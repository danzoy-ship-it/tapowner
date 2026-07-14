"""Populate Dallas building attributes on parcels from DCAD's public export.

Source: DCAD "Data Products" DCAD{year}_CURRENT.ZIP -> RES_DETAIL.CSV
(https://www.dallascad.org/dataproducts.aspx, free instant download).
Join: parcels.source_property_id == RES_DETAIL.ACCOUNT_NUM (17-char DCAD
account number -- format verified against live rows, county_fips 48113).

Fills living_area_sqft (TOT_LIVING_AREA_SF, true living area), stories,
bedrooms, baths_full/baths_half, has_pool (POOL_IND -- true AND false, a real
"no pool" signal for residential accounts), and backfills year_built where
null. Multi-dwelling accounts keep the largest dwelling's attributes; pool is
OR'd across dwellings.

Usage:
    DATABASE_URL=... python load_dallas_attributes.py path/to/RES_DETAIL.CSV [--dry-run]
"""

import csv
import io
import os
import sys
import time

import psycopg2

DALLAS_FIPS = "48113"

STORIES_MAP = {
    "ONE STORY": 1.0,
    "ONE AND ONE HALF STORIES": 1.5,
    "TWO STORIES": 2.0,
    "TWO AND ONE HALF STORIES": 2.5,
    "THREE STORIES": 3.0,
}


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_dallas_attributes.py path/to/RES_DETAIL.CSV [--dry-run]")
        sys.exit(1)
    csv_path = args[0]

    # Aggregate per account: largest dwelling wins the attributes, pool is OR'd.
    accounts = {}
    started = time.time()
    with open(csv_path, newline="", encoding="utf-8", errors="replace") as f:
        for i, row in enumerate(csv.DictReader(f)):
            acct = row["ACCOUNT_NUM"].strip()
            if not acct:
                continue
            living = to_int(row.get("TOT_LIVING_AREA_SF"), 1, 2_000_000) or to_int(
                row.get("TOT_MAIN_SF"), 1, 2_000_000
            )
            yr = to_int(row.get("YR_BUILT"), 1800, 2027)
            stories = STORIES_MAP.get((row.get("NUM_STORIES_DESC") or "").strip())
            beds = to_int(row.get("NUM_BEDROOMS"), 1, 100)
            baths_full = to_int(row.get("NUM_FULL_BATHS"), 1, 100)
            baths_half = to_int(row.get("NUM_HALF_BATHS"), 0, 100)
            pool = (row.get("POOL_IND") or "").strip() == "Y"
            if living is None and yr is None and stories is None and not pool:
                continue

            prev = accounts.get(acct)
            if prev is None or (living or 0) > (prev[0] or 0):
                accounts[acct] = [living, yr, stories, beds, baths_full, baths_half, pool or (prev[6] if prev else False)]
            elif pool:
                prev[6] = True
            if i % 200_000 == 0 and i:
                print(f"parsed {i:,} rows ({time.time() - started:.0f}s)", flush=True)
            if dry_run and len(accounts) >= 20_000:
                print("dry-run: stopping parse at 20k accounts", flush=True)
                break

    print(f"aggregated {len(accounts):,} accounts with attributes", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """CREATE TEMP TABLE dallas_attrs (
               acct TEXT PRIMARY KEY, living INT, yr INT, stories NUMERIC,
               beds INT, baths_full INT, baths_half INT, pool BOOLEAN
           )"""
    )
    buf = io.StringIO()
    for acct, (living, yr, stories, beds, bf, bh, pool) in accounts.items():
        buf.write(
            "\t".join(
                [
                    acct,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    r"\N" if stories is None else str(stories),
                    r"\N" if beds is None else str(beds),
                    r"\N" if bf is None else str(bf),
                    r"\N" if bh is None else str(bh),
                    "t" if pool else "f",
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY dallas_attrs FROM STDIN", buf)
    print("staged to temp table", flush=True)

    cur.execute(
        """SELECT count(*) FROM dallas_attrs d
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = d.acct""",
        (DALLAS_FIPS,),
    )
    joinable = cur.fetchone()[0]
    print(f"joinable parcel rows: {joinable:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(d.living, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, d.yr),
               stories          = COALESCE(d.stories, p.stories),
               bedrooms         = COALESCE(d.beds, p.bedrooms),
               baths_full       = COALESCE(d.baths_full, p.baths_full),
               baths_half       = COALESCE(d.baths_half, p.baths_half),
               has_pool         = COALESCE(d.pool, p.has_pool)
           FROM dallas_attrs d
           WHERE p.county_fips = %s AND p.source_property_id = d.acct""",
        (DALLAS_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                  count(*) FILTER (WHERE has_pool) AS pools
           FROM parcels WHERE county_fips = %s""",
        (DALLAS_FIPS,),
    )
    sqft, pools = cur.fetchone()
    print(f"Dallas parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)


if __name__ == "__main__":
    main()
