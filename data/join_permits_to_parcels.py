"""Match permits.parcel_id -> parcels(id) for a jurisdiction. Three passes,
cheapest/most-exact first, each idempotent (only fills NULL parcel_id):

  1. KEY: the permit's own parcel id (source_parcel_key, e.g. Austin tcad_id) vs
     parcels.apn / source_property_id in the same county. Uses a temp INDEXED
     mapping table keyed on the leading-zero-stripped digits so 0100060150 (tcad)
     == 100060150 (apn) matches — and it scales (indexed text equality, not a
     per-row numeric cast).
  2. SPATIAL: remaining permits with a point -> ST_Contains the parcel polygon
     (county-scoped GIST index).
  3. ADDRESS: remaining permits with an address -> normalized street-address
     equality (temp indexed table; uppercase, strip unit/suite tails, collapse ws).

Usage: DATABASE_URL=... python join_permits_to_parcels.py <jurisdiction>
"""
import os
import sys
import time

import psycopg2

# SQL fragment: normalize an address column to a comparable street key.
# 1) upper; 2) cut everything from a comma OR a unit/suite/city token onward
#    (parcel situs often has ',DALLAS, TX 75219' inline; permits are street-only);
# 3) drop 'STE:450' style unit tails; 4) collapse whitespace.
NORM = (r"trim(regexp_replace(regexp_replace(upper({col}), "
        r"'\s*(,|\bSTE\b|\bSTE:|\bSUITE\b|\bAPT\b|\bUNIT\b|\bBLDG\b|\bBLD\b|#|\bLOT\b|\bSPACE\b|\bSPC\b|\bRM\b|\bROOM\b|\bFL\b|\bFLOOR\b).*$', ''), "
        r"'\s+', ' ', 'g'))")


def main():
    juris = sys.argv[1]
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='15s'")
    cur.execute("SET statement_timeout='900s'")

    cur.execute("SELECT count(*), count(*) FILTER (WHERE parcel_id IS NOT NULL), max(county_fips) FROM permits WHERE jurisdiction=%s", (juris,))
    tot, pre, fips = cur.fetchone()
    print(f"[{juris}] {tot:,} permits ({fips}), {pre:,} already matched", flush=True)

    # ---- Pass 1: key match via an indexed temp mapping (leading-zeros stripped).
    cur.execute("SELECT count(*) FROM permits WHERE jurisdiction=%s AND parcel_id IS NULL AND source_parcel_key ~ '^[0-9]+$'", (juris,))
    if cur.fetchone()[0]:
        for keycol in ("apn", "source_property_id"):
            t0 = time.time()
            cur.execute("DROP TABLE IF EXISTS pk")
            cur.execute(f"""CREATE TEMP TABLE pk AS
                SELECT ltrim({keycol}, '0') AS k, id FROM parcels
                WHERE county_fips=%s AND {keycol} ~ '^[0-9]+$'""", (fips,))
            cur.execute("CREATE INDEX pk_k ON pk(k)")
            cur.execute("ANALYZE pk")
            cur.execute("""UPDATE permits pm SET parcel_id = pk.id FROM pk
                           WHERE pm.jurisdiction=%s AND pm.parcel_id IS NULL
                             AND pm.source_parcel_key ~ '^[0-9]+$'
                             AND ltrim(pm.source_parcel_key,'0') = pk.k""", (juris,))
            print(f"  key match ({keycol}): +{cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
            conn.commit()

    # ---- Pass 2: spatial fallback via a county-scoped temp table + fresh GIST.
    # (A correlated county filter forces a per-permit BitmapAnd over the whole
    # county — pathologically slow; scoping parcels once fixes it.)
    cur.execute("SELECT count(*) FROM permits WHERE jurisdiction=%s AND parcel_id IS NULL AND geom IS NOT NULL", (juris,))
    if cur.fetchone()[0]:
        t0 = time.time()
        cur.execute("DROP TABLE IF EXISTS cp")
        cur.execute("CREATE TEMP TABLE cp AS SELECT id, geom FROM parcels WHERE county_fips=%s AND geom IS NOT NULL", (fips,))
        cur.execute("CREATE INDEX cp_gix ON cp USING GIST (geom)")
        cur.execute("ANALYZE cp")
        cur.execute("""UPDATE permits pm SET parcel_id = cp.id FROM cp
                       WHERE pm.jurisdiction=%s AND pm.parcel_id IS NULL AND pm.geom IS NOT NULL
                         AND ST_Contains(cp.geom, pm.geom)""", (juris,))
        print(f"  spatial match: +{cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
        conn.commit()

    # ---- Pass 3: normalized-address fallback via an indexed temp table.
    cur.execute("SELECT count(*) FROM permits WHERE jurisdiction=%s AND parcel_id IS NULL AND address IS NOT NULL", (juris,))
    if cur.fetchone()[0]:
        t0 = time.time()
        cur.execute("DROP TABLE IF EXISTS pa")
        cur.execute(f"""CREATE TEMP TABLE pa AS
            SELECT DISTINCT ON (trim({NORM.format(col='situs_address')})) trim({NORM.format(col='situs_address')}) AS k, id
            FROM parcels WHERE county_fips=%s AND situs_address IS NOT NULL
              AND trim({NORM.format(col='situs_address')}) <> ''""", (fips,))
        cur.execute("CREATE INDEX pa_k ON pa(k)")
        cur.execute("ANALYZE pa")
        cur.execute(f"""UPDATE permits pm SET parcel_id = pa.id FROM pa
                        WHERE pm.jurisdiction=%s AND pm.parcel_id IS NULL AND pm.address IS NOT NULL
                          AND trim({NORM.format(col='pm.address')}) = pa.k""", (juris,))
        print(f"  address match: +{cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
        conn.commit()

    cur.execute("""SELECT count(*) FILTER (WHERE parcel_id IS NOT NULL),
                          count(*) FILTER (WHERE parcel_id IS NOT NULL AND permit_category IN ('roof','solar'))
                   FROM permits WHERE jurisdiction=%s""", (juris,))
    matched, roofer = cur.fetchone()
    print(f"[{juris}] matched {matched:,}/{tot:,} ({100*matched/max(tot,1):.0f}%) | roof+solar matched: {roofer:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
