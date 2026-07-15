"""Populate Bexar building attributes from SARA's current BCAD export.

Source: San Antonio River Authority's republication of BCAD's Dec-2025
"Export Property Summary" as a hosted ArcGIS FeatureServer (free, public) --
https://gis.sara-tx.org/ags1/rest/services/FW_Bexar/BCAD_Parcels_PROD/FeatureServer/0
(BCAD's OWN maps.bexar.org layer is sqft/year only — the SARA republication is
the current full detail, per DATA_HUNTING_PLAYBOOK.md recipe #3.)

Fields: Prop_id, Bedrooms, Whole_Bath, Half_Bath, Sq_ft, Yr_blt, Imprv_Type.
Beds/baths are STRINGS; multi-improvement parcels are space-separated lists
("2  2") that SUM to the whole-property count. Imprv_Type is a space-separated
code list per property (LA=living area, GAR=garage, OP=open porch, RSW=pool,
SPA=spa, DLA/DLA1=detached living/casita, SH*/RSH=shed, PTO=patio, AG, RMS...).
We store the raw code list verbatim in parcels.improvements and set booleans.

Join: parcels.source_property_id == str(int(Prop_id)) (county_fips 48029).

Usage:
    DATABASE_URL=postgres://... python load_bexar_attributes.py [--dry-run]
"""

import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import psycopg2

LAYER_QUERY_URL = (
    "https://gis.sara-tx.org/ags1/rest/services/FW_Bexar/BCAD_Parcels_PROD/FeatureServer/0/query"
)
OUT_FIELDS = "Prop_id,Bedrooms,Whole_Bath,Half_Bath,Sq_ft,Yr_blt,Imprv_Type"
BEXAR_FIPS = "48029"
PAGE_SIZE = 2000
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# Improvement-code -> boolean flag (raw list always kept in `improvements`).
POOL_CODES = {"RSW"}
CASITA_CODES = {"DLA", "DLA1"}
SHED_CODES = {"SH1", "SH2", "SH3", "SH4", "SH5", "RSH", "SHD", "SH"}
# AG = attached garage, DG = detached garage in BCAD's Imprv_Type vocabulary
# (Frederick's own house has AG and was has_garage=false — caught 2026-07-15).
GARAGE_CODES = {"GAR", "GR", "CAR", "CARP", "CP", "AG", "DG"}


def fetch_page(offset: int):
    params = {
        "where": "Prop_id IS NOT NULL",
        "outFields": OUT_FIELDS,
        "orderByFields": "Prop_id",
        "returnGeometry": "false",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "json",
    }
    url = LAYER_QUERY_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.load(resp)
            if "features" in data:
                return data["features"]
            raise RuntimeError(f"unexpected response: {str(data)[:200]}")
        except Exception:
            if attempt == 4:
                raise
            time.sleep(2 * (attempt + 1))


def sum_counts(value, lo, hi):
    """Space-separated per-improvement counts ('2  2') -> summed int, clamped."""
    if value is None:
        return None
    total = 0
    seen = False
    for tok in str(value).split():
        try:
            total += int(float(tok))
            seen = True
        except ValueError:
            continue
    if not seen:
        return None
    return total if lo <= total <= hi else None


