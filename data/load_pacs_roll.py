"""GENERALIZED PACS Legacy certified-roll loader — one pass, ALL roll fields,
auto-detecting the join key. The workhorse for the county-coverage campaign
(most Texas CADs on True Automation publish this exact file set).

Reads from the roll zip:
  APPRAISAL_IMPROVEMENT_DETAIL.TXT     prop_id[0:12], type_desc[50:75],
                                       yr_built[85:89], area/sqft[93:108]
  APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT prop_id[0:12], attr_name[52:77], value[77:]
                                       ("Number of Bedrooms"->beds, "Plumbing"->baths)
  APPRAISAL_INFO.TXT                   prop_id[0:12], geo_id[547:596], deed_dt[2034:2058],
                                       exemption T/F block (hs 2609, ov65 2610, ...)

Captures per property: improvements[] (verbatim type descriptions) + has_pool/
garage/shed + beds/baths + living_area_sqft + year_built + last_sale_date +
exemptions[]. (lot_size from LAND_DETAIL and stories are a planned add.)

JOIN AUTO-DETECT (the Fort Bend/Tarrant lesson: high rate != correct): the roll
carries BOTH prop_id and geo_id; the DB key is source_property_id or apn. We
test all four combinations, pick the highest-count join, and REQUIRE >=30% or
abort (so a coincidental low-overlap numeric match can't silently corrupt).

Usage: DATABASE_URL=... python load_pacs_roll.py <fips> <roll.zip> [--dry-run]
"""
import io
import json
import os
import re
import sys
import time
import zipfile
from datetime import date

import psycopg2

POOL_RE = re.compile(r"pool|swimpl", re.I)
GARAGE_RE = re.compile(r"garage|carport", re.I)
SHED_RE = re.compile(r"\bshed\b|workshop|out ?building|storage bldg|stg bldg|\bbarn\b|boat *dock|boathouse", re.I)
BATHISH_RE = re.compile(r"(\d+(?:\.\d+)?)")
EXEMPT_COLS = {2609: "HS", 2610: "OV65", 2661: "OV65S", 2662: "DP",
               2663: "DV1", 2664: "DV1S", 2665: "DV2", 2666: "DV2S",
               2667: "DV3", 2668: "DV3S", 2669: "DV4", 2670: "DV4S", 2671: "EX"}


def sl(line, s, e):
    return line[s - 1:e]


def parse_deed_dt(raw):
    s = "".join(ch for ch in raw.strip() if ch.isdigit())
    if len(s) != 8:
        return None
    mm, dd, yyyy = int(s[0:2]), int(s[2:4]), int(s[4:8])
    if not (1 <= mm <= 12 and 1 <= dd <= 31 and 1900 <= yyyy <= date.today().year):
        return None
    try:
        return date(yyyy, mm, dd)
    except ValueError:
        return None


def member(z, suffix):
    hits = [n for n in z.namelist() if n.upper().endswith(suffix)]
    return hits[0] if hits else None


def to_int(v, lo, hi):
    try:
        n = int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, zip_path = args[0], args[1]
    z = zipfile.ZipFile(zip_path)
    t0 = time.time()

    info = {}   # prop_id -> [geo_id, deed_dt, exemptions]
    ai = member(z, "APPRAISAL_INFO.TXT")
    if ai:
        with z.open(ai) as f:
            for raw in f:
                line = raw.decode("latin-1", "replace").rstrip("\r\n")
                if len(line) < 2671 or sl(line, 13, 17).strip() != "R":
                    continue
                pid = sl(line, 1, 12).strip().lstrip("0") or "0"
                geo = sl(line, 547, 596).strip()
                dt = parse_deed_dt(sl(line, 2034, 2058))
                codes = [c for col, c in EXEMPT_COLS.items() if sl(line, col, col) == "T"]
                info[pid] = [geo, dt, codes]
    print(f"[{fips}] APPRAISAL_INFO: {len(info):,} real props ({time.time()-t0:.0f}s)", flush=True)

    imps = {}   # prop_id -> {descs}, sqft, year
    sqft, year = {}, {}
    idf = member(z, "IMPROVEMENT_DETAIL.TXT")
    if idf:
        with z.open(idf) as f:
            for raw in f:
                line = raw.decode("latin-1", "replace")
                if len(line) < 75:
                    continue
                pid = line[0:12].strip().lstrip("0") or "0"
                desc = line[50:75].strip()
                if desc:
                    imps.setdefault(pid, set()).add(desc)
                a = to_int(line[93:108], 1, 2_000_000) if len(line) >= 108 else None
                if a:
                    sqft[pid] = sqft.get(pid, 0) + a
                y = to_int(line[85:89], 1800, date.today().year + 1) if len(line) >= 89 else None
                if y:
                    year[pid] = max(year.get(pid, 0), y)
    print(f"[{fips}] IMPROVEMENT_DETAIL: {len(imps):,} w/ improvements, {len(sqft):,} sqft ({time.time()-t0:.0f}s)", flush=True)

    beds, baths, bath_vals = {}, {}, []
    attrf = member(z, "IMPROVEMENT_DETAIL_ATTR.TXT")
    if attrf:
        with z.open(attrf) as f:
            for raw in f:
                line = raw.decode("latin-1", "replace")
                if len(line) < 78:
                    continue
                pid = line[0:12].strip().lstrip("0") or "0"
                name = line[52:77].strip().lower()
                val = line[77:].strip()
                if "bedroom" in name or name in ("beds", "bedrooms"):
                    v = to_int(val, 1, 60)
                    if v:
                        beds[pid] = beds.get(pid, 0) + v
                elif "plumbing" in name or ("bath" in name and "restroom" not in name):
                    m = BATHISH_RE.search(val)
                    if m:
                        fv = float(m.group(1))
                        full = int(fv)
                        half = round((fv - full) * 10) if fv != full else 0
                        if 1 <= full <= 40:
                            baths[pid] = (full, min(half, 9))
                            bath_vals.append(full)
    if bath_vals:
        bath_vals.sort()
        med = bath_vals[len(bath_vals) // 2]
        if med > 3.5:
            print(f"[{fips}] BATH GUARD: median {med} > 3.5 (fixtures) — dropping baths", flush=True)
            baths = {}
    print(f"[{fips}] ATTR: {len(beds):,} beds, {len(baths):,} baths ({time.time()-t0:.0f}s)", flush=True)

    # ---- stage keyed by prop_id, carrying geo_id for join auto-detect
    staged = {}
    for pid in set(info) | set(imps) | set(sqft):
        geo, dt, codes = info.get(pid, ["", None, []])
        descs = imps.get(pid)
        bf = baths.get(pid)
        staged[pid] = (geo, sorted(descs) if descs else None, beds.get(pid),
                       bf[0] if bf else None, bf[1] if bf else None,
                       sqft.get(pid), year.get(pid), dt, codes or None)
    print(f"[{fips}] staged {len(staged):,}", flush=True)
    _db_phase(fips, staged, dry)


def _connect():
    for a in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1,
                                 keepalives_idle=30, keepalives_interval=10,
                                 keepalives_count=10, connect_timeout=20)
            cur = c.cursor(); cur.execute("SET lock_timeout='3s'"); c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {a+1}: {e}", flush=True); time.sleep(5)
    raise RuntimeError("could not connect")


