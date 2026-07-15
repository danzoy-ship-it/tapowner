"""Pritchard & Abbott / BIS "export_web*" roll loader — the P&A family
(Midland, Hood, Parker, TomGreen, + SWData COLLECTORS variants). Comma CSV
members inside the roll zip, each with a `_matrix` layout:

  export_webbld.txt : webbld_id, webbld_code, webbld_constyr, webbld_desc,
                      webbld_sqft, webbld_stories  -> improvements + sqft + year + stories
  export_websale.txt: websale_id, websale_dt       -> last_sale_date (max)
  export_webprop.txt: webprop_id, webprop_geoid (JOIN), webprop_exempt,
                      webprop_hscode, webprop_dvcode, webprop_acres

All three keyed by the same P&A prop id (I/M/R prefix); webprop carries the
geoid. Re-key everything to geoid and join **parcels.apn == geoid** (verified
Midland: DB apn '00080400.041.0160' == webprop_geoid format). Auto-detects
apn-vs-source_property_id.

Usage: DATABASE_URL=... python load_pa_export.py <fips> <roll.zip> [--dry-run]
"""
import csv
import io
import json
import os
import re
import sys
import time
import zipfile
from datetime import date

import psycopg2

POOL_RE = re.compile(r"pool", re.I)
GARAGE_RE = re.compile(r"garage|carport", re.I)
SHED_RE = re.compile(r"\bshed\b|storage|barn|outbuilding|workshop", re.I)
SKIP_DESC = {"", "MAIN AREA", "RESIDENCE", "OPEN PORCH"}


def reader(z, tag):
    m = [n for n in z.namelist() if n.endswith(tag + ".txt")]
    if not m:
        return None
    return csv.reader(io.TextIOWrapper(z.open(m[0]), encoding="latin-1"))


def to_int(v, lo, hi):
    try:
        n = int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def parse_dt(v):
    s = (v or "").strip()
    if not s or s.startswith("1/1/1900"):
        return None
    for fmt in ("%m/%d/%Y", "%m/%d/%Y %H:%M:%S %p", "%Y-%m-%d"):
        try:
            return date(*time.strptime(s.split()[0], "%m/%d/%Y")[:3]) if "/" in s else date.fromisoformat(s[:10])
        except (ValueError, IndexError):
            continue
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, zip_path = args[0], args[1]
    z = zipfile.ZipFile(zip_path)
    t0 = time.time()

    imps, sqft, year, stories = {}, {}, {}, {}
    r = reader(z, "export_webbld")
    if r:
        h = next(r); ix = {c: i for i, c in enumerate(h)}
        for row in r:
            if len(row) <= ix["webbld_stories"]:
                continue
            pid = row[ix["webbld_id"]].strip()
            desc = row[ix["webbld_desc"]].strip()
            if desc and desc.upper() not in SKIP_DESC:
                imps.setdefault(pid, set()).add(desc)
            a = to_int(row[ix["webbld_sqft"]], 1, 2_000_000)
            if a:
                sqft[pid] = sqft.get(pid, 0) + a
            y = to_int(row[ix["webbld_constyr"]], 1800, date.today().year + 1)
            if y:
                year[pid] = max(year.get(pid, 0), y)
            s = to_int(row[ix["webbld_stories"]], 1, 60)
            if s:
                stories[pid] = max(stories.get(pid, 0), s)
    print(f"[{fips}] webbld: {len(imps):,} w/ improv, {len(sqft):,} sqft ({time.time()-t0:.0f}s)", flush=True)

    sale = {}
    r = reader(z, "export_websale")
    if r:
        h = next(r); ix = {c: i for i, c in enumerate(h)}
        for row in r:
            if len(row) <= ix["websale_dt"]:
                continue
            pid = row[ix["websale_id"]].strip()
            dt = parse_dt(row[ix["websale_dt"]])
            if pid and dt and (pid not in sale or dt > sale[pid]):
                sale[pid] = dt

    geoid, exempt = {}, {}
    r = reader(z, "export_webprop")
    if r:
        h = next(r); ix = {c: i for i, c in enumerate(h)}
        gi = ix.get("webprop_geoid")
        for row in r:
            if gi is None or len(row) <= gi:
                continue
            pid = row[ix["webprop_id"]].strip()
            geoid[pid] = row[gi].strip()
            codes = set()
            # hscode: 'H'=homestead, 'S'/'D'/'DVH'/'F'=other homestead classes; ''=none
            hc = row[ix["webprop_hscode"]].strip().upper() if ix.get("webprop_hscode") is not None else ""
            if hc and hc != "0":
                codes.add("HS" if hc.startswith("H") else hc)
            # dvcode: '0'=NO disabled-veteran (the default); 1-5 = DV level
            dv = row[ix["webprop_dvcode"]].strip() if ix.get("webprop_dvcode") is not None else ""
            if dv and dv != "0":
                codes.add("DV")
            ex = row[ix["webprop_exempt"]].strip() if ix.get("webprop_exempt") is not None else ""
            for c in re.split(r"[,;\s]+", ex):
                if c.strip() and c.strip() != "0":
                    codes.add(c.strip().upper())
            if codes:
                exempt[pid] = sorted(codes)
    print(f"[{fips}] webprop: {len(geoid):,} geoids, {len(exempt):,} w/ exemptions; websale {len(sale):,} ({time.time()-t0:.0f}s)", flush=True)

    # re-key by geoid
    staged = {}
    for pid, geo in geoid.items():
        if not geo:
            continue
        descs = imps.get(pid)
        staged[geo] = (sorted(descs) if descs else None, sqft.get(pid), year.get(pid),
                       stories.get(pid), sale.get(pid), exempt.get(pid))
    print(f"[{fips}] staged {len(staged):,} geoids", flush=True)
    _db_phase(fips, staged, dry)