def clean_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    dry_run = "--dry-run" in sys.argv

    # attrs: pid -> (beds, bfull, bhalf, sqft, yr, [codes], pool, casita, shed, garage)
    staged = {}
    seen_codes = {}
    offset, total = 0, 0
    started = time.time()
    while True:
        feats = fetch_page(offset)
        if not feats:
            break
        for f in feats:
            a = f["attributes"]
            total += 1
            pid = a.get("Prop_id")
            if pid is None:
                continue
            key = str(int(pid))
            beds = sum_counts(a.get("Bedrooms"), 1, 60)
            bfull = sum_counts(a.get("Whole_Bath"), 1, 60)
            bhalf = sum_counts(a.get("Half_Bath"), 0, 60)
            sqft = clean_int(a.get("Sq_ft"), 1, 2_000_000)
            yr = clean_int(a.get("Yr_blt"), 1800, 2027)
            codes = [c for c in str(a.get("Imprv_Type") or "").split() if c]
            for c in codes:
                seen_codes[c] = seen_codes.get(c, 0) + 1
            up = {c.upper() for c in codes}
            pool = bool(up & POOL_CODES)
            casita = bool(up & CASITA_CODES)
            shed = bool(up & SHED_CODES)
            garage = bool(up & GARAGE_CODES)
            if not any([beds, bfull, sqft, yr, codes]):
                continue
            staged[key] = (beds, bfull, bhalf, sqft, yr, codes, pool, casita, shed, garage)
        offset += len(feats)
        if total % 100_000 < PAGE_SIZE:
            print(f"fetched {total:,} features ({time.time() - started:.0f}s)", flush=True)
        if dry_run and total >= 4000:
            print("dry-run: stopping fetch after ~4000 features", flush=True)
            break

    print(f"done fetching: {total:,} features, {len(staged):,} usable ({time.time() - started:.0f}s)", flush=True)
    _dump_labels(seen_codes)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                """CREATE TEMP TABLE bexar_attrs (
                       pid TEXT PRIMARY KEY, beds INT, bfull INT, bhalf INT,
                       sqft INT, yr INT, improvements JSONB,
                       pool BOOLEAN, casita BOOLEAN, shed BOOLEAN, garage BOOLEAN
                   )"""
            )
            buf = io.StringIO()
            for pid, (beds, bfull, bhalf, sqft, yr, codes, pool, casita, shed, garage) in staged.items():
                improv = json.dumps(codes).replace("\\", "\\\\")
                buf.write(
                    "\t".join(
                        [
                            pid,
                            r"\N" if beds is None else str(beds),
                            r"\N" if bfull is None else str(bfull),
                            r"\N" if bhalf is None else str(bhalf),
                            r"\N" if sqft is None else str(sqft),
                            r"\N" if yr is None else str(yr),
                            improv if codes else r"\N",
                            "t" if pool else "f",
                            "t" if casita else "f",
                            "t" if shed else "f",
                            "t" if garage else "f",
                        ]
                    )
                    + "\n"
                )
            buf.seek(0)
            cur.copy_expert("COPY bexar_attrs FROM STDIN", buf)

            cur.execute(
                """SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
                   FROM bexar_attrs a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                (BEXAR_FIPS,),
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
                       living_area_sqft = COALESCE(a.sqft, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr),
                       improvements     = COALESCE(a.improvements, p.improvements),
                       has_pool         = COALESCE(p.has_pool, NULLIF(a.pool, FALSE)) OR a.pool,
                       has_casita       = COALESCE(p.has_casita, FALSE) OR a.casita,
                       has_shed         = COALESCE(p.has_shed, FALSE) OR a.shed,
                       has_garage       = COALESCE(p.has_garage, FALSE) OR a.garage
                   FROM bexar_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (BEXAR_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE baths_full IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE has_casita),
                          count(*) FILTER (WHERE has_shed),
                          count(*) FILTER (WHERE improvements IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (BEXAR_FIPS,),
            )
            beds, baths, pool, casita, shed, improv = cur.fetchone()
            print(
                f"Bexar: beds={beds:,} baths={baths:,} pool={pool:,} casita={casita:,} "
                f"shed={shed:,} improvements={improv:,}",
                flush=True,
            )
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


def _dump_labels(seen_codes: dict) -> None:
    path = os.path.join(os.path.dirname(__file__), "improvement_labels_seen.md")
    exists = os.path.exists(path)
    with open(path, "a", encoding="utf-8") as fh:
        if not exists:
            fh.write("# Improvement labels seen (raw, per system/county)\n\n")
            fh.write("Append-only log so the app session can extend the canonical crosswalk.\n\n")
            fh.write("| system | county | raw label | count |\n|---|---|---|---|\n")
        for label, count in sorted(seen_codes.items(), key=lambda kv: -kv[1]):
            fh.write(f"| SARA/BCAD (PACS) | Bexar | `{label}` | {count} |\n")
    print(f"logged {len(seen_codes)} distinct improvement codes to improvement_labels_seen.md", flush=True)


if __name__ == "__main__":
    main()
