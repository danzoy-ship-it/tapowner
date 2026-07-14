"""Populate Collin building attributes on parcels from the Texas Open Data
Portal (Socrata) -- Collin CAD publishes its certified appraisal data there.

Dataset: https://data.texas.gov/resource/vffy-snc6 (Collin CAD Appraisal Data,
2025 certified). Join: parcels.source_property_id == propid (numeric PACS id,
format verified against live rows, county_fips 48085).

Fills living_area_sqft (imprvmainarea), has_pool (imprvpoolflag T/F -- both
directions for improved properties), and backfills year_built where null.

Usage:
    DATABASE_URL=... python load_collin_attributes.py [--dry-run]
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

COLLIN_FIPS = "48085"
DATASET = "https://data.texas.gov/resource/vffy-snc6.json"
PAGE = 50_000


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def fetch_page(offset: int, limit: int):
    params = {
        "$select": "propid,imprvyearbuilt,imprvmainarea,imprvpoolflag",
        "$limit": str(limit),
        "$offset": str(offset),
        "$order": "propid",
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
        rows = fetch_page(offset, PAGE if not dry_run else 5000)
        if not rows:
            break
        for r in rows:
            pid = (r.get("propid") or "").strip()
            if not pid:
                continue
            living = to_int(r.get("imprvmainarea"), 1, 2_000_000)
            yr = to_int(r.get("imprvyearbuilt"), 1800, 2027)
            pool = str(r.get("imprvpoolflag", "")).strip().upper() in ("T", "TRUE", "Y", "1")
            has_improvement = living is not None or yr is not None
            if not has_improvement and not pool:
                continue
            prev = accounts.get(pid)
            if prev is None:
                accounts[pid] = [living, yr, pool]
            else:
                if (living or 0) > (prev[0] or 0):
                    prev[0], prev[1] = living, yr or prev[1]
                prev[2] = prev[2] or pool
        offset += len(rows)
        print(f"fetched {offset:,} rows ({time.time() - started:.0f}s)", flush=True)
        if dry_run:
            break
        if len(rows) < PAGE:
            break

    print(f"aggregated {len(accounts):,} properties with attributes", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "CREATE TEMP TABLE collin_attrs (pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN)"
    )
    buf = io.StringIO()
    for pid, (living, yr, pool) in accounts.items():
        buf.write(
            "\t".join(
                [
                    pid,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    "t" if pool else "f",
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY collin_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM collin_attrs c
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = c.pid""",
        (COLLIN_FIPS,),
    )
    print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(c.living, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, c.yr),
               has_pool         = COALESCE(c.pool, p.has_pool)
           FROM collin_attrs c
           WHERE p.county_fips = %s AND p.source_property_id = c.pid""",
        (COLLIN_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                  count(*) FILTER (WHERE has_pool) AS pools
           FROM parcels WHERE county_fips = %s""",
        (COLLIN_FIPS,),
    )
    sqft, pools = cur.fetchone()
    print(f"Collin parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)


if __name__ == "__main__":
    main()