def _db_phase(fips, staged, dry):
    conn = _connect(); cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE roll_stage (
                       pid TEXT PRIMARY KEY, geo TEXT, improvements JSONB, beds INT,
                       bfull INT, bhalf INT, sqft INT, yr INT, sale_dt DATE,
                       exemptions TEXT[], pool BOOL, garage BOOL, shed BOOL)""")
    buf = io.StringIO()
    for pid, (geo, descs, b, bf, bh, sq, yr, dt, codes) in staged.items():
        blob = " ".join(descs).lower() if descs else ""
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([
            pid, geo or r"\N",
            json.dumps(descs).replace("\\", "\\\\") if descs else r"\N",
            r"\N" if b is None else str(b),
            r"\N" if bf is None else str(bf),
            r"\N" if bh is None else str(bh),
            r"\N" if sq is None else str(sq),
            r"\N" if yr is None else str(yr),
            r"\N" if dt is None else dt.isoformat(),
            arr,
            "t" if POOL_RE.search(blob) else "f",
            "t" if GARAGE_RE.search(blob) else "f",
            "t" if SHED_RE.search(blob) else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY roll_stage (pid, geo, improvements, beds, bfull, bhalf, sqft, yr, sale_dt, exemptions, pool, garage, shed) FROM STDIN", buf)
    cur.execute("ANALYZE roll_stage")

    candidates = [
        ("spid==prop_id", "p.source_property_id = s.pid"),
        ("spid==geo_id", "p.source_property_id = s.geo"),
        ("apn==prop_id", "p.apn = s.pid"),
        ("apn==geo_id", "p.apn = s.geo"),
    ]
    best_join, best_n = None, 0
    for label, cond in candidates:
        cur.execute(f"SELECT count(*) FROM roll_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    county_tot = cur.fetchone()[0]
    if best_n < 0.30 * max(county_tot, 1):
        conn.rollback(); conn.close()
        raise SystemExit(f"[{fips}] ABORT: best join {best_n:,} < 30% of {county_tot:,} parcels — key mismatch, investigate")
    print(f"  -> {best_join} ({best_n:,} / {county_tot:,} county parcels)", flush=True)

    if dry:
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute(f"""UPDATE parcels p SET
                        improvements     = COALESCE(p.improvements, s.improvements),
                        bedrooms         = COALESCE(p.bedrooms, s.beds),
                        baths_full       = COALESCE(p.baths_full, s.bfull),
                        baths_half       = COALESCE(p.baths_half, s.bhalf),
                        living_area_sqft = COALESCE(p.living_area_sqft, s.sqft),
                        year_built       = COALESCE(p.year_built, s.yr),
                        last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                        exemptions       = COALESCE(s.exemptions, p.exemptions),
                        has_pool         = COALESCE(p.has_pool, FALSE) OR s.pool,
                        has_garage       = COALESCE(p.has_garage, FALSE) OR s.garage,
                        has_shed         = COALESCE(p.has_shed, FALSE) OR s.shed
                    FROM roll_stage s
                    WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL),
                          count(*) FILTER (WHERE array_length(exemptions,1)>0)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    imp, bd, sq, sd, ex = cur.fetchone()
    print(f"[{fips}] now: improv {imp:,}, beds {bd:,}, sqft {sq:,}, sale {sd:,}, exempt {ex:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
