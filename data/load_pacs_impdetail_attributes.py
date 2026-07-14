"""Populate building attributes from a PACS APPRAISAL_IMPROVEMENT_DETAIL file.

Generic for any Texas CAD publishing the full PACS Legacy 8.0.33/34 certified
roll (fixed-width, 622-char rows; layout from the standard AppraisalExport
spreadsheet). First county: Guadalupe (free 2025 certified roll on
guadalupead.org — their PIA reply pointed straight at it).

Fields (0-based slices): prop_id 0:12 (zero-padded), type_cd 40:50,
type_desc 50:75, yr_built 85:89, area 93:108. Main dwelling = type_cd MA (or
MH for manufactured homes / desc MAIN AREA); pools = any POOL row.
Join: parcels.source_property_id == prop_id with leading zeros stripped.

Usage:
    DATABASE_URL=... python load_pacs_impdetail_attributes.py <fips> <roll.zip> [--dry-run]
"""

import io
import os
import re
import sys
import time
import zipfile

import psycopg2

POOL_RE = re.compile(r"pool", re.I)
# Dwelling floor areas vary by CAD vocabulary: "Main Area" (Travis-style MA),
# "MAIN FLOOR RESIDENTIAL"/"2ND FLOOR RESIDENTIAL" (Guadalupe RES1/UPST),
# "MANUFACTURED HOUSE" (MH), "LIVING AREA"/"2ND STORY LIVING AREA"/"LIVING
# AREA MH" (Kaufman LA/STR2, Grayson LA/LVM), "RESIDENCE"/"2ND FLOOR"/
# "MOBILE HOME" (Bell RES/2ND/MH.). Floors are SUMMED per property.
DWELLING_RE = re.compile(
    r"MAIN AREA|MAIN FLOOR|FLOOR RESID|MANUFACTURED HOUSE|LIVING AREA"
    r"|\bRESIDENCE\b|2ND FLOOR|MOBILE HOME",
    re.I,
)
# Grayson's cd MH is "MOBILE HOME APPENDAGES" (porches/decks bolted onto a
# mobile home) — NOT the dwelling. Never count appendage rows as living area.
EXCLUDE_RE = re.compile(r"APPENDAGE", re.I)


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
        print("usage: load_pacs_impdetail_attributes.py <fips> <roll.zip> [--dry-run]")
        sys.exit(1)
    fips, zip_path = args[0], args[1]

    zf = zipfile.ZipFile(zip_path)
    member = next(
        n for n in zf.namelist() if "IMPROVEMENT_DETAIL." in n.upper() and n.upper().endswith(".TXT")
    )
    print(f"reading {member}", flush=True)
    started = time.time()

    accounts = {}
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for i, line in enumerate(text):
            if len(line) < 108:
                continue
            pid = line[0:12].lstrip("0").strip()
            if not pid:
                continue
            cd = line[40:50].strip().upper()
            desc = line[50:75].strip().upper()
            entry = accounts.setdefault(pid, [None, None, False])
            if POOL_RE.search(desc) or POOL_RE.search(cd):
                entry[2] = True
            if (DWELLING_RE.search(desc) or cd in ("MA", "MH")) and not EXCLUDE_RE.search(desc):
                living = to_int(line[93:108], 1, 2_000_000)
                yr = to_int(line[85:89], 1800, 2027)
                if living:
                    entry[0] = (entry[0] or 0) + living
                entry[1] = entry[1] or yr
            if dry_run and i >= 120_000:
                print("dry-run: stopping parse", flush=True)
                break

    accounts = {k: v for k, v in accounts.items() if v[0] or v[1] or v[2]}
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
                "CREATE TEMP TABLE pacs_attrs (pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN)"
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
            cur.copy_expert("COPY pacs_attrs FROM STDIN", buf)

            if dry_run:
                cur.execute(
                    """SELECT count(*) FROM pacs_attrs a
                       JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                    (fips,),
                )
                print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr),
                       has_pool         = COALESCE(a.pool, p.has_pool)
                   FROM pacs_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (fips,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL) AS sqft,
                          count(*) FILTER (WHERE has_pool) AS pools
                   FROM parcels WHERE county_fips = %s""",
                (fips,),
            )
            sqft, pools = cur.fetchone()
            print(f"county parcels with sqft: {sqft:,} | with pool: {pools:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
