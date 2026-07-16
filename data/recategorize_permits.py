"""Re-run permit_categorize over ALL rows in `permits` and update permit_category
where it changed. Use after editing permit_categorize.py (e.g. adding window/gutter)
so the whole table reflects the current category rules without re-loading from source.

Batched by id range; only writes rows whose category actually changed. Idempotent.

Usage: DATABASE_URL=... python recategorize_permits.py
"""
import io
import os
import time

import psycopg2

from permit_categorize import categorize

BATCH = 100_000


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='10s'")
    cur.execute("SELECT min(id), max(id) FROM permits")
    lo, hi = cur.fetchone()
    if lo is None:
        print("no permits"); return
    changed_total = 0
    t0 = time.time()
    lastid = lo - 1
    while lastid < hi:
        rcur = conn.cursor(name="rc")  # server-side cursor for the read
        rcur.itersize = BATCH
        rcur.execute("SELECT id, permit_type_raw, description, permit_category FROM permits "
                     "WHERE id > %s AND id <= %s ORDER BY id", (lastid, lastid + BATCH))
        updates = []
        for pid, traw, desc, cat in rcur:
            newcat = categorize(traw, desc)
            if newcat != cat:
                updates.append((pid, newcat))
        rcur.close()
        if updates:
            buf = io.StringIO()
            for pid, nc in updates:
                buf.write(f"{pid}\t{nc}\n")
            buf.seek(0)
            cur.execute("CREATE TEMP TABLE rc_upd (id BIGINT PRIMARY KEY, cat TEXT) ON COMMIT DROP")
            cur.copy_expert("COPY rc_upd FROM STDIN", buf)
            cur.execute("UPDATE permits p SET permit_category = u.cat FROM rc_upd u WHERE p.id = u.id")
            changed_total += cur.rowcount
            conn.commit()
        lastid += BATCH
        print(f"  through id {min(lastid,hi):,}: {changed_total:,} changed ({time.time()-t0:.0f}s)", flush=True)

    cur.execute("SELECT permit_category, count(*) FROM permits GROUP BY 1 ORDER BY 2 DESC")
    print(f"recategorized. {changed_total:,} rows changed. categories now:", flush=True)
    for c, n in cur.fetchall():
        print(f"  {c:12} {n:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
