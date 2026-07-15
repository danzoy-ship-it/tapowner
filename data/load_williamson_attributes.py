"""Populate Williamson building attributes from WCAD's own Socrata portal.

Dataset: https://data.wcad.org/resource/cvyp-ab5t ("Property Characteristics",
refreshed daily). Join: parcels.source_property_id == quickrefid (R-prefixed,
format verified against live rows, county_fips 48491).

Fills living_area_sqft (sqftcur), has_pool (pool 0/1 -- both directions),
has_garage (garage 0/1), and backfills year_built (actyrbuilt).

Beds/baths (added 2026-07-15): the dataset DOES carry them as SPARSE columns
(Socrata omits null fields, so they don't show on every row -- inspect the
DATA, not the first row's keys):
  fbedrooms    -> bedrooms   (67.6K populated; clamp 1..20, garbage like 928/
                              3120 are sqft bleed-through and get dropped)
  fplumbing    -> baths_full (221K populated; number of full baths)
  fnumhalfbath -> baths_half (72K populated; number of half baths)

Usage:
    DATABASE_URL=... python load_williamson_attributes.py [--dry-run]
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

FIPS = "48491"
DATASET = "https://data.wcad.org/resource/cvyp-ab5t.json"
PAGE = 50_000


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def fetch_page(offset: int, limit: int):
    params = {
        "$select": "quickrefid,sqftcur,actyrbuilt,pool,garage,fbedrooms,fplumbing,fnumhalfbath",
        "$limit": str(limit),
        "$offset": str(offset),
        "$order": "quickrefid",
    }
    url = DATASET + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.load(resp)
        except Exception:
            if attempt == 4:
                raise
            time.sleep(3 * (attempt + 1))


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    accounts = {}
    offset, started = 0, time.time()
    while True:
        rows = fetch_page(offset, 5000 if dry_run else PAGE)
        if not rows:
            break
        for r in rows:
            qid = (r.get("quickrefid") or "").strip()
            if not qid:
                continue
            living = to_int(r.get("sqftcur"), 1, 2_000_000)
            yr = to_int(r.get("actyrbuilt"), 1800, 2027)
            pool = (to_int(r.get("pool"), 0, 100) or 0) > 0
            garage = (to_int(r.get("garage"), 0, 100) or 0) > 0
            beds = to_int(r.get("fbedrooms"), 1, 20)
            bfull = to_int(r.get("fplumbing"), 1, 20)
            bhalf = to_int(r.get("fnumhalfbath"), 0, 10)
            if (living is None and yr is None and not pool and not garage
                    and beds is None and bfull is None and bhalf is None):
                continue
            prev = accounts.get(qid)
            if prev is None:
                accounts[qid] = [living, yr, pool, garage, beds, bfull, bhalf]
            else:
                if (living or 0) > (prev[0] or 0):
                    # main dwelling row (largest sqft) wins for beds/baths too
                    prev[0], prev[1] = living, yr or prev[1]
                    prev[4] = beds if beds is not None else prev[4]
                    prev[5] = bfull if bfull is not None else prev[5]
                    prev[6] = bhalf if bhalf is not None else prev[6]
                else:
                    prev[4] = prev[4] if prev[4] is not None else beds
                    prev[5] = prev[5] if prev[5] is not None else bfull
                    prev[6] = prev[6] if prev[6] is not None else bhalf
                prev[2] = prev[2] or pool
                prev[3] = prev[3] or garage
        offset += len(rows)
        print(f"fetched {offset:,} rows ({time.time() - started:.0f}s)", flush=True)
        if dry_run or len(rows) < (5000 if dry_run else PAGE):
            break

    print(f"aggregated {len(accounts):,} properties", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "CREATE TEMP TABLE wm_attrs (qid TEXT PRIMARY KEY, living INT, yr INT, "
        "pool BOOLEAN, garage BOOLEAN, beds INT, bfull INT, bhalf INT)"
    )
    buf = io.StringIO()
    for qid, (living, yr, pool, garage, beds, bfull, bhalf) in accounts.items():
        buf.write(
            "\t".join(
                [
                    qid,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    "t" if pool else "f",
                    "t" if garage else "f",
                    r"\N" if beds is None else str(beds),
                    r"\N" if bfull is None else str(bfull),
                    r"\N" if bhalf is None else str(bhalf),
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY wm_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM wm_attrs a
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.qid""",
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
               year_built       = COALESCE(p.year_built, a.yr),
               has_pool         = COALESCE(a.pool, p.has_pool),
               has_garage       = COALESCE(a.garage, p.has_garage),
               bedrooms         = COALESCE(a.beds, p.bedrooms),
               baths_full       = COALESCE(a.bfull, p.baths_full),
               baths_half       = COALESCE(a.bhalf, p.baths_half)
           FROM wm_attrs a
           WHERE p.county_fips = %s AND p.source_property_id = a.qid""",
        (FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                  count(*) FILTER (WHERE has_pool) AS pools,
                  count(*) FILTER (WHERE bedrooms IS NOT NULL) AS beds,
                  count(*) FILTER (WHERE baths_full IS NOT NULL) AS baths
           FROM parcels WHERE county_fips = %s""",
        (FIPS,),
    )
    sqft, pools, beds, baths = cur.fetchone()
    print(f"Williamson parcels with sqft: {sqft:,} | pool: {pools:,} | "
          f"beds: {beds:,} | baths: {baths:,}", flush=True)


if __name__ == "__main__":
    main()
