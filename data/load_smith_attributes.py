"""Populate Smith County (Tyler) building attributes (sqft, year built).

Source: Smith County public GIS "TaxParcelQuery" ArcGIS layer (free, no key) --
https://www.smithcountymapsite.org/publicgis/rest/services/Gallery/TaxParcelQuery/MapServer/1
Join: parcels.source_property_id == 'R' + layer PIN (zero-padded 6 digits;
validated live: PIN 064373 -> R064373). Duplicate PINs across split/condo
parcel rows correctly share building attributes.

Usage:
    DATABASE_URL=postgres://... python load_smith_attributes.py [--dry-run]

--dry-run fetches ~2000 rows, reports joinability, and rolls back.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

LAYER_QUERY_URL = (
    "https://www.smithcountymapsite.org/publicgis/rest/services/Gallery/TaxParcelQuery/MapServer/1/query"
)
OUT_FIELDS = "OBJECTID,PIN,YRBLT,SFLA"
SMITH_FIPS = "48423"
PAGE_SIZE = 1000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def fetch_page(last_oid: int):
    params = {
        "where": f"OBJECTID > {last_oid}",
        "outFields": OUT_FIELDS,
        "orderByFields": "OBJECTID",
        "returnGeometry": "false",
        "resultRecordCount": str(PAGE_SIZE),
        "f": "json",
    }
    url = LAYER_QUERY_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.load(resp)
            if "features" in data:
                return data["features"]
            raise RuntimeError(f"unexpected response: {str(data)[:200]}")
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))


def clean_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    # Fetch everything before opening the DB connection (proxy drops idle links).
    staged = {}
    last_oid, total = 0, 0
    started = time.time()
    while True:
        feats = fetch_page(last_oid)
        if not feats:
            break
        for f in feats:
            a = f["attributes"]
            last_oid = max(last_oid, a["OBJECTID"])
            total += 1
            pin = (str(a.get("PIN") or "")).strip()
            if not pin:
                continue
            sqft = clean_int(a.get("SFLA"), 1, 2_000_000)
            yr = clean_int(a.get("YRBLT"), 1800, 2027)
            if sqft is None and yr is None:
                continue
            staged.setdefault("R" + pin, (sqft, yr))
        if total % 25_000 < PAGE_SIZE:
            print(
                f"fetched {total:,} features ({time.time() - started:.0f}s, last OID {last_oid})",
                flush=True,
            )
        if dry_run and total >= 2000:
            print("dry-run: stopping fetch after ~2000 features", flush=True)
            break

    print(f"done fetching: {total:,} features, {len(staged):,} usable prop_ids", flush=True)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                "CREATE TEMP TABLE smith_attrs (prop_id TEXT PRIMARY KEY, sqft INT, yr INT)"
            )
            args = b",".join(
                cur.mogrify("(%s,%s,%s)", (pid, sqft, yr)) for pid, (sqft, yr) in staged.items()
            )
            cur.execute(b"INSERT INTO smith_attrs (prop_id, sqft, yr) VALUES " + args)

            cur.execute(
                """SELECT count(*) FROM smith_attrs a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.prop_id""",
                (SMITH_FIPS,),
            )
            print("joinable parcel rows:", cur.fetchone()[0], flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.sqft, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr)
                   FROM smith_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.prop_id""",
                (SMITH_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE year_built IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (SMITH_FIPS,),
            )
            sqft_n, yr_n = cur.fetchone()
            print(f"Smith parcels with sqft: {sqft_n:,} | with year_built: {yr_n:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
