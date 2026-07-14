"""Populate Bexar building attributes (sqft, year built, stories) on parcels.

Source: Bexar County GIS "Parcels" ArcGIS layer (free, public, no key) --
https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer/0
Join: parcels.source_property_id == layer PropID (validated 1:1 on a known
home; PropID may repeat across condo sub-units, which correctly share
building attributes).

Fills living_area_sqft from TOT_GBA/GBA (gross building area -- the assessor's
building sqft; may include attached garage), stories, and backfills year_built
only where null. has_pool is NOT in this layer (needs BCAD's full improvement
export via open-records request).

Usage:
    DATABASE_URL=postgres://... python load_bexar_attributes.py [--dry-run]

--dry-run fetches ~2000 rows, reports joinability, and rolls back.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

LAYER_QUERY_URL = "https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer/0/query"
OUT_FIELDS = "OBJECTID,PropID,YrBlt,Stories,GBA,TOT_GBA"
BEXAR_FIPS = "48029"
PAGE_SIZE = 1000


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
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=90) as resp:
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


def clean_num(value, lo, hi):
    try:
        n = float(str(value).strip())
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """CREATE TEMP TABLE bexar_attrs (
               prop_id TEXT PRIMARY KEY,
               gba     INTEGER,
               yr_blt  INTEGER,
               stories NUMERIC
           )"""
    )

    last_oid, total, usable = 0, 0, 0
    started = time.time()
    while True:
        feats = fetch_page(last_oid)
        if not feats:
            break
        rows = []
        for f in feats:
            a = f["attributes"]
            last_oid = max(last_oid, a["OBJECTID"])
            total += 1
            pid = a.get("PropID")
            if pid is None:
                continue
            gba = clean_int(a.get("TOT_GBA") or a.get("GBA"), 1, 2_000_000)
            yr = clean_int(a.get("YrBlt"), 1800, 2027)
            st = clean_num(a.get("Stories"), 0.5, 60)
            if gba is None and yr is None and st is None:
                continue
            rows.append((str(int(pid)), gba, yr, st))
            usable += 1
        if rows:
            args = b",".join(cur.mogrify("(%s,%s,%s,%s)", r) for r in rows)
            cur.execute(
                b"INSERT INTO bexar_attrs (prop_id, gba, yr_blt, stories) VALUES "
                + args
                + b" ON CONFLICT (prop_id) DO NOTHING"
            )
        if total % 50_000 < PAGE_SIZE:
            print(
                f"fetched {total:,} features ({time.time() - started:.0f}s, last OBJECTID {last_oid})",
                flush=True,
            )
        if dry_run and total >= 2000:
            print("dry-run: stopping fetch after ~2000 features", flush=True)
            break

    print(f"done fetching: {total:,} features, {usable:,} with usable attributes", flush=True)

    cur.execute("SELECT count(*) FROM bexar_attrs")
    print("distinct prop_ids staged:", cur.fetchone()[0], flush=True)
    cur.execute(
        """SELECT count(*) FROM bexar_attrs b
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = b.prop_id""",
        (BEXAR_FIPS,),
    )
    print("joinable parcel rows:", cur.fetchone()[0], flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(b.gba, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, b.yr_blt),
               stories          = COALESCE(b.stories, p.stories)
           FROM bexar_attrs b
           WHERE p.county_fips = %s AND p.source_property_id = b.prop_id""",
        (BEXAR_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        "SELECT count(*) FROM parcels WHERE county_fips = %s AND living_area_sqft IS NOT NULL",
        (BEXAR_FIPS,),
    )
    print("Bexar parcels with sqft now:", cur.fetchone()[0], flush=True)


if __name__ == "__main__":
    main()
