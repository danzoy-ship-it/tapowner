"""BIS Consultants ArcGIS FeatureServer loader — the clean BULK path for the
~45-county BIS family (fable-5 crack, 2026-07-16). Same shape as the Bexar/SARA
loader: paginate an Esri layer's /query and map attributes to parcels.

Direct-server counties: https://gis.{county}cad.org/arcgis/rest/services/
{County}CADWebService/MapServer/{parcelLayer} . Fields (identical across counties):
PROP_ID, QuickRefID, YearBuilt, TotSqftLvg (living sqft), LandSizeFT (lot),
SaleDate (epoch ms), DeedDate, IMPClass, TotalValue, Exemptions (Orion variant).
NO beds/baths/features here (those need the eSearch surface, later).

Auto-discovers the Parcels layer if not given (scans MapServer?f=json for a layer
carrying TotSqftLvg/PROP_ID). Join auto-detected + >=30% or abort.

Usage: DATABASE_URL=... python load_bis_gis.py <fips> <MapServer-url> [layer] [--dry-run]
   e.g. ... 48303 https://gis.lubbockcad.org/arcgis/rest/services/LubbockCADWebService/MapServer 129
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

import psycopg2

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
PAGE = 1000


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for a in range(5):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except Exception:
            if a == 4:
                raise
            time.sleep(2 * (a + 1))


def find_layer(mapserver):
    meta = fetch(mapserver + "?f=json")
    for lyr in meta.get("layers", []):
        lid = lyr["id"]
        lm = fetch(f"{mapserver}/{lid}?f=json")
        fields = {f["name"].lower() for f in lm.get("fields", [])}
        if "totsqftlvg" in fields and ("prop_id" in fields or "quickrefid" in fields):
            return lid
    raise SystemExit("could not auto-find the Parcels layer (no TotSqftLvg field)")


def to_int(v, lo, hi):
    try:
        n = int(float(v))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def epoch_to_date(v):
    try:
        return datetime.fromtimestamp(int(v) / 1000, tz=timezone.utc).date()
    except (ValueError, TypeError, OSError):
        return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, mapserver = args[0], args[1].rstrip("/")
    layer = args[2] if len(args) > 2 else find_layer(mapserver)
    base = f"{mapserver}/{layer}/query"
    total = fetch(base + "?where=1%3D1&returnCountOnly=true&f=json").get("count", 0)
    print(f"[{fips}] layer {layer}: {total:,} features", flush=True)

    staged = {}
    off, t0 = 0, time.time()
    while off < total:
        params = {"where": "1=1", "outFields": "*", "returnGeometry": "false",
                  "resultOffset": str(off), "resultRecordCount": str(PAGE), "f": "json"}
        data = fetch(base + "?" + urllib.parse.urlencode(params))
        feats = data.get("features", [])
        if not feats:
            break
        for f in feats:
            a = {k.lower(): v for k, v in f["attributes"].items()}
            pid = str(a.get("prop_id") or a.get("quickrefid") or "").strip()
            if not pid:
                continue
            ex = a.get("exemptions")
            codes = [c.strip().upper() for c in str(ex).replace(";", ",").split(",") if c.strip()] if ex else None
            staged[pid] = (
                to_int(a.get("totsqftlvg"), 1, 2_000_000),
                to_int(a.get("yearbuilt"), 1800, date.today().year + 1),
                epoch_to_date(a.get("saledate")) or epoch_to_date(a.get("deeddate")),
                to_int(a.get("landsizeft"), 1, 500_000_000),
                codes,
            )
        off += len(feats)
        if off % 20000 < PAGE:
            print(f"  fetched {off:,} ({time.time()-t0:.0f}s)", flush=True)
    print(f"[{fips}] fetched {len(staged):,} parcels ({time.time()-t0:.0f}s)", flush=True)
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
    import io
    conn = _connect(); cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE bis_stage (
                       pid TEXT PRIMARY KEY, sqft INT, yr INT, sale_dt DATE, lot INT, exemptions TEXT[])""")
    buf = io.StringIO()
    for pid, (sq, yr, dt, lot, codes) in staged.items():
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([
            pid.replace("\\", "\\\\"),
            r"\N" if sq is None else str(sq),
            r"\N" if yr is None else str(yr),
            r"\N" if dt is None else dt.isoformat(),
            r"\N" if lot is None else str(lot),
            arr,
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY bis_stage (pid, sqft, yr, sale_dt, lot, exemptions) FROM STDIN", buf)
    cur.execute("ANALYZE bis_stage")

    cands = [("spid==PROP_ID", "p.source_property_id = s.pid"),
             ("apn==PROP_ID", "p.apn = s.pid")]
    best_join, best_n = None, 0
    for label, cond in cands:
        cur.execute(f"SELECT count(*) FROM bis_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    tot = cur.fetchone()[0]
    if best_n < 0.30 * max(tot, 1):
        conn.rollback(); conn.close()
        raise SystemExit(f"[{fips}] ABORT: best join {best_n:,} < 30% of {tot:,}")
    print(f"  -> {best_join} ({best_n:,}/{tot:,})", flush=True)

    if dry:
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute(f"""UPDATE parcels p SET
                        living_area_sqft = COALESCE(p.living_area_sqft, s.sqft),
                        year_built       = COALESCE(p.year_built, s.yr),
                        last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                        lot_size_sqft    = COALESCE(p.lot_size_sqft, s.lot),
                        exemptions       = COALESCE(s.exemptions, p.exemptions)
                    FROM bis_stage s
                    WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE year_built IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    sq, yr, sd = cur.fetchone()
    print(f"[{fips}] now: sqft {sq:,}, year {yr:,}, sale {sd:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
