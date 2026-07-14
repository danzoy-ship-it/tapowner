"""Populate El Paso building attributes from EPCAD's public improvements dump.

Source: https://propertysearch.blob.core.windows.net/abepublicfiles/
Improvements2026Dump.zip (linked from epcad.org/OpenGovernment). Tilde-
delimited, headerless; one row per improvement segment:
  [0]=prop_id [1]=type desc [2]=state code [3]=improvement living total
  [5]=segment desc (MAIN AREA / GARAGE / POOL...) [8]=year built [9]=seg area
Join: parcels.source_property_id == prop_id (sample join test 74.7%,
county_fips 48141). MAIN AREA rows carry living/year; POOL/GARAGE segments
set the flags.

Usage:
    DATABASE_URL=... python load_elpaso_attributes.py path/to/Improvements2026Dump.zip [--dry-run]
"""

import io
import os
import sys
import time
import zipfile

import psycopg2

FIPS = "48141"


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
        print("usage: load_elpaso_attributes.py path/to/Improvements2026Dump.zip [--dry-run]")
        sys.exit(1)

    zf = zipfile.ZipFile(args[0])
    member = next(n for n in zf.namelist() if n.lower().endswith(".txt"))
    started = time.time()

    accounts = {}
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for i, line in enumerate(text):
            parts = line.rstrip("\r\n").split("~")
            if len(parts) < 10:
                continue
            pid = parts[0].strip()
            if not pid:
                continue
            entry = accounts.setdefault(pid, [None, None, False, False])
            desc = parts[5].strip().upper()
            if "POOL" in desc:
                entry[2] = True
            if "GARAGE" in desc or "CARPORT" in desc:
                entry[3] = True
            if desc.startswith("MAIN AREA"):
                living = to_int(parts[3], 1, 2_000_000)
                yr = to_int(parts[8], 1800, 2027)
                if living and (entry[0] or 0) < living:
                    entry[0] = living
                entry[1] = entry[1] or yr
            if dry_run and i >= 80_000:
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
                "CREATE TEMP TABLE ep_attrs (pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN, garage BOOLEAN)"
            )
            buf = io.StringIO()
            for pid, (living, yr, pool, garage) in accounts.items():
                buf.write(
                    "\t".join(
                        [
                            pid,
                            r"\N" if living is None else str(living),
                            r"\N" if yr is None else str(yr),
                            "t" if pool else "f",
                            "t" if garage else "f",
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY ep_attrs FROM STDIN", buf)

            if dry_run:
                cur.execute(
                    """SELECT count(*) FROM ep_attrs a
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
                       has_pool         = COALESCE(a.pool, p.has_pool),
                       has_garage       = COALESCE(a.garage, p.has_garage)
                   FROM ep_attrs a
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
            print(f"El Paso parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
