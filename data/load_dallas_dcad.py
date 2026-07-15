"""Dallas (DCAD, 48113) extra improvements/feature tags from DCAD's public data
product RES_ADDL.CSV — 694K parcels that had beds/baths/sqft but no improvements.

Source: dallascad.org DataProducts -> DCAD{yr}_CURRENT.ZIP -> RES_ADDL.CSV
(residential additional improvements). Columns: ACCOUNT_NUM (17-char ==
parcels.source_property_id) + IMPR_TYP_DESC (plain-English: ATTACHED GARAGE,
DETACHED GARAGE, POOL, STORAGE BUILDING, CARPORT, CABANA, SPA, BARN,
TENNIS COURT, DECK…). Aggregated per account into parcels.improvements +
has_pool/has_garage/has_shed/has_casita booleans.

NOTE (per the 100%-coverage mandate): Dallas still lacks sale_date + exemptions.
DCAD publishes APPLIED_STD_EXEMPT.CSV / ABATEMENT_EXEMPT.CSV (exemptions) and
ACCOUNT_INFO has deed info — logged as a follow-up in COUNTY_COVERAGE.md.

Usage: DATABASE_URL=... python load_dallas_dcad.py <path/DCAD_CURRENT.zip> [--dry-run]
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

FIPS = "48113"
MEMBER = "RES_ADDL.CSV"
POOL_RE = re.compile(r"pool", re.I)
GARAGE_RE = re.compile(r"garage|carport|porte coch", re.I)
SHED_RE = re.compile(r"storage|outbuilding|\bbarn\b|greenhouse|\bshed\b", re.I)
CASITA_RE = re.compile(r"quarters|cabana", re.I)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        raise SystemExit("usage: load_dallas_dcad.py <DCAD_CURRENT.zip> [--dry-run]")
    z = zipfile.ZipFile(args[0])
    feats = {}
    n = 0
    t0 = time.time()
    with z.open(MEMBER) as f:
        r = csv.reader(io.TextIOWrapper(f, encoding="latin-1"))
        hdr = next(r)
        ai, di = hdr.index("ACCOUNT_NUM"), hdr.index("IMPR_TYP_DESC")
        for row in r:
            if len(row) <= di:
                continue
            acct = row[ai].strip()
            d = row[di].strip()
            if not acct or not d or d == "UNASSIGNED":
                continue
            feats.setdefault(acct, set()).add(d)
            n += 1
            if dry and n >= 200_000:
                break
    print(f"parsed {n:,} addl-improvement rows -> {len(feats):,} accounts ({time.time()-t0:.0f}s)", flush=True)
    _db_phase(feats, dry)


def _connect():
    for a in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1,
                                 keepalives_idle=30, keepalives_interval=10,
                                 keepalives_count=10, connect_timeout=20)
            cur = c.cursor(); cur.execute("SET lock_timeout='3s'"); c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {a+1}: {e}", flush=True); time.sleep(5)
    raise RuntimeError("could not connect")


def _db_phase(feats, dry):
    conn = _connect(); cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE dcad_stage (
                       acct TEXT PRIMARY KEY, improvements JSONB,
                       pool BOOL, garage BOOL, shed BOOL, casita BOOL)""")
    buf = io.StringIO()
    for acct, descs in feats.items():
        lst = sorted(descs)
        blob = " ".join(lst).lower()
        buf.write("\t".join([
            acct, json.dumps(lst).replace("\\", "\\\\"),
            "t" if POOL_RE.search(blob) else "f",
            "t" if GARAGE_RE.search(blob) else "f",
            "t" if SHED_RE.search(blob) else "f",
            "t" if CASITA_RE.search(blob) else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY dcad_stage (acct, improvements, pool, garage, shed, casita) FROM STDIN", buf)
    cur.execute("ANALYZE dcad_stage")

    candidates = [
        ("acct-as-is", "p.source_property_id = s.acct"),
        ("acct-stripped", "p.source_property_id = ltrim(s.acct,'0')"),
        ("db-lpad17==acct", "lpad(p.source_property_id,17,'0') = s.acct"),
    ]
    best_join, best_n = None, 0
    for label, cond in candidates:
        cur.execute(f"SELECT count(*) FROM dcad_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (FIPS,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    if best_n == 0:
        conn.rollback(); conn.close(); raise SystemExit("ABORT: no join matched")

    if dry:
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute(f"""UPDATE parcels p SET
                        improvements = COALESCE(p.improvements, s.improvements),
                        has_pool   = COALESCE(p.has_pool, FALSE) OR s.pool,
                        has_garage = COALESCE(p.has_garage, FALSE) OR s.garage,
                        has_shed   = COALESCE(p.has_shed, FALSE) OR s.shed,
                        has_casita = COALESCE(p.has_casita, FALSE) OR s.casita
                    FROM dcad_stage s
                    WHERE p.county_fips=%s AND {best_join}""", (FIPS,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE has_pool), count(*) FILTER (WHERE has_garage)
                   FROM parcels WHERE county_fips=%s""", (FIPS,))
    imp, pool, g = cur.fetchone()
    print(f"[{FIPS}] now: improvements {imp:,}, has_pool {pool:,}, has_garage {g:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
