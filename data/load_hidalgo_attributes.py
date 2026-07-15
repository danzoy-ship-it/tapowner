"""Populate Hidalgo building attributes from HCAD's own ArcGIS FeatureServer.

Source: Hidalgo County GIS (hidgis) hosted feature layer republishing the
2026 HCAD certified parcel export -- free, public, ArcGIS Online:
  https://services9.arcgis.com/dwMDP55HTfoj4n1c/arcgis/rest/services/HCAD_PARCELS_2026/FeatureServer/1
(Hidalgo runs True Automation/esearch + a True Prodigy map portal; the bulk
certified roll is NOT published as a PACS zip. This GIS layer is the free bulk
door per DATA_HUNTING_PLAYBOOK.md recipe #3 -- but it carries sqft + year ONLY,
no beds/baths/pool. Those remain an app-lane fill-on-blank via the Prodigy API.)

Fields used: PROP_ID (== our source_property_id), imprvMainArea (living sqft),
imprvActualYearBuilt (year built). ~262K parcels with sqft, ~268K with year.

Join: parcels.source_property_id == str(int(PROP_ID)) (county_fips 48215).

Usage:
    DATABASE_URL=postgres://... python load_hidalgo_attributes.py [--dry-run]
"""

import io
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

LAYER_QUERY_URL = (
    "https://services9.arcgis.com/dwMDP55HTfoj4n1c/arcgis/rest/services/"
    "HCAD_PARCELS_2026/FeatureServer/1/query"
)
OUT_FIELDS = "PROP_ID,imprvMainArea,imprvActualYearBuilt"
HIDALGO_FIPS = "48215"
PAGE_SIZE = 2000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

import json


def fetch_page(offset: int):
    params = {
        "where": "PROP_ID IS NOT NULL",
        "outFields": OUT_FIELDS,
        "orderByFields": "PROP_ID",
        "returnGeometry": "false",
        "resultOffset": str(offset),
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

    staged = {}  # pid -> (sqft, yr)
    offset, total = 0, 0
    started = time.time()
    while True:
        feats = fetch_page(offset)
        if not feats:
            break
        for f in feats:
            a = f["attributes"]
            total += 1
            pid = a.get("PROP_ID")
            if pid is None:
                continue
            key = str(int(pid))
            sqft = clean_int(a.get("imprvMainArea"), 1, 2_000_000)
            yr = clean_int(a.get("imprvActualYearBuilt"), 1800, 2027)
            if sqft is None and yr is None:
                continue
            # Keep the largest sqft / earliest usable year if a pid repeats.
            prev = staged.get(key)
            if prev:
                sqft = max(x for x in (sqft, prev[0]) if x is not None) if (sqft or prev[0]) else None
                yr = yr or prev[1]
            staged[key] = (sqft, yr)
        offset += len(feats)
        if total % 100_000 < PAGE_SIZE:
            print(f"fetched {total:,} features ({time.time() - started:.0f}s)", flush=True)
        if dry_run and total >= 6000:
            print("dry-run: stopping fetch after ~6000 features", flush=True)
            break

    print(f"done fetching: {total:,} features, {len(staged):,} usable ({time.time() - started:.0f}s)", flush=True)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                "CREATE TEMP TABLE hid_attrs (pid TEXT PRIMARY KEY, sqft INT, yr INT)"
            )
            buf = io.StringIO()
            for pid, (sqft, yr) in staged.items():
                buf.write("\t".join([
                    pid,
                    r"\N" if sqft is None else str(sqft),
                    r"\N" if yr is None else str(yr),
                ]) + "\n")
            buf.seek(0)
            cur.copy_expert("COPY hid_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*), count(*) FILTER (WHERE a.sqft IS NOT NULL)
                   FROM hid_attrs a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                (HIDALGO_FIPS,),
            )
            j, js = cur.fetchone()
            print(f"joinable parcel rows: {j:,} (with sqft {js:,})", flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.sqft, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr)
                   FROM hid_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (HIDALGO_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE year_built IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (HIDALGO_FIPS,),
            )
            sqft, yr = cur.fetchone()
            print(f"Hidalgo: sqft={sqft:,} year={yr:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
