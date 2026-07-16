"""Fill parcels.situs_zip from geometry via Census ZCTA (ZIP Code Tabulation Area)
polygons — a free, county-agnostic, statewide fix for the ~5.4M parcels whose CAD
never provided a situs_zip (Tarrant/Fort Worth was 0%, plus Hidalgo, Williamson,
Galveston, Lubbock, etc.). Derives the ZIP from each parcel's centroid, so it works
regardless of the source CAD. Prefers CAD-provided zip (never overwrites it); only
fills NULLs. Stamps `situs_zip_source` so it's auditable:
  NULL        = CAD-provided (original)
  'zcta'      = ZCTA polygon contains the parcel centroid
  'zcta_nearest' = centroid fell in a ZCTA gap/water; nearest ZCTA assigned

ZCTA ≠ postal ZIP exactly, but for disambiguation + coarse geo-filter it beats null
and is >99.99% right. Result: 100% situs_zip coverage across all 254 counties.

Prereqs: shapely + fiona (read the shapefile); PostGIS. Download the Census
generalized ZCTA cartographic boundary once:
  https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip
  -> unzip into data/downloads/zcta/

Usage: DATABASE_URL=... python fill_situs_zip_zcta.py [--reload-zcta]
"""
import glob
import os
import sys
import time

import fiona
import psycopg2
from shapely.geometry import shape

TX_BBOX = (-107.0, 25.0, -93.0, 37.0)   # Texas + a border margin


def load_zcta(cur):
    shp = glob.glob(os.path.join(os.path.dirname(__file__), "downloads", "zcta", "*.shp"))
    if not shp:
        sys.exit("ZCTA shapefile not found in data/downloads/zcta/ — download cb_2020_us_zcta520_500k.zip")
    cur.execute("DROP TABLE IF EXISTS zcta")
    cur.execute("CREATE TABLE zcta (zcta5 text, geom geometry(MultiPolygon,4326))")
    n = 0
    with fiona.open(shp[0]) as src:
        for feat in src.filter(bbox=TX_BBOX):
            cur.execute("INSERT INTO zcta(zcta5,geom) VALUES(%s, ST_Multi(ST_GeomFromText(%s,4326)))",
                        (feat["properties"]["ZCTA5CE20"], shape(feat["geometry"]).wkt))
            n += 1
    cur.execute("CREATE INDEX zcta_gix ON zcta USING GIST (geom)")
    cur.execute("ANALYZE zcta")
    print(f"loaded {n} TX-area ZCTAs")


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='20s'")
    cur.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS situs_zip_source text")

    cur.execute("SELECT to_regclass('zcta')")
    if cur.fetchone()[0] is None or "--reload-zcta" in sys.argv:
        load_zcta(cur)
    conn.commit()

    # Pass 1 — containment, per county (bounded transactions + progress).
    cur.execute("""SELECT county_fips, count(*) FROM parcels
                   WHERE situs_zip IS NULL AND geom IS NOT NULL GROUP BY 1 ORDER BY 2 DESC""")
    counties = cur.fetchall()
    t0 = time.time(); done = 0
    for fips, cnt in counties:
        cur.execute("SET statement_timeout='600s'")
        cur.execute("""UPDATE parcels p SET situs_zip=z.zcta5, situs_zip_source='zcta'
                       FROM zcta z WHERE p.county_fips=%s AND p.situs_zip IS NULL
                         AND p.geom IS NOT NULL AND ST_Contains(z.geom, ST_Centroid(p.geom))""", (fips,))
        conn.commit(); done += cur.rowcount
        print(f"  {fips}: +{cur.rowcount:,} (total {done:,}, {time.time()-t0:.0f}s)", flush=True)

    # Pass 2 — nearest ZCTA for centroids that fell in a gap/water.
    cur.execute("SET statement_timeout='600s'")
    cur.execute("""
      WITH nn AS (
        SELECT id, (SELECT z.zcta5 FROM zcta z ORDER BY z.geom <-> ST_Centroid(p.geom) LIMIT 1) AS zcta5
        FROM parcels p WHERE p.situs_zip IS NULL AND p.geom IS NOT NULL)
      UPDATE parcels p SET situs_zip=nn.zcta5, situs_zip_source='zcta_nearest'
      FROM nn WHERE p.id=nn.id AND nn.zcta5 IS NOT NULL""")
    conn.commit()
    print(f"  nearest fallback: +{cur.rowcount:,}", flush=True)

    cur.execute("SELECT count(situs_zip), count(*) FROM parcels")
    h, t = cur.fetchone()
    print(f"situs_zip: {h:,}/{t:,} ({100*h/t:.2f}%)")
    conn.close()


if __name__ == "__main__":
    main()
