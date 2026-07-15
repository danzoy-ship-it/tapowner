"""Capture SALE-DATE (tenure) + EXEMPTIONS from a PACS APPRAISAL_INFO.TXT file.

The "rides existing pipelines" signals (app session, 2026-07-15): tenure
("owned 15+ years" — our poor-man's SmartZip) and the homestead-drop / over-65
seller signals. Both live in File #2 of the PACS Legacy certified roll,
APPRAISAL_INFO.TXT (fixed-width), positions per the official "Appraisal Export
Layout - 8.0.31.xlsx" shipped inside the Gregg (GCAD) roll and VERIFIED against
real Gregg data 2026-07-15:

  prop_id     cols 1-12      join key (leading zeros stripped)
  prop_type   cols 13-17     R = Real
  deed_dt     cols 2034-2058 current owner's deed date, format MMDDYYYY
              -> parcels.last_sale_date (Texas is NON-DISCLOSURE: there is no
                 sale PRICE in the roll, so last_sale_price stays null — date
                 alone unlocks tenure).
  exemption T/F flags (stable early block, consistent across layout versions):
    hs   2609 HS   | ov65 2610 OV65 | ov65s 2661 OV65S | dp 2662 DP
    dv1  2663 DV1  | dv1s 2664 DV1S | dv2 2665 DV2 | dv2s 2666 DV2S
    dv3  2667 DV3  | dv3s 2668 DV3S | dv4 2669 DV4 | dv4s 2670 DV4S | ex 2671 EX
  -> parcels.exemptions text[] (verbatim codes present; '{}' when none). The app
     derives has_homestead / has_over65 from it; homestead-DROP needs two
     snapshots over time, so capturing the current one is step 1.

SAFETY: field positions can shift between PACS layout versions, and a shifted
position silently corrupts (the fixture-bath lesson). So before writing anything
this loader SANITY-CHECKS a sample: hs/ov65 must be >=95% in {T,F} and deed_dt
must parse as a plausible date for a real fraction of rows, else it ABORTS with a
diagnostic (that county needs its own layout offsets).

Schema: adds ONE column `parcels.exemptions text[]` (production-safe: lock_timeout
2s, single ALTER guarded by information_schema, GIN index CONCURRENTLY).
`last_sale_date` already exists. Logged in the system map per the contract.

Usage:
    DATABASE_URL=... python load_pacs_appraisal_info.py <fips> <roll.zip> [--dry-run]
"""

import io
import os
import sys
import time
import zipfile
from datetime import date

import psycopg2

# 1-based inclusive (start, end) from the official layout -> python [start-1:end].
POS = {
    "prop_id": (1, 12),
    "prop_type": (13, 17),
    "deed_dt": (2034, 2058),
}
# exemption flag column -> code (all in the stable early block).
EXEMPT_COLS = {
    2609: "HS", 2610: "OV65", 2661: "OV65S", 2662: "DP",
    2663: "DV1", 2664: "DV1S", 2665: "DV2", 2666: "DV2S",
    2667: "DV3", 2668: "DV3S", 2669: "DV4", 2670: "DV4S", 2671: "EX",
}
MIN_LINE_LEN = 2671  # must reach the last exemption flag to be a usable row


def _slice(line, s, e):
    return line[s - 1:e]


def parse_deed_dt(raw):
    """PACS deed_dt, MMDDYYYY — some counties dash/slash it (Cameron: MM-DD-YYYY).
    Strip separators, then parse 8 digits. -> date or None (guarded)."""
    s = "".join(ch for ch in raw.strip() if ch.isdigit())
    if len(s) != 8:
        return None
    mm, dd, yyyy = int(s[0:2]), int(s[2:4]), int(s[4:8])
    if not (1 <= mm <= 12 and 1 <= dd <= 31 and 1900 <= yyyy <= date.today().year):
        return None
    try:
        return date(yyyy, mm, dd)
    except ValueError:
        return None


def find_member(z):
    hits = [n for n in z.namelist() if n.upper().endswith("APPRAISAL_INFO.TXT")]
    if not hits:
        raise SystemExit("no APPRAISAL_INFO.TXT in this roll (partial export — "
                         "needs the full certified roll for exemptions/deed date)")
    return hits[0]


