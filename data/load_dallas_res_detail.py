"""Dallas (DCAD, 48113) beds/baths/stories/year from RES_DETAIL.CSV — the
residential detail file inside DCAD{yr}_CURRENT.ZIP (companion to RES_ADDL which
gave features). Cols: ACCOUNT_NUM[0], YR_BUILT[4], NUM_STORIES_DESC[11],
NUM_FULL_BATHS[23], NUM_HALF_BATHS[24], NUM_BEDROOMS[26]. Join ACCOUNT_NUM ==
source_property_id (17-char, as RES_ADDL). Usage:
    DATABASE_URL=... python load_dallas_res_detail.py <DCAD_CURRENT.zip> [--dry-run]
"""
import csv
import io
import os
import re
import sys
import time
import zipfile

import psycopg2

FIPS = "48113"
NUM = re.compile(r"\d+")


def to_int(v, lo, hi):
    m = NUM.search(str(v or ""))
    if not m:
        return None
    n = int(m.group())
    return n if lo <= n <= hi else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    z = zipfile.ZipFile(args[0])
    rows = {}
    t0 = time.time()
    with z.open("RES_DETAIL.CSV") as f:
        r = csv.reader(io.TextIOWrapper(f, encoding="latin-1"))
        hdr = [h.strip() for h in next(r)]
        ix = {h: i for i, h in enumerate(hdr)}
        for row in r:
            if len(row) <= ix["NUM_BEDROOMS"]:
                continue
            acct = row[ix["ACCOUNT_NUM"]].strip()
            if not acct:
                continue
            beds = to_int(row[ix["NUM_BEDROOMS"]], 1, 40)
            bf = to_int(row[ix["NUM_FULL_BATHS"]], 1, 40)
            bh = to_int(row[ix["NUM_HALF_BATHS"]], 0, 20)
            yr = to_int(row[ix["YR_BUILT"]], 1800, 2027)
            st = to_int(row[ix["NUM_STORIES_DESC"]], 1, 60)
            if any(v is not None for v in (beds, bf, yr, st)):
                # keep the richest per account (RES_DETAIL is one row per building)
                prev = rows.get(acct)
                if prev is None:
                    rows[acct] = (beds, bf, bh, yr, st)
                else:
                    rows[acct] = tuple(p if p is not None else n for p, n in zip(prev, (beds, bf, bh, yr, st)))
    print(f"parsed {len(rows):,} accounts ({time.time()-t0:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='12s'")
    cur.execute("CREATE TEMP TABLE rd (acct TEXT PRIMARY KEY, beds INT, bf INT, bh INT, yr INT, st INT)")
    buf = io.StringIO()
    for acct, (beds, bf, bh, yr, st) in rows.items():
        buf.write("\t".join([acct] + [r"\N" if v is None else str(v) for v in (beds, bf, bh, yr, st)]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY rd FROM STDIN", buf)
    cur.execute("ANALYZE rd")
    cur.execute("SELECT count(*) FROM rd s JOIN parcels p ON p.county_fips=%s AND p.source_property_id=s.acct", (FIPS,))
    print("joinable:", cur.fetchone()[0], flush=True)
    if dry:
        conn.rollback(); print("dry-run"); return
    cur.execute("""UPDATE parcels p SET
                       bedrooms   = COALESCE(p.bedrooms, s.beds),
                       baths_full = COALESCE(p.baths_full, s.bf),
                       baths_half = COALESCE(p.baths_half, s.bh),
                       year_built = COALESCE(p.year_built, s.yr),
                       stories    = COALESCE(p.stories, s.st)
                   FROM rd s WHERE p.county_fips=%s AND p.source_property_id=s.acct""", (FIPS,))
    print("updated:", cur.rowcount, flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE bedrooms IS NOT NULL), count(*) FILTER (WHERE baths_full IS NOT NULL),
                          count(*) FILTER (WHERE stories IS NOT NULL) FROM parcels WHERE county_fips=%s""", (FIPS,))
    b, ba, st = cur.fetchone()
    print(f"[{FIPS}] now: beds {b:,}, baths {ba:,}, stories {st:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
