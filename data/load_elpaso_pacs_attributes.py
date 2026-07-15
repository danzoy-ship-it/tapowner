"""Populate El Paso BEDS/BATHS/POOL/improvements from EPCAD's PACS certified roll.

EPCAD publishes the full PACS 8.0.34 "Appraisal Export" (free) at
  https://export.epcad.org/datasets/2025_Certified_Export_Files.zip
linked from https://epcad.org/OpenGovernment . Beds/baths are the standard PACS
improvement-characteristics (inspect the DATA, not the layout):
  APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT  attr name @52:77, value @77:
    'Number of Bedrooms' -> bedrooms   ('0' = unknown, dropped)
    'Plumbing'           -> baths_full/baths_half  (full.half, e.g. 2.50 -> 2/1)
  APPRAISAL_IMPROVEMENT_DETAIL.TXT       prop_id 0:12, type_cd 40:50,
    type_desc 50:75, yr 85:89, area 93:108 -> pool ('SWIMMING POOL'), casita,
    shed, garage + the full improvement-type list (parcels.improvements jsonb).

Join: parcels.source_property_id == prop_id (leading zeros stripped). Verified:
EPCAD prop_id IS El Paso's source_property_id (apn 'H77909786900130' <-> spid
'11084'), ~99% joinable.

Sqft is NOT overwritten here: El Paso living_area_sqft is already loaded from
EPCAD's ABE dumps (load_elpaso_attributes.py, MA+MU+MG+M floors summed). This
loader only BACKFILLS sqft/year where still null, and the generic PACS loader is
NOT used for El Paso because its dwelling regex counts MA only (missing the
MU/MG/M upper/ground floors) and would regress the ABE sqft.

Usage:
    DATABASE_URL=... python load_elpaso_pacs_attributes.py <2025_Certified_Export_Files.zip> [--dry-run]
"""

import io
import json
import os
import re
import sys
import time
import zipfile

import psycopg2

FIPS = "48141"
POOL_RE = re.compile(r"POOL|SWIMMING", re.I)
CASITA_RE = re.compile(r"CASITA|GUEST|QUARTERS|GARAGE APART|GAR APT|STUDIO", re.I)
SHED_RE = re.compile(r"\bSHED\b|WORKSHOP|OUT ?BUILDING|STORAGE BLDG|STG BLDG|\bBARN\b", re.I)
GARAGE_RE = re.compile(r"GARAGE|CARPORT", re.I)
DWELLING_CD = {"MA", "MU", "MG", "M"}  # matches the ABE loader's floor set
NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def _first_num(v):
    m = NUM_RE.search(str(v))
    return float(m.group()) if m else None


def parse_beds(v):
    f = _first_num(v)
    if f is None:
        return None
    n = int(f)
    return n if 1 <= n <= 20 else None


def parse_baths(v):
    f = _first_num(v)
    if f is None:
        return None, None
    full = int(f)
    if not (1 <= full <= 20):
        return None, None
    return full, (1 if (f - full) >= 0.4 else 0)


