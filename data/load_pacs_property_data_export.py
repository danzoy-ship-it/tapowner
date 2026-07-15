"""Populate building attributes from a True Automation "Property Data Export".

This is the CSV (quoted, header-row) sibling of the fixed-width PACS certified
roll handled by load_pacs_impdetail_attributes.py. Some CADs publish this newer
export instead — an outer zip containing per-table nested zips:

    Property Data Export - Segment.zip   <- the one we need (dwelling segments)
    Property Data Export - Improvement.zip
    Property Data Export - Property.zip   ...etc

The Segment file (RecordType 5) is one row per improvement segment with columns:
    PropertyID, Type, Description, Class, ActYrBuilt, Area, Bedrooms, Plumbing,
    Fireplace, HeatAC, Roof, Foundation, ExtFinish, ...

Living area = SUM of dwelling-segment Area per property (Description "Main Area"
/ residence / mobile-home floors). Beds/baths taken from the Bedrooms/Plumbing
columns on the dwelling segment (both may ship blank at a given CAD — that's a
real district gap, not a reading failure; sqft/improvements still load). Pool /
casita / shed / garage derived from the segment Description set, and the full
per-property description list is captured into parcels.improvements (JSONB).

Join: parcels.source_property_id == PropertyID.

Usage:
    DATABASE_URL=... python load_pacs_property_data_export.py <fips> <export.zip> [--dry-run]
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

POOL_RE = re.compile(r"pool|swimpl", re.I)
CASITA_RE = re.compile(r"CASITA|GUEST|QUARTERS|GARAGE APART|GAR APT|STUDIO", re.I)
SHED_RE = re.compile(r"\bSHED\b|WORKSHOP|OUT ?BUILDING|STORAGE BLDG|STG BLDG|\bBARN\b", re.I)
GARAGE_RE = re.compile(r"GARAGE|CARPORT", re.I)
DWELLING_RE = re.compile(
    r"MAIN AREA|MAIN FLOOR|FLOOR RESID|MANUFACTURED HOU|LIVING AREA"
    r"|\bRESIDENCE\b|RESIDENTIAL|2ND FLOOR|MOBILE HOME|SECOND FLOOR|1ST FLOOR",
    re.I,
)
EXCLUDE_RE = re.compile(r"APPENDAGE|PORCH|PATIO|GARAGE|CARPORT|STORAGE|SHED|POOL", re.I)


def num(v):
    v = (v or "").strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def main():
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if len(args) < 2:
        print("usage: load_pacs_property_data_export.py <fips> <export.zip> [--dry-run]")
        sys.exit(1)
    fips, zip_path = args[0], args[1]

    outer = zipfile.ZipFile(zip_path)
    seg_member = next((n for n in outer.namelist() if "SEGMENT" in n.upper()), None)
    if not seg_member:
        print("no Segment member in export zip", outer.namelist())
        sys.exit(1)
    inner = zipfile.ZipFile(io.BytesIO(outer.read(seg_member)))
    txt = inner.namelist()[0]
    started = time.time()

    acc = {}
    label_counts = {}
    rdr = csv.DictReader(io.TextIOWrapper(io.BytesIO(inner.read(txt)), encoding="latin-1"))
    for r in rdr:
        pid = (r.get("PropertyID") or "").strip().lstrip("0")
        if not pid:
            continue
        desc = (r.get("Description") or "").strip()
        u = desc.upper()
        e = acc.setdefault(pid, {"living": None, "yr": None, "pool": False,
                                 "casita": False, "shed": False, "garage": False,
                                 "types": set(), "beds": None, "bfull": None, "bhalf": None})
        if desc:
            e["types"].add(desc)
            label_counts[desc] = label_counts.get(desc, 0) + 1
        if POOL_RE.search(u):
            e["pool"] = True
        if CASITA_RE.search(u):
            e["casita"] = True
        if SHED_RE.search(u):
            e["shed"] = True
        if GARAGE_RE.search(u):
            e["garage"] = True
        if DWELLING_RE.search(u) and not EXCLUDE_RE.search(u):
            area = num(r.get("Area"))
            if area and 1 <= area <= 2_000_000:
                e["living"] = (e["living"] or 0) + int(area)
            yr = num(r.get("ActYrBuilt") or r.get("EffYrBuilt"))
            if yr and 1800 <= yr <= 2027:
                e["yr"] = e["yr"] or int(yr)
            b = num(r.get("Bedrooms"))
            if b and 1 <= b <= 20:
                e["beds"] = int(b)
            pl = num(r.get("Plumbing"))
            if pl and 1 <= pl <= 20:
                e["bfull"], e["bhalf"] = int(pl), (1 if (pl - int(pl)) >= 0.4 else 0)

    acc = {k: v for k, v in acc.items()
           if v["living"] or v["yr"] or v["pool"] or v["types"] or v["beds"] or v["bfull"]}
    print(f"aggregated {len(acc):,} properties ({time.time() - started:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"],
                            keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10)
    cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE pde_attrs (
        pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN, casita BOOLEAN,
        shed BOOLEAN, garage BOOLEAN, improvements JSONB, beds INT, bfull INT, bhalf INT)""")
    buf = io.StringIO()
    for pid, v in acc.items():
        improv = json.dumps(sorted(v["types"])).replace("\\", "\\\\") if v["types"] else r"\N"
        buf.write("\t".join([
            pid,
            r"\N" if v["living"] is None else str(v["living"]),
            r"\N" if v["yr"] is None else str(v["yr"]),
            "t" if v["pool"] else "f", "t" if v["casita"] else "f",
            "t" if v["shed"] else "f", "t" if v["garage"] else "f",
            improv,
            r"\N" if v["beds"] is None else str(v["beds"]),
            r"\N" if v["bfull"] is None else str(v["bfull"]),
            r"\N" if v["bhalf"] is None else str(v["bhalf"]),
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY pde_attrs FROM STDIN", buf)

    if dry_run:
        cur.execute("""SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
                       FROM pde_attrs a JOIN parcels p
                       ON p.county_fips=%s AND p.source_property_id=a.pid""", (fips,))
        print("joinable rows:", cur.fetchone(), flush=True)
        conn.rollback()
        return

    cur.execute("""UPDATE parcels p SET
        living_area_sqft = COALESCE(a.living, p.living_area_sqft),
        year_built       = COALESCE(p.year_built, a.yr),
        has_pool         = COALESCE(p.has_pool, FALSE) OR a.pool,
        has_casita       = COALESCE(p.has_casita, FALSE) OR a.casita,
        has_shed         = COALESCE(p.has_shed, FALSE) OR a.shed,
        has_garage       = COALESCE(p.has_garage, FALSE) OR a.garage,
        improvements     = COALESCE(a.improvements, p.improvements),
        bedrooms         = COALESCE(a.beds, p.bedrooms),
        baths_full       = COALESCE(a.bfull, p.baths_full),
        baths_half       = COALESCE(a.bhalf, p.baths_half)
        FROM pde_attrs a WHERE p.county_fips=%s AND p.source_property_id=a.pid""", (fips,))
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE baths_full IS NOT NULL),
                          count(*) FILTER (WHERE improvements IS NOT NULL)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    sqft, pools, beds, baths, improv = cur.fetchone()
    print(f"county: sqft={sqft:,} pool={pools:,} beds={beds:,} baths={baths:,} improvements={improv:,}", flush=True)


if __name__ == "__main__":
    main()
