"""Load the Texas Comptroller EARS statewide appraisal roll -> parcels.year_built
(+ living_area_sqft) for ALL 254 counties in one file. This is the statewide
backdoor found 2026-07-16 (see memory texas-ears-statewide-roll / DATA_ACCESS_CRACKS.md):
every CAD must submit its certified roll to PTAD annually; the roll's AJR record
carries AJR23 "Year Built" — so a single PIA to the Comptroller fills the 106
roof-age-blind counties for $0. Frederick sent the PIA 2026-07-16 (~10 biz days).

FORMAT (from the EARS Record Layout Manual, June-2019 redesign):
  - The file is COMMA-DELIMITED CSV (not fixed-width anymore); fields with a comma
    are wrapped in double quotes; one record per line.
  - Two record types: AJR (appraisal roll) and AUD. We only use AJR.
  - AJR01=Record Type ("AJR"), AJR03=CAD ID (county # 1-254), AJR07=Account,
    AJR22=sqft of main improvement, AJR23=Year Built, AJR31=Category.
  - An account appears in MULTIPLE AJR records (one per category/taxing unit);
    we dedupe to one year_built per (county, account).
  - CAD ID -> county FIPS: fips = 48000 + (2*cad_id - 1)  [verified: Anderson #1
    -> 48001, Comal #46 -> 48091].

★ VERIFY-ON-ARRIVAL (the file is not in hand yet — built from the layout spec):
  The COL column-index map below assumes the CSV lists fields in AJR-number order
  (column i = AJR(i+1)). The June-2019 redesign "consolidated data fields," so the
  delivered file MAY omit/reorder columns. Before any write, run:
      python load_ears_roll.py --inspect <ears.csv>
  It prints the first rows + a validation summary (is col0 "AJR"? does the
  year_built column parse as plausible 4-digit years? do CAD IDs map to real TX
  counties?). If the mapping is off, fix COL (one edit) and re-inspect. The real
  load also self-validates and ABORTS on an implausible mapping rather than
  corrupting parcels.

Usage:
  python load_ears_roll.py --inspect <ears.csv>     # verify column mapping, no DB
  DATABASE_URL=... python load_ears_roll.py <ears.csv> [--dry-run]
  python load_ears_roll.py --selftest               # test the pure helpers
"""
import csv
import io
import os
import sys
import time
from datetime import date

# --- AJR record column map (0-indexed) = AJR field number - 1. VERIFY per header. ---
COL = {
    "record_type": 0,    # AJR01 "AJR"
    "cad_id":      2,    # AJR03 CAD ID (county number 1-254)
    "account":     6,    # AJR07 Account -> join to parcels.source_property_id
    "sqft":       21,    # AJR22 Square footage of main improvement
    "year_built": 22,    # AJR23 Year Built
    "category":   30,    # AJR31 Comptroller category code
}
CUR_YEAR = date.today().year


def cad_to_fips(cad_id):
    """Texas CAD ID (alphabetical county # 1-254) -> 5-digit county FIPS."""
    try:
        n = int(str(cad_id).strip())
    except (ValueError, TypeError):
        return None
    return f"48{2 * n - 1:03d}" if 1 <= n <= 254 else None


def parse_year(v):
    s = "".join(ch for ch in str(v or "") if ch.isdigit())
    if len(s) != 4:
        return None
    y = int(s)
    return y if 1800 <= y <= CUR_YEAR + 1 else None


def parse_sqft(v):
    try:
        n = int(float(str(v).replace(",", "").strip()))
    except (ValueError, TypeError):
        return None
    return n if 1 <= n <= 2_000_000 else None


def strip_key(v):
    return str(v or "").strip().lstrip("0") or "0"


def selftest():
    assert cad_to_fips(1) == "48001", cad_to_fips(1)      # Anderson
    assert cad_to_fips("046") == "48091", cad_to_fips("046")  # Comal
    assert cad_to_fips(254) == "48507", cad_to_fips(254)  # last county
    assert cad_to_fips(0) is None and cad_to_fips(255) is None
    assert parse_year("2016") == 2016 and parse_year("0") is None and parse_year("18") is None
    assert parse_sqft("2,143") == 2143 and parse_sqft("0") is None
    print("selftest OK (cad_to_fips / parse_year / parse_sqft)")


def rows_from(path):
    raw = open(path, "rb").read().decode("utf-8-sig", errors="replace")
    return csv.reader(io.StringIO(raw))


