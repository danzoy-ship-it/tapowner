"""Materialize parcels.improvement_tags (text[]) from raw parcels.improvements.

Pipeline step 3 of IMPROVEMENT_TAXONOMY.md, PRODUCTION-SAFE rewrite after the
2026-07-15 incident (a queued ALTER behind a long UPDATE blocked every parcels
query and took the live app down — see HANDOFF §3 "bulk-DDL rule").

Safety rules implemented (the incident post-mortem, all five):
1. `SET lock_timeout='2s'` on EVERY session before any DDL — a DDL that can't
   get its lock FAILS instead of queuing (a queued ACCESS EXCLUSIVE = outage).
2. The parcels ALTER runs at most ONCE: we check information_schema first and
   skip it entirely when the column exists (ALTER ... IF NOT EXISTS still takes
   ACCESS EXCLUSIVE even as a no-op). Never inside a retry wrapper.
3. The UPDATE is batched: 100K-id ranges, each in its own transaction on its
   own connection — no minutes-long single transaction on the live table.
4. The GIN index is built with CREATE INDEX CONCURRENTLY (autocommit session),
   never a blocking CREATE INDEX.
5. Pre-flight guard: aborts if ANY other materialize/DDL query is active on
   parcels (prevents the two-instance collision that caused the pileup).

Tag rules (per the taxonomy): lowercase label; tag applies if ANY `match` regex
hits AND no `exclude` hits; parcel tags = UNION across labels; boat_dock implies
waterfront (folded into the label map — no full-table post-pass); single_story
is a derived_field (not tagged). Idempotent, re-runnable, raw labels untouched.

Usage:
    DATABASE_URL=... python materialize_improvement_tags.py [--dry-run]
"""

import io
import json
import os
import re
import sys
import time

import psycopg2

HERE = os.path.dirname(__file__)
BATCH = 100_000


def connect(autocommit=False):
    for attempt in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                                 keepalives_interval=10, keepalives_count=10, connect_timeout=20)
            c.autocommit = autocommit
            cur = c.cursor()
            cur.execute("SET lock_timeout = '2s'")  # rule 1: never queue on a lock
            if not autocommit:
                c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {attempt+1}: {e}", flush=True)
            time.sleep(5)
    raise RuntimeError("could not connect after retries")


def load_crosswalk():
    with open(os.path.join(HERE, "improvement_crosswalk.json"), encoding="utf-8") as fh:
        cw = json.load(fh)
    compiled = {}
    for tag, spec in cw["tags"].items():
        if not (spec.get("match") or []):
            continue
        compiled[tag] = ([re.compile(p, re.I) for p in spec["match"]],
                         [re.compile(p, re.I) for p in (spec.get("exclude") or [])])
    return compiled, cw.get("version")


def tags_for_label(s, compiled):
    tags = [tag for tag, (ms, xs) in compiled.items()
            if any(m.search(s) for m in ms) and not any(x.search(s) for x in xs)]
    if "boat_dock" in tags and "waterfront" not in tags:
        tags.append("waterfront")  # implication folded in at the label level
    return tags


def retry_dml(fn, what):
    """Retry loop for DML ONLY (never DDL on parcels — rule 2)."""
    for attempt in range(6):
        conn = connect()
        try:
            result = fn(conn)
            conn.commit()
            conn.close()
            return result
        except psycopg2.Error as e:
            print(f"  {what} retry {attempt+1}: {e}", flush=True)
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(5)
    raise RuntimeError(f"{what} failed after retries")


