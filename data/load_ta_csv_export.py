"""True Automation "Property Data Export" loader (nested-zip CSV format) — the
Segment/Improvement/Sales export several TX CADs publish (Hays 48209, etc.).

Outer zip -> a folder of inner zips (…IMPROVEMENT.zip, …SEGMENT.zip, …SALES.zip,
…OWNER.zip); each inner zip holds one pipe-or-comma CSV with a header row.

  SEGMENT: PropertyID, QuickRefID, PropertyNumber, Type, Description (plain
           English: "Main Area","Garage","Pool","Detached Garage"…), Area(sqft),
           ActYrBuilt  -> parcels.improvements + sqft + year + has_pool/garage/shed
  SALES:   PropertyID, SaleDate, DeedDate -> last_sale_date (max)

Join auto-detected (PropertyID/QuickRefID/PropertyNumber vs source_property_id/apn),
>=30% or abort (the Fort Bend guard).

Usage: DATABASE_URL=... python load_ta_csv_export.py <fips> <export.zip> [--dry-run]
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
SHED_RE = re.compile(r"\bshed\b|storage|out ?building|\bbarn\b|workshop|boat *dock|boathouse", re.I)
SKIP_DESC = {"main area", "main area 2nd floor", "open frame porch", "open porch",
             "patio", "concrete patio", "second floor", ""}


def open_inner(z, tag):
    hits = [n for n in z.namelist() if tag in n.upper() and n.endswith(".zip")]
    if not hits:
        return None
    iz = zipfile.ZipFile(io.BytesIO(z.read(hits[0])))
    return iz.open(iz.namelist()[0])


def sniff(fh):
    data = io.TextIOWrapper(fh, encoding="latin-1")
    first = data.readline()
    delim = "|" if first.count("|") > first.count(",") else ","
    hdr = next(csv.reader([first], delimiter=delim))
    return data, [h.strip().strip('"') for h in hdr], delim


def parse_dt(s):
    s = (s or "").strip()
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return date.fromisoformat(s[:10]) if "-" in s else date(*time.strptime(s, fmt)[:3])
        except (ValueError, TypeError):
            continue
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, zip_path = args[0], args[1]
    z = zipfile.ZipFile(zip_path)
    t0 = time.time()

    # SEGMENT -> improvements + sqft + year, keyed by (PropertyID, QuickRefID, PropertyNumber)
    imps, sqft, year = {}, {}, {}
    key2 = {}   # PropertyID -> (QuickRefID, PropertyNumber) for join options
    fh = open_inner(z, "SEGMENT")
    if fh:
        data, hdr, delim = sniff(fh)
        idx = {h: i for i, h in enumerate(hdr)}
        pi, di = idx.get("PropertyID"), idx.get("Description")
        qi, ni = idx.get("QuickRefID"), idx.get("PropertyNumber")
        ai, yi = idx.get("Area"), idx.get("ActYrBuilt")
        for row in csv.reader(data, delimiter=delim):
            if len(row) <= di:
                continue
            pid = row[pi].strip()
            desc = row[di].strip()
            if not pid:
                continue
            key2.setdefault(pid, (row[qi].strip() if qi is not None else "",
                                  row[ni].strip() if ni is not None else ""))
            if desc and desc.lower() not in SKIP_DESC:
                imps.setdefault(pid, set()).add(desc)
            if ai is not None and ai < len(row):
                try:
                    a = int(float(row[ai]))
                    if 1 <= a <= 2_000_000:
                        sqft[pid] = sqft.get(pid, 0) + a
                except ValueError:
                    pass
            if yi is not None and yi < len(row):
                try:
                    y = int(float(row[yi]))
                    if 1800 <= y <= date.today().year + 1:
                        year[pid] = max(year.get(pid, 0), y)
                except ValueError:
                    pass
    print(f"[{fips}] SEGMENT: {len(key2):,} props, {len(imps):,} w/ improvements ({time.time()-t0:.0f}s)", flush=True)

    # SALES -> latest sale date per PropertyID
    sale = {}
    fh = open_inner(z, "SALES")
    if fh:
        data, hdr, delim = sniff(fh)
        idx = {h: i for i, h in enumerate(hdr)}
        pi = idx.get("PropertyID")
        sdi, ddi = idx.get("SaleDate"), idx.get("DeedDate")
        for row in csv.reader(data, delimiter=delim):
            if pi is None or len(row) <= pi:
                continue
            pid = row[pi].strip()
            dt = parse_dt(row[sdi] if sdi is not None and sdi < len(row) else "") or \
                 parse_dt(row[ddi] if ddi is not None and ddi < len(row) else "")
            if pid and dt and (pid not in sale or dt > sale[pid]):
                sale[pid] = dt
    print(f"[{fips}] SALES: {len(sale):,} sale dates ({time.time()-t0:.0f}s)", flush=True)

    staged = {}
    for pid, (qref, pnum) in key2.items():
        descs = imps.get(pid)
        staged[pid] = (qref, pnum, sorted(descs) if descs else None,
                       sqft.get(pid), year.get(pid), sale.get(pid))
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
    cur.execute("""CREATE TEMP TABLE ta_stage (
                       pid TEXT PRIMARY KEY, qref TEXT, pnum TEXT, improvements JSONB,
                       sqft INT, yr INT, sale_dt DATE, pool BOOL, garage BOOL, shed BOOL)""")
    buf = io.StringIO()
    for pid, (qref, pnum, descs, sq, yr, dt) in staged.items():
        blob = " ".join(descs).lower() if descs else ""
        buf.write("\t".join([
            pid, qref or r"\N", pnum or r"\N",
            json.dumps(descs).replace("\\", "\\\\") if descs else r"\N",
            r"\N" if sq is None else str(sq),
            r"\N" if yr is None else str(yr),
            r"\N" if dt is None else dt.isoformat(),
            "t" if POOL_RE.search(blob) else "f",
            "t" if GARAGE_RE.search(blob) else "f",
            "t" if SHED_RE.search(blob) else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY ta_stage (pid, qref, pnum, improvements, sqft, yr, sale_dt, pool, garage, shed) FROM STDIN", buf)
    cur.execute("ANALYZE ta_stage")

    candidates = [
        ("spid==PropertyID", "p.source_property_id = s.pid"),
        ("spid==QuickRefID", "p.source_property_id = s.qref"),
        ("apn==PropertyNumber", "p.apn = s.pnum"),
        ("spid==PropertyNumber", "p.source_property_id = s.pnum"),
    ]
    best_join, best_n = None, 0
    for label, cond in candidates:
        cur.execute(f"SELECT count(*) FROM ta_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    tot = cur.fetchone()[0]
    if best_n < 0.30 * max(tot, 1):
        conn.rollback(); conn.close()
        raise SystemExit(f"[{fips}] ABORT: best join {best_n:,} < 30% of {tot:,} — key mismatch")
    print(f"  -> {best_join} ({best_n:,}/{tot:,})", flush=True)

    if dry:
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute(f"""UPDATE parcels p SET
                        improvements     = COALESCE(p.improvements, s.improvements),
                        living_area_sqft = COALESCE(p.living_area_sqft, s.sqft),
                        year_built       = COALESCE(p.year_built, s.yr),
                        last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                        has_pool         = COALESCE(p.has_pool, FALSE) OR s.pool,
                        has_garage       = COALESCE(p.has_garage, FALSE) OR s.garage,
                        has_shed         = COALESCE(p.has_shed, FALSE) OR s.shed
                    FROM ta_stage s
                    WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    imp, sq, sd = cur.fetchone()
    print(f"[{fips}] now: improv {imp:,}, sqft {sq:,}, sale {sd:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
