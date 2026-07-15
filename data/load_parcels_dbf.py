"""Load sale date + SALE PRICE + year from a CAD "Parcels_export.dbf" (the GIS
map-file DBF some CADs post, e.g. Hill's HillCADMapFiles.zip). Texas is a
non-disclosure state so sl_price is usually 0, but where a CAD leaks it (Hill
does) this is the ONLY free source of the neighbor-sold-high price signal.

Fields (tolerant): PROP_ID / prop_id_1 + geo_id for the join; sl_dt -> last_sale_date,
sl_price (>0) -> last_sale_price, yr_blt/year_built -> year_built if present.
Join auto-detected (spid/apn x prop_id/geo_id), >=30% or abort.

Usage: DATABASE_URL=... python load_parcels_dbf.py <fips> <parcels.dbf> [--dry-run]
"""
import io
import os
import sys
import time
from datetime import date, datetime

import psycopg2
from dbfread import DBF


def field(rec, *names):
    for n in names:
        for k in rec:
            if k.lower() == n.lower():
                return rec[k]
    return None


def to_price(v):
    try:
        n = float(v)
    except (ValueError, TypeError):
        return None
    return int(n) if 100 <= n <= 500_000_000 else None


def to_dt(v):
    if isinstance(v, (date, datetime)):
        d = v.date() if isinstance(v, datetime) else v
        return d if 1900 <= d.year <= date.today().year else None
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dry = "--dry-run" in sys.argv
    fips, path = args[0], args[1]
    t = DBF(path, ignore_missing_memofile=True, char_decode_errors="replace")
    staged = {}   # pid -> (geo, sale_dt, price, yr)
    n = 0
    t0 = time.time()
    for r in t:
        n += 1
        pid = field(r, "PROP_ID", "prop_id_1", "prop_id")
        geo = field(r, "geo_id", "geoid")
        pid = str(pid).strip() if pid not in (None, "") else ""
        geo = str(geo).strip() if geo not in (None, "") else ""
        if not pid and not geo:
            continue
        dt = to_dt(field(r, "sl_dt", "sale_date", "deed_date"))
        price = to_price(field(r, "sl_price", "sale_price"))
        yr = field(r, "yr_blt", "year_built", "actual_yr")
        try:
            yr = int(yr) if yr and 1800 <= int(yr) <= date.today().year + 1 else None
        except (ValueError, TypeError):
            yr = None
        key = pid or geo
        if dt or price or yr:
            staged[key] = (pid, geo, dt, price, yr)
    print(f"[{fips}] read {n:,} rows -> {len(staged):,} with sale/price/year ({time.time()-t0:.0f}s)", flush=True)
    npx = sum(1 for v in staged.values() if v[3])
    print(f"[{fips}] {npx:,} carry a SALE PRICE", flush=True)
    _db_phase(fips, staged, dry)


def _db_phase(fips, staged, dry):
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10, connect_timeout=20)
    cur = conn.cursor(); cur.execute("SET lock_timeout='6s'")
    cur.execute("CREATE TEMP TABLE dbf_stage (pid TEXT, geo TEXT, sale_dt DATE, price BIGINT, yr INT)")
    buf = io.StringIO()
    for key, (pid, geo, dt, price, yr) in staged.items():
        buf.write("\t".join([
            pid or r"\N", geo or r"\N",
            dt.isoformat() if dt else r"\N",
            str(price) if price else r"\N",
            str(yr) if yr else r"\N",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY dbf_stage (pid, geo, sale_dt, price, yr) FROM STDIN", buf)
    cur.execute("ANALYZE dbf_stage")

    best_join, best_n = None, 0
    for label, cond in [("spid==pid", "p.source_property_id = s.pid"), ("apn==geo", "p.apn = s.geo"),
                        ("apn==pid", "p.apn = s.pid"), ("spid==geo", "p.source_property_id = s.geo")]:
        cur.execute(f"SELECT count(*) FROM dbf_stage s JOIN parcels p ON p.county_fips=%s AND {cond} AND s.{ 'pid' if 'pid' in cond.split('=')[-1] else 'geo'} <> ''", (fips,))
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

    cur.execute(f"""UPDATE parcels p SET
                        last_sale_date  = COALESCE(p.last_sale_date, s.sale_dt),
                        last_sale_price = COALESCE(p.last_sale_price, s.price),
                        year_built      = COALESCE(p.year_built, s.yr)
                    FROM dbf_stage s WHERE p.county_fips=%s AND {best_join}""", (fips,))
    print(f"  parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()
    cur.execute("""SELECT count(*) FILTER (WHERE last_sale_date IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_price IS NOT NULL)
                   FROM parcels WHERE county_fips=%s""", (fips,))
    sd, sp = cur.fetchone()
    print(f"[{fips}] now: sale {sd:,}, SALE PRICE {sp:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