def to_int(v, lo, hi):
    try:
        n = int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_elpaso_pacs_attributes.py <cert.zip> [--dry-run]")
        sys.exit(1)
    zip_path = args[0]
    zf = zipfile.ZipFile(zip_path)
    detail = next(n for n in zf.namelist()
                  if "IMPROVEMENT_DETAIL." in n.upper() and n.upper().endswith(".TXT"))
    attr = next(n for n in zf.namelist() if "IMPROVEMENT_DETAIL_ATTR" in n.upper())
    started = time.time()

    acc = {}
    print(f"reading {detail}", flush=True)
    with zf.open(detail) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for i, line in enumerate(text):
            if len(line) < 108:
                continue
            pid = line[0:12].lstrip("0").strip()
            if not pid:
                continue
            cd = line[40:50].strip().upper()
            desc = line[50:75].strip()
            u = desc.upper()
            e = acc.setdefault(pid, {"living": None, "yr": None, "pool": False,
                                     "casita": False, "shed": False, "garage": False,
                                     "types": set(), "beds": None, "bfull": None, "bhalf": None})
            if desc:
                e["types"].add(desc)
            if POOL_RE.search(u):
                e["pool"] = True
            if CASITA_RE.search(u):
                e["casita"] = True
            if SHED_RE.search(u):
                e["shed"] = True
            if GARAGE_RE.search(u):
                e["garage"] = True
            if cd in DWELLING_CD:
                living = to_int(line[93:108], 1, 2_000_000)
                yr = to_int(line[85:89], 1800, 2027)
                if living:
                    e["living"] = (e["living"] or 0) + living
                e["yr"] = e["yr"] or yr
            if dry_run and i >= 300_000:
                print("dry-run: stopping detail parse", flush=True)
                break

    print(f"reading {attr}", flush=True)
    with zf.open(attr) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for i, line in enumerate(text):
            if len(line) < 78:
                continue
            pid = line[0:12].lstrip("0").strip()
            if not pid or pid not in acc:
                continue
            name = line[52:77].strip().upper()
            value = line[77:].strip()
            if "BEDROOM" in name:
                b = parse_beds(value)
                if b is not None:
                    acc[pid]["beds"] = b
            elif name == "PLUMBING":
                full, half = parse_baths(value)
                if full is not None:
                    acc[pid]["bfull"], acc[pid]["bhalf"] = full, half
            if dry_run and i >= 500_000:
                print("dry-run: stopping attr parse", flush=True)
                break

    acc = {k: v for k, v in acc.items()
           if v["beds"] or v["bfull"] or v["pool"] or v["types"] or v["living"]}
    print(f"aggregated {len(acc):,} properties ({time.time() - started:.0f}s)", flush=True)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                """CREATE TEMP TABLE ep_pacs (
                       pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN,
                       casita BOOLEAN, shed BOOLEAN, garage BOOLEAN, improvements JSONB,
                       beds INT, bfull INT, bhalf INT)"""
            )
            buf = io.StringIO()
            for pid, v in acc.items():
                improv = json.dumps(sorted(v["types"])).replace("\\", "\\\\") if v["types"] else r"\N"
                buf.write("\t".join([
                    pid,
                    r"\N" if v["living"] is None else str(v["living"]),
                    r"\N" if v["yr"] is None else str(v["yr"]),
                    "t" if v["pool"] else "f",
                    "t" if v["casita"] else "f",
                    "t" if v["shed"] else "f",
                    "t" if v["garage"] else "f",
                    improv,
                    r"\N" if v["beds"] is None else str(v["beds"]),
                    r"\N" if v["bfull"] is None else str(v["bfull"]),
                    r"\N" if v["bhalf"] is None else str(v["bhalf"]),
                ]) + "\n")
            buf.seek(0)
            cur.copy_expert("COPY ep_pacs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
                   FROM ep_pacs a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                (FIPS,),
            )
            j, jb = cur.fetchone()
            print(f"joinable parcel rows: {j:,} (with beds {jb:,})", flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       bedrooms         = COALESCE(a.beds, p.bedrooms),
                       baths_full       = COALESCE(a.bfull, p.baths_full),
                       baths_half       = COALESCE(a.bhalf, p.baths_half),
                       has_pool         = COALESCE(p.has_pool, FALSE) OR a.pool,
                       has_casita       = COALESCE(p.has_casita, FALSE) OR a.casita,
                       has_shed         = COALESCE(p.has_shed, FALSE) OR a.shed,
                       has_garage       = COALESCE(p.has_garage, FALSE) OR a.garage,
                       improvements     = COALESCE(a.improvements, p.improvements),
                       living_area_sqft = COALESCE(p.living_area_sqft, a.living),
                       year_built       = COALESCE(p.year_built, a.yr)
                   FROM ep_pacs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE baths_full IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE living_area_sqft IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (FIPS,),
            )
            beds, baths, pools, improv, sqft = cur.fetchone()
            print(f"El Paso: beds={beds:,} baths={baths:,} pool={pools:,} "
                  f"improvements={improv:,} sqft={sqft:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
