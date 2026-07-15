"""Populate Travis beds/baths/pool + improvements from TCAD's improvement_detail.

THE FILE FRED WAS RIGHT ABOUT: it never disappeared — it's the free public
`improvement_detail_2026.zip` on traviscad.org/publicinformation (path
/wp-content/largefiles/, not linked from the homepage). The prior TCAD loader
read the 30GB protaxExport JSON for sqft/year and SKIPPED the room rows; the
API strips bedrooms; but this focused CSV set has them as CODED ROWS (playbook
recipe #2): imprvDetailTypeDesc BEDROOMS(252) / BATHROOM(251) / HALF
BATHROOM(250), with the count in the `area` column. Values are per-segment and
SUM per property (main house + casita → total beds), like Bexar.

Columns (CSV, header row): pID(1), imprvDescription(6), imprvDetailType(7),
imprvDetailTypeDesc(8), area(13). Join: parcels.source_property_id == str(pID),
county_fips 48453.

Usage:
    DATABASE_URL=... python load_travis_improvement_detail.py <improvement_detail_2026.zip> [--dry-run]
"""

import csv
import io
import json
import os
import re
import sys
import time
import zipfile

import psycopg2

TRAVIS_FIPS = "48453"
POOL_RE = re.compile(r"\bPOOL\b", re.I)
CASITA_RE = re.compile(r"CASITA|GUEST|QUARTERS|DETACHED LIV|GARAGE APART|STUDIO|SECOND DWELL", re.I)
SHED_RE = re.compile(r"\bSHED\b|WORKSHOP|OUT ?BUILDING|STORAGE|\bBARN\b", re.I)
GARAGE_RE = re.compile(r"GARAGE|CARPORT", re.I)
# Room codes handled separately (kept out of the improvements list).
ROOM_DESCS = {"BEDROOMS", "BATHROOM", "HALF BATHROOM"}


def to_num(value):
    try:
        return float(str(value).strip())
    except (ValueError, TypeError):
        return None


def clamp_int(total, lo, hi):
    if total is None:
        return None
    n = int(round(total))
    return n if lo <= n <= hi else (hi if n > hi else None)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_travis_improvement_detail.py <improvement_detail_2026.zip> [--dry-run]")
        sys.exit(1)

    zf = zipfile.ZipFile(args[0])
    members = [n for n in zf.namelist() if n.lower().endswith(".csv")]
    started = time.time()

    # pid -> {bed, fbath, hbath, pool, casita, shed, garage, types:set}
    acc: dict = {}
    for m in members:
        with zf.open(m) as raw:
            text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
            r = csv.reader(text)
            hdr = next(r)
            pi, di, ai, imi = 1, 8, 13, 6
            # be robust to column drift
            for i, h in enumerate(hdr):
                hl = h.strip().lower()
                if hl == "pid":
                    pi = i
                elif hl == "imprvdetailtypedesc":
                    di = i
                elif hl == "area":
                    ai = i
                elif hl == "imprvdescription":
                    imi = i
            maxi = max(pi, di, ai, imi)
            for row in r:
                if len(row) <= maxi:
                    continue
                pid = row[pi].strip().lstrip("0") or "0"
                desc = row[di].strip()
                du = desc.upper()
                e = acc.setdefault(pid, {"bed": None, "fbath": None, "hbath": None,
                                         "pool": False, "casita": False, "shed": False,
                                         "garage": False, "types": set()})
                if du == "BEDROOMS":
                    v = to_num(row[ai])
                    if v:
                        e["bed"] = (e["bed"] or 0) + v
                elif du == "BATHROOM":
                    v = to_num(row[ai])
                    if v:
                        e["fbath"] = (e["fbath"] or 0) + v
                elif du == "HALF BATHROOM":
                    v = to_num(row[ai])
                    if v:
                        e["hbath"] = (e["hbath"] or 0) + v
                else:
                    # non-room detail type — capture for the improvement set
                    label = desc or row[imi].strip()
                    if label and du not in ROOM_DESCS:
                        e["types"].add(label)
                    if POOL_RE.search(du):
                        e["pool"] = True
                    if CASITA_RE.search(du):
                        e["casita"] = True
                    if SHED_RE.search(du):
                        e["shed"] = True
                    if GARAGE_RE.search(du):
                        e["garage"] = True
        print(f"parsed {m}: {len(acc):,} pids so far ({time.time() - started:.0f}s)", flush=True)

    print(f"aggregated {len(acc):,} properties ({time.time() - started:.0f}s)", flush=True)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1,
                                    keepalives_idle=30, keepalives_interval=10, keepalives_count=10)
            cur = conn.cursor()
            cur.execute(
                """CREATE TEMP TABLE tcad_rooms (
                       pid TEXT PRIMARY KEY, beds INT, bfull INT, bhalf INT,
                       pool BOOLEAN, casita BOOLEAN, shed BOOLEAN, garage BOOLEAN,
                       improvements JSONB
                   )"""
            )
            buf = io.StringIO()
            for pid, e in acc.items():
                beds = clamp_int(e["bed"], 1, 20)
                bfull = clamp_int(e["fbath"], 1, 20)
                bhalf = clamp_int(e["hbath"], 0, 20)
                improv = json.dumps(sorted(e["types"])).replace("\\", "\\\\") if e["types"] else r"\N"
                if not (beds or bfull or bhalf or e["pool"] or e["types"]):
                    continue
                buf.write("\t".join([
                    pid,
                    r"\N" if beds is None else str(beds),
                    r"\N" if bfull is None else str(bfull),
                    r"\N" if bhalf is None else str(bhalf),
                    "t" if e["pool"] else "f",
                    "t" if e["casita"] else "f",
                    "t" if e["shed"] else "f",
                    "t" if e["garage"] else "f",
                    improv,
                ]) + "\n")
            buf.seek(0)
            cur.copy_expert("COPY tcad_rooms FROM STDIN", buf)

            cur.execute(
                """SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
                   FROM tcad_rooms a
                   JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                (TRAVIS_FIPS,),
            )
            j, jb = cur.fetchone()
            print(f"joinable parcel rows: {j:,} (with beds {jb:,})", flush=True)

            if dry_run:
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       bedrooms     = COALESCE(a.beds, p.bedrooms),
                       baths_full   = COALESCE(a.bfull, p.baths_full),
                       baths_half   = COALESCE(a.bhalf, p.baths_half),
                       has_pool     = COALESCE(p.has_pool, FALSE) OR a.pool,
                       has_casita   = COALESCE(p.has_casita, FALSE) OR a.casita,
                       has_shed     = COALESCE(p.has_shed, FALSE) OR a.shed,
                       has_garage   = COALESCE(p.has_garage, FALSE) OR a.garage,
                       improvements = COALESCE(a.improvements, p.improvements)
                   FROM tcad_rooms a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (TRAVIS_FIPS,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE baths_full IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE has_casita)
                   FROM parcels WHERE county_fips = %s""",
                (TRAVIS_FIPS,),
            )
            beds, baths, pool, casita = cur.fetchone()
            print(f"Travis: beds={beds:,} baths={baths:,} pool={pool:,} casita={casita:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
