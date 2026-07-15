"""Harris (HCAD, 48201) improvements/feature tags from HCAD's public
extra_features.txt — the biggest single coverage win (1.5M parcels that had
beds/baths/sqft but ZERO improvements/feature tags).

Source: https://download.hcad.org/data/CAMA/2025/Real_building_land.zip →
member extra_features.txt (tab-delimited, header row). Columns:
  0 acct   13-digit account == parcels.source_property_id (48201)
  6 l_dscr plain-English feature ("Frame Detached Garage","Gunite Pool",
           "Frame Utility Shed","Pool SPA with Heater","...Boat Dock",
           "...Pole Barn","Carport - Residential"…)
We aggregate distinct l_dscr per acct into parcels.improvements (verbatim; the
crosswalk tags them) and set has_pool/has_garage/has_shed booleans.

Usage: DATABASE_URL=... python load_hcad_extra_features.py <path/Real_building_land.zip> [--dry-run]
"""
import io
import json
import os
import re
import sys
import time
import zipfile

import psycopg2

FIPS = "48201"
MEMBER = "extra_features.txt"
ACCT, LDSCR = 0, 6

POOL_RE = re.compile(r"pool", re.I)
GARAGE_RE = re.compile(r"garage|carport", re.I)
SHED_RE = re.compile(r"\bshed\b|utility bldg|pole barn|\bbarn\b|boathouse", re.I)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    if not args:
        raise SystemExit("usage: load_hcad_extra_features.py <Real_building_land.zip> [--dry-run]")
    zip_path = args[0]

    z = zipfile.ZipFile(zip_path)
    feats = {}   # acct -> set(descriptions)
    n = 0
    t0 = time.time()
    with z.open(MEMBER) as f:
        f.readline()  # header
        for raw in f:
            p = raw.decode("latin-1", "replace").rstrip("\r\n").split("\t")
            if len(p) <= LDSCR:
                continue
            acct = p[ACCT].strip()
            d = p[LDSCR].strip()
            if not acct or not d:
                continue
            feats.setdefault(acct, set()).add(d)
            n += 1
            if n % 500_000 == 0:
                print(f"  parsed {n:,} feature rows ({time.time()-t0:.0f}s)", flush=True)
            if dry and n >= 200_000:
                break
    print(f"parsed {n:,} feature rows -> {len(feats):,} accounts ({time.time()-t0:.0f}s)", flush=True)
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


def _try_join(cur, key_expr):
    cur.execute(f"""SELECT count(*) FROM hcad_stage s
                    JOIN parcels p ON p.county_fips=%s AND p.source_property_id={key_expr}""", (FIPS,))
    return cur.fetchone()[0]


def _db_phase(feats, dry):
    conn = _connect(); cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE hcad_stage (
                       acct TEXT PRIMARY KEY, improvements JSONB,
                       pool BOOL, garage BOOL, shed BOOL)""")
    buf = io.StringIO()
    for acct, descs in feats.items():
        lst = sorted(descs)
        blob = " ".join(lst).lower()
        buf.write("\t".join([
            acct,
            json.dumps(lst).replace("\\", "\\\\"),
            "t" if POOL_RE.search(blob) else "f",
            "t" if GARAGE_RE.search(blob) else "f",
            "t" if SHED_RE.search(blob) else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY hcad_stage (acct, improvements, pool, garage, shed) FROM STDIN", buf)
    cur.execute("ANALYZE hcad_stage")

    # Resolve the join key format (leading-zero handling). Each candidate is a
    # full boolean join CONDITION between parcels and hcad_stage.
    candidates = [
        ("acct-as-is", "p.source_property_id = s.acct"),
        ("acct-stripped", "p.source_property_id = ltrim(s.acct,'0')"),
        ("db-lpad13==acct", "lpad(p.source_property_id,13,'0') = s.acct"),
    ]
    best_join, best_n = None, 0
    for label, cond in candidates:
        cur.execute(f"SELECT count(*) FROM hcad_stage s JOIN parcels p "
                    f"ON p.county_fips=%s AND {cond}", (FIPS,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond

    if best_n == 0:
        conn.rollback(); conn.close()
        raise SystemExit("ABORT: no join variant matched")
    print(f"  -> using join with {best_n:,} matches", flush=True)

    if dry:
        conn.rollback(); conn.close(); print("dry-run: rolled back"); return

    cur.execute(f"""UPDATE parcels p SET
                        improvements = COALESCE(p.improvements, s.improvements),
                        has_pool   = COALESCE(p.has_pool, FALSE) OR s.pool,
                        has_garage = COALESCE(p.has_garage, FALSE) OR s.garage,
                        has_shed   = COALESCE(p.has_shed, FALSE) OR s.shed
                    FROM hcad_stage s
                    WHERE p.county_fips=%s AND {best_join}""", (FIPS,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()

    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE has_pool),
                          count(*) FILTER (WHERE has_garage)
                   FROM parcels WHERE county_fips=%s""", (FIPS,))
    imp, pool, g = cur.fetchone()
    print(f"[{FIPS}] now: improvements {imp:,}, has_pool {pool:,}, has_garage {g:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
