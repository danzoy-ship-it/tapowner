"""Populate Tarrant has_garage from the City of Fort Worth parcel layer.

Source: CFW hosted ArcGIS layer (free, public; TAX_YEAR 2024 vintage) --
https://services5.arcgis.com/3ddLCBXe1bRt7mzj/arcgis/rest/services/Parcels_Public_Vview/FeatureServer/0
GARAGE_CAP > 0 on ~447K Tarrant rows (TAD's own current files have garage
wiped by the 2026 True Prodigy re-export; this 2024 snapshot still has it).
Join: parcels.source_property_id == GIS_LINK (validated live by the hunt,
incl. 416 N Bailey Ave). Multi-county layer — filtered to COUNTYNAME='Tarrant'.

Only sets has_garage=true where GARAGE_CAP>0; leaves everything else alone
(a 2024 snapshot shouldn't overwrite 2026 sqft/values).

Usage:
    DATABASE_URL=... python load_tarrant_garage.py [--dry-run]
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

LAYER_QUERY_URL = (
    "https://services5.arcgis.com/3ddLCBXe1bRt7mzj/arcgis/rest/services/"
    "Parcels_Public_Vview/FeatureServer/0/query"
)
TARRANT_FIPS = "48439"
PAGE_SIZE = 2000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)


def fetch_page(offset: int):
    params = {
        "where": "COUNTYNAME='Tarrant' AND GARAGE_CAP > 0",
        "outFields": "GIS_LINK,GARAGE_CAP",
        "orderByFields": "OBJECTID",
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


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    links: set[str] = set()
    offset, total = 0, 0
    started = time.time()
    while True:
        feats = fetch_page(offset)
        if not feats:
            break
        for f in feats:
            total += 1
            link = (f["attributes"].get("GIS_LINK") or "").strip()
            if link:
                links.add(link)
        offset += len(feats)
        if total % 50_000 < PAGE_SIZE:
            print(f"fetched {total:,} garage rows ({time.time() - started:.0f}s)", flush=True)
        if dry_run and total >= 4000:
            print("dry-run: stopping fetch after ~4000 rows", flush=True)
            break

    print(f"done fetching: {total:,} rows, {len(links):,} distinct GIS links", flush=True)

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=10,
    )
    cur = conn.cursor()
    cur.execute("CREATE TEMP TABLE cfw_garage (gis_link TEXT PRIMARY KEY)")
    import io

    buf = io.StringIO()
    for link in links:
        buf.write(link + "\n")
    buf.seek(0)
    cur.copy_expert("COPY cfw_garage FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM cfw_garage g
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = g.gis_link""",
        (TARRANT_FIPS,),
    )
    print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET has_garage = TRUE
           FROM cfw_garage g
           WHERE p.county_fips = %s AND p.source_property_id = g.gis_link
             AND (p.has_garage IS DISTINCT FROM TRUE)""",
        (TARRANT_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        "SELECT count(*) FROM parcels WHERE county_fips = %s AND has_garage",
        (TARRANT_FIPS,),
    )
    print(f"Tarrant parcels with garage: {cur.fetchone()[0]:,}", flush=True)


if __name__ == "__main__":
    main()
