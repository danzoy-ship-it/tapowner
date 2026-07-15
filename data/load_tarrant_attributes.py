"""Populate Tarrant building attributes AND assessed values from TAD's export.

Source: https://www.tad.org/content/data-download/PropertyData(Delimited)_R.ZIP
(residential) and ..._C.ZIP (commercial) — pipe-delimited, header row, free
instant download (browser UA required). Accepts the .zip or the extracted .txt.
Join: parcels.source_property_id == GIS_Link (subdivision-block-lot, e.g.
"14437-29-32", county_fips 48439). GIS_Link repeats across condo/sub-unit
rows; the largest-Living_Area row wins wholesale, pool OR'd.

Fills living_area_sqft (Living_Area), has_pool (Swimming_Pool_Ind Y/N, both
directions), year_built (backfill), and — the 2026-07-14 hunt findings —
assessed_land_value / assessed_improvement_value / assessed_total_value
(Land_Value/Improvement_Value/Total_Value; populated on ~663K of 669K rows)
plus lot_size_sqft (Land_SqFt, fallback Land_Acres*43560). Values/lot take
precedence over existing DB values because StratMap's Tarrant extract shipped
literal zeros (forensics 2026-07-14: 809/757,171 nonzero MKT_VALUE at source).

Beds/baths are BLANK in every TAD bulk file — but the app session fills them
live from TAD's True Prodigy per-property API (see HANDOFF "TARRANT BEDS/BATHS").
That fill resolves each parcel by the numeric TP pid, which it reads from
parcels.apn — so this loader ALSO backfills parcels.apn = Account_Num (col 2 of
the R file) where apn IS NULL, keeping the crosswalk alive across reloads.

Usage:
    DATABASE_URL=... python load_tarrant_attributes.py <R.zip|R.txt> [more files...] [--dry-run]
"""

import io
import os
import sys
import time
import zipfile

import psycopg2

TARRANT_FIPS = "48439"


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def open_text(path: str):
    if path.lower().endswith(".zip"):
        zf = zipfile.ZipFile(path)
        member = next(n for n in zf.namelist() if n.lower().endswith(".txt"))
        return io.TextIOWrapper(zf.open(member), encoding="latin-1", errors="replace")
    return open(path, encoding="latin-1", errors="replace")


