"""Populate building attributes from a True Prodigy "nightly_appraisals" CSV.

Several Texas CADs on the True Prodigy platform publish a per-property CSV
(inside a zip) with standard columns: pid, imprvActualYearBuilt,
imprvMainArea. Join: parcels.source_property_id == pid. First verified county:
Denton (dentoncad.net .../gis/nightly_appraisals.zip).

Fills living_area_sqft (imprvMainArea) and backfills year_built. No beds/
baths/pool in this format.

Usage:
    DATABASE_URL=... python load_prodigy_csv_attributes.py <fips> path/to/file.zip [--dry-run]
"""

import csv
import io
import os
import sys
import time
import zipfile

import psycopg2


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if len(args) < 2:
        print("usage: load_prodigy_csv_attributes.py <fips> path/to/file.zip [--dry-run]")
        sys.exit(1)
    fips, zip_path = args[0], args[1]

    zf = zipfile.ZipFile(zip_path)
    member = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
    started = time.time()

    accounts = {}
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
        for i, row in enumerate(csv.DictReader(text)):
            pid = (row.get("pid") or "").strip()
            if not pid:
                continue
            living = to_int(row.get("imprvMainArea"), 1, 2_000_000)
            yr = to_int(row.get("imprvActualYearBuilt"), 1800, 2027)
            if living is None and yr is None:
                continue
            prev = accounts.get(pid)
            if prev is None or (living or 0) > (prev[0] or 0):
                accounts[pid] = [living, yr]
            if dry_run and i >= 50_000:
                print("dry-run: stopping parse", flush=True)
                break

    print(f"aggregated {len(accounts):,} properties ({time.time() - started:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("CREATE TEMP TABLE prodigy_attrs (pid TEXT PRIMARY KEY, living INT, yr INT)")
    buf = io.StringIO()
    for pid, (living, yr) in accounts.items():
        buf.write(
            "\t".join([pid, r"\N" if living is None else str(living), r"\N" if yr is None else str(yr)]) + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY prodigy_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM prodigy_attrs a
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
        (fips,),
    )
    print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(a.living, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, a.yr)
           FROM prodigy_attrs a
           WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
        (fips,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        "SELECT count(*) FROM parcels WHERE county_fips = %s AND living_area_sqft IS NOT NULL",
        (fips,),
    )
    print(f"parcels with sqft now: {cur.fetchone()[0]:,}", flush=True)


if __name__ == "__main__":
    main()
