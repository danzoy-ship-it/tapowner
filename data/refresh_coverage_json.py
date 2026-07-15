"""Refresh coverage.json from the live DB — the per-county attribute counts that
build_coverage_log.py renders into COUNTY_COVERAGE.md. Run this BEFORE
build_coverage_log.py so the scoreboard reflects the current parcels table.

Usage: DATABASE_URL=... python refresh_coverage_json.py
"""
import json
import os

import psycopg2

OUT = ("C:/Users/danzo/AppData/Local/Temp/claude/"
       "C--Users-danzo-Tapowner/0f8b8247-afc5-410e-b454-4c95cb59a3f7/scratchpad/coverage.json")

c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                     keepalives_interval=10, keepalives_count=10, connect_timeout=20)
cur = c.cursor()
cur.execute("""
    SELECT county_fips,
           count(*)                                                     AS tot,
           count(*) FILTER (WHERE living_area_sqft IS NOT NULL)         AS sqft,
           count(*) FILTER (WHERE bedrooms IS NOT NULL)                 AS beds,
           count(*) FILTER (WHERE baths_full IS NOT NULL)               AS baths,
           count(*) FILTER (WHERE improvements IS NOT NULL)             AS improv,
           count(*) FILTER (WHERE last_sale_date IS NOT NULL)           AS sale,
           count(*) FILTER (WHERE array_length(exemptions,1) > 0)       AS exempt
    FROM parcels
    GROUP BY county_fips
""")
rows = [{"county_fips": f, "tot": str(t), "sqft": str(sq), "beds": str(b),
         "baths": str(ba), "improv": str(im), "sale": str(sa), "exempt": str(ex)}
        for f, t, sq, b, ba, im, sa, ex in cur.fetchall()]
c.close()
json.dump(rows, open(OUT, "w"))
print(f"wrote {len(rows)} county rows to coverage.json")
