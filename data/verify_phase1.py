"""
Phase 1 acceptance-test checks (TAPOWNER_BUILD.md §4). Run after loading counties.

Usage:
    python verify_phase1.py --database-url "postgresql://..."
"""

import argparse
import json

import psycopg2
import psycopg2.extras


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    args = ap.parse_args()

    conn = psycopg2.connect(args.database_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("=== Row count ===")
    cur.execute("SELECT count(*) FROM parcels")
    print(cur.fetchone())

    print("\n=== Counties present ===")
    cur.execute("SELECT county_fips, county_name, count(*) FROM parcels GROUP BY 1,2 ORDER BY 2")
    for row in cur.fetchall():
        print(row)

    print("\n=== Protected-record sample ===")
    cur.execute("SELECT id, apn, owner_name, is_protected FROM parcels WHERE is_protected LIMIT 3")
    for row in cur.fetchall():
        print(row)

    print("\n=== Absentee sample ===")
    cur.execute("SELECT id, apn, situs_city, mailing_city, is_absentee FROM parcels WHERE is_absentee = TRUE LIMIT 3")
    for row in cur.fetchall():
        print(row)

    print("\n=== Point-in-polygon query performance (EXPLAIN) ===")
    # A point inside downtown San Antonio (Bexar) -- generic, not a specific address,
    # just to prove the GIST index is used and timing is fast.
    cur.execute(
        """
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT id, apn, owner_name FROM parcels
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(-98.4936, 29.4241), 4326))
        """
    )
    for row in cur.fetchall():
        print(list(row.values())[0])

    print("\n=== Sample property detail fields (spot-check readiness) ===")
    cur.execute(
        """
        SELECT id, apn, situs_address, owner_name, year_built, lot_size_sqft,
               living_area_sqft, has_pool, last_sale_price, assessed_total_value
        FROM parcels WHERE county_fips = '48029' AND owner_name IS NOT NULL
        LIMIT 3
        """
    )
    for row in cur.fetchall():
        print(row)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