def parse_file(path: str, keys: dict, accts: dict, dry_run: bool) -> None:
    started = time.time()
    with open_text(path) as text:
        header = [h.strip() for h in text.readline().rstrip("\r\n").split("|")]
        idx = {h: i for i, h in enumerate(header)}
        gi = idx["GIS_Link"]
        ai = idx.get("Account_Num")  # numeric True Prodigy pid (col 2)
        li, yi, pi = idx["Living_Area"], idx["Year_Built"], idx["Swimming_Pool_Ind"]
        lvi, ivi, tvi = idx["Land_Value"], idx["Improvement_Value"], idx["Total_Value"]
        lsi, lai = idx["Land_SqFt"], idx["Land_Acres"]
        maxi = max(gi, li, yi, pi, lvi, ivi, tvi, lsi, lai, ai or 0)
        for n, line in enumerate(text):
            parts = line.rstrip("\r\n").split("|")
            if len(parts) <= maxi:
                continue
            key = parts[gi].strip()
            if not key:
                continue
            # apn crosswalk: GIS_Link -> Account_Num (the numeric TP pid the
            # app's fill-on-blank resolves beds/baths by). Constant per GIS_Link.
            if ai is not None and key not in accts:
                acct = parts[ai].strip()
                if acct:
                    accts[key] = acct
            living = to_int(parts[li], 1, 2_000_000)
            yr = to_int(parts[yi], 1800, 2027)
            pool = parts[pi].strip().upper() == "Y"
            land_val = to_int(parts[lvi], 1, 2_000_000_000)
            imp_val = to_int(parts[ivi], 1, 2_000_000_000)
            total_val = to_int(parts[tvi], 1, 2_000_000_000)
            lot = to_int(parts[lsi], 1, 2_000_000_000)
            if lot is None:
                acres = to_int(parts[lai], 1, 10_000_000)  # whole acres only as fallback
                if acres is None:
                    try:
                        a = float(parts[lai].strip())
                        lot = int(a * 43560) if 0 < a < 10_000_000 else None
                    except (ValueError, TypeError):
                        lot = None
                else:
                    lot = acres * 43560
            row = [living, yr, pool, land_val, imp_val, total_val, lot]
            if all(v in (None, False) for v in row):
                continue
            prev = keys.get(key)
            if prev is None:
                keys[key] = row
            elif (living or 0) > (prev[0] or 0):
                # largest dwelling wins wholesale; keep pool if either row had it
                row[2] = row[2] or prev[2]
                keys[key] = row
            else:
                prev[2] = prev[2] or pool
            if dry_run and n >= 100_000:
                print("dry-run: stopping parse at 100k rows", flush=True)
                break
    print(f"{path}: aggregated so far {len(keys):,} GIS links ({time.time() - started:.0f}s)", flush=True)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_tarrant_attributes.py <R.zip|R.txt> [more files...] [--dry-run]")
        sys.exit(1)

    # gis_link -> [living, yr, pool, land_val, imp_val, total_val, lot_sqft]
    keys: dict = {}
    accts: dict = {}  # gis_link -> Account_Num (numeric TP pid) for the apn crosswalk
    for path in args:
        parse_file(path, keys, accts, dry_run)

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=10,
    )
    cur = conn.cursor()
    cur.execute(
        """CREATE TEMP TABLE tarrant_attrs (
               gis_link TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN,
               land_val BIGINT, imp_val BIGINT, total_val BIGINT, lot_sqft BIGINT,
               account_num TEXT
           )"""
    )
    buf = io.StringIO()
    for key, (living, yr, pool, land_val, imp_val, total_val, lot) in keys.items():
        buf.write(
            "\t".join(
                [
                    key,
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    "t" if pool else "f",
                    r"\N" if land_val is None else str(land_val),
                    r"\N" if imp_val is None else str(imp_val),
                    r"\N" if total_val is None else str(total_val),
                    r"\N" if lot is None else str(lot),
                    accts.get(key) or r"\N",
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY tarrant_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*),
                  count(*) FILTER (WHERE t.total_val IS NOT NULL),
                  count(*) FILTER (WHERE t.lot_sqft IS NOT NULL)
           FROM tarrant_attrs t
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = t.gis_link""",
        (TARRANT_FIPS,),
    )
    j, jv, jl = cur.fetchone()
    print(f"joinable parcel rows: {j:,} (with values {jv:,} · with lot {jl:,})", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    # Values + lot: NEW wins (existing Tarrant values are source zeros, not data).
    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft           = COALESCE(t.living, p.living_area_sqft),
               year_built                 = COALESCE(p.year_built, t.yr),
               has_pool                   = COALESCE(t.pool, p.has_pool),
               assessed_land_value        = COALESCE(t.land_val, NULLIF(p.assessed_land_value, 0)),
               assessed_improvement_value = COALESCE(t.imp_val, NULLIF(p.assessed_improvement_value, 0)),
               assessed_total_value       = COALESCE(t.total_val, NULLIF(p.assessed_total_value, 0)),
               lot_size_sqft              = COALESCE(t.lot_sqft, NULLIF(p.lot_size_sqft, 0))
           FROM tarrant_attrs t
           WHERE p.county_fips = %s AND p.source_property_id = t.gis_link""",
        (TARRANT_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)

    # Leftover source zeros ("$0" in the app) become clean NULLs (rendered as
    # absent, per build doc §4: omit, never show a placeholder/zero).
    cur.execute(
        """UPDATE parcels SET
               assessed_land_value        = NULLIF(assessed_land_value, 0),
               assessed_improvement_value = NULLIF(assessed_improvement_value, 0),
               assessed_total_value       = NULLIF(assessed_total_value, 0),
               lot_size_sqft              = CASE WHEN lot_size_sqft < 1 THEN NULL ELSE lot_size_sqft END
           WHERE county_fips = %s
             AND (assessed_land_value = 0 OR assessed_improvement_value = 0
                  OR assessed_total_value = 0 OR lot_size_sqft < 1)""",
        (TARRANT_FIPS,),
    )
    print("zero->NULL cleanup rows:", cur.rowcount, flush=True)

    # Durability: the app-session's beds/baths fill-on-blank resolves each
    # Tarrant parcel by the numeric True Prodigy pid, which it reads from
    # parcels.apn. TAD's GIS_Link (our source_property_id) is the hyphenated
    # geoID; Account_Num is the pid. Backfill apn where NULL so a reload of
    # this loader never wipes the crosswalk and takes the fill dormant.
    cur.execute(
        """UPDATE parcels p SET apn = t.account_num
           FROM tarrant_attrs t
           WHERE p.county_fips = %s AND p.source_property_id = t.gis_link
             AND p.apn IS NULL AND t.account_num IS NOT NULL""",
        (TARRANT_FIPS,),
    )
    print("apn (TP pid) backfill rows:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                  count(*) FILTER (WHERE has_pool),
                  count(*) FILTER (WHERE assessed_total_value > 0),
                  count(*) FILTER (WHERE lot_size_sqft > 0)
           FROM parcels WHERE county_fips = %s""",
        (TARRANT_FIPS,),
    )
    sqft, pools, vals, lots = cur.fetchone()
    print(
        f"Tarrant parcels with sqft: {sqft:,} | pools: {pools:,} | values: {vals:,} | lot: {lots:,}",
        flush=True,
    )


if __name__ == "__main__":
    main()
