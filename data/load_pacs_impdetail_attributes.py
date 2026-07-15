"""Populate building attributes from a PACS improvement export (detail + attr).

Generic for any Texas CAD publishing the full PACS Legacy 8.0.33/34 certified
roll (fixed-width). Reads TWO members of the roll zip:

  APPRAISAL_IMPROVEMENT_DETAIL.TXT — dwelling sqft, year, pool, and the full
  per-property improvement-type description list (the Reverse-Prospecting gold:
  pool / casita / shed / garage / boat dock / etc., captured VERBATIM into the
  parcels.improvements JSONB column).
    slices: prop_id 0:12, type_cd 40:50, type_desc 50:75, yr_built 85:89, area 93:108

  APPRAISAL_IMPROVEMENT_DETAIL_ATTR.TXT — the improvement-characteristics file
  where PACS actually stores BEDS/BATHS (the DATA_HUNTING_PLAYBOOK "inspect the
  data, not the layout" crack, 2026-07-15): attribute name at 52:77, value at
  77:. "Number of Bedrooms" -> bedroom count; "Plumbing" -> baths as full.half
  (e.g. 2.5 = 2 full + 1 half). Same file family across ALL PACS counties.
    slices: prop_id 0:12, attr_name 52:77, attr_value 77:

Join: parcels.source_property_id == prop_id with leading zeros stripped.

Usage:
    DATABASE_URL=... python load_pacs_impdetail_attributes.py <fips> <roll.zip> [--dry-run]
"""

import io
import json
import os
import re
import sys
import time
import zipfile

import psycopg2

# "SWIMPL" is Potter/Randall (PRAD) for swimming pool.
POOL_RE = re.compile(r"pool|swimpl", re.I)
CASITA_RE = re.compile(r"CASITA|GUEST|QUARTERS|GARAGE APART|GAR APT|STUDIO", re.I)
SHED_RE = re.compile(r"\bSHED\b|WORKSHOP|OUT ?BUILDING|STORAGE BLDG|STG BLDG|\bBARN\b", re.I)
GARAGE_RE = re.compile(r"GARAGE|CARPORT", re.I)
# Dwelling floor areas vary by CAD vocabulary (see git history for the full
# vocabulary provenance per county). Floors are SUMMED per property.
DWELLING_RE = re.compile(
    r"MAIN AREA|MAIN FLOOR|FLOOR RESID|MANUFACTURED HOUSE|LIVING AREA"
    r"|RESIDEN|2ND FLOOR|MOBILE HOME"
    r"|\bBASE\b|SECOND FLOOR|\bMH[ABC]\b|\bMHOME\b",
    re.I,
)
# Grayson's cd MH is "MOBILE HOME APPENDAGES" (porches/decks) — NOT the dwelling.
EXCLUDE_RE = re.compile(r"APPENDAGE", re.I)


def to_int(value, lo, hi):
    try:
        n = int(float(str(value).strip()))
    except (ValueError, TypeError):
        return None
    return n if lo <= n <= hi else None


NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def _first_num(value):
    """First number in a mixed string: '04'->4.0, 'BATH 2.0'->2.0, '1 Bath'->1.0."""
    m = NUM_RE.search(str(value))
    return float(m.group()) if m else None


def parse_beds(value):
    """'04' -> 4, '+3' -> 3, 'NONE'/'0'/'' -> None, clamp 1..20."""
    f = _first_num(value)
    if f is None:
        return None
    n = int(f)
    return n if 1 <= n <= 20 else None


BATHISH_RE = re.compile(r"^\s*\d+(?:\.\d+)?\s*$")


