"""Repair the 51 counties stored in Web Mercator meters but stamped EPSG:4326.

Re-eval finding F1: the Phase-1 loader ignored each shapefile's CRS, so 51
counties' coordinates are EPSG:3857 meters labeled as degrees -- invisible on
the map and unmatchable by /parcels/at. The geometry VALUES are valid Web
Mercator, so the fix is an in-place ST_Transform per county -- no reload, no
new parcel ids (traces/saves/CRM references all survive).

Safety: per-county transaction; refuses to touch a county whose current bbox
already looks like degrees (guards double-transform); asserts the transformed
bbox lands inside Texas before committing.

Usage:
    DATABASE_URL=... python fix_misprojected_counties.py path/to/verify_results2.json
"""

import json
import os
import sys
import time

import psycopg2

TX = {"min_lng": -107.2, "max_lng": -93.2, "min_lat": 25.5, "max_lat": 36.8}


def connect():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    conn.autocommit = False
    return conn


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: fix_misprojected_counties.py path/to/verify_results2.json")
        sys.exit(1)
    with open(sys.argv[1], encoding="utf-8") as f:
        rows = json.load(f)["corrupt_counties"]["rows"]

    conn = connect()
    cur = conn.cursor()

    fixed = skipped = failed = total_rows = 0
    for fips, name, expected in rows:
        started = time.time()
        # The public proxy drops long-lived connections; each county is its own
        # transaction, so reconnect and carry on (the degrees-guard below makes
        # re-running any county a no-op).
        try:
            cur.execute("SELECT 1")
        except psycopg2.OperationalError:
            print("connection dropped -- reconnecting", flush=True)
            try:
                conn.close()
            except Exception:
                pass
            conn = connect()
            cur = conn.cursor()
        # Current bbox: mercator meters are ~1e5..1e7 in absolute value.
        cur.execute(
            """SELECT ST_XMin(e), ST_XMax(e), ST_YMin(e), ST_YMax(e) FROM (
                   SELECT ST_Extent(geom) AS e FROM parcels WHERE county_fips = %s
               ) s""",
            (fips,),
        )
        xmin, xmax, ymin, ymax = cur.fetchone()
        if xmin is None:
            print(f"{name} ({fips}): no rows, skipping")
            skipped += 1
            conn.rollback()
            continue
        if abs(xmin) <= 180 and abs(xmax) <= 180 and abs(ymin) <= 90 and abs(ymax) <= 90:
            print(f"{name} ({fips}): bbox already in degrees, skipping (fixed earlier?)")
            skipped += 1
            conn.rollback()
            continue

        cur.execute(
            """UPDATE parcels
               SET geom = ST_Transform(ST_SetSRID(geom, 3857), 4326)
               WHERE county_fips = %s""",
            (fips,),
        )
        n = cur.rowcount

        cur.execute(
            """SELECT ST_XMin(e), ST_XMax(e), ST_YMin(e), ST_YMax(e) FROM (
                   SELECT ST_Extent(geom) AS e FROM parcels WHERE county_fips = %s
               ) s""",
            (fips,),
        )
        nxmin, nxmax, nymin, nymax = cur.fetchone()
        ok = (
            TX["min_lng"] <= nxmin <= TX["max_lng"]
            and TX["min_lng"] <= nxmax <= TX["max_lng"]
            and TX["min_lat"] <= nymin <= TX["max_lat"]
            and TX["min_lat"] <= nymax <= TX["max_lat"]
        )
        if not ok:
            conn.rollback()
            failed += 1
            print(f"{name} ({fips}): TRANSFORM FAILED bbox=({nxmin},{nymin})..({nxmax},{nymax}) -- rolled back")
            continue

        conn.commit()
        fixed += 1
        total_rows += n
        print(
            f"{name} ({fips}): {n:,} rows -> ({nxmin:.3f},{nymin:.3f})..({nxmax:.3f},{nymax:.3f}) "
            f"[{time.time() - started:.1f}s]",
            flush=True,
        )

    print(f"\ndone: {fixed} counties fixed ({total_rows:,} rows), {skipped} skipped, {failed} failed")
    cur.execute("ANALYZE parcels")
    conn.commit()
    print("ANALYZE complete")


if __name__ == "__main__":
    main()
