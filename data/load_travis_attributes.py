"""Populate Travis building attributes on parcels from TCAD's public export.

Source: traviscad.org "Special export" zip (protaxExport JSON, ~30GB
uncompressed). The JSON is a pretty-printed array with ONE KEY PER LINE, so
this streams the zip and line-scans instead of JSON-parsing 30GB: tracks the
current "pID" and captures imprvMainArea / imprvActualYearBuilt /
imprvStories from each property's profile. Join:
parcels.source_property_id == str(pID) (county_fips 48453).

Pool is NOT loaded: TCAD improvement-detail types are opaque numeric codes
with no published legend in the export -- revisit if a code table turns up.

Usage:
    DATABASE_URL=... python load_travis_attributes.py path/to/Travis_special.zip [--dry-run]
"""

import io
import os
import sys
import time
import zipfile

import psycopg2

TRAVIS_FIPS = "48453"


def num_after_colon(line: str):
    try:
        val = line.split(":", 1)[1].strip().rstrip(",")
        if val in ("null", '""'):
            return None
        return float(val.strip('"'))
    except (IndexError, ValueError):
        return None


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    dry_run = "--dry-run" in sys.argv
    if not args:
        print("usage: load_travis_attributes.py path/to/Travis_special.zip [--dry-run]")
        sys.exit(1)

    zf = zipfile.ZipFile(args[0])
    member = next(n for n in zf.namelist() if n.lower().endswith(".json"))
    started = time.time()

    # pid -> [main_area, yr, stories]
    props: dict = {}
    cur_pid = None
    bytes_seen = 0
    limit_bytes = 50_000_000 if dry_run else None

    with zf.open(member) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8", errors="replace")
        for line in text:
            bytes_seen += len(line)
            if '"pID":' in line:
                v = num_after_colon(line)
                if v is not None:
                    cur_pid = int(v)
                continue
            if cur_pid is None or '"imprv' not in line:
                if limit_bytes and bytes_seen > limit_bytes:
                    print("dry-run: stopping scan", flush=True)
                    break
                continue
            if '"imprvMainArea":' in line:
                v = num_after_colon(line)
                if v and 1 <= v <= 2_000_000:
                    entry = props.setdefault(cur_pid, [None, None, None])
                    if (entry[0] or 0) < v:
                        entry[0] = int(v)
            elif '"imprvActualYearBuilt":' in line:
                v = num_after_colon(line)
                if v and 1800 <= v <= 2027:
                    entry = props.setdefault(cur_pid, [None, None, None])
                    entry[1] = entry[1] or int(v)
            elif '"imprvStories":' in line:
                v = num_after_colon(line)
                if v and 0.5 <= v <= 60:
                    entry = props.setdefault(cur_pid, [None, None, None])
                    entry[2] = entry[2] or v
            if bytes_seen % 2_000_000_000 < 200:
                print(f"scanned {bytes_seen/1e9:.1f} GB ({time.time() - started:.0f}s)", flush=True)
            if limit_bytes and bytes_seen > limit_bytes:
                print("dry-run: stopping scan", flush=True)
                break

    print(f"scanned {bytes_seen/1e9:.2f} GB, {len(props):,} properties with attributes "
          f"({time.time() - started:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        """CREATE TEMP TABLE travis_attrs (
               pid TEXT PRIMARY KEY, living INT, yr INT, stories NUMERIC
           )"""
    )
    buf = io.StringIO()
    for pid, (living, yr, stories) in props.items():
        buf.write(
            "\t".join(
                [
                    str(pid),
                    r"\N" if living is None else str(living),
                    r"\N" if yr is None else str(yr),
                    r"\N" if stories is None else str(stories),
                ]
            )
            + "\n"
        )
    buf.seek(0)
    cur.copy_expert("COPY travis_attrs FROM STDIN", buf)

    cur.execute(
        """SELECT count(*) FROM travis_attrs t
           JOIN parcels p ON p.county_fips = %s AND p.source_property_id = t.pid""",
        (TRAVIS_FIPS,),
    )
    print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)

    if dry_run:
        conn.rollback()
        print("dry-run complete, rolled back")
        return

    cur.execute(
        """UPDATE parcels p SET
               living_area_sqft = COALESCE(t.living, p.living_area_sqft),
               year_built       = COALESCE(p.year_built, t.yr),
               stories          = COALESCE(t.stories, p.stories)
           FROM travis_attrs t
           WHERE p.county_fips = %s AND p.source_property_id = t.pid""",
        (TRAVIS_FIPS,),
    )
    print("parcel rows updated:", cur.rowcount, flush=True)
    conn.commit()

    cur.execute(
        "SELECT count(*) FROM parcels WHERE county_fips = %s AND living_area_sqft IS NOT NULL",
        (TRAVIS_FIPS,),
    )
    print(f"Travis parcels with sqft: {cur.fetchone()[0]:,}", flush=True)


if __name__ == "__main__":
    main()
