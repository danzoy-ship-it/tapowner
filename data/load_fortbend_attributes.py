"""Populate Fort Bend building attributes from FBCAD's live CamaSummary layer.

Source: FBCAD ArcGIS "CamaSummary" FeatureServer (free, public, no key) --
https://services2.arcgis.com/D4saGHECICkCeoJm/arcgis/rest/services/CamaSummary_/FeatureServer/0
Fills living_area_sqft (TotalLivin) and backfills year_built (YearBuilt).

Join: parcels.apn == PropertyNu (both the quadrant form '5910-04-022-0700-907').
The earlier loader joined UID -> source_property_id, which overlapped only ~⅓
of StratMap ids; PropertyNu==apn is the right key (validated 6/6 live). apn is
not perfectly unique in FB (~8K dupes of 374K), harmless for a COALESCE fill.
No beds/baths/pool in this export.

Usage:
    DATABASE_URL=... python load_fortbend_attributes.py [--dry-run]

--dry-run fetches ~4000 rows, reports joinability, and rolls back.
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

FIPS = "48157"
LAYER_QUERY_URL = (
    "https://services2.arcgis.com/D4saGHECICkCeoJm/arcgis/rest/services/"
    "CamaSummary_/FeatureServer/0/query"
)
OUT_FIELDS = "FID,PropertyNu,TotalLivin,YearBuilt"
PAGE_SIZE = 2000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def fetch_page(last_fid: int):
    params = {
        "where": f"FID > {last_fid}",
        "outFields": OUT_FIELDS,
        "orderByFields": "FID",
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


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    # Fetch everything before opening the DB connection (proxy drops idle links).
    staged = {}
    last_fid, total = 0, 0
    started = time.time()
    while True:
        feats = fetch_page(last_fid)
        if not feats:
            break
        for f in feats:
            a = f["attributes"]
            last_fid = max(last_fid, a["FID"])
            total += 1
            apn = (a.get("PropertyNu") or "").strip()
            if not apn:
                continue
            living = to_int(a.get("TotalLivin"), 1, 2_000_000)
            yr = to_int(a.get("YearBuilt"), 1800, 2027)
            if living is None and yr is None:
                continue
            prev = staged.get(apn)
            if prev is None or (living or 0) > (prev[0] or 0):
                staged[apn] = (living, yr)
        if total % 40_000 < PAGE_SIZE:
            print(
                f"fetched {total:,} features ({time.time() - started:.0f}s, last FID {last_fid})",
                flush=True,
            )
        if dry_run and total >= 4000:
            print("dry-run: stopping fetch after ~4000 features", flush=True)
            break

    print(f"done fetching: {total:,} features, {len(staged):,} usable apns", flush=True)

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
            cur.execute("CREATE TEMP TABLE fb_attrs (apn TEXT PRIMARY KEY, living INT, yr INT)")
            buf = io.StringIO()
            for apn, (living, yr) in staged.items():
                buf.write(
                    "\t".join(
                        [
                            apn,
                            r"\N" if living is None else str(living),
                            r"\N" if yr is None else str(yr),
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY fb_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*) FROM parcels p
                   JOIN fb_attrs a ON p.county_fips = %s AND p.apn = a.apn""",
                (FIPS,),
            )
            print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr)
                   FROM fb_attrs a
                   WHERE p.county_fips = %s AND p.apn = a.apn""",
                (FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE year_built IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (FIPS,),
            )
            sqft_n, yr_n = cur.fetchone()
            print(f"Fort Bend parcels with sqft: {sqft_n:,} | with year_built: {yr_n:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
