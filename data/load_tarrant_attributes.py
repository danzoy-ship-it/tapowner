"""Populate Tarrant building attributes on parcels from TAD's public export.

Source: https://www.tad.org/content/data-download/PropertyData(Delimited)_R.ZIP
(residential, pipe-delimited, free instant download; browser UA required).
Join: parcels.source_property_id == GIS_Link (subdivision-block-lot, e.g.
"14437-29-32" -- exact format match verified against live rows, county_fips
48439). GIS_Link repeats across condo/sub-unit rows; largest dwelling wins,
pool OR'd.

Fills living_area_sqft (Living_Area), has_pool (Swimming_Pool_Ind Y/N -- both
directions), and backfills year_built where null. Beds/baths/garage are empty
in TAD's current legacy reformat (True Prodigy transition) -- skipped.

Usage:
    DATABASE_URL=... python load_tarrant_attributes.py path/to/Tarrant_R.zip [--dry-run]
"""

import io
import os
import sys
import time
import zipfile

import psycopg2

TARRANT_FIPS = "48439"


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
        print("usage: load_tarrant_attributes.py path/to/Tarrant_R.zip [--dry-run]")
        sys.exit(1)

    zf = zipfile.ZipFile(args[0])
    member = next(n for n in zf.namelist() if n.lower().endswith(".txt"))
    started = time.time()

    # gis_link -> [living, yr, pool]
    keys = {}
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        header = [h.strip() for h in text.readline().rstrip("\r\n").split("|")]
        idx = {h: i for i, h in enumerate(header)}
        gi, li, yi, pi = idx["GIS_Link"], idx["Living_Area"], idx["Year_Built"], idx["Swimming_Pool_Ind"]
        for n, line in enumerate(text):
            parts = line.rstrip("\r\n").split("|")
            if len(parts) <= max(gi, li, yi, pi):
                continue
            key = parts[gi].strip()
            if not key:
                continue
            living = to_int(parts[li], 1, 2_000_000)
            yr = to_int(parts[yi], 1800, 2027)
            pool = parts[pi].strip().upper() == "Y"
            if living is None and yr is None and not pool:
                continue
            prev = keys.get(key)
            if prev is None:
                keys[key] = [living, yr, pool]
            else:
                if (living or 0) > (prev[0] or 0):
                    prev[0], prev[1] = living, yr or prev[1]
                prev[2] = prev[2] or pool
            if dry_run and n >= 100_000:
                print("dry-run: stopping parse at 100k rows", flush=True)
                break

    print(f"aggregated {len(keys):,} GIS links ({time.time() - started:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """CREATE TEMP TABLE tarrant_attrs (
               gis_link TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN
           )"""
    )
    buf = io.StringIO()
    for key, (living, yr, pool) in keys.items():
        buf.write(
            "\t".join(
                [
                    key,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    "t" if pool else "f",
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY tarrant_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM tarrant_attrs t
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = t.gis_link""",
        (TARRANT_FIPS,),
    )
    print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(t.living, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, t.yr),
               has_pool         = COALESCE(t.pool, p.has_pool)
           FROM tarrant_attrs t
           WHERE p.county_fips = %s AND p.source_property_id = t.gis_link""",
        (TARRANT_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                  count(*) FILTER (WHERE has_pool) AS pools
           FROM parcels WHERE county_fips = %s""",
        (TARRANT_FIPS,),
    )
    sqft, pools = cur.fetchone()
    print(f"Tarrant parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)


if __name__ == "__main__":
    main()
