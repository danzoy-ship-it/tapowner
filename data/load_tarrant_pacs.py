"""Tarrant (TAD, 48439) — improvements + beds/baths + sale-date + exemptions
from TAD's full PACS roll (000_Tarrant_All_Taxing_Units.zip). 757K parcels that
had ONLY sqft (TAD's public portal is True Prodigy/app-lane, but the bulk export
is a standard PACS Legacy roll).

TWO-HOP JOIN (verified): the roll's prop_id is a small internal sequential that
does NOT match the DB. The roll's geo_id (APPRAISAL_INFO cols 547-596, format
"14437-2-1") == parcels.source_property_id (the lot code). So:
  IMPROVEMENT_DETAIL(prop_id -> type_desc)   +
  IMPROVEMENT_DETAIL_ATTR(prop_id -> beds/baths) +
  APPRAISAL_INFO(prop_id -> geo_id, deed_dt, exemptions)
all keyed by prop_id, then re-keyed to geo_id and joined to source_property_id.

Usage: DATABASE_URL=... python load_tarrant_pacs.py <path/000_Tarrant_All_Taxing_Units.zip> [--dry-run]
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

FIPS = "48439"
POOL_RE = re.compile(r"pool|swimpl", re.I)
GARAGE_RE = re.compile(r"garage|carport", re.I)
SHED_RE = re.compile(r"\bshed\b|workshop|out ?building|storage bldg|\bbarn\b|boat *dock|boathouse", re.I)
BATHISH_RE = re.compile(r"^\s*B?\d+(?:\.\d+)?\s*$", re.I)
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
    return [n for n in z.namelist() if n.upper().endswith(suffix)][0]


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    z = zipfile.ZipFile(args[0])
    t0 = time.time()

    # ---- APPRAISAL_INFO: prop_id -> (geo_id, deed_dt, exemptions)
    info = {}
    ai = member(z, "APPRAISAL_INFO.TXT")
    with z.open(ai) as f:
        for raw in f:
            line = raw.decode("latin-1", "replace").rstrip("\r\n")
            if len(line) < 2671 or sl(line, 13, 17).strip() != "R":
                continue
            pid = sl(line, 1, 12).strip().lstrip("0") or "0"
            geo = sl(line, 547, 596).strip()
            if not geo:
                continue
            dt = parse_deed_dt(sl(line, 2034, 2058))
            codes = [c for col, c in EXEMPT_COLS.items() if sl(line, col, col) == "T"]
            info[pid] = (geo, dt, codes)
    print(f"APPRAISAL_INFO: {len(info):,} real props ({time.time()-t0:.0f}s)", flush=True)

    # ---- IMPROVEMENT_DETAIL: prop_id -> set(type_desc)
    imps = {}
    idf = member(z, "IMPROVEMENT_DETAIL.TXT")
    with z.open(idf) as f:
        for raw in f:
            line = raw.decode("latin-1", "replace")
            if len(line) < 75:
                continue
            pid = line[0:12].strip().lstrip("0") or "0"
            desc = line[50:75].strip()
            if desc:
                imps.setdefault(pid, set()).add(desc)
    print(f"IMPROVEMENT_DETAIL: {len(imps):,} props with improvements ({time.time()-t0:.0f}s)", flush=True)

    # ---- IMPROVEMENT_DETAIL_ATTR: prop_id -> beds / baths(full.half)
    beds, baths = {}, {}
    attrf = member(z, "IMPROVEMENT_DETAIL_ATTR.TXT")
    bath_vals = []
    with z.open(attrf) as f:
        for raw in f:
            line = raw.decode("latin-1", "replace")
            if len(line) < 78:
                continue
            pid = line[0:12].strip().lstrip("0") or "0"
            name = line[52:77].strip().lower()
            val = line[77:].strip()
            if "bedroom" in name or name in ("beds", "bedrooms"):
                try:
                    beds[pid] = beds.get(pid, 0) + int(float(val))
                except ValueError:
                    pass
            elif "plumbing" in name or "bath" in name:
                m = re.search(r"(\d+(?:\.\d+)?)", val)
                if m:
                    f_val = float(m.group(1))
                    full = int(f_val)
                    half = round((f_val - full) * 10) if f_val != full else 0
                    baths[pid] = (full, half)
                    bath_vals.append(full)
    # fixture-contamination guard (median full-bath > 3.5 -> drop baths)
    if bath_vals:
        bath_vals.sort()
        med = bath_vals[len(bath_vals) // 2]
        if med > 3.5:
            print(f"  BATH GUARD: median full-bath {med} > 3.5 (fixture counts) — dropping baths", flush=True)
            baths = {}
    print(f"ATTR: {len(beds):,} beds, {len(baths):,} baths ({time.time()-t0:.0f}s)", flush=True)

    # ---- re-key everything by geo_id
    staged = {}
    for pid, (geo, dt, codes) in info.items():
        descs = imps.get(pid)
        b = beds.get(pid)
        bf = baths.get(pid)
        staged[geo] = (sorted(descs) if descs else None, b,
                       bf[0] if bf else None, bf[1] if bf else None,
                       dt, codes or None)
    print(f"staged {len(staged):,} geo_ids", flush=True)
    _db_phase(staged, dry)


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


def _db_phase(staged, dry):
    conn = _connect(); cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE tad_stage (
                       geo TEXT PRIMARY KEY, improvements JSONB, beds INT,
                       bfull INT, bhalf INT, sale_dt DATE, exemptions TEXT[],
                       pool BOOL, garage BOOL, shed BOOL)""")
    buf = io.StringIO()
    for geo, (descs, b, bf, bh, dt, codes) in staged.items():
        blob = " ".join(descs).lower() if descs else ""
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([
            geo,
            json.dumps(descs).replace("\\", "\\\\") if descs else r"\N",
            r"\N" if b is None else str(b),
            r"\N" if bf is None else str(bf),
            r"\N" if bh is None else str(bh),
            r"\N" if dt is None else dt.isoformat(),
            arr,
            "t" if POOL_RE.search(blob) else "f",
            "t" if GARAGE_RE.search(blob) else "f",
            "t" if SHED_RE.search(blob) else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY tad_stage (geo, improvements, beds, bfull, bhalf, sale_dt, exemptions, pool, garage, shed) FROM STDIN", buf)
    cur.execute("ANALYZE tad_stage")

    cur.execute("SELECT count(*) FROM tad_stage s JOIN parcels p ON p.county_fips=%s AND p.source_property_id=s.geo", (FIPS,))
    nj = cur.fetchone()[0]
    print(f"  join geo==source_property_id: {nj:,} / {len(staged):,}", flush=True)
    if nj < 0.2 * len(staged):
        conn.rollback(); conn.close(); raise SystemExit("ABORT: join too low")

    if dry:
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute("""UPDATE parcels p SET
                       improvements     = COALESCE(p.improvements, s.improvements),
                       bedrooms         = COALESCE(p.bedrooms, s.beds),
                       baths_full       = COALESCE(p.baths_full, s.bfull),
                       baths_half       = COALESCE(p.baths_half, s.bhalf),
                       last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                       exemptions       = COALESCE(s.exemptions, p.exemptions),
                       has_pool         = COALESCE(p.has_pool, FALSE) OR s.pool,
                       has_garage       = COALESCE(p.has_garage, FALSE) OR s.garage,
                       has_shed         = COALESCE(p.has_shed, FALSE) OR s.shed
                   FROM tad_stage s
                   WHERE p.county_fips=%s AND p.source_property_id=s.geo""", (FIPS,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL),
                          count(*) FILTER (WHERE array_length(exemptions,1)>0),
                          count(*) FILTER (WHERE has_pool)
                   FROM parcels WHERE county_fips=%s""", (FIPS,))
    imp, bd, sd, ex, pool = cur.fetchone()
    print(f"[{FIPS}] now: improvements {imp:,}, beds {bd:,}, sale {sd:,}, exempt {ex:,}, pool {pool:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
