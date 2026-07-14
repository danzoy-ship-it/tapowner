"""Populate Hays building attributes from HaysCAD's Property Data Export.

Source: hayscad.com/data-downloads -> "PROPERTY DATA EXPORT FILES" zip -> the
SEGMENT file (quoted CSV, RecordType 5): "MA" (Main Area) rows carry Area /
ActYrBuilt / Bedrooms; pool segments appear as Type/Description "POOL",
"POOL & SPA", "Above Ground Pool", etc. Join:
parcels.source_property_id == PropertyID (county_fips 48209).

Usage:
    DATABASE_URL=... python load_hays_attributes.py path/to/SEGMENT.txt [--dry-run]
"""

import csv
import io
import os
import re
import sys
import time

import psycopg2

FIPS = "48209"
POOL_RE = re.compile(r"pool", re.I)


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
        print("usage: load_hays_attributes.py path/to/SEGMENT.txt [--dry-run]")
        sys.exit(1)

    accounts = {}
    started = time.time()
    with open(args[0], newline="", encoding="latin-1") as f:
        for i, row in enumerate(csv.DictReader(f)):
            pid = (row.get("PropertyID") or "").strip()
            if not pid:
                continue
            entry = accounts.setdefault(pid, [None, None, None, False])
            desc = (row.get("Description") or "") + " " + (row.get("Type") or "")
            if POOL_RE.search(desc):
                entry[3] = True
            if (row.get("Type") or "").strip() == "MA":
                living = to_int(row.get("Area"), 1, 2_000_000)
                yr = to_int(row.get("ActYrBuilt"), 1800, 2027)
                beds = to_int(row.get("Bedrooms"), 1, 100)
                if living and (entry[0] or 0) < living:
                    entry[0], entry[1] = living, yr or entry[1]
                entry[1] = entry[1] or yr
                entry[2] = entry[2] or beds
            if dry_run and i >= 60_000:
                print("dry-run: stopping parse", flush=True)
                break

    accounts = {k: v for k, v in accounts.items() if v[0] or v[1] or v[2] or v[3]}
    print(f"aggregated {len(accounts):,} properties ({time.time() - started:.0f}s)", flush=True)

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
                "CREATE TEMP TABLE hays_attrs (pid TEXT PRIMARY KEY, living INT, yr INT, beds INT, pool BOOLEAN)"
            )
            buf = io.StringIO()
            for pid, (living, yr, beds, pool) in accounts.items():
                buf.write(
                    "\t".join(
                        [
                            pid,
                            r"\N" if living is None else str(living),
                            r"\N" if yr is None else str(yr),
                            r"\N" if beds is None else str(beds),
                            "t" if pool else "f",
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY hays_attrs FROM STDIN", buf)

            if dry_run:
                cur.execute(
                    """SELECT count(*) FROM hays_attrs a
                       JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                    (FIPS,),
                )
                print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr),
                       bedrooms         = COALESCE(a.beds, p.bedrooms),
                       has_pool         = COALESCE(a.pool, p.has_pool)
                   FROM hays_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
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
            print(f"Hays parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
