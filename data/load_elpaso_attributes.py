"""Populate El Paso building attributes from EPCAD's ABE public dumps.

Source: epcad.org OpenGovernment "abepublicfiles" (free, public) --
  Properties{YEAR}Dump.txt   (~-delimited: dbId, PropertyId, legal, agent, GeoID, …)
  Improvements{YEAR}Dump.txt (~-delimited: impId, Type, stateCd, LivingArea,
                              value, Description, classCd, extWall, YearBuilt,
                              SquareFootage, Year, Property_dbId, bldgId, TypeCD)
Join chain: Improvements.Property_dbId -> Properties.PropertyId (col1, NOT the
            col0 "dbId" despite the schema name) -> Properties.GeoID == parcels.apn
            (both 'C83499900500300' form; validated live, 8/8 on col1).

The old loader keyed EPCAD prop_id -> StratMap source_property_id and overlapped
only ~5%; GeoID==apn is the right key. Dwelling = TypeCD MA/MU/MG/M (MAIN AREA /
MAIN-UPPER / MAIN-GROUND / MAIN) — SquareFootage summed per property (floors).
Pool = any "SWIMMING POOL" improvement.

Usage:
    DATABASE_URL=... python load_elpaso_attributes.py <Properties.zip> <Improvements.zip> [--dry-run]
"""

import io
import os
import re
import sys
import time
import zipfile

import psycopg2

FIPS = "48141"
DWELLING_TYPECD = {"MA", "MU", "MG", "M"}
POOL_RE = re.compile(r"swimming pool", re.I)


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def open_member(zip_path: str):
    zf = zipfile.ZipFile(zip_path)
    member = next(n for n in zf.namelist() if n.lower().endswith(".txt"))
    return zf.open(member)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if len(args) < 2:
        print("usage: load_elpaso_attributes.py <Properties.zip> <Improvements.zip> [--dry-run]")
        sys.exit(1)
    props_zip, impr_zip = args[0], args[1]
    started = time.time()

    # PropertyId (col1) -> GeoID (col4). Improvements.Property_dbId references
    # this PropertyId, not the col0 dbId (confirmed 8/8 on a live sample).
    pid_to_geo = {}
    with open_member(props_zip) as raw:
        t = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for line in t:
            c = line.rstrip("\n").split("~")
            if len(c) < 5:
                continue
            pid = c[1].strip()
            geo = c[4].strip()
            if pid and geo:
                pid_to_geo[pid] = geo
    print(f"properties: {len(pid_to_geo):,} PropertyId->GeoID ({time.time() - started:.0f}s)", flush=True)

    # GeoID -> [living_sqft, year_built, pool]
    geo = {}
    with open_member(impr_zip) as raw:
        t = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for line in t:
            c = line.rstrip("\n").split("~")
            if len(c) < 14:
                continue
            g = pid_to_geo.get(c[11].strip())
            if not g:
                continue
            entry = geo.setdefault(g, [None, None, False])
            desc = c[5].strip()
            if POOL_RE.search(desc):
                entry[2] = True
            if c[13].strip().upper() in DWELLING_TYPECD:
                sqft = to_int(c[9], 1, 2_000_000)
                yr = to_int(c[8], 1800, 2027)
                if sqft:
                    entry[0] = (entry[0] or 0) + sqft
                entry[1] = entry[1] or yr

    geo = {k: v for k, v in geo.items() if v[0] or v[1] or v[2]}
    print(f"aggregated {len(geo):,} GeoIDs ({time.time() - started:.0f}s)", flush=True)

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
                "CREATE TEMP TABLE ep_attrs (apn TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN)"
            )
            buf = io.StringIO()
            for apn, (living, yr, pool) in geo.items():
                buf.write(
                    "\t".join(
                        [
                            apn,
                            r"\N" if living is None else str(living),
                            r"\N" if yr is None else str(yr),
                            "t" if pool else "f",
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY ep_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*) FROM parcels p
                   JOIN ep_attrs a ON p.county_fips = %s AND p.apn = a.apn""",
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
                       has_pool         = COALESCE(a.pool, p.has_pool)
                   FROM ep_attrs a
                   WHERE p.county_fips = %s AND p.apn = a.apn""",
                (FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE year_built IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (FIPS,),
            )
            sqft_n, pools, yr_n = cur.fetchone()
            print(
                f"El Paso parcels with sqft: {sqft_n:,} | pools: {pools:,} | year_built: {yr_n:,}",
                flush=True,
            )
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
