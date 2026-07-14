"""Populate Williamson building attributes from WCAD's own Socrata portal.

Dataset: https://data.wcad.org/resource/cvyp-ab5t ("Property Characteristics",
refreshed daily). Join: parcels.source_property_id == quickrefid (R-prefixed,
format verified against live rows, county_fips 48491).

Fills living_area_sqft (sqftcur), has_pool (pool 0/1 -- both directions),
has_garage (garage 0/1), and backfills year_built (actyrbuilt). Bed/bath
fields are ambiguous in this dataset (fplumbing) -- skipped rather than
guessed.

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
        "$select": "quickrefid,sqftcur,actyrbuilt,pool,garage",
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
            if living is None and yr is None and not pool and not garage:
                continue
            prev = accounts.get(qid)
            if prev is None:
                accounts[qid] = [living, yr, pool, garage]
            else:
                if (living or 0) > (prev[0] or 0):
                    prev[0], prev[1] = living, yr or prev[1]
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
        "CREATE TEMP TABLE wm_attrs (qid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN, garage BOOLEAN)"
    )
    buf = io.StringIO()
    for qid, (living, yr, pool, garage) in accounts.items():
        buf.write(
            "\t".join(
                [
                    qid,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    "t" if pool else "f",
                    "t" if garage else "f",
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
               has_garage       = COALESCE(a.garage, p.has_garage)
           FROM wm_attrs a
           WHERE p.county_fips = %s AND p.source_property_id = a.qid""",
        (FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                  count(*) FILTER (WHERE has_pool) AS pools
           FROM parcels WHERE county_fips = %s""",
        (FIPS,),
    )
    sqft, pools = cur.fetchone()
    print(f"Williamson parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)


if __name__ == "__main__":
    main()
