"""Fort Bend (FBCAD, 48157) improvements/feature tags from FBCAD's public
Residential Segments export — 375K parcels that had sqft only.

Source: fbcad.org/wp-content/uploads/…Website_ResidentialSegments.zip (CSV,
True Prodigy segment structure). Key cols: PropertyID (numeric ==
parcels.source_property_id) + fSegType (code). Codes are the standard
True-Prodigy/PACS vocabulary (same as Bexar): AG=attached garage, DG=detached
garage, RP=residential pool (fSegClass GRP5/ARP5), SPA=spa, WD=wood deck,
OP=open porch, PA=patio, MA=main area. Stored VERBATIM in parcels.improvements
(crosswalk v3 already tags AG/DG/SPA); booleans set for the confident ones.

CROSSWALK FOLLOW-UP (logged in COUNTY_COVERAGE.md): for improvement_tags parity
the app should map RP->pool and any shed/casita codes; has_pool/has_garage
booleans cover filtering meanwhile.

Usage: DATABASE_URL=... python load_fbcad_segments.py <path/ResidentialSegments.zip> [--dry-run]
"""
import csv
import io
import json
import os
import sys
import time
import zipfile

import psycopg2

FIPS = "48157"
GARAGE_CODES = {"AG", "DG"}
POOL_CODES = {"RP"}          # RP = residential pool (fSegClass GRP5/ARP5/VGRP5)
SPA_CODES = {"SPA"}
# structural sub-areas we DON'T store as "improvements" (noise): main area etc.
SKIP = {"MA", "MA2", "MA1.5", "MAA", "MA1", "OP", "PA", "EP", "NV"}


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        raise SystemExit("usage: load_fbcad_segments.py <ResidentialSegments.zip> [--dry-run]")
    z = zipfile.ZipFile(args[0])
    member = z.namelist()[0]
    feats = {}
    n = 0
    t0 = time.time()
    with z.open(member) as f:
        r = csv.reader(io.TextIOWrapper(f, encoding="latin-1"))
        hdr = next(r)
        # JOIN on PropertyNumber == parcels.apn (dashed geo id). VERIFIED: the
        # numeric PropertyID does NOT match the DB's numeric source_property_id
        # (StratMap uses its own numbering) — PropertyID 93800 in segments is a
        # different parcel than DB spid 93800. apn/PropertyNumber is the truth.
        pi, si = hdr.index("PropertyNumber"), hdr.index("fSegType")
        for row in r:
            if len(row) <= si:
                continue
            pid = row[pi].strip()
            code = row[si].strip()
            if not pid or not code:
                continue
            feats.setdefault(pid, set()).add(code)
            n += 1
            if dry and n >= 200_000:
                break
    print(f"parsed {n:,} segment rows -> {len(feats):,} properties ({time.time()-t0:.0f}s)", flush=True)
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
    cur.execute("""CREATE TEMP TABLE fb_stage (
                       pid TEXT PRIMARY KEY, improvements JSONB,
                       pool BOOL, garage BOOL, spa BOOL)""")
    buf = io.StringIO()
    for pid, codes in feats.items():
        keep = sorted(c for c in codes if c not in SKIP)
        if not keep:
            keep = []
        buf.write("\t".join([
            pid,
            json.dumps(keep).replace("\\", "\\\\") if keep else r"\N",
            "t" if codes & POOL_CODES else "f",
            "t" if codes & GARAGE_CODES else "f",
            "t" if codes & SPA_CODES else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY fb_stage (pid, improvements, pool, garage, spa) FROM STDIN", buf)
    cur.execute("ANALYZE fb_stage")

    best_n = 0
    for label, cond in [("apn==PropertyNumber", "p.apn = s.pid")]:
        cur.execute(f"SELECT count(*) FROM fb_stage s JOIN parcels p ON p.county_fips=%s AND {cond}", (FIPS,))
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
                        has_garage = COALESCE(p.has_garage, FALSE) OR s.garage
                    FROM fb_stage s
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
