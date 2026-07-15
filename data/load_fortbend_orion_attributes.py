"""Populate Fort Bend BEDS/BATHS from FBCAD's Orion residential-segment export.

FBCAD runs Tyler **Orion** (not PACS). Its CamaSummary GIS layer carries sqft/
year only -- NO beds (verified: the layer has no bedroom field at all). Beds/
baths live in the Orion residential-segment export ("WebsiteResidentialSegs"),
a large xlsx linked from https://www.fbcad.org/data/ :

  2024-PostCert_WebsiteResidentialSegs-November.xlsx  (one row per building
  segment; the MAIN dwelling segment carries the room counts)
    fBedrooms    -> bedrooms    (clamp 1..20)
    fPlumbing    -> baths_full  (full baths)
    fNumHalfBath -> baths_half
  PropertyNumber (the quadrant id '5910-04-022-0700-907') == parcels.apn --
  the SAME join key load_fortbend_attributes.py used for sqft.

Room counts appear only on the main segment (MA/MA2 …); other segments (garage,
porch, AG) leave them null. Per property we keep the counts from the segment
that reports bedrooms; if none does, we still take the max plumbing seen.

Usage:
    DATABASE_URL=... python load_fortbend_orion_attributes.py <ResidentialSegs.xlsx> [--dry-run]
"""

import io
import os
import sys
import time

import openpyxl
import psycopg2

FIPS = "48157"
# column indices from the export header (0-based)
C_PROPNUM = 3      # PropertyNumber (== apn)
C_BEDS = 20        # fBedrooms
C_HALFBATH = 41    # fNumHalfBath
C_PLUMBING = 48    # fPlumbing (full baths)


def to_int(v, lo, hi):
    try:
        n = int(float(str(v).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_fortbend_orion_attributes.py <ResidentialSegs.xlsx> [--dry-run]")
        sys.exit(1)
    xlsx = args[0]
    started = time.time()

    wb = openpyxl.load_workbook(xlsx, read_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    next(it)  # header

    # apn -> [beds, bfull, bhalf]
    acc = {}
    n = 0
    for row in it:
        if len(row) <= C_PLUMBING:
            continue
        apn = row[C_PROPNUM]
        if not apn:
            continue
        apn = str(apn).strip()
        beds = to_int(row[C_BEDS], 1, 20)
        bfull = to_int(row[C_PLUMBING], 1, 20)
        bhalf = to_int(row[C_HALFBATH], 0, 10)
        if beds is None and bfull is None and bhalf is None:
            continue
        e = acc.get(apn)
        if e is None:
            acc[apn] = [beds, bfull, bhalf]
        else:
            # a segment that reports bedrooms is the main dwelling: prefer its
            # full/half bath values; otherwise fill blanks / keep max plumbing.
            if beds is not None and e[0] is None:
                e[0], e[1], e[2] = beds, bfull, bhalf
            else:
                if e[0] is None and beds is not None:
                    e[0] = beds
                if e[1] is None or (bfull or 0) > (e[1] or 0):
                    e[1] = bfull if bfull is not None else e[1]
                if e[2] is None and bhalf is not None:
                    e[2] = bhalf
        n += 1
        if n % 200_000 == 0:
            print(f"scanned {n:,} segment rows, {len(acc):,} props ({time.time()-started:.0f}s)", flush=True)
        if dry_run and n >= 200_000:
            print("dry-run: stopping scan", flush=True)
            break

    acc = {k: v for k, v in acc.items() if v[0] is not None or v[1] is not None}
    print(f"aggregated {len(acc):,} properties ({time.time()-started:.0f}s)", flush=True)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                "CREATE TEMP TABLE fb_orion (apn TEXT PRIMARY KEY, beds INT, bfull INT, bhalf INT)"
            )
            buf = io.StringIO()
            for apn, (beds, bfull, bhalf) in acc.items():
                buf.write("\t".join([
                    apn,
                    r"\N" if beds is None else str(beds),
                    r"\N" if bfull is None else str(bfull),
                    r"\N" if bhalf is None else str(bhalf),
                ]) + "\n")
            buf.seek(0)
            cur.copy_expert("COPY fb_orion FROM STDIN", buf)

            cur.execute(
                """SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
                   FROM fb_orion a
                   JOIN parcels p ON p.county_fips = %s AND p.apn = a.apn""",
                (FIPS,),
            )
            j, jb = cur.fetchone()
            print(f"joinable parcel rows: {j:,} (with beds {jb:,})", flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       bedrooms   = COALESCE(a.beds, p.bedrooms),
                       baths_full = COALESCE(a.bfull, p.baths_full),
                       baths_half = COALESCE(a.bhalf, p.baths_half)
                   FROM fb_orion a
                   WHERE p.county_fips = %s AND p.apn = a.apn""",
                (FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE baths_full IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (FIPS,),
            )
            beds, baths = cur.fetchone()
            print(f"Fort Bend: beds={beds:,} baths={baths:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
