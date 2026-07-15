"""Harris Govern / P&A "eSearch" certified-roll CSV loader — the free
`/Forms/ExcelDownload?subPath=Data Records&fileName=...csv` export shared by a
family of TX CADs (Eastland, DeWitt, Gonzales, Marion, Hutchinson, Panola,
Houston, Freestone, Jones, Leon…). 108-col comma CSV, owner/value/EXEMPTIONS.

NO building features / beds / baths / sqft in this export (value + owner +
exemption only) — so it captures the EXEMPTION seller-signals (homestead,
over-65, disabled, disabled-veteran) for geom-only counties. Improvements for
these counties stay logged as a separate gap (records-request or fable pass).

Exemption cols (value>0 or 'True' = has it): State_Homestead[90]->HS,
State_Mandated_Over65[91]->OV65, State_Mandated_Disabled[92]/Local_Disabled[94]->DP,
Disabled_Veteran[96]->DV. Join key: Parcel_ID / Account vs source_property_id/apn
(auto-detected, >=30% or abort).

Usage: DATABASE_URL=... python load_harris_esearch_csv.py <fips> <url-or-path> [--dry-run]
"""
import csv
import io
import os
import sys
import time
import urllib.request

import psycopg2

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
EXEMPT_MAP = [("State_Homestead", "HS"), ("State_Mandated_Over65", "OV65"),
              ("State_Mandated_Disabled", "DP"), ("Local_Disabled", "DP"),
              ("Disabled_Veteran", "DV"), ("Road_Homestead", "HS")]


def truthy(v):
    v = (v or "").strip()
    if v in ("", "0", "0.00", "False", "false", "N", "No"):
        return False
    try:
        return float(v) != 0
    except ValueError:
        return v.lower() in ("true", "y", "yes") or bool(v)


def get_reader(src):
    if src.startswith("http"):
        req = urllib.request.Request(src, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=180).read()
    else:
        raw = open(src, "rb").read()
    return csv.reader(io.StringIO(raw.decode("latin-1")))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, src = args[0], args[1]
    r = get_reader(src)
    hdr = next(r)
    idx = {h.strip(): i for i, h in enumerate(hdr)}
    pki = idx.get("Parcel_ID")
    aci = idx.get("Account")
    # This export encodes homestead via Homestead_Code='H' (+ Improvement_Hs/Land_Hs
    # value cols); the State_* exemption cols are unused. Over-65/DV are NOT cleanly
    # present here (logged as a refinement — likely a tax-ceiling column).
    hci = idx.get("Homestead_Code")
    ihi, lhi = idx.get("Improvement_Hs"), idx.get("Land_Hs")
    ex_cols = [(idx[c], code) for c, code in EXEMPT_MAP if c in idx]

    staged = {}   # parcel_id -> (account, [exemption codes])
    n = 0
    t0 = time.time()
    for row in r:
        if pki is None or len(row) <= pki:
            continue
        pid = row[pki].strip()
        acct = row[aci].strip() if aci is not None and aci < len(row) else ""
        codes = {code for ci, code in ex_cols if ci < len(row) and truthy(row[ci])}
        if (hci is not None and hci < len(row) and row[hci].strip()) or \
           (ihi is not None and ihi < len(row) and truthy(row[ihi])) or \
           (lhi is not None and lhi < len(row) and truthy(row[lhi])):
            codes.add("HS")
        codes = sorted(codes)
        if not pid:
            continue
        # merge across the multiple jurisdiction rows per parcel
        prev = staged.get(pid)
        if prev:
            staged[pid] = (prev[0] or acct, sorted(set(prev[1]) | set(codes)))
        else:
            staged[pid] = (acct, codes)
        n += 1
    withex = sum(1 for _, c in staged.values() if c)
    print(f"[{fips}] parsed {n:,} rows -> {len(staged):,} parcels, {withex:,} with exemptions ({time.time()-t0:.0f}s)", flush=True)
    _db_phase(fips, staged, dry)


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


def _db_phase(fips, staged, dry):
    conn = _connect(); cur = conn.cursor()
    cur.execute("CREATE TEMP TABLE es_stage (pid TEXT PRIMARY KEY, acct TEXT, exemptions TEXT[])")
    def esc(s):
        return s.replace("\\", "\\\\").replace("\t", " ")
    buf = io.StringIO()
    for pid, (acct, codes) in staged.items():
        arr = "{" + ",".join(codes) + "}" if codes else r"\N"
        buf.write("\t".join([esc(pid), esc(acct) if acct else r"\N", arr]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY es_stage (pid, acct, exemptions) FROM STDIN", buf)
    cur.execute("ANALYZE es_stage")

    cands = [("spid==Parcel_ID", "p.source_property_id = s.pid"),
             ("apn==Parcel_ID", "p.apn = s.pid"),
             ("spid==Account", "p.source_property_id = s.acct"),
             ("apn==Account", "p.apn = s.acct")]
    best_join, best_n = None, 0
    for label, cond in cands:
        cur.execute(f"SELECT count(*) FROM es_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
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
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute(f"""UPDATE parcels p SET exemptions = COALESCE(p.exemptions, s.exemptions)
                    FROM es_stage s
                    WHERE p.county_fips=%s AND {best_join} AND array_length(s.exemptions,1) > 0""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("SELECT count(*) FILTER (WHERE array_length(exemptions,1)>0) FROM parcels WHERE county_fips=%s", (fips,))
    print(f"[{fips}] now: exemptions {cur.fetchone()[0]:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
