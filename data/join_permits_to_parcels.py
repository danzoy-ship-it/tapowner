"""Match permits.parcel_id -> parcels(id) for a jurisdiction. Two passes,
key-match first (cheap, exact) then spatial fallback:

  1. KEY: if the permit carries the jurisdiction's own parcel id (source_parcel_key,
     e.g. Austin tcad_id), match it to parcels.apn / source_property_id in the SAME
     county (numeric compare, so leading-zero differences like 0100060150 vs
     100060150 still match).
  2. SPATIAL: for permits still unmatched that have a geom point, ST_Contains the
     parcel polygon (county-scoped, uses the parcels GIST index).

Idempotent — only fills NULL parcel_id, safe to re-run after each load.

Usage: DATABASE_URL=... python join_permits_to_parcels.py <jurisdiction>
"""
import os
import sys
import time

import psycopg2


def main():
    juris = sys.argv[1]
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='15s'")
    cur.execute("SET statement_timeout='600s'")

    cur.execute("SELECT count(*), count(*) FILTER (WHERE parcel_id IS NOT NULL) FROM permits WHERE jurisdiction=%s", (juris,))
    tot, pre = cur.fetchone()
    print(f"[{juris}] {tot:,} permits, {pre:,} already matched", flush=True)

    # Pass 1 — key match on apn, then source_property_id (numeric, county-scoped).
    for keycol in ("apn", "source_property_id"):
        t0 = time.time()
        cur.execute(f"""
            UPDATE permits pm SET parcel_id = p.id
            FROM parcels p
            WHERE pm.jurisdiction=%s AND pm.parcel_id IS NULL
              AND pm.source_parcel_key ~ '^[0-9]+$'
              AND p.county_fips = pm.county_fips
              AND p.{keycol} ~ '^[0-9]+$'
              AND p.{keycol}::bigint = pm.source_parcel_key::bigint
        """, (juris,))
        print(f"  key match ({keycol}): +{cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
        conn.commit()

    # Pass 2 — spatial fallback for the remainder that have a point.
    t0 = time.time()
    cur.execute("""
        UPDATE permits pm SET parcel_id = p.id
        FROM parcels p
        WHERE pm.jurisdiction=%s AND pm.parcel_id IS NULL AND pm.geom IS NOT NULL
          AND p.county_fips = pm.county_fips
          AND p.geom IS NOT NULL
          AND ST_Contains(p.geom, pm.geom)
    """, (juris,))
    print(f"  spatial match: +{cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
    conn.commit()

    # Pass 3 — normalized-address fallback (for jurisdictions with no key/geom,
    # e.g. Dallas). Normalize both sides: uppercase, strip unit/suite/bldg/apt/#
    # tails, collapse whitespace. Exact match on the normalized street address
    # within the county. Imperfect but honest partial coverage.
    norm = (r"regexp_replace(regexp_replace(upper({col}), "
            r"'\\s+(STE|SUITE|APT|UNIT|BLDG|BLD|#|LOT|SPACE|SPC|RM|ROOM|FL|FLOOR)\\b.*$', ''), "
            r"'\\s+', ' ', 'g')")
    have_addr = 0
    cur.execute("SELECT count(*) FROM permits WHERE jurisdiction=%s AND parcel_id IS NULL AND address IS NOT NULL", (juris,))
    have_addr = cur.fetchone()[0]
    if have_addr:
        t0 = time.time()
        cur.execute(f"""
            UPDATE permits pm SET parcel_id = p.id
            FROM parcels p
            WHERE pm.jurisdiction=%s AND pm.parcel_id IS NULL AND pm.address IS NOT NULL
              AND p.county_fips = pm.county_fips AND p.situs_address IS NOT NULL
              AND trim({norm.format(col='p.situs_address')}) = trim({norm.format(col='pm.address')})
              AND trim({norm.format(col='pm.address')}) <> ''
        """, (juris,))
        print(f"  address match: +{cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
        conn.commit()

    cur.execute("""SELECT count(*) FILTER (WHERE parcel_id IS NOT NULL),
                          count(*) FILTER (WHERE parcel_id IS NOT NULL AND permit_category IN ('roof','solar'))
                   FROM permits WHERE jurisdiction=%s""", (juris,))
    matched, roofer = cur.fetchone()
    print(f"[{juris}] now matched: {matched:,}/{tot:,} ({100*matched/max(tot,1):.0f}%) | roof+solar matched: {roofer:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