def inspect(path):
    r = rows_from(path)
    n = 0
    ajr = years = bad_fips = 0
    print(f"col map assumed: {COL}\n--- first 8 rows (key columns) ---")
    for row in r:
        n += 1
        rt = row[COL["record_type"]] if len(row) > COL["record_type"] else ""
        if rt.strip().upper() != "AJR":
            continue
        ajr += 1
        cad = row[COL["cad_id"]] if len(row) > COL["cad_id"] else ""
        acct = row[COL["account"]] if len(row) > COL["account"] else ""
        yr = parse_year(row[COL["year_built"]]) if len(row) > COL["year_built"] else None
        sq = parse_sqft(row[COL["sqft"]]) if len(row) > COL["sqft"] else None
        fips = cad_to_fips(cad)
        if yr:
            years += 1
        if not fips:
            bad_fips += 1
        if ajr <= 8:
            print(f"  rt={rt!r} cad={cad!r}->fips={fips} acct={acct!r} yr={yr} sqft={sq} cols={len(row)}")
        if n >= 20000:
            break
    print(f"\nscanned {n} rows: {ajr} AJR records; {years} had a plausible year_built; "
          f"{bad_fips} bad CAD->FIPS.")
    print("VERDICT:", "mapping LOOKS RIGHT" if (ajr and years and bad_fips == 0)
          else "MAPPING SUSPECT — check COL indices against the file's actual columns")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--selftest" in sys.argv:
        selftest(); return
    if "--inspect" in sys.argv:
        inspect(args[0]); return
    dry = "--dry-run" in sys.argv
    path = args[0]

    # Parse -> dedupe one (fips, account) -> (year, sqft).
    acc = {}
    n = ajr = 0
    for row in rows_from(path):
        n += 1
        if len(row) <= COL["year_built"]:
            continue
        if str(row[COL["record_type"]]).strip().upper() != "AJR":
            continue
        ajr += 1
        fips = cad_to_fips(row[COL["cad_id"]])
        if not fips:
            continue
        yr = parse_year(row[COL["year_built"]])
        sq = parse_sqft(row[COL["sqft"]])
        if yr is None and sq is None:
            continue
        key = (fips, strip_key(row[COL["account"]]))
        cur = acc.get(key)
        if cur is None:
            acc[key] = [yr, sq]
        else:  # keep first non-null of each (year_built agrees across an account's rows)
            if cur[0] is None:
                cur[0] = yr
            if cur[1] is None:
                cur[1] = sq
    dated = sum(1 for v in acc.values() if v[0] is not None)
    print(f"parsed {n:,} lines, {ajr:,} AJR records -> {len(acc):,} distinct accounts "
          f"({dated:,} with year_built)", flush=True)

    # SELF-VALIDATION before touching the DB (guards a wrong column mapping).
    if ajr == 0 or dated < 0.05 * max(len(acc), 1):
        sys.exit("ABORT: <5% of accounts have a year_built — column map is likely wrong. "
                 "Run `--inspect` and fix COL before loading.")

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='20s'")
    cur.execute("ALTER TABLE parcels ADD COLUMN IF NOT EXISTS year_built_source text")
    cur.execute("CREATE TEMP TABLE ears (fips text, acct text, yr int, sqft int) ON COMMIT DROP")
    buf = io.StringIO()
    for (fips, acct), (yr, sq) in acc.items():
        buf.write(f"{fips}\t{acct}\t{'' if yr is None else yr}\t{'' if sq is None else sq}\n")
    buf.seek(0)
    cur.copy_expert("COPY ears (fips,acct,yr,sqft) FROM STDIN WITH (NULL '')", buf)
    cur.execute("CREATE INDEX ears_k ON ears (fips, acct)")
    cur.execute("ANALYZE ears")

    # match parcels by county + leading-zero-stripped account.
    cur.execute("SET statement_timeout='1200s'")
    upd = """UPDATE parcels p SET
               year_built        = COALESCE(p.year_built, e.yr),
               year_built_source = CASE WHEN p.year_built IS NULL AND e.yr IS NOT NULL
                                        THEN 'ears' ELSE p.year_built_source END,
               living_area_sqft  = COALESCE(p.living_area_sqft, e.sqft)
             FROM ears e
             WHERE p.county_fips = e.fips
               AND ltrim(p.source_property_id,'0') = e.acct
               AND (p.year_built IS NULL OR p.living_area_sqft IS NULL)"""
    if dry:
        cur.execute("""SELECT count(*) FROM parcels p JOIN ears e
                       ON p.county_fips=e.fips AND ltrim(p.source_property_id,'0')=e.acct""")
        print(f"DRY-RUN: {cur.fetchone()[0]:,} parcels would join EARS accounts", flush=True)
        conn.rollback(); print("rolled back"); conn.close(); return
    t0 = time.time()
    cur.execute(upd)
    print(f"parcels updated: {cur.rowcount:,} ({time.time()-t0:.0f}s)", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE year_built_source='ears'),
                          count(DISTINCT county_fips) FILTER (WHERE year_built_source='ears')
                   FROM parcels""")
    filled, counties = cur.fetchone()
    print(f"EARS-filled year_built: {filled:,} parcels across {counties} counties", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
