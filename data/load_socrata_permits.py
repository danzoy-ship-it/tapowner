"""Generalized Socrata open-data building-permit loader. Most big TX metros
publish permits on a Socrata portal (data.{city}.gov). Add a jurisdiction to the
CITIES config (Socrata 4x4 dataset id + a field map) and run — the loader
paginates the SODA API, normalizes each permit's category (permit_categorize.py),
and UPSERTs into `permits` keyed on (jurisdiction, permit_number) so re-runs are
idempotent and pick up new permits.

Pagination is page-by-page (50k rows) with a per-page COPY→ON CONFLICT upsert, so
memory stays bounded even on Austin's 2.3M-row dataset.

Usage: DATABASE_URL=... python load_socrata_permits.py <jurisdiction> [--limit N] [--app-token TOKEN]
"""
import io
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime

import psycopg2

from permit_categorize import categorize

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
PAGE = 50000

# Each city: county_fips, Socrata host + dataset, and a field map. Field-map keys
# are our columns; values are the source column names (None = not present).
CITIES = {
    "austin": {
        "county_fips": "48453",
        "domain": "data.austintexas.gov",
        "dataset": "3syk-w9eu",  # Issued Construction Permits
        "fields": {
            "permit_number": "permit_number",
            "type_desc": "permit_type_desc",
            "work_class": "work_class",
            "permit_class": "permit_class",
            "description": "description",
            "issued_date": "issue_date",
            "address": "original_address1",
            "city": "original_city",
            "zip": "original_zip",
            "lat": "latitude",
            "lon": "longitude",
            "valuation": None,
            "parcel_key": "tcad_id",
        },
    },
    "dallas": {
        "county_fips": "48113",
        "domain": "www.dallasopendata.com",
        "dataset": "e7gq-4sah",  # Building Permits (rich: type + work_description + value)
        "fields": {
            "permit_number": "permit_number",
            "type_desc": "permit_type",
            "work_class": None,
            "permit_class": None,
            "description": "work_description",
            "issued_date": "issued_date",
            "address": "street_address",
            "city": None,
            "zip": "zip_code",
            "lat": None,
            "lon": None,
            "valuation": "value",
            "parcel_key": None,
        },
    },
}


def parse_date(v):
    if not v:
        return None
    s = str(v).strip()
    tok = s.split()[0] if s else ""   # 'M/D/YYYY h:mm' -> 'M/D/YYYY'
    for cand, fmt in ((s[:26] if "." in s else s[:19] if "T" in s else s[:10], "%Y-%m-%dT%H:%M:%S.%f"),
                      (s[:19], "%Y-%m-%dT%H:%M:%S"), (s[:10], "%Y-%m-%d"),
                      (tok, "%m/%d/%Y"), (tok, "%m/%d/%y")):
        try:
            d = datetime.strptime(cand, fmt).date()
            return d if 1900 <= d.year <= date.today().year + 1 else None
        except ValueError:
            continue
    return None


def to_float(v):
    try:
        f = float(v)
        return f if -180 <= f <= 180 else None
    except (ValueError, TypeError):
        return None


def to_num(v):
    try:
        return float(str(v).replace(",", "").replace("$", ""))
    except (ValueError, TypeError):
        return None