def parse_baths(value):
    """Baths as full.half: '2.5'->(2,1); '3'->(3,0); 'BATH 2.0'->(2,0);
    '1 Bath'->(1,0). Clamp full 1..20.

    The PACS 'Plumbing' attribute is overloaded across districts: some carry
    real baths ('2.00', '2 BATH', '1 Bath'), but others stuff it with junk —
    water/septic codes ('S1-MUNICIP', 'S2-SEPTIC'), garage sizes ('2 CAR'),
    materials ('METAL'), etc. Accept a value ONLY if it is a bare number or
    literally mentions BATH; reject everything else so junk never becomes a
    bath count (learned on Nueces/Guadalupe, 2026-07-15)."""
    s = str(value).strip()
    if "BATH" not in s.upper() and not BATHISH_RE.match(s):
        return None, None
    f = _first_num(s)
    if f is None:
        return None, None
    full = int(f)
    if not (1 <= full <= 20):
        return None, None
    half = 1 if (f - full) >= 0.4 else 0
    return full, half


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if len(args) < 2:
        print("usage: load_pacs_impdetail_attributes.py <fips> <roll.zip> [--dry-run]")
        sys.exit(1)
    fips, zip_path = args[0], args[1]

    zf = zipfile.ZipFile(zip_path)
    detail = next(
        (n for n in zf.namelist()
         if "IMPROVEMENT_DETAIL." in n.upper() and n.upper().endswith(".TXT")),
        None,
    )
    attr = next(
        (n for n in zf.namelist() if "IMPROVEMENT_DETAIL_ATTR" in n.upper()),
        None,
    )
    started = time.time()

    # pid -> {living, yr, pool, casita, shed, garage, types:set, beds, bfull, bhalf}
    acc: dict = {}
    label_counts: dict = {}

    print(f"reading {detail}", flush=True)
    with zf.open(detail) as raw:
        text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
        for i, line in enumerate(text):
            if len(line) < 108:
                continue
            pid = line[0:12].lstrip("0").strip()
            if not pid:
                continue
            cd = line[40:50].strip().upper()
            desc = line[50:75].strip()
            u = desc.upper()
            e = acc.setdefault(pid, {"living": None, "yr": None, "pool": False,
                                     "casita": False, "shed": False, "garage": False,
                                     "types": set(), "beds": None, "bfull": None, "bhalf": None})
            if desc:
                e["types"].add(desc)
                label_counts[desc] = label_counts.get(desc, 0) + 1
            if POOL_RE.search(u) or POOL_RE.search(cd):
                e["pool"] = True
            if CASITA_RE.search(u):
                e["casita"] = True
            if SHED_RE.search(u):
                e["shed"] = True
            if GARAGE_RE.search(u):
                e["garage"] = True
            if (DWELLING_RE.search(u) or cd in ("MA", "MH", "HSE")) and not EXCLUDE_RE.search(u):
                living = to_int(line[93:108], 1, 2_000_000)
                yr = to_int(line[85:89], 1800, 2027)
                if living:
                    e["living"] = (e["living"] or 0) + living
                e["yr"] = e["yr"] or yr
            if dry_run and i >= 120_000:
                print("dry-run: stopping detail parse", flush=True)
                break

    if attr:
        print(f"reading {attr}", flush=True)
        with zf.open(attr) as raw:
            text = io.TextIOWrapper(raw, encoding="latin-1", errors="replace")
            for i, line in enumerate(text):
                if len(line) < 78:
                    continue
                pid = line[0:12].lstrip("0").strip()
                if not pid or pid not in acc:
                    continue
                name = line[52:77].strip()
                value = line[77:].strip()
                nu = name.upper()
                # Beds: "Number of Bedrooms" (True Automation) or "BEDROOMS"
                # (PRAD). Bathrooms: "Plumbing" or "BATHROOMS", both full.half
                # (2.5 = 2 full + 1 half). Vocabulary varies by PACS district.
                if ("BEDROOM" in nu or nu == "BEDS") and "BONUS" not in nu:
                    b = parse_beds(value)
                    if b is not None:
                        acc[pid]["beds"] = b
                elif ("1/2" in nu or "HALF" in nu) and "BATH" in nu:
                    # Separate half-bath count label (e.g. Nueces "Number of
                    # 1/2 Baths"). Must NOT clobber the full-bath count.
                    h = parse_beds(value)
                    if h is not None:
                        acc[pid]["bhalf"] = h
                elif "BATH" in nu or nu == "PLUMBING":
                    full, half = parse_baths(value)
                    if full is not None:
                        acc[pid]["bfull"] = full
                        if half:
                            acc[pid]["bhalf"] = half
                if dry_run and i >= 200_000:
                    print("dry-run: stopping attr parse", flush=True)
                    break
    else:
        print("no IMPROVEMENT_DETAIL_ATTR in zip — beds/baths skipped", flush=True)

    acc = {k: v for k, v in acc.items()
           if v["living"] or v["yr"] or v["pool"] or v["types"] or v["beds"] or v["bfull"]}
    print(f"aggregated {len(acc):,} properties ({time.time() - started:.0f}s)", flush=True)
    if not dry_run:
        _dump_labels(fips, label_counts)

    for attempt in range(3):
        try:
            conn = psycopg2.connect(
                os.environ["DATABASE_URL"],
                keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10,
            )
            cur = conn.cursor()
            cur.execute(
                """CREATE TEMP TABLE pacs_attrs (
                       pid TEXT PRIMARY KEY, living INT, yr INT, pool BOOLEAN,
                       casita BOOLEAN, shed BOOLEAN, garage BOOLEAN, improvements JSONB,
                       beds INT, bfull INT, bhalf INT
                   )"""
            )
            buf = io.StringIO()
            for pid, v in acc.items():
                improv = json.dumps(sorted(v["types"])).replace("\\", "\\\\") if v["types"] else r"\N"
                buf.write("\t".join([
                    pid,
                    r"\N" if v["living"] is None else str(v["living"]),
                    r"\N" if v["yr"] is None else str(v["yr"]),
                    "t" if v["pool"] else "f",
                    "t" if v["casita"] else "f",
                    "t" if v["shed"] else "f",
                    "t" if v["garage"] else "f",
                    improv,
                    r"\N" if v["beds"] is None else str(v["beds"]),
                    r"\N" if v["bfull"] is None else str(v["bfull"]),
                    r"\N" if v["bhalf"] is None else str(v["bhalf"]),
                ]) + "\n")
            buf.seek(0)
            cur.copy_expert("COPY pacs_attrs FROM STDIN", buf)

            if dry_run:
                cur.execute(
                    """SELECT count(*), count(*) FILTER (WHERE a.beds IS NOT NULL)
                       FROM pacs_attrs a
                       JOIN parcels p ON p.county_fips = %s AND p.source_property_id = a.pid""",
                    (fips,),
                )
                j, jb = cur.fetchone()
                print(f"joinable parcel rows: {j:,} (with beds {jb:,})", flush=True)
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                """UPDATE parcels p SET
                       living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                       year_built       = COALESCE(p.year_built, a.yr),
                       has_pool         = COALESCE(p.has_pool, FALSE) OR a.pool,
                       has_casita       = COALESCE(p.has_casita, FALSE) OR a.casita,
                       has_shed         = COALESCE(p.has_shed, FALSE) OR a.shed,
                       has_garage       = COALESCE(p.has_garage, FALSE) OR a.garage,
                       improvements     = COALESCE(a.improvements, p.improvements),
                       bedrooms         = COALESCE(a.beds, p.bedrooms),
                       baths_full       = COALESCE(a.bfull, p.baths_full),
                       baths_half       = COALESCE(a.bhalf, p.baths_half)
                   FROM pacs_attrs a
                   WHERE p.county_fips = %s AND p.source_property_id = a.pid""",
                (fips,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                """SELECT count(*) FILTER (WHERE living_area_sqft IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE bedrooms IS NOT NULL),
                          count(*) FILTER (WHERE baths_full IS NOT NULL),
                          count(*) FILTER (WHERE improvements IS NOT NULL)
                   FROM parcels WHERE county_fips = %s""",
                (fips,),
            )
            sqft, pools, beds, baths, improv = cur.fetchone()
            print(f"county: sqft={sqft:,} pool={pools:,} beds={beds:,} baths={baths:,} improvements={improv:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


def _dump_labels(fips: str, label_counts: dict) -> None:
    if not label_counts:
        return
    path = os.path.join(os.path.dirname(__file__), "improvement_labels_seen.md")
    exists = os.path.exists(path)
    with open(path, "a", encoding="utf-8") as fh:
        if not exists:
            fh.write("# Improvement labels seen (raw, per system/county)\n\n")
            fh.write("Append-only log so the app session can extend the canonical crosswalk.\n\n")
            fh.write("| system | county | raw label | count |\n|---|---|---|---|\n")
        for label, count in sorted(label_counts.items(), key=lambda kv: -kv[1]):
            safe = label.replace("|", "\\|")
            fh.write(f"| PACS | fips {fips} | `{safe}` | {count} |\n")
    print(f"logged {len(label_counts)} distinct improvement labels", flush=True)


if __name__ == "__main__":
    main()
