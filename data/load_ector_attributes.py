"""Populate Ector County (Odessa) building attributes from the ECAD roll XLSX.

Source: ectorcad.org CERTIFIED_APPRAISAL_ROLL_RE zip (free) -> one ~156MB
XLSX, sheet SearchResults, ~1 row/account with the main improvement's
IMPROVEMENT_TYPE / IMPROVEMENT_AREA / YEAR_BUILT (cols AC/AE/AF). Dwelling
rows: type RESIDENCE or MOBILE HOME (summed on the few multi-row accounts).
No pool data in this export. Join: parcels.apn == GIS_IDENTIFICATION_NUM
(both '00100-00301-00101' style).

Usage:
    DATABASE_URL=... python load_ector_attributes.py <roll.xlsx> [--dry-run]

The whole sheet is parsed either way; --dry-run reports the full-file join
rate and rolls back.
"""

import io
import os
import re
import sys
import time

import openpyxl
import psycopg2

ECTOR_FIPS = "48135"
DWELLING_RE = re.compile(r"\bRESIDENCE\b|MOBILE HOME", re.I)


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
        print("usage: load_ector_attributes.py <roll.xlsx> [--dry-run]")
        sys.exit(1)

    print("opening workbook (read-only)…", flush=True)
    started = time.time()
    wb = openpyxl.load_workbook(args[0], read_only=True)
    ws = wb.active

    accounts = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        gis_id = (str(row[2]) if row[2] is not None else "").strip()
        if not gis_id:
            continue
        imp_type = str(row[29] or "")
        entry = accounts.setdefault(gis_id, [None, None])
        if DWELLING_RE.search(imp_type):
            living = to_int(row[30], 1, 2_000_000)
            yr = to_int(row[31], 1800, 2027)
            if living:
                entry[0] = (entry[0] or 0) + living
            entry[1] = entry[1] or yr

    accounts = {k: v for k, v in accounts.items() if v[0] or v[1]}
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
                "CREATE TEMP TABLE ecad_attrs (gis_id TEXT PRIMARY KEY, living INT, yr INT)"
            )
            buf = io.StringIO()
            for gis_id, (living, yr) in accounts.items():
                buf.write(
                    "\t".join(
                        [
                            gis_id,
                            r"\N" if living is None else str(living),
                            r"\N" if yr is None else str(yr),
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY ecad_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*) FROM ecad_attrs a
                   JOIN parcels p ON p.county_fips = %s AND p.apn = a.gis_id""",
                (ECTOR_FIPS,),
            )
            print("joinable parcel rows:", cur.fetchone()[0], flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr)
                   FROM ecad_attrs a
                   WHERE p.county_fips = %s AND p.apn = a.gis_id""",
                (ECTOR_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE year_built IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (ECTOR_FIPS,),
            )
            sqft_n, yr_n = cur.fetchone()
            print(f"Ector parcels with sqft: {sqft_n:,} | with year_built: {yr_n:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
