"""Populate Harris building attributes on parcels from HCAD's public export.

Source: https://download.hcad.org/data/CAMA/{year}/Real_building_land.zip
(free instant download). Streams members straight out of the zip -- no 2.3GB
extraction. Join: parcels.source_property_id == acct (13-digit HCAD account,
format verified against live rows, county_fips 48201).

Fills living_area_sqft (heat_ar, heated area; fallback im_sq_ft), bedrooms /
baths_full / baths_half (fixtures RMB/RMF/RMH unit counts), has_pool (extra
feature descriptions containing "Pool", excluding heater-only and whirlpool
rows; FALSE for improved accounts with no pool feature), and backfills
year_built (date_erected) where null. Stories: not present in HCAD's files --
left untouched.

Usage:
    DATABASE_URL=... python load_harris_attributes.py path/to/Real_building_land.zip [--dry-run]
"""

import io
import os
import re
import sys
import time
import zipfile

import psycopg2

HARRIS_FIPS = "48201"
POOL_RE = re.compile(r"pool", re.I)
POOL_EXCLUDE_RE = re.compile(r"heater only|whirl", re.I)


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def stream_rows(zf: zipfile.ZipFile, member: str, limit=None):
    """Yield dict rows from a tab-delimited member with a header line."""
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        header = [h.strip() for h in text.readline().rstrip("\r\n").split("\t")]
        for i, line in enumerate(text):
            if limit is not None and i >= limit:
                return
            parts = line.rstrip("\r\n").split("\t")
            yield dict(zip(header, parts))


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_harris_attributes.py path/to/Real_building_land.zip [--dry-run]")
        sys.exit(1)
    zip_path = args[0]
    limit = 200_000 if dry_run else None

    started = time.time()
    zf = zipfile.ZipFile(zip_path)

    # acct -> [living, yr, beds, baths_full, baths_half, pool]
    accounts: dict = {}

    print("pass 1/3: building_res (living area, year built)…", flush=True)
    for row in stream_rows(zf, "building_res.txt", limit):
        acct = (row.get("acct") or "").strip()
        if not acct:
            continue
        living = to_int(row.get("heat_ar"), 1, 2_000_000) or to_int(row.get("im_sq_ft"), 1, 2_000_000)
        yr = to_int(row.get("date_erected"), 1800, 2027)
        if living is None and yr is None:
            continue
        prev = accounts.get(acct)
        if prev is None:
            accounts[acct] = [living, yr, None, None, None, False]
        elif (living or 0) > (prev[0] or 0):
            prev[0], prev[1] = living, yr or prev[1]
    print(f"  {len(accounts):,} accounts ({time.time() - started:.0f}s)", flush=True)

    print("pass 2/3: fixtures (beds/baths)…", flush=True)
    for row in stream_rows(zf, "fixtures.txt", limit):
        t = (row.get("type") or "").strip()
        if t not in ("RMB", "RMF", "RMH"):
            continue
        acct = (row.get("acct") or "").strip()
        entry = accounts.get(acct)
        if entry is None:
            continue
        units = to_int(row.get("units"), 1, 100)
        if units is None:
            continue
        idx = {"RMB": 2, "RMF": 3, "RMH": 4}[t]
        entry[idx] = (entry[idx] or 0) + units
    print(f"  done ({time.time() - started:.0f}s)", flush=True)

    print("pass 3/3: extra_features (pools)…", flush=True)
    pools = 0
    for row in stream_rows(zf, "extra_features.txt", limit):
        dscr = row.get("l_dscr") or ""
        if not POOL_RE.search(dscr) or POOL_EXCLUDE_RE.search(dscr):
            continue
        acct = (row.get("acct") or "").strip()
        entry = accounts.get(acct)
        if entry is not None and not entry[5]:
            entry[5] = True
            pools += 1
    print(f"  {pools:,} pool accounts ({time.time() - started:.0f}s)", flush=True)

    # Sanity caps on summed fixture counts (apartment-style accounts).
    for entry in accounts.values():
        if entry[2] is not None and entry[2] > 100:
            entry[2] = None
        if entry[3] is not None and entry[3] > 50:
            entry[3] = None
        if entry[4] is not None and entry[4] > 50:
            entry[4] = None

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """CREATE TEMP TABLE harris_attrs (
               acct TEXT PRIMARY KEY, living INT, yr INT,
               beds INT, baths_full INT, baths_half INT, pool BOOLEAN
           )"""
    )
    buf = io.StringIO()
    for acct, (living, yr, beds, bf, bh, pool) in accounts.items():
        buf.write(
            "\t".join(
                [
                    acct,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    r"\N" if beds is None else str(beds),
                    r"\N" if bf is None else str(bf),
                    r"\N" if bh is None else str(bh),
                    "t" if pool else "f",
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY harris_attrs FROM STDIN", buf)
    print("staged to temp table", flush=True)

    cur.execute(
        """SELECT count(*) FROM harris_attrs h
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = h.acct""",
        (HARRIS_FIPS,),
    )
    print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(h.living, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, h.yr),
               bedrooms         = COALESCE(h.beds, p.bedrooms),
               baths_full       = COALESCE(h.baths_full, p.baths_full),
               baths_half       = COALESCE(h.baths_half, p.baths_half),
               has_pool         = COALESCE(h.pool, p.has_pool)
           FROM harris_attrs h
           WHERE p.county_fips = %s AND p.source_property_id = h.acct""",
        (HARRIS_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                  count(*) FILTER (WHERE has_pool) AS pools
           FROM parcels WHERE county_fips = %s""",
        (HARRIS_FIPS,),
    )
    sqft, pools_db = cur.fetchone()
    print(f"Harris parcels with sqft: {sqft:,} | with pool: {pools_db:,}", flush=True)


if __name__ == "__main__":
    main()
