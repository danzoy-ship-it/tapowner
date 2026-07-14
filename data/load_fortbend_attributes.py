"""Populate Fort Bend building attributes from FBCAD's Open Data Hub.

Source: ArcGIS item 9d4668cb9eb440e3a3816af175395c92 ("CamaSummary" shapefile,
https://fbcad-open-data-hub-fortbend.hub.arcgis.com). Join:
parcels.source_property_id == UID (county_fips 48157). Fills living_area_sqft
(TotalLivin) and backfills year_built (YearBuilt). No beds/baths/pool in this
export.

Usage:
    DATABASE_URL=... python load_fortbend_attributes.py path/to/CamaSummary.shp [--dry-run]
"""

import io
import os
import sys
import time

import fiona
import psycopg2

FIPS = "48157"


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_fortbend_attributes.py path/to/CamaSummary.shp [--dry-run]")
        sys.exit(1)

    accounts = {}
    started = time.time()
    with fiona.open(args[0]) as src:
        for i, feat in enumerate(src):
            p = feat["properties"]
            uid = str(p.get("UID") or "").strip()
            if not uid:
                continue
            living = to_int(p.get("TotalLivin"), 1, 2_000_000)
            yr = to_int(p.get("YearBuilt"), 1800, 2027)
            if living is None and yr is None:
                continue
            prev = accounts.get(uid)
            if prev is None or (living or 0) > (prev[0] or 0):
                accounts[uid] = [living, yr]
            if dry_run and i >= 30_000:
                print("dry-run: stopping parse", flush=True)
                break

    print(f"aggregated {len(accounts):,} properties ({time.time() - started:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("CREATE TEMP TABLE fb_attrs (pid TEXT PRIMARY KEY, living INT, yr INT)")
    buf = io.StringIO()
    for pid, (living, yr) in accounts.items():
        buf.write("\t".join([pid, r"\N" if living is None else str(living), r"\N" if yr is None else str(yr)]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY fb_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM fb_attrs a
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
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
           WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
        (FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        "SELECT count(*) FROM parcels WHERE county_fips = %s AND living_area_sqft IS NOT NULL",
        (FIPS,),
    )
    print(f"Fort Bend parcels with sqft now: {cur.fetchone()[0]:,}", flush=True)


if __name__ == "__main__":
    main()
