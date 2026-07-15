"""Hidalgo (HCAD, 48215) parcel-attribute loader from the free monthly
HCADShapefiles.zip -> data.mdb (single "Data" table, ~394K rows). The True
Prodigy migration killed HCAD's bulk roll, but this shapefile companion mdb
still carries per-parcel year built, main-area sqft, deed date + exemptions
(NO improvement segments / beds / pool — those need a PIA for the PACS export).

Columns used: geoID (dashed, JOIN vs apn) / pid (vs source_property_id),
imprvActualYearBuilt -> year_built, imprvMainArea -> living_area_sqft,
deedDt (ISO) -> last_sale_date, exemptions ("HS OV65" space-sep) -> exemptions[].

Usage: DATABASE_URL=... python load_hcad_data_mdb.py <fips> <data.mdb> [--dry-run]
"""
import io
import os
import sys
import time
from datetime import date

import psycopg2
import pyodbc

FIPS_DEFAULT = "48215"


def to_int(v, lo, hi):
    try:
        n = int(float(v))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def parse_dt(v):
    s = str(v or "").strip()
    if len(s) < 10:
        return None
    try:
        d = date.fromisoformat(s[:10])
        return d if 1900 <= d.year <= date.today().year else None
    except ValueError:
        return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips = args[0]
    mdb = args[1]
    con = pyodbc.connect(r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=" + mdb)
    cur = con.cursor()
    cur.execute("SELECT pid, geoID, imprvActualYearBuilt, imprvMainArea, deedDt, exemptions FROM [Data]")
    staged = {}   # geo -> (pid, sqft, yr, dt, codes)
    n = 0
    t0 = time.time()
    for pid, geo, yb, area, dd, ex in cur.fetchall():
        n += 1
        geo = str(geo or "").strip()
        pid = str(pid or "").strip()
        key = geo or pid
        if not key:
            continue
        sqft = to_int(area, 1, 2_000_000)
        yr = to_int(yb, 1800, date.today().year + 1)
        dt = parse_dt(dd)
        codes = sorted({c.strip().upper() for c in str(ex or "").split() if c.strip()}) or None
        staged[key] = (pid, geo, sqft, yr, dt, codes)
    con.close()
    print(f"[{fips}] read {n:,} rows -> {len(staged):,} keyed ({time.time()-t0:.0f}s)", flush=True)
    _db_phase(fips, staged, dry)


def _db_phase(fips, staged, dry):
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='6s'")
    cur.execute("""CREATE TEMP TABLE hcad_stage (pid TEXT, geo TEXT, sqft INT, yr INT,
                       sale_dt DATE, exemptions TEXT[])""")
    buf = io.StringIO()
    for key, (pid, geo, sqft, yr, dt, codes) in staged.items():
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([
            pid or r"\N", geo or r"\N",
            r"\N" if sqft is None else str(sqft),
            r"\N" if yr is None else str(yr),
            r"\N" if dt is None else dt.isoformat(), arr,
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY hcad_stage (pid, geo, sqft, yr, sale_dt, exemptions) FROM STDIN", buf)
    cur.execute("ANALYZE hcad_stage")

    best_join, best_n = None, 0
    for label, cond in [("apn==geo", "p.apn = s.geo"), ("spid==geo", "p.source_property_id = s.geo"),
                        ("apn==pid", "p.apn = s.pid"), ("spid==pid", "p.source_property_id = s.pid")]:
        cur.execute(f"SELECT count(*) FROM hcad_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
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
                        living_area_sqft = COALESCE(p.living_area_sqft, s.sqft),
                        year_built       = COALESCE(p.year_built, s.yr),
                        last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                        exemptions       = COALESCE(s.exemptions, p.exemptions)
                    FROM hcad_stage s WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL), count(*) FILTER (WHERE year_built IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL), count(*) FILTER (WHERE array_length(exemptions,1)>0)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    sq, yr, sd, ex = cur.fetchone()
    print(f"[{fips}] now: sqft {sq:,}, year {yr:,}, sale {sd:,}, exempt {ex:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
