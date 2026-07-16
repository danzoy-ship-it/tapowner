"""Shackelford-family loader: parses a True Automation "Certified Appraisal Roll"
PRINTED REPORT (human-readable, page-broken, NOT the fixed-width machine export)
when a district only posts that format. One property = a repeating multi-line
block:

    <ws>{prop_id} {owner_id} {pct} {TYPE}  Geo: {geo_id} ... Market: {value}
    {owner name / legal}                                    ...
    {addr line2}                          Acres: ... Land NHS: ...
    {addr line3 or blank}                 State Codes: {codes} ... Assessed: {value}
    {addr line4 (Agent:/Situs:)}          Situs: {situs} ... Exemptions: {codes}
    {DBA line, optional}
    <blank>
    <entity subtotal table, variable length>
    <blank / form-feed>

The header line + market value are found by regex; the Exemptions field is
found by scanning forward from the header for the first "Exemptions:" line
(robust to the Agent:/DBA: line-count variance). TYPE 'R' = real property
(joinable to parcels); P/MN/M (personal/mineral) are skipped.

Usage: DATABASE_URL=... python load_pacs_print_report.py <fips> <roll.zip> <member.txt> [--dry-run]
"""
import io
import os
import re
import sys
import zipfile

import psycopg2

HEADER_RE = re.compile(r"^\s+(\d+)\s+(\d+)\s+[\d.]+\s+(R|P|MN|M)\s+Geo:\s*(\S*).*Market:\s*([\d,]*)\s*$")
EXEMPT_RE = re.compile(r"Exemptions:\s*(.*)$")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, zip_path, member = args[0], args[1], args[2]
    z = zipfile.ZipFile(zip_path)
    text = z.read(member).decode("latin-1")
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    staged = {}   # geo_id -> (prop_id, market_value, exemption_codes)
    i = 0
    n = 0
    while i < len(lines):
        m = HEADER_RE.match(lines[i])
        if m:
            pid, _ownerid, ptype, geo, market_s = m.groups()
            if ptype == "R" and geo:
                market = int(market_s.replace(",", "")) if market_s.strip() else None
                codes = []
                for j in range(i, min(i + 10, len(lines))):
                    if j > i and HEADER_RE.match(lines[j]):
                        break
                    em = EXEMPT_RE.search(lines[j])
                    if em:
                        raw = em.group(1).strip().upper()
                        if raw:
                            codes = sorted(set(re.split(r"[,\s/]+", raw)) - {""})
                        break
                staged[geo] = (pid, market, codes)
                n += 1
        i += 1

    withex = sum(1 for _, _, c in staged.values() if c)
    print(f"[{fips}] parsed {n:,} real-property blocks -> {len(staged):,} geo_ids, {withex:,} with exemptions", flush=True)
    _db_phase(fips, staged, dry)


def _connect():
    return psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)


def _db_phase(fips, staged, dry):
    conn = _connect(); cur = conn.cursor(); cur.execute("SET lock_timeout='6s'")
    cur.execute("CREATE TEMP TABLE pr_stage (geo TEXT PRIMARY KEY, pid TEXT, market BIGINT, exemptions TEXT[])")
    buf = io.StringIO()
    for geo, (pid, market, codes) in staged.items():
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([geo.replace("\\", "\\\\"), pid, str(market) if market else r"\N", arr]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY pr_stage (geo, pid, market, exemptions) FROM STDIN", buf)
    cur.execute("ANALYZE pr_stage")

    best_join, best_n = None, 0
    for label, cond in [("apn==geo", "p.apn = s.geo"), ("spid==geo", "p.source_property_id = s.geo"),
                        ("apn==pid", "p.apn = s.pid"), ("spid==pid", "p.source_property_id = s.pid")]:
        cur.execute(f"SELECT count(*) FROM pr_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    tot = cur.fetchone()[0]
    if best_n < 0.30 * max(tot, 1):
        conn.rollback(); conn.close()
        raise SystemExit(f"[{fips}] ABORT: best join {best_n:,} < 30% of {tot:,}")
    print(f"  -> {best_join} ({best_n:,}/{tot:,})", flush=True)
    if dry:
        conn.rollback(); conn.close(); print("dry-run"); return

    cur.execute(f"""UPDATE parcels p SET exemptions = COALESCE(s.exemptions, p.exemptions)
                    FROM pr_stage s WHERE p.county_fips=%s AND {best_join}
                      AND array_length(s.exemptions,1) > 0""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("SELECT count(*) FILTER (WHERE array_length(exemptions,1)>0) FROM parcels WHERE county_fips=%s", (fips,))
    print(f"[{fips}] now: exemptions {cur.fetchone()[0]:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
