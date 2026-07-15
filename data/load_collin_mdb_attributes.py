"""Populate Collin BEDS/BATHS/STORIES/POOL from CCAD's public "Lite Database".

The Socrata dataset (load_collin_attributes.py) gave sqft/pool/year but carries
NO beds/baths. CCAD's *other* public export does: the "Appraisal Data Export"
LiteDatabase (a single Access table AD_Public.mdb, ~504K rows), linked from
https://collincad.org/category/appraisal-data-exports/ :

  https://link.collincad.org/public/folder/1j1vp-rhx06rqkh3vz2ipw/AppraisalData/LiteDatabaseCurrent.zip

Per the shipped AD_Public_FileLayout.pdf, the flat table keys on prop_id and
carries beds / baths / stories / pool / living_area / yr_blt directly:
  beds    text '0'..'11' (322K populated)   -> bedrooms   (clamp 1..20)
  baths   text full.half '2.5'=2full+1half  -> baths_full/baths_half
          (338K populated; a few malformed '4.5.5' -> first number '4.5' wins)
  stories int                               -> stories
  pool    'Y'/'N'                           -> has_pool

Join: parcels.source_property_id == str(prop_id)  (county_fips 48085), same key
the Socrata loader used.

Reads the .mdb via the 64-bit Microsoft Access ODBC driver (pyodbc). Usage:
    DATABASE_URL=... python load_collin_mdb_attributes.py <path\\AD_Public.mdb> [--dry-run]
"""

import io
import os
import re
import sys
import time

import psycopg2
import pyodbc

FIPS = "48085"
NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def _first_num(value):
    if value is None:
        return None
    m = NUM_RE.search(str(value))
    return float(m.group()) if m else None


def parse_beds(value):
    f = _first_num(value)
    if f is None:
        return None
    n = int(f)
    return n if 1 <= n <= 20 else None


def parse_baths(value):
    """full.half convention: '2.5' -> (2,1); '3' -> (3,0); '4.5.5' -> (4,1)."""
    f = _first_num(value)
    if f is None:
        return None, None
    full = int(f)
    if not (1 <= full <= 20):
        return None, None
    return full, (1 if (f - full) >= 0.4 else 0)


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_collin_mdb_attributes.py <AD_Public.mdb> [--dry-run]")
        sys.exit(1)
    mdb = args[0]
    started = time.time()

    cn = pyodbc.connect(
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};DBQ=%s;" % mdb
    )
    cur = cn.cursor()
    cur.execute(
        "SELECT prop_id, beds, baths, stories, pool, living_area, yr_blt FROM AD_Public"
    )

    # pid -> [beds, bfull, bhalf, stories, pool, living, yr]
    acc = {}
    n = 0
    for prop_id, beds, baths, stories, pool, living, yr in cur:
        if prop_id is None:
            continue
        pid = str(int(prop_id)) if isinstance(prop_id, (int, float)) else str(prop_id).strip()
        b = parse_beds(beds)
        bfull, bhalf = parse_baths(baths)
        st = to_int(stories, 1, 60)
        pl = str(pool).strip().upper() == "Y" if pool is not None else None
        liv = to_int(living, 1, 2_000_000)
        yb = to_int(yr, 1800, 2027)
        if b is None and bfull is None and st is None and pl is None and liv is None and yb is None:
            continue
        acc[pid] = [b, bfull, bhalf, st, pl, liv, yb]
        n += 1
        if dry_run and n >= 20000:
            break
    print(f"read {len(acc):,} usable rows ({time.time() - started:.0f}s)", flush=True)
    cn.close()

    conn = psycopg2.connect(
        os.environ["DATABASE_URL"],
        keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10,
    )
    pcur = conn.cursor()
    pcur.execute(
        """CREATE TEMP TABLE collin_mdb (
               pid TEXT PRIMARY KEY, beds INT, bfull INT, bhalf INT,
               stories INT, pool BOOLEAN, living INT, yr INT)"""
    )
    buf = io.StringIO()
    for pid, (b, bf, bh, st, pl, liv, yb) in acc.items():
        buf.write("\t".join([
            pid,
            r"\N" if b is None else str(b),
            r"\N" if bf is None else str(bf),
            r"\N" if bh is None else str(bh),
            r"\N" if st is None else str(st),
            r"\N" if pl is None else ("t" if pl else "f"),
            r"\N" if liv is None else str(liv),
            r"\N" if yb is None else str(yb),
        ]) + "\n")
    buf.seek(0)
    pcur.copy_expert("COPY collin_mdb FROM STDIN", buf)

    pcur.execute(
        """SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
           FROM collin_mdb a
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
        (FIPS,),
    )
    j, jb = pcur.fetchone()
    print(f"joinable parcel rows: {j:,} (with beds {jb:,})", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    pcur.execute(
        """UPDATE parcels p SET
               bedrooms         = COALESCE(a.beds, p.bedrooms),
               baths_full       = COALESCE(a.bfull, p.baths_full),
               baths_half       = COALESCE(a.bhalf, p.baths_half),
               stories          = COALESCE(a.stories, p.stories),
               has_pool         = COALESCE(p.has_pool, FALSE) OR COALESCE(a.pool, FALSE),
               living_area_sqft = COALESCE(p.living_area_sqft, a.living),
               year_built       = COALESCE(p.year_built, a.yr)
           FROM collin_mdb a
           WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
        (FIPS,),
    )
    print("parcel rows updated:", pcur.rowcount, flush=True)
    conn.commit()

    pcur.execute(
        """SELECT count(*) FILTER (WHERE bedrooms IS NOT NULL),
                  count(*) FILTER (WHERE baths_full IS NOT NULL),
                  count(*) FILTER (WHERE stories IS NOT NULL),
                  count(*) FILTER (WHERE has_pool),
                  count(*) FILTER (WHERE living_area_sqft IS NOT NULL)
           FROM parcels WHERE county_fips = %s""",
        (FIPS,),
    )
    beds, baths, st, pools, sqft = pcur.fetchone()
    print(f"Collin: beds={beds:,} baths={baths:,} stories={st:,} pool={pools:,} sqft={sqft:,}", flush=True)


if __name__ == "__main__":
    main()