def main():
    dry_run = "--dry-run" in sys.argv
    compiled, version = load_crosswalk()
    print(f"crosswalk v{version}: {len(compiled)} matchable tags", flush=True)

    # ---- Pre-flight guard (rule 5): no concurrent materialize/DDL on parcels.
    conn = connect()
    cur = conn.cursor()
    cur.execute("""SELECT pid, left(query,70) FROM pg_stat_activity
                   WHERE pid <> pg_backend_pid() AND state = 'active'
                     AND (query ILIKE '%improvement_tags%' OR query ILIKE '%_label_tag_map%'
                          OR (query ILIKE '%ALTER TABLE%parcels%'))""")
    busy = cur.fetchall()
    if busy:
        print("ABORT: another materialize/DDL run is active on parcels:", busy, flush=True)
        sys.exit(2)

    # ---- Column setup (rule 2): ALTER at most once, checked first, fail-fast.
    cur.execute("""SELECT count(*) FROM information_schema.columns
                   WHERE table_name='parcels' AND column_name='improvement_tags'""")
    if cur.fetchone()[0] == 0:
        print("adding improvement_tags column (lock_timeout=2s, fails fast if busy)…", flush=True)
        cur.execute("ALTER TABLE parcels ADD COLUMN improvement_tags TEXT[]")
        conn.commit()
    else:
        print("improvement_tags column already exists — skipping ALTER (no lock taken)", flush=True)
    conn.close()

    # ---- Label map (tiny table; its DDL touches only _label_tag_map, not parcels).
    def phase_labels(conn):
        cur = conn.cursor()
        cur.execute("""SELECT DISTINCT lower(trim(value))
                       FROM parcels, LATERAL jsonb_array_elements_text(improvements) value
                       WHERE improvements IS NOT NULL""")
        labels = [r[0] for r in cur.fetchall() if r[0]]
        mapped = {l: t for l, t in ((lbl, tags_for_label(lbl, compiled)) for lbl in labels) if t}
        cur.execute("DROP TABLE IF EXISTS _label_tag_map")
        cur.execute("CREATE TABLE _label_tag_map (label TEXT PRIMARY KEY, tags TEXT[])")
        buf = io.StringIO()
        for lbl, tg in mapped.items():
            buf.write(lbl.replace("\\", "\\\\").replace("\t", " ") + "\t{" + ",".join(tg) + "}\n")
        buf.seek(0)
        cur.copy_expert("COPY _label_tag_map (label, tags) FROM STDIN", buf)
        return len(labels), len(mapped)
    t0 = time.time()
    nlabels, nmapped = retry_dml(phase_labels, "label-map")
    print(f"distinct labels {nlabels:,}, mapped {nmapped:,} ({time.time()-t0:.0f}s)", flush=True)

    if dry_run:
        print("dry-run: label map built; skipping the batched tagging pass")
        return

    # ---- Recompute mode: for a full re-tag after the crosswalk changes, null
    # the column first (batched) so the resumable IS NULL filter reprocesses
    # every parcel. Default (no flag) RESUMES — only untagged rows are touched,
    # so the pass survives the 10-min background cap across invocations.
    recompute = "--recompute" in sys.argv

    # Optional --id-lo / --id-hi bound the pass to one id band, e.g. a single
    # county after a crosswalk change: --recompute --id-lo 197374 --id-hi 906914.
    def _arg(name):
        if name in sys.argv:
            return int(sys.argv[sys.argv.index(name) + 1])
        return None
    arg_lo, arg_hi = _arg("--id-lo"), _arg("--id-hi")

    # ---- Batched tagging (rule 3): 100K-id ranges, one txn each.
    lo, hi = retry_dml(lambda c: (lambda cu: (cu.execute(
        "SELECT min(id), max(id) FROM parcels WHERE improvements IS NOT NULL"), cu.fetchone())[1])(c.cursor()),
        "bounds")
    if arg_lo is not None:
        lo = max(lo, arg_lo)
    if arg_hi is not None:
        hi = min(hi, arg_hi)
    print(f"tagging id range {lo:,}..{hi:,} in {BATCH:,}-id batches (recompute={recompute})", flush=True)

    if recompute:
        rstart = lo
        while rstart <= hi:
            rend = rstart + BATCH - 1
            retry_dml(lambda c, s=rstart, e=rend: c.cursor().execute(
                "UPDATE parcels SET improvement_tags = NULL WHERE id BETWEEN %s AND %s AND improvements IS NOT NULL",
                (s, e)), f"reset@{rstart:,}")
            rstart = rend + 1
        print("recompute: cleared improvement_tags for a full re-tag", flush=True)

    total, t0, start = 0, time.time(), lo
    while start <= hi:
        end = start + BATCH - 1

        def batch(conn, s=start, e=end):
            cur = conn.cursor()
            cur.execute(
                """UPDATE parcels p SET improvement_tags = sub.tags
                   FROM (SELECT p2.id, array_agg(DISTINCT t) tags
                         FROM parcels p2
                         CROSS JOIN LATERAL jsonb_array_elements_text(p2.improvements) lbl
                         JOIN _label_tag_map m ON m.label = lower(trim(lbl))
                         CROSS JOIN LATERAL unnest(m.tags) t
                         WHERE p2.improvements IS NOT NULL AND p2.improvement_tags IS NULL
                           AND p2.id BETWEEN %s AND %s
                         GROUP BY p2.id) sub
                   WHERE p.id = sub.id""", (s, e))
            n = cur.rowcount
            cur.execute("""UPDATE parcels SET improvement_tags = '{}'
                           WHERE id BETWEEN %s AND %s AND improvements IS NOT NULL
                             AND improvement_tags IS NULL""", (s, e))
            return n

        total += retry_dml(batch, f"batch@{start:,}")
        if (start - lo) % (BATCH * 20) == 0:
            print(f"  …{start:,} ({total:,} tagged, {time.time()-t0:.0f}s)", flush=True)
        start = end + 1
    print(f"tagged {total:,} parcels ({time.time()-t0:.0f}s)", flush=True)

    retry_dml(lambda c: c.cursor().execute("DROP TABLE IF EXISTS _label_tag_map"), "drop-map")

    # ---- GIN index (rule 4): CONCURRENTLY on an autocommit session, never blocking.
    print("building GIN index CONCURRENTLY…", flush=True)
    idx_conn = connect(autocommit=True)
    icur = idx_conn.cursor()
    icur.execute("""SELECT count(*) FROM pg_indexes WHERE indexname='parcels_improvement_tags_gin'""")
    if icur.fetchone()[0] == 0:
        icur.execute("CREATE INDEX CONCURRENTLY parcels_improvement_tags_gin ON parcels USING GIN (improvement_tags)")
        print("index built", flush=True)
    else:
        print("index already exists — skipped", flush=True)
    idx_conn.close()

    # ---- Report (read-only).
    def report(conn):
        cur = conn.cursor()
        cur.execute("SELECT t, count(*) FROM parcels, LATERAL unnest(improvement_tags) t GROUP BY t ORDER BY 2 DESC")
        return cur.fetchall()
    print("=== per-tag parcel counts (statewide) ===")
    for tag, c in retry_dml(report, "report"):
        print(f"  {tag:<15} {c:>10,}")


if __name__ == "__main__":
    main()
