"""
Load one county's StratMap Land Parcels shapefile into the `parcels` table.

Idempotent and re-runnable per county (TAPOWNER_BUILD.md §6): each run
downloads (if not cached), then replaces that county's rows in a single
transaction (DELETE + bulk INSERT), so re-running is always safe.

Usage:
    python load_county.py --fips 48029 --name bexar --database-url "postgresql://..."
    python load_county.py --fips 48029 --name bexar --database-url "postgresql://..." --year 2025

Source: TxGIO StratMap Land Parcels (public, CC0), one zip per county at
https://tnris-data-warehouse.s3.us-east-1.amazonaws.com/LCD/collection/stratmap-{year}-land-parcels/items/shp/
"""

import argparse
import datetime
import os
import sys
import time
import zipfile

import fiona
import psycopg2
import psycopg2.extras
from shapely.geometry import shape, MultiPolygon

S3_BASE = "https://tnris-data-warehouse.s3.us-east-1.amazonaws.com/LCD/collection"
DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads")

# StratMap's common schema (same field names across all 253 counties it
# covers) does NOT carry living area, beds/baths, stories, pool, garage
# indicator, or sale price/date for ANY county -- confirmed against the
# 2025 Bexar file (709,541 features, none of these fields present in the
# .dbf schema at all). Those columns stay NULL until a richer per-CAD
# source is ingested (documented future task, not v1 -- see PROGRESS.md).
FIELD_MAP_NOTES = {
    "GEO_ID": ("apn", "County-facing parcel/account number."),
    "Prop_ID": ("source_property_id", "CAD internal property id; not unique (multi-unit parcels share one)."),
    "OWNER_NAME": ("owner_name", "Blank/null treated as is_protected=true per Tex. Tax Code 25.025 -- "
                                  "StratMap has no explicit protected-record flag, so this is a heuristic; "
                                  "also catches genuinely incomplete CAD rows, not just legally protected ones."),
    "NAME_CARE": ("owner_name_care", None),
    "SITUS_ADDR": ("situs_address", None),
    "SITUS_NUM": ("situs_number", None),
    "SITUS_STRE": ("situs_street", None),
    "SITUS_ST_1": ("situs_street_1", None),
    "SITUS_ST_2": ("situs_street_2", None),
    "SITUS_CITY": ("situs_city", None),
    "SITUS_STAT": ("situs_state", None),
    "SITUS_ZIP": ("situs_zip", None),
    "MAIL_ADDR": ("mailing_address", None),
    "MAIL_LINE1": ("mailing_line1", None),
    "MAIL_LINE2": ("mailing_line2", None),
    "MAIL_CITY": ("mailing_city", None),
    "MAIL_STAT": ("mailing_state", None),
    "MAIL_ZIP": ("mailing_zip", None),
    "LOC_LAND_U": ("land_use", "Local land-use code preferred over STAT_LAND_ (state code): more complete."),
    "STAT_LAND_": ("land_use", "Fallback when LOC_LAND_U is null."),
    "LEGAL_DESC": ("legal_description", None),
    "DATE_ACQ": ("source_date", "CAD/StratMap extract date -- NOT a property sale date."),
    "YEAR_BUILT": ("year_built", "Comma-separated multi-structure values (e.g. main+addition); "
                                  "reduced to the minimum plausible year (earliest construction)."),
    "GIS_AREA": ("lot_size_sqft", "Converted from GIS_AREA_U (observed: Acres -> *43560); unrecognized units -> null."),
    "LAND_VALUE": ("assessed_land_value", None),
    "IMP_VALUE": ("assessed_improvement_value", None),
    "MKT_VALUE": ("assessed_total_value", None),
}


