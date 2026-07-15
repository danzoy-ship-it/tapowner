"""SWData / Southwest Data Solution "export_collector" roll loader — the
pipe-delimited tax-collection export some SWData CADs post (e.g. Sabine). Header
row of `collector_*` columns; NO improvement detail (it's the collections roll),
but it DOES carry homestead + deed date = seller signals for otherwise geom-only
counties.

Fields used: collector_geoid (JOIN vs apn) / collector_altid, collector_hscode
(non-empty -> HS), collector_exempt ('Y'), collector_deeddate -> last_sale_date.

Usage: DATABASE_URL=... python load_swdata_collectors.py <fips> <collectors.txt> [--dry-run]
"""
import csv
import io
import os
import sys
import time
from datetime import date, datetime

import psycopg2


def parse_dt(v):
    s = str(v or "").strip()
    if not s or s.startswith("1900") or s.startswith("01/01/1900"):
        return None
    for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%Y %H:%M:%S"):
        try:
            d = datetime.strptime(s.split()[0], fmt).date()
            return d if 1900 < d.year <= date.today().year else None
        except (ValueError, IndexError):
            continue
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, path = args[0], args[1]
    staged = {}   # geoid -> (altid, codes, sale_dt)
    t0 = time.time()
    with open(path, encoding="latin-1") as f:
        r = csv.DictReader(f, delimiter="|")
        for row in r:
            geo = (row.get("collector_geoid") or "").strip()
            alt = (row.get("collector_altid") or "").strip()
            key = geo or alt
            if not key:
                continue
            codes = set()
            if (row.get("collector_hscode") or "").strip():
                codes.add("HS")
            if (row.get("collector_exempt") or "").strip().upper() == "Y":
                codes.add("EX")
            dt = parse_dt(row.get("collector_deeddate"))
            prev = staged.get(key)
            if prev:
                staged[key] = (prev[0] or alt, prev[1] | codes, prev[2] or dt)
            else:
                staged[key] = (alt, codes, dt)
    print(f"[{fips}] parsed {len(staged):,} rows ({time.time()-t0:.0f}s)", flush=True)
    _db_phase(fips, staged, dry)


def _db_phase(fips, staged, dry):
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='6s'")
    cur.execute("CREATE TEMP TABLE col_stage (geo TEXT PRIMARY KEY, alt TEXT, exemptions TEXT[], sale_dt DATE)")
    buf = io.StringIO()
    for geo, (alt, codes, dt) in staged.items():
        arr = "{" + ",".join(sorted(codes)) + "}" if codes else r"\N"
        buf.write("\t".join([geo.replace("\\", "\\\\"), alt.replace("\\", "\\\\") if alt else r"\N",
                             arr, dt.isoformat() if dt else r"\N"]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY col_stage (geo, alt, exemptions, sale_dt) FROM STDIN", buf)
    cur.execute("ANALYZE col_stage")

    best_join, best_n = None, 0
    for label, cond in [("apn==geo", "p.apn = s.geo"), ("spid==geo", "p.source_property_id = s.geo"),
                        ("apn==alt", "p.apn = s.alt"), ("spid==alt", "p.source_property_id = s.alt")]:
        cur.execute(f"SELECT count(*) FROM col_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    tot = cur.fetchone()[0]
    if best_n < 0.30 * max(tot, 1):
        conn.rollback(); conn.close()
        raise SystemExit(f"[{fips}] ABORT: best join {best_n:,} < 30% of {tot:,}")
    print(f"  -> {best_join} ({best_n:,}/{tot:,})", flush=True)
    if dry:
        conn.rollback(); conn.close(); print("dry-run"); return

    cur.execute(f"""UPDATE parcels p SET
                        exemptions     = COALESCE(s.exemptions, p.exemptions),
                        last_sale_date = COALESCE(p.last_sale_date, s.sale_dt)
                    FROM col_stage s WHERE p.county_fips=%s AND {best_join}
                      AND (array_length(s.exemptions,1) > 0 OR s.sale_dt IS NOT NULL)""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE last_sale_date IS NOT NULL), count(*) FILTER (WHERE array_length(exemptions,1)>0)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    sd, ex = cur.fetchone()
    print(f"[{fips}] now: sale {sd:,}, exempt {ex:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
