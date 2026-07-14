"""Populate building attributes from a True Prodigy protaxExport JSON (generic).

Same format as TCAD's special export (see load_travis_attributes.py, which
this generalizes): a pretty-printed JSON array with one key per line, so it
line-scans the zip instead of JSON-parsing gigabytes -- tracks "pID" and
captures imprvMainArea / imprvActualYearBuilt / imprvStories per property.
First generic use: Montgomery CAD (Google Drive "Certified Appraisal Roll
(JSON)" export).

Join: parcels.source_property_id == str(pID). Pass --normalize-float when the
county's StratMap ids carry a float artifact ("120780.00000000" -> join on
regexp-stripped id).

Usage:
    DATABASE_URL=... python load_prodigy_json_attributes.py <fips> path/to/export.zip [--dry-run] [--normalize-float]
"""

import io
import os
import sys
import time
import zipfile

import psycopg2


def num_after_colon(line: str):
    try:
        val = line.split(":", 1)[1].strip().rstrip(",")
        if val in ("null", '""'):
            return None
        return float(val.strip('"'))
    except (IndexError, ValueError):
        return None


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry_run = "--dry-run" in sys.argv
    normalize_float = "--normalize-float" in sys.argv
    if len(args) < 2:
        print("usage: load_prodigy_json_attributes.py <fips> path/to/export.zip [--dry-run] [--normalize-float]")
        sys.exit(1)
    fips, zip_path = args[0], args[1]

    zf = zipfile.ZipFile(zip_path)
    member = next(n for n in zf.namelist() if n.lower().endswith(".json"))
    started = time.time()

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
                break

    print(f"scanned {bytes_seen/1e9:.2f} GB, {len(props):,} properties ({time.time() - started:.0f}s)", flush=True)

    # Some counties' StratMap ids carry a float artifact ("120780.00000000").
    join_expr = (
        "regexp_replace(p.source_property_id, '\\.0+$', '')" if normalize_float else "p.source_property_id"
    )

    # The public proxy drops long-lived/slow connections; the parsed dict is
    # in memory, so the whole DB phase (temp COPY + UPDATE) simply retries on
    # a fresh keepalive'd connection.
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
            cur.execute("CREATE TEMP TABLE pj_attrs (pid TEXT PRIMARY KEY, living INT, yr INT, stories NUMERIC)")
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
            cur.copy_expert("COPY pj_attrs FROM STDIN", buf)

            if dry_run:
                cur.execute(
                    f"""SELECT count(*) FROM pj_attrs a
                        JOIN parcels p ON p.county_fips = %s AND {join_expr} = a.pid""",
                    (fips,),
                )
                print(f"joinable parcel rows: {cur.fetchone()[0]:,}", flush=True)
                conn.rollback()
                print("dry-run complete, rolled back")
                return

            cur.execute(
                f"""UPDATE parcels p SET
                        living_area_sqft = COALESCE(a.living, p.living_area_sqft),
                        year_built       = COALESCE(p.year_built, a.yr),
                        stories          = COALESCE(a.stories, p.stories)
                    FROM pj_attrs a
                    WHERE p.county_fips = %s AND {join_expr} = a.pid""",
                (fips,),
            )
            print("parcel rows updated:", cur.rowcount, flush=True)
            conn.commit()

            cur.execute(
                "SELECT count(*) FROM parcels WHERE county_fips = %s AND living_area_sqft IS NOT NULL",
                (fips,),
            )
            print(f"parcels with sqft now: {cur.fetchone()[0]:,}", flush=True)
            return
        except psycopg2.OperationalError as err:
            print(f"DB phase attempt {attempt + 1} failed ({err}); retrying…", flush=True)
            time.sleep(5)
    raise RuntimeError("DB phase failed after 3 attempts")


if __name__ == "__main__":
    main()
