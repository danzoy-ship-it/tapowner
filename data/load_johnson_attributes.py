"""Populate Johnson County building attributes from the JCAD certified roll.

Source: johnsoncad.com 2025 Certified Data Roll zip (free), member
"2025 Certification Web Extracts/*WEBIMPR.CSV" (True Automation web extract).
Columns: ACCOUNT_NUM, AI_TYPE_CDX, AI_DESCRIPTION, AI_YEAR_BUILT,
AI_LIVING_IND ('Y' = living area — sum those), AI_AREA_SIZE.
Join: parcels.source_property_id == ACCOUNT_NUM (R-prefixed; M-prefixed
mobile-home accounts mostly won't join — acceptable under-fill).

Usage:
    DATABASE_URL=... python load_johnson_attributes.py <roll.zip> [--dry-run]

The whole WEBIMPR file is parsed either way; --dry-run reports the full-file
join rate and rolls back.
"""

import csv
import io
import json
import os
import re
import sys
import time
import zipfile

import psycopg2

JOHNSON_FIPS = "48251"
POOL_RE = re.compile(r"pool", re.I)
# Same improvement-type vocabulary as load_pacs_impdetail_attributes.py so the
# Reverse-Prospecting booleans/JSONB stay consistent across counties.
CASITA_RE = re.compile(r"CASITA|GUEST|QUARTERS|GARAGE APART|GAR APT|STUDIO", re.I)
SHED_RE = re.compile(r"\bSHED\b|WORKSHOP|OUT ?BUILDING|STORAGE|STG BLDG|\bBARN\b", re.I)
GARAGE_RE = re.compile(r"GARAGE|CARPORT", re.I)


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
        print("usage: load_johnson_attributes.py <roll.zip> [--dry-run]")
        sys.exit(1)

    zf = zipfile.ZipFile(args[0])
    member = next(n for n in zf.namelist() if n.upper().endswith("WEBIMPR.CSV"))
    print(f"reading {member}", flush=True)
    started = time.time()

    accounts = {}
    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for row in csv.DictReader(text):
            acct = (row.get("ACCOUNT_NUM") or "").strip()
            if not acct:
                continue
            desc = (row.get("AI_DESCRIPTION") or "").strip()
            type_cd = (row.get("AI_TYPE_CDX") or "").strip()
            entry = accounts.setdefault(
                acct,
                {"living": None, "yr": None, "pool": False, "casita": False,
                 "shed": False, "garage": False, "types": set()},
            )
            u = desc.upper()
            if desc:
                entry["types"].add(desc)
            if POOL_RE.search(desc) or POOL_RE.search(type_cd):
                entry["pool"] = True
            if CASITA_RE.search(u):
                entry["casita"] = True
            if SHED_RE.search(u):
                entry["shed"] = True
            if GARAGE_RE.search(u):
                entry["garage"] = True
            if (row.get("AI_LIVING_IND") or "").strip().upper() == "Y":
                living = to_int(row.get("AI_AREA_SIZE"), 1, 2_000_000)
                yr = to_int(row.get("AI_YEAR_BUILT"), 1800, 2027)
                if living:
                    entry["living"] = (entry["living"] or 0) + living
                entry["yr"] = entry["yr"] or yr

    accounts = {
        k: v for k, v in accounts.items()
        if v["living"] or v["yr"] or v["pool"] or v["types"]
    }
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
                """CREATE TEMP TABLE jcad_attrs (
                       acct TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN,
                       casita BOOLEAN, shed BOOLEAN, garage BOOLEAN, improvements JSONB
                   )"""
            )
            buf = io.StringIO()
            for acct, v in accounts.items():
                improv = (
                    json.dumps(sorted(v["types"])).replace("\\", "\\\\")
                    if v["types"] else r"\N"
                )
                buf.write(
                    "\t".join(
                        [
                            acct,
                            r"\N" if v["living"] is None else str(v["living"]),
                            r"\N" if v["yr"] is None else str(v["yr"]),
                            "t" if v["pool"] else "f",
                            "t" if v["casita"] else "f",
                            "t" if v["shed"] else "f",
                            "t" if v["garage"] else "f",
                            improv,
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY jcad_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*) FROM jcad_attrs a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.acct""",
                (JOHNSON_FIPS,),
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
                       has_pool         = COALESCE(p.has_pool, FALSE) OR a.pool,
                       has_casita       = COALESCE(p.has_casita, FALSE) OR a.casita,
                       has_shed         = COALESCE(p.has_shed, FALSE) OR a.shed,
                       has_garage       = COALESCE(p.has_garage, FALSE) OR a.garage,
                       improvements     = COALESCE(a.improvements, p.improvements)
                   FROM jcad_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.acct""",
                (JOHNSON_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE improvements IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (JOHNSON_FIPS,),
            )
            sqft, pools, improv = cur.fetchone()
            print(f"Johnson parcels with sqft: {sqft:,} | pool: {pools:,} | improvements: {improv:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