def sanity_check(z, member):
    """Verify positions on a sample before trusting them. Returns (ok, msg)."""
    hs_tf = ov_tf = total = date_ok = 0
    with z.open(member) as f:
        for raw in f:
            line = raw.decode("latin-1").rstrip("\r\n")
            if len(line) < MIN_LINE_LEN:
                continue
            if _slice(line, *POS["prop_type"]).strip() != "R":
                continue
            total += 1
            if _slice(line, 2609, 2609) in ("T", "F"):
                hs_tf += 1
            if _slice(line, 2610, 2610) in ("T", "F"):
                ov_tf += 1
            if parse_deed_dt(_slice(line, *POS["deed_dt"])):
                date_ok += 1
            if total >= 5000:
                break
    if total < 50:
        return False, f"only {total} real rows sampled — can't validate"
    hs_pct, ov_pct, dt_pct = hs_tf / total, ov_tf / total, date_ok / total
    msg = f"sample n={total}: hs T/F {hs_pct:.0%}, ov65 T/F {ov_pct:.0%}, deed_dt parses {dt_pct:.0%}"
    if hs_pct < 0.95 or ov_pct < 0.95:
        return False, "POSITION DRIFT — " + msg + " (exemption flags not T/F; needs county-specific offsets)"
    if dt_pct < 0.10:
        return False, "POSITION DRIFT — " + msg + " (deed_dt not parsing; needs county-specific offsets)"
    return True, msg


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    if len(args) < 2:
        raise SystemExit("usage: load_pacs_appraisal_info.py <fips> <roll.zip> [--dry-run]")
    fips, zip_path = args[0], args[1]

    z = zipfile.ZipFile(zip_path)
    member = find_member(z)
    print(f"[{fips}] reading {member}", flush=True)

    ok, msg = sanity_check(z, member)
    print(f"[{fips}] sanity: {msg}", flush=True)
    if not ok:
        raise SystemExit(f"[{fips}] ABORT: {msg}")

    # staged: pid -> (last_sale_date or None, [exemption codes])
    staged = {}
    n = with_date = with_exempt = 0
    t0 = time.time()
    with z.open(member) as f:
        for raw in f:
            line = raw.decode("latin-1").rstrip("\r\n")
            if len(line) < MIN_LINE_LEN:
                continue
            if _slice(line, *POS["prop_type"]).strip() != "R":
                continue
            pid = _slice(line, *POS["prop_id"]).strip().lstrip("0") or "0"
            dt = parse_deed_dt(_slice(line, *POS["deed_dt"]))
            codes = [code for col, code in EXEMPT_COLS.items()
                     if _slice(line, col, col) == "T"]
            # keep the richest record per pid (PACS repeats pid per owner)
            prev = staged.get(pid)
            if prev is None:
                staged[pid] = (dt, codes)
            else:
                staged[pid] = (prev[0] or dt, prev[1] or codes)
            n += 1
            if n % 200_000 == 0:
                print(f"  parsed {n:,} ({time.time()-t0:.0f}s)", flush=True)
    for dt, codes in staged.values():
        if dt:
            with_date += 1
        if codes:
            with_exempt += 1
    print(f"[{fips}] parsed {n:,} real rows, {len(staged):,} pids; "
          f"{with_date:,} with deed date, {with_exempt:,} with >=1 exemption "
          f"({time.time()-t0:.0f}s)", flush=True)

    _db_phase(fips, staged, dry_run)


def _connect():
    for attempt in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1,
                                 keepalives_idle=30, keepalives_interval=10,
                                 keepalives_count=10, connect_timeout=20)
            cur = c.cursor()
            cur.execute("SET lock_timeout='2s'")
            c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {attempt+1}: {e}", flush=True)
            time.sleep(5)
    raise RuntimeError("could not connect")


def _ensure_column():
    """ALTER at most once, guarded (bulk-DDL rule). Returns nothing."""
    conn = _connect()
    cur = conn.cursor()
    cur.execute("""SELECT 1 FROM information_schema.columns
                   WHERE table_name='parcels' AND column_name='exemptions'""")
    if not cur.fetchone():
        print("  adding parcels.exemptions text[] (lock_timeout 2s)", flush=True)
        cur.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS exemptions text[]")
        conn.commit()
    else:
        print("  parcels.exemptions already exists — no ALTER", flush=True)
    conn.close()


def _db_phase(fips, staged, dry_run):
    if not staged:
        print("  nothing to load")
        return
    if not dry_run:
        _ensure_column()

    conn = _connect()
    cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE ai_stage (
                       pid TEXT PRIMARY KEY, sale_dt DATE, exemptions TEXT[]
                   )""")
    buf = io.StringIO()
    for pid, (dt, codes) in staged.items():
        arr = "{" + ",".join(codes) + "}"  # PG array literal; '{}' when empty
        buf.write("\t".join([
            pid,
            r"\N" if dt is None else dt.isoformat(),
            arr,
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY ai_stage (pid, sale_dt, exemptions) FROM STDIN", buf)

    cur.execute("""SELECT count(*),
                          count(*) FILTER (WHERE s.sale_dt IS NOT NULL),
                          count(*) FILTER (WHERE array_length(s.exemptions,1) > 0)
                   FROM ai_stage s
                   JOIN parcels p ON p.county_fips=%s AND p.source_property_id=s.pid""",
                (fips,))
    j, jd, je = cur.fetchone()
    rate = j / max(1, len(staged))
    print(f"  joinable parcels: {j:,} (deed date {jd:,}, exemptions {je:,}) "
          f"= {rate:.0%} of staged pids", flush=True)

    # Roll-mismatch guard: if the roll's prop_id space doesn't match how this
    # county's geometry was keyed (e.g. a supplement re-numbered ids), the join
    # collapses — Gregg's GCAD_Export matched 1.7%. Refuse to load garbage.
    if rate < 0.20:
        conn.rollback()
        conn.close()
        raise SystemExit(f"[{fips}] ABORT: only {rate:.0%} of pids join — roll/geometry "
                         f"key mismatch (wrong roll for this county's source_property_id)")

    if dry_run:
        conn.rollback()
        print("  dry-run: rolled back")
        conn.close()
        return

    cur.execute("""UPDATE parcels p SET
                       last_sale_date = COALESCE(p.last_sale_date, s.sale_dt),
                       exemptions     = COALESCE(s.exemptions, p.exemptions)
                   FROM ai_stage s
                   WHERE p.county_fips=%s AND p.source_property_id=s.pid""",
                (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()

    cur.execute("""SELECT count(*) FILTER (WHERE last_sale_date IS NOT NULL),
                          count(*) FILTER (WHERE array_length(exemptions,1) > 0),
                          count(*) FILTER (WHERE exemptions @> ARRAY['HS']),
                          count(*) FILTER (WHERE exemptions @> ARRAY['OV65'])
                   FROM parcels WHERE county_fips=%s""", (fips,))
    sd, ex, hs, ov = cur.fetchone()
    print(f"[{fips}] now: last_sale_date {sd:,}, exemptions {ex:,} "
          f"(HS {hs:,}, OV65 {ov:,})", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
