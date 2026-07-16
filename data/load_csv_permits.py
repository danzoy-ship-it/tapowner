"""Generalized CSV/CKAN building-permit loader — for jurisdictions that publish a
whole-file CSV (e.g. San Antonio's CKAN "PERMITS ISSUED 2020-2024" historical bulk,
which the recent-only ArcGIS mirror doesn't cover). Config-driven field map;
handles MIXED-projection X/Y (some rows WGS84 decimal degrees, some Texas State
Plane South Central ft / EPSG 2278) via pyproj. Idempotent upsert into `permits`.

Usage: DATABASE_URL=... python load_csv_permits.py <jurisdiction> <csv-path-or-url>
"""
import csv
import io
import os
import sys
import time
import urllib.request
from datetime import date, datetime

import psycopg2
from pyproj import Transformer

from permit_categorize import categorize

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
PAGE = 50000
# TX State Plane South Central (NAD83, US ft) -> WGS84 lon/lat
_TF = Transformer.from_crs(2278, 4326, always_xy=True)

CITIES = {
    "san_antonio": {          # historical CKAN bulk; complements the ArcGIS 2025+ mirror
        "county_fips": "48029",
        "source_system": "socrata",
        "fields": {
            "permit_number": "PERMIT #",
            "type_desc": "PERMIT TYPE",
            "work_class": "WORK TYPE",
            "permit_class": None,
            "description": "PROJECT NAME",
            "issued_date": "DATE ISSUED",
            "address": "ADDRESS",
            "city": None, "zip": None,
            "valuation": "DECLARED VALUATION",
            "x": "X_COORD", "y": "Y_COORD",
            "parcel_key": None,
        },
    },
}


def parse_date(v):
    s = str(v or "").strip()
    if not s:
        return None
    tok = s.split()[0]
    for cand, fmt in ((s[:19], "%Y-%m-%dT%H:%M:%S"), (s[:10], "%Y-%m-%d"),
                      (tok, "%m/%d/%Y"), (tok, "%m/%d/%y")):
        try:
            d = datetime.strptime(cand, fmt).date()
            return d if 1900 <= d.year <= date.today().year + 1 else None
        except ValueError:
            continue
    return None


def to_num(v):
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except (ValueError, TypeError):
        return None


def to_lonlat(xs, ys):
    """Return (lon, lat) in WGS84, or (None, None). Detect projection by magnitude."""
    try:
        x, y = float(xs), float(ys)
    except (ValueError, TypeError):
        return None, None
    if x == 0 and y == 0:
        return None, None
    if abs(x) <= 180 and abs(y) <= 90:
        return x, y                     # already WGS84
    if abs(x) > 1000:                   # State Plane feet
        lon, lat = _TF.transform(x, y)
        if -107 <= lon <= -93 and 25 <= lat <= 37:   # sanity: inside Texas
            return lon, lat
    return None, None


def get_reader(src):
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=300).read()
    else:
        raw = open(src, "rb").read()
    text = raw.decode("utf-8-sig", errors="replace")   # strips the BOM
    return csv.DictReader(io.StringIO(text))


def main():
    juris, src = sys.argv[1], sys.argv[2]
    cfg = CITIES[juris]
    fm = cfg["fields"]
    r = get_reader(src)

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='10s'")
    cur.execute("CREATE TEMP TABLE stage (LIKE permits INCLUDING DEFAULTS) ON COMMIT DELETE ROWS")

    def col(row, key):
        s = fm.get(key)
        return row.get(s) if s else None

    def clean(x):
        return str(x or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").replace("\\", " ").strip()

    upserted = 0
    t0 = time.time()
    batch = []

    def flush(batch):
        if not batch:
            return 0
        buf = io.StringIO()
        for row in batch:
            pnum = clean(col(row, "permit_number"))
            if not pnum:
                continue
            type_raw = " / ".join(clean(col(row, k)) for k in ("type_desc", "work_class", "permit_class") if col(row, k))
            cat = categorize(col(row, "type_desc"), col(row, "work_class"), col(row, "permit_class"), col(row, "description"))
            dt = parse_date(col(row, "issued_date"))
            lon, lat = to_lonlat(col(row, "x"), col(row, "y"))
            val = to_num(col(row, "valuation"))

            def f(x):
                return r"\N" if x is None or x == "" else str(x)
            buf.write("\t".join([
                juris, cfg["source_system"], pnum, type_raw or r"\N", cat,
                dt.isoformat() if dt else r"\N", clean(col(row, "description")) or r"\N", f(val),
                clean(col(row, "address")) or r"\N", r"\N", r"\N",
                cfg["county_fips"], f(lat), f(lon), r"\N",
            ]) + "\n")
        buf.seek(0)
        cur.copy_expert("""COPY stage (jurisdiction,source_system,permit_number,permit_type_raw,
            permit_category,issued_date,description,valuation,address,city,zip,county_fips,lat,lon,source_parcel_key)
            FROM STDIN""", buf)
        cur.execute("""
            INSERT INTO permits (jurisdiction,source_system,permit_number,permit_type_raw,permit_category,
                issued_date,description,valuation,address,city,zip,county_fips,lat,lon,geom,source_parcel_key)
            SELECT DISTINCT ON (jurisdiction, permit_number)
                jurisdiction,source_system,permit_number,permit_type_raw,permit_category,issued_date,
                description,valuation,address,city,zip,county_fips,lat,lon,
                CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN ST_SetSRID(ST_MakePoint(lon,lat),4326) END,
                source_parcel_key
            FROM stage ORDER BY jurisdiction, permit_number, issued_date DESC NULLS LAST
            ON CONFLICT (jurisdiction, permit_number) DO UPDATE SET
                permit_type_raw=EXCLUDED.permit_type_raw, permit_category=EXCLUDED.permit_category,
                issued_date=COALESCE(EXCLUDED.issued_date, permits.issued_date),
                description=EXCLUDED.description, valuation=EXCLUDED.valuation, address=EXCLUDED.address,
                lat=COALESCE(EXCLUDED.lat,permits.lat), lon=COALESCE(EXCLUDED.lon,permits.lon),
                geom=COALESCE(EXCLUDED.geom,permits.geom), loaded_at=now()
        """)
        conn.commit()
        return cur.rowcount

    for row in r:
        batch.append(row)
        if len(batch) >= PAGE:
            n = flush(batch); upserted += len(batch); batch = []
            print(f"  {upserted:,} rows ({time.time()-t0:.0f}s)", flush=True)
    flush(batch); upserted += len(batch)
    print(f"[{juris}] processed {upserted:,} CSV rows ({time.time()-t0:.0f}s)", flush=True)

    cur.execute("SELECT count(*), min(issued_date), max(issued_date) FROM permits WHERE jurisdiction=%s", (juris,))
    print(f"[{juris}] table now: {cur.fetchone()}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