def _connect():
    for a in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                                 keepalives_interval=10, keepalives_count=10, connect_timeout=20)
            cur = c.cursor(); cur.execute("SET lock_timeout='8s'"); c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {a+1}: {e}", flush=True); time.sleep(5)
    raise RuntimeError("could not connect")


def _db_phase(fips, staged, dry):
    conn = _connect(); cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE pa_stage (geo TEXT PRIMARY KEY, improvements JSONB,
                       sqft INT, yr INT, stories INT, sale_dt DATE, exemptions TEXT[],
                       pool BOOL, garage BOOL, shed BOOL)""")
    buf = io.StringIO()
    for geo, (descs, sq, yr, st, dt, codes) in staged.items():
        blob = " ".join(descs).lower() if descs else ""
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([
            geo.replace("\\", "\\\\"),
            json.dumps(descs).replace("\\", "\\\\") if descs else r"\N",
            r"\N" if sq is None else str(sq), r"\N" if yr is None else str(yr),
            r"\N" if st is None else str(st), r"\N" if dt is None else dt.isoformat(), arr,
            "t" if POOL_RE.search(blob) else "f", "t" if GARAGE_RE.search(blob) else "f",
            "t" if SHED_RE.search(blob) else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY pa_stage (geo, improvements, sqft, yr, stories, sale_dt, exemptions, pool, garage, shed) FROM STDIN", buf)
    cur.execute("ANALYZE pa_stage")

    best_join, best_n = None, 0
    for label, cond in [("apn==geoid", "p.apn = s.geo"), ("spid==geoid", "p.source_property_id = s.geo")]:
        cur.execute(f"SELECT count(*) FROM pa_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    tot = cur.fetchone()[0]
    if best_n < 0.30 * max(tot, 1):
        conn.rollback(); conn.close(); raise SystemExit(f"[{fips}] ABORT: {best_n:,} < 30% of {tot:,}")
    print(f"  -> {best_join} ({best_n:,}/{tot:,})", flush=True)
    if dry:
        conn.rollback(); conn.close(); print("dry-run"); return

    cur.execute(f"""UPDATE parcels p SET
                        improvements     = COALESCE(p.improvements, s.improvements),
                        living_area_sqft = COALESCE(p.living_area_sqft, s.sqft),
                        year_built       = COALESCE(p.year_built, s.yr),
                        stories          = COALESCE(p.stories, s.stories),
                        last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                        exemptions       = COALESCE(s.exemptions, p.exemptions),
                        has_pool         = COALESCE(p.has_pool, FALSE) OR s.pool,
                        has_garage       = COALESCE(p.has_garage, FALSE) OR s.garage,
                        has_shed         = COALESCE(p.has_shed, FALSE) OR s.shed
                    FROM pa_stage s WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL), count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL), count(*) FILTER (WHERE array_length(exemptions,1)>0)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    imp, sq, sd, ex = cur.fetchone()
    print(f"[{fips}] now: improv {imp:,}, sqft {sq:,}, sale {sd:,}, exempt {ex:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