def clean_str(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.strip(", ") == "":
        return None
    return s


def parse_year_built(raw):
    s = clean_str(raw)
    if not s:
        return None
    this_year = datetime.date.today().year
    years = []
    for part in s.split(","):
        part = part.strip()
        if part.isdigit():
            y = int(part)
            if 1800 <= y <= this_year + 1:
                years.append(y)
    return min(years) if years else None


def parse_source_date(raw):
    if raw is None:
        return None
    s = str(raw)
    if len(s) != 8:
        return None
    try:
        return datetime.date(int(s[0:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


def parse_lot_size_sqft(area, unit):
    if area is None:
        return None
    u = (unit or "").strip().lower()
    if u == "acres":
        return round(area * 43560, 2)
    if u in ("sqft", "sq ft", "square feet", "squarefeet"):
        return round(area, 2)
    return None


def compute_is_absentee(situs_city, situs_state, mail_city, mail_state):
    sc, ss = clean_str(situs_city), clean_str(situs_state)
    mc, ms = clean_str(mail_city), clean_str(mail_state)
    if not sc or not mc:
        return None
    if (sc.upper(), (ss or "").upper()) == (mc.upper(), (ms or "").upper()):
        return False
    return True


def to_multipolygon_wkt(geom_geojson):
    if geom_geojson is None:
        return None
    geom = shape(geom_geojson)
    if geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])
    elif geom.geom_type != "MultiPolygon":
        return None
    return geom.wkt


def download_county(fips, name, year):
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    zip_name = f"stratmap-{year}-land-parcels-{name}_{fips}_shp.zip"
    zip_path = os.path.join(DOWNLOAD_DIR, zip_name)
    if not os.path.exists(zip_path):
        url = f"{S3_BASE}/stratmap-{year}-land-parcels/items/shp/{zip_name}"
        print(f"Downloading {url} ...")
        import urllib.request
        urllib.request.urlretrieve(url, zip_path)
    else:
        print(f"Using cached {zip_path}")

    extract_dir = os.path.join(DOWNLOAD_DIR, f"{name}_{fips}")
    if not os.path.exists(extract_dir):
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)

    shp_files = sorted(f for f in os.listdir(extract_dir) if f.endswith(".shp"))
    if not shp_files:
        raise FileNotFoundError(f"No .shp found in {extract_dir}")
    # Some counties (e.g. Harris) ship as multiple shapefiles (east/west split)
    # because a single .dbf would exceed size limits. Load all of them.
    return [os.path.join(extract_dir, f) for f in shp_files]


def load_rows(shp_paths):
    for shp_path in shp_paths:
        yield from _load_rows_one(shp_path)


def _load_rows_one(shp_path):
    with fiona.open(shp_path) as src:
        for feat in src:
            p = feat["properties"]
            wkt = to_multipolygon_wkt(feat["geometry"])
            if wkt is None:
                continue

            owner_name = clean_str(p.get("OWNER_NAME"))
            land_use = clean_str(p.get("LOC_LAND_U")) or clean_str(p.get("STAT_LAND_"))

            yield (
                clean_str(p.get("GEO_ID")),
                clean_str(p.get("Prop_ID")),
                clean_str(p.get("FIPS")),
                clean_str(p.get("COUNTY")),
                wkt,
                clean_str(p.get("SITUS_ADDR")),
                clean_str(p.get("SITUS_NUM")),
                clean_str(p.get("SITUS_STRE")),
                clean_str(p.get("SITUS_ST_1")),
                clean_str(p.get("SITUS_ST_2")),
                clean_str(p.get("SITUS_CITY")),
                clean_str(p.get("SITUS_STAT")),
                clean_str(p.get("SITUS_ZIP")),
                owner_name,
                clean_str(p.get("NAME_CARE")),
                clean_str(p.get("MAIL_ADDR")),
                clean_str(p.get("MAIL_LINE1")),
                clean_str(p.get("MAIL_LINE2")),
                clean_str(p.get("MAIL_CITY")),
                clean_str(p.get("MAIL_STAT")),
                clean_str(p.get("MAIL_ZIP")),
                compute_is_absentee(p.get("SITUS_CITY"), p.get("SITUS_STAT"), p.get("MAIL_CITY"), p.get("MAIL_STAT")),
                owner_name is None,
                land_use,
                clean_str(p.get("LEGAL_DESC")),
                parse_source_date(p.get("DATE_ACQ")),
                parse_year_built(p.get("YEAR_BUILT")),
                parse_lot_size_sqft(p.get("GIS_AREA"), p.get("GIS_AREA_U")),
                p.get("LAND_VALUE"),
                p.get("IMP_VALUE"),
                p.get("MKT_VALUE"),
            )


INSERT_SQL = """
INSERT INTO parcels (
    apn, source_property_id, county_fips, county_name, geom,
    situs_address, situs_number, situs_street, situs_street_1, situs_street_2,
    situs_city, situs_state, situs_zip,
    owner_name, owner_name_care,
    mailing_address, mailing_line1, mailing_line2, mailing_city, mailing_state, mailing_zip,
    is_absentee, is_protected, land_use, legal_description, source_date,
    year_built, lot_size_sqft, assessed_land_value, assessed_improvement_value, assessed_total_value
) VALUES %s
"""

ROW_TEMPLATE = (
    "(%s,%s,%s,%s,ST_SetSRID(ST_GeomFromText(%s),4326)," + ",".join(["%s"] * 26) + ")"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fips", required=True)
    ap.add_argument("--name", required=True, help="lowercase county name as used in the S3 key, e.g. bexar")
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--year", default="2025")
    ap.add_argument("--batch-size", type=int, default=2000)
    args = ap.parse_args()

    shp_paths = download_county(args.fips, args.name, args.year)

    print(f"Reading {shp_paths} ...")
    t0 = time.time()

    conn = psycopg2.connect(args.database_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("DELETE FROM parcels WHERE county_fips = %s", (args.fips,))
        deleted = cur.rowcount
        print(f"Deleted {deleted} existing rows for county_fips={args.fips}")

        batch = []
        total = 0
        skipped_geom = 0
        for row in load_rows(shp_paths):
            batch.append(row)
            if len(batch) >= args.batch_size:
                psycopg2.extras.execute_values(cur, INSERT_SQL, batch, template=ROW_TEMPLATE, page_size=args.batch_size)
                total += len(batch)
                batch = []
                if total % 50000 == 0:
                    print(f"  ... {total} rows inserted ({time.time()-t0:.1f}s)")
        if batch:
            psycopg2.extras.execute_values(cur, INSERT_SQL, batch, template=ROW_TEMPLATE, page_size=args.batch_size)
            total += len(batch)

        for source_col, (target_field, notes) in FIELD_MAP_NOTES.items():
            cur.execute(
                """
                INSERT INTO cad_field_map (county_fips, source_column_name, target_field, notes)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (county_fips, source_column_name, target_field)
                DO UPDATE SET notes = EXCLUDED.notes
                """,
                (args.fips, source_col, target_field, notes),
            )

        conn.commit()
        print(f"Committed {total} rows for {args.name} ({args.fips}) in {time.time()-t0:.1f}s")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