def fetch(domain, dataset, select, offset, token):
    import json
    params = {"$select": select, "$order": ":id", "$limit": str(PAGE), "$offset": str(offset)}
    url = f"https://{domain}/resource/{dataset}.json?" + urllib.parse.urlencode(params, safe="(),:")
    headers = {"User-Agent": UA}
    if token:
        headers["X-App-Token"] = token
    for a in range(5):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:
            if a == 4:
                raise
            print(f"  fetch retry {a+1} @off {offset}: {e}", flush=True)
            time.sleep(4 * (a + 1))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    juris = args[0]
    cfg = CITIES[juris]
    fm = cfg["fields"]
    token = None
    if "--app-token" in sys.argv:
        token = sys.argv[sys.argv.index("--app-token") + 1]
    hard_limit = None
    if "--limit" in sys.argv:
        hard_limit = int(sys.argv[sys.argv.index("--limit") + 1])
    dataset = cfg["dataset"]
    if "--dataset" in sys.argv:   # load another dataset under the same jurisdiction (e.g. Dallas fiscal-year files)
        dataset = sys.argv[sys.argv.index("--dataset") + 1]
    cfg = dict(cfg, dataset=dataset)

    src_cols = [v for v in fm.values() if v]
    select = ",".join(sorted(set(src_cols)))

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='10s'")
    cur.execute("""CREATE TEMP TABLE stage (LIKE permits INCLUDING DEFAULTS) ON COMMIT DELETE ROWS""")

    def col(row, key):
        src = fm.get(key)
        return row.get(src) if src else None

    total, upserted = 0, 0
    offset = 0
    t0 = time.time()
    while True:
        rows = fetch(cfg["domain"], cfg["dataset"], select, offset, token)
        if not rows:
            break
        buf = io.StringIO()
        n = 0
        for r in rows:
            pnum = (col(r, "permit_number") or "").strip()
            if not pnum:
                continue
            type_raw = " / ".join(str(col(r, k)) for k in ("type_desc", "work_class", "permit_class") if col(r, k))
            cat = categorize(col(r, "type_desc"), col(r, "work_class"), col(r, "permit_class"), col(r, "description"))
            dt = parse_date(col(r, "issued_date"))
            lat, lon = to_float(col(r, "lat")), to_float(col(r, "lon"))
            val = to_num(col(r, "valuation"))
            desc = (col(r, "description") or "").replace("\t", " ").replace("\n", " ").replace("\\", " ")
            addr = (col(r, "address") or "").replace("\t", " ").replace("\\", " ")
            pkey = (str(col(r, "parcel_key")).strip() if col(r, "parcel_key") else "")

            def f(x):
                return r"\N" if x is None or x == "" else str(x)
            # columns: jurisdiction,source_system,permit_number,permit_type_raw,permit_category,
            #          issued_date,description,valuation,address,city,zip,county_fips,lat,lon,source_parcel_key
            buf.write("\t".join([
                juris, "socrata", pnum.replace("\t", " "), type_raw or r"\N", cat,
                dt.isoformat() if dt else r"\N", desc or r"\N", f(val),
                addr or r"\N", (col(r, "city") or r"\N"), (col(r, "zip") or r"\N"),
                cfg["county_fips"], f(lat), f(lon), pkey or r"\N",
            ]) + "\n")
            n += 1
        buf.seek(0)
        cur.copy_expert("""COPY stage (jurisdiction,source_system,permit_number,permit_type_raw,
            permit_category,issued_date,description,valuation,address,city,zip,county_fips,lat,lon,source_parcel_key)
            FROM STDIN""", buf)
        cur.execute("""
            INSERT INTO permits (jurisdiction,source_system,permit_number,permit_type_raw,permit_category,
                issued_date,description,valuation,address,city,zip,county_fips,lat,lon,geom,source_parcel_key)
            SELECT DISTINCT ON (jurisdiction, permit_number)
                jurisdiction,source_system,permit_number,permit_type_raw,permit_category,issued_date,
                description,valuation,address,city,zip,county_fips,lat,lon,
                CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN ST_SetSRID(ST_MakePoint(lon,lat),4326) END,
                source_parcel_key
            FROM stage
            ORDER BY jurisdiction, permit_number, issued_date DESC NULLS LAST
            ON CONFLICT (jurisdiction, permit_number) DO UPDATE SET
                permit_type_raw=EXCLUDED.permit_type_raw, permit_category=EXCLUDED.permit_category,
                issued_date=EXCLUDED.issued_date, description=EXCLUDED.description, valuation=EXCLUDED.valuation,
                address=EXCLUDED.address, city=EXCLUDED.city, zip=EXCLUDED.zip, lat=EXCLUDED.lat, lon=EXCLUDED.lon,
                geom=EXCLUDED.geom, source_parcel_key=EXCLUDED.source_parcel_key, loaded_at=now()
        """)
        conn.commit()
        upserted += n
        total += len(rows)
        offset += len(rows)
        print(f"  page @{offset-len(rows):>8} : +{n:,} upserted (total {upserted:,}, {time.time()-t0:.0f}s)", flush=True)
        if len(rows) < PAGE:
            break
        if hard_limit and total >= hard_limit:
            break

    cur.execute("""SELECT permit_category, count(*) FROM permits WHERE jurisdiction=%s
                   GROUP BY permit_category ORDER BY 2 DESC""", (juris,))
    print(f"[{juris}] loaded {upserted:,} permits. category breakdown:", flush=True)
    for c, n in cur.fetchall():
        print(f"    {c:12} {n:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
