"""Re-parse baths from a PACS IMPROVEMENT_DETAIL_ATTR.TXT with district-aware
logic and OVERWRITE baths_full/baths_half for one county. Fixes the two failure
modes the generic loader hit:

  * Coded districts (Montgomery): the Plumbing value mixes bath codes ('2FB'=2
    full, '1HB'=1 half, '2AF'=ignore) with raw PLUMBING FIXTURE counts ('8','10',
    '13') that must NOT be read as baths. FB/HB rows are per-segment, so a prop's
    baths = SUM of its FB + HB rows.
  * Decimal districts (Denton): bare '2.5' = 2 full + 1 half (not 5 half).

Bare integers > 8 are fixture counts -> ignored. Uses SET (not COALESCE) to
replace the contaminated values. Join is auto-detected the same way as the
main loader. Usage:
    DATABASE_URL=... python fix_pacs_baths.py <fips> <roll.zip> [--dry-run]
"""
import io
import os
import re
import sys
import time
import zipfile

import psycopg2

FB_RE = re.compile(r"(\d+)\s*FB", re.I)
HB_RE = re.compile(r"(\d+)\s*HB", re.I)
BARE_RE = re.compile(r"^\d+(?:\.\d+)?$")


def bath_contrib(val):
    """One ATTR Plumbing row -> (full, half) contribution, or None to ignore."""
    v = (val or "").strip().upper()
    if not v:
        return None
    fb, hb = FB_RE.search(v), HB_RE.search(v)
    if fb or hb:
        return (int(fb.group(1)) if fb else 0, int(hb.group(1)) if hb else 0)
    if BARE_RE.match(v):
        fv = float(v)
        if fv > 8:            # plumbing fixture count, not baths
            return None
        return (int(fv), 1 if (fv - int(fv)) >= 0.5 else 0)
    return None               # '2AF' and other non-bath codes


def member(z, suffix):
    hits = [n for n in z.namelist() if n.upper().endswith(suffix)]
    return hits[0] if hits else None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, zip_path = args[0], args[1]
    z = zipfile.ZipFile(zip_path)
    attrf = member(z, "IMPROVEMENT_DETAIL_ATTR.TXT")
    if not attrf:
        raise SystemExit("no ATTR member")
    t0 = time.time()

    # prop_id -> geo_id (parcels may join on either; ATTR is keyed by prop_id)
    pid2geo = {}
    ai = member(z, "APPRAISAL_INFO.TXT")
    if ai:
        with z.open(ai) as f:
            for raw in f:
                line = raw.decode("latin-1", "replace")
                if len(line) < 596 or line[12:16].strip() != "R":
                    continue
                pid = line[0:12].strip().lstrip("0") or "0"
                geo = line[546:596].strip()
                if geo:
                    pid2geo[pid] = geo
        print(f"[{fips}] INFO: {len(pid2geo):,} prop_id->geo_id ({time.time()-t0:.0f}s)", flush=True)

    baths = {}   # prop_id -> [full, half]
    with z.open(attrf) as f:
        for raw in f:
            line = raw.decode("latin-1", "replace")
            if len(line) < 78 or line[52:77].strip().lower() != "plumbing":
                continue
            pid = line[0:12].strip().lstrip("0") or "0"
            c = bath_contrib(line[77:])
            if c is None:
                continue
            # MAX across a property's segments (the primary dwelling's bath
            # count) — NOT sum: summing per-segment Plumbing rows double-counts
            # (main + garage-apt + ... -> absurd avg). FB and HB ride separate
            # rows, so maxing each independently recombines them (2FB + 1HB -> 2 full, 1 half).
            cur = baths.setdefault(pid, [0, 0])
            cur[0] = max(cur[0], c[0])
            cur[1] = max(cur[1], c[1])
    # finalize: cap, drop empties
    staged = {}
    for pid, (full, half) in baths.items():
        full = min(full, 12)
        half = min(half, 6)
        if full >= 1:
            staged[pid] = (full, half)
    print(f"[{fips}] parsed {len(staged):,} props with valid baths ({time.time()-t0:.0f}s)", flush=True)

    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='6s'")
    cur.execute("CREATE TEMP TABLE bfix (pid TEXT PRIMARY KEY, geo TEXT, bf INT, bh INT)")
    buf = io.StringIO()
    for pid, (full, half) in staged.items():
        geo = pid2geo.get(pid, "")
        buf.write(f"{pid}\t{geo if geo else chr(92)+'N'}\t{full}\t{half}\n")
    buf.seek(0)
    cur.copy_expert("COPY bfix (pid, geo, bf, bh) FROM STDIN", buf)
    cur.execute("ANALYZE bfix")

    best_join, best_n = None, 0
    for label, cond in [("apn==geo", "p.apn = s.geo"), ("spid==geo", "p.source_property_id = s.geo"),
                        ("apn==pid", "p.apn = s.pid"), ("spid==pid", "p.source_property_id = s.pid")]:
        cur.execute(f"SELECT count(*) FROM bfix s JOIN parcels p ON p.county_fips=%s AND {cond}", (fips,))
        nj = cur.fetchone()[0]
        print(f"  join {label}: {nj:,}", flush=True)
        if nj > best_n:
            best_n, best_join = nj, cond
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s", (fips,))
    tot = cur.fetchone()[0]
    if best_n < 0.30 * max(tot, 1):
        conn.rollback(); conn.close()
        raise SystemExit(f"[{fips}] ABORT: best join {best_n:,} < 30% of {tot:,} — no safe key, baths unchanged")
    print(f"  -> {best_join} ({best_n:,}/{tot:,})", flush=True)
    if dry:
        conn.rollback(); print("dry-run"); return

    # First clear the county's contaminated baths, then set the corrected ones.
    cur.execute("UPDATE parcels SET baths_full=NULL, baths_half=NULL WHERE county_fips=%s", (fips,))
    cur.execute(f"""UPDATE parcels p SET baths_full=s.bf, baths_half=s.bh
                    FROM bfix s WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels set: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE baths_full IS NOT NULL), max(baths_full), round(avg(baths_full),2)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    n, mx, av = cur.fetchone()
    print(f"[{fips}] now: baths_full {n:,} | max {mx} | avg {av}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
