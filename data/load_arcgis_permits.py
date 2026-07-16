"""Generalized ArcGIS FeatureServer building-permit loader — the non-Socrata
metros (San Antonio, etc.) publish permits as an ArcGIS layer. Add a jurisdiction
to CITIES (FeatureServer URL + field map) and run: paginates the /query endpoint,
normalizes the category, and UPSERTs into `permits` keyed on
(jurisdiction, permit_number) — idempotent, picks up new permits on re-run.

Handles ArcGIS epoch-millisecond dates and X/Y coord fields (or a returned
point geometry). Same `permits` schema + categorizer as the Socrata loader.

Usage: DATABASE_URL=... python load_arcgis_permits.py <jurisdiction> [--referer URL]
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

import psycopg2

from permit_categorize import categorize

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
PAGE = 2000

CITIES = {
    "san_antonio": {
        "county_fips": "48029",
        "featureserver": "https://services.arcgis.com/g1fRTDLeMgspWrYp/arcgis/rest/services/Permits_Issued/FeatureServer/0",
        "referer": None,
        "geom_mode": False,   # X_COORD/Y_COORD fields carry WGS84 lon/lat
        "fields": {
            "permit_number": "Permit_Number",
            "type_desc": "Permit_Type",
            "work_class": "Work_Type",
            "permit_class": None,
            "description": "Project_Name",
            "issued_date": "Date_Issued",      # epoch ms
            "address": "Address",
            "city": None,
            "zip": None,
            "lat": "Y_COORD",
            "lon": "X_COORD",
            "valuation": "Declared_Valuation",
            "parcel_key": None,
        },
    },
    "new_braunfels": {
        "county_fips": "48091",   # Comal
        "featureserver": "https://gismaps.newbraunfels.gov/arcserverwa22/rest/services/OpenData/PlanningZoning/MapServer/10",
        "referer": None,
        "geom_mode": True,        # coords come from the returned point geometry (outSR=4326)
        "fields": {
            "permit_number": "CoNB_Permit_Number",
            "type_desc": "Permit_Type_Name",
            "work_class": "Permit_Classification",
            "permit_class": "Permit_Group",
            "description": "Permit_Label",
            "issued_date": "Permit_Issue_Date",
            "address": "Permit_Address",
            "city": None,
            "zip": None,
            "lat": None,
            "lon": None,
            "valuation": None,
            "parcel_key": None,
        },
    },
    "san_marcos": {
        "county_fips": "48209",   # Hays
        "featureserver": "https://smgis.sanmarcostx.gov/arcgis/rest/services/Planning/CoSM_BuildingPermits/FeatureServer/0",
        "referer": None,
        "geom_mode": True,
        "fields": {
            "permit_number": "PERMITID",
            "type_desc": "TYPE",
            "work_class": "LANDUSE",
            "permit_class": None,
            "description": "DESCRIPTION",
            "issued_date": "ISSUED",
            "address": "ADDRESS",
            "city": None,
            "zip": None,
            "lat": None,
            "lon": None,
            "valuation": None,
            "parcel_key": None,
        },
    },
    "seguin": {
        "county_fips": "48187",   # Guadalupe
        "featureserver": "https://gis.seguintexas.gov/arcgis/rest/services/Permits/Permits/FeatureServer/0",
        "referer": None,
        "geom_mode": True,
        "fields": {
            "permit_number": "USER_PERMITNUMBER",
            "type_desc": "USER_NAME",
            "work_class": None,
            "permit_class": None,
            "description": "USER_DESCRIPTION1",
            "issued_date": "USER_DATEISSUED",   # string 'M/D/YYYY h:mm:ss AM'
            "address": "USER_Address",
            "city": None,
            "zip": None,
            "lat": None,
            "lon": None,
            "valuation": None,
            "parcel_key": None,
        },
    },
    "buda": {
        "county_fips": "48209",   # Hays (small rolling-window dataset)
        "featureserver": "https://services6.arcgis.com/vXZW4vAaPRr14z2s/arcgis/rest/services/Permits/FeatureServer/0",
        "referer": None,
        "geom_mode": True,
        "fields": {
            "permit_number": "PermitNumber",
            "type_desc": "PermitType",
            "work_class": "WorkType",
            "permit_class": None,
            "description": "Description",
            "issued_date": "IssuedDate",        # string M/D/YYYY
            "address": "OriginalAddress",        # NB: 'address' field is the contractor's, do not use
            "city": None,
            "zip": None,
            "lat": None,
            "lon": None,
            "valuation": None,
            "parcel_key": None,
        },
    },
}


def parse_epoch_or_date(v):
    if v in (None, ""):
        return None
    try:  # epoch milliseconds (ArcGIS date)
        ms = int(v)
        d = datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()
        return d if 1900 <= d.year <= date.today().year + 1 else None
    except (ValueError, TypeError, OverflowError, OSError):
        pass
    s = str(v).strip()
    tok = s.split()[0] if s else ""   # 'M/D/YYYY h:mm:ss AM' -> 'M/D/YYYY'
    for cand, fmt in ((s[:19] if "T" in s else s[:10], "%Y-%m-%dT%H:%M:%S"),
                      (s[:10], "%Y-%m-%d"), (tok, "%m/%d/%Y")):
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


def fetch(base, fields, offset, referer, geom_mode):
    params = {"where": "1=1", "outFields": ",".join(fields),
              "returnGeometry": "true" if geom_mode else "false",
              "orderByFields": "OBJECTID", "resultOffset": str(offset),
              "resultRecordCount": str(PAGE), "f": "json"}
    if geom_mode:
        params["outSR"] = "4326"
    url = base + "/query?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": UA}
    if referer:
        headers["Referer"] = referer
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
    juris = [a for a in sys.argv[1:] if not a.startswith("--")][0]
    cfg = CITIES[juris]
    fm = cfg["fields"]
    geom_mode = cfg.get("geom_mode", False)
    referer = cfg.get("referer")
    if "--referer" in sys.argv:
        referer = sys.argv[sys.argv.index("--referer") + 1]
    src_cols = ["OBJECTID"] + [v for v in fm.values() if v]

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='10s'")
    cur.execute("CREATE TEMP TABLE stage (LIKE permits INCLUDING DEFAULTS) ON COMMIT DELETE ROWS")

    def col(row, key):
        src = fm.get(key)
        return row.get(src) if src else None

    upserted, offset = 0, 0
    t0 = time.time()
    while True:
        data = fetch(cfg["featureserver"], sorted(set(src_cols)), offset, referer, geom_mode)
        feats = data.get("features", [])
        if not feats:
            break
        buf = io.StringIO()
        n = 0
        for ft in feats:
            r = ft["attributes"]
            pnum = str(col(r, "permit_number") or "").strip()
            if not pnum:
                continue
            def clean(x):
                return str(x or "").replace("\t", " ").replace("\r", " ").replace("\n", " ").replace("\\", " ").strip()
            type_raw = " / ".join(clean(col(r, k)) for k in ("type_desc", "work_class", "permit_class") if col(r, k))
            cat = categorize(col(r, "type_desc"), col(r, "work_class"), col(r, "permit_class"), col(r, "description"))
            dt = parse_epoch_or_date(col(r, "issued_date"))
            if geom_mode:
                g = ft.get("geometry") or {}
                lat, lon = to_float(g.get("y")), to_float(g.get("x"))
            else:
                lat, lon = to_float(col(r, "lat")), to_float(col(r, "lon"))
            val = to_num(col(r, "valuation"))
            desc = clean(col(r, "description"))
            addr = clean(col(r, "address"))

            def f(x):
                return r"\N" if x is None or x == "" else str(x)
            buf.write("\t".join([
                juris, "arcgis", pnum.replace("\t", " "), type_raw or r"\N", cat,
                dt.isoformat() if dt else r"\N", desc or r"\N", f(val),
                addr or r"\N", (str(col(r, "city")) if col(r, "city") else r"\N"),
                (str(col(r, "zip")) if col(r, "zip") else r"\N"),
                cfg["county_fips"], f(lat), f(lon),
                (str(col(r, "parcel_key")).strip() if col(r, "parcel_key") else r"\N"),
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
                address=EXCLUDED.address, lat=EXCLUDED.lat, lon=EXCLUDED.lon, geom=EXCLUDED.geom, loaded_at=now()
        """)
        conn.commit()
        upserted += n
        offset += len(feats)
        print(f"  page @{offset-len(feats):>7}: +{n:,} (total {upserted:,}, {time.time()-t0:.0f}s)", flush=True)
        if not data.get("exceededTransferLimit") and len(feats) < PAGE:
            break

    cur.execute("SELECT permit_category, count(*) FROM permits WHERE jurisdiction=%s GROUP BY 1 ORDER BY 2 DESC", (juris,))
    print(f"[{juris}] loaded {upserted:,} permits. categories:", flush=True)
    for c, n in cur.fetchall():
        print(f"    {c:12} {n:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
