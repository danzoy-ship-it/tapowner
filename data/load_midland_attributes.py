"""Populate Midland building attributes from the MCAD Web File export.

Source: midcad.org "MCAD Web File" zip (free), member export_webbld.txt --
comma-delimited, header row, no text qualifier (layout in the matrix file).
Dwelling rows: desc RESIDENCE / RESIDENCE (SECOND) / UPSTAIRS / MOBILE HOME
(codes RES/RES2/UPST/MH/MHP), floors summed. Pools: desc SWIMMING POOL.
Join: webbld_id 'R000000007' -> strip prefix letter + leading zeros -> '7'
== parcels.source_property_id (bare numeric; validated 4/5 live).

Usage:
    DATABASE_URL=... python load_midland_attributes.py <webfile.zip> [--dry-run]

The whole file is parsed either way; --dry-run reports the full-file join
rate and rolls back.
"""

import csv
import io
import os
import re
import sys
import time
import zipfile

import psycopg2

MIDLAND_FIPS = "48329"
POOL_RE = re.compile(r"pool", re.I)
DWELLING_RE = re.compile(r"\bRESIDENCE\b|UPSTAIRS|MOBILE HOME", re.I)


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
        print("usage: load_midland_attributes.py <webfile.zip> [--dry-run]")
        sys.exit(1)

    zf = zipfile.ZipFile(args[0])
    member = next(n for n in zf.namelist() if n.lower().endswith("export_webbld.txt"))
    print(f"reading {member}", flush=True)
    started = time.time()

    accounts = {}
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for row in csv.DictReader(text):
            raw_id = (row.get("webbld_id") or "").strip()
            pid = raw_id.lstrip("RMPX").lstrip("0")
            if not pid.isdigit():
                continue
            desc = (row.get("webbld_desc") or "").strip()
            entry = accounts.setdefault(pid, [None, None, False])
            if POOL_RE.search(desc):
                entry[2] = True
            if DWELLING_RE.search(desc):
                living = to_int(row.get("webbld_sqft"), 1, 2_000_000)
                yr = to_int(row.get("webbld_constyr"), 1800, 2027)
                if living:
                    entry[0] = (entry[0] or 0) + living
                entry[1] = entry[1] or yr

    accounts = {k: v for k, v in accounts.items() if v[0] or v[1] or v[2]}
    print(f"aggregated {len(accounts):,} accounts ({time.time() - started:.0f}s)", flush=True)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                "CREATE TEMP TABLE mcad_attrs (pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN)"
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
            cur.copy_expert("COPY mcad_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*) FROM mcad_attrs a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                (MIDLAND_FIPS,),
            )
            print("joinable parcel rows:", cur.fetchone()[0], flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr),
                       has_pool         = COALESCE(a.pool, p.has_pool)
                   FROM mcad_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (MIDLAND_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE has_pool)
                   FROM parcels WHERE county_fips = %s""",
                (MIDLAND_FIPS,),
            )
            sqft, pools = cur.fetchone()
            print(f"Midland parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
