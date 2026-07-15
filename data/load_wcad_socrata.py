"""Williamson (WCAD, 48491) attributes from WCAD's public Socrata portal.

WCAD publishes a full data lane at data.wcad.org (Socrata JSON API, no key),
keyed by `quickrefid` (R-format) == parcels.source_property_id for 48491. This
fills the county's biggest gap: it had beds/baths/sqft but ZERO improvements
(no feature tags). Two datasets, both quickrefid-keyed (direct DB join):

  Segment - PropertyDataExport (4kxj-e8c3): one row per improvement segment;
    `description` is the plain-English type ('Garage','Pool','Deck','Main Area'…)
    -> aggregated per quickrefid into parcels.improvements (feeds the crosswalk).
  Property Characteristics (cvyp-ab5t): one row per property; `deeddate`
    -> last_sale_date (Texas non-disclosure, no price), `sqftcur`/`actyrbuilt`
    backfill, `garage` boolean flag.

(Sale/Exemptions datasets key on numeric propertyid; PropChar carries both ids
so a later pass can crosswalk them — left as a follow-up.)

Usage: DATABASE_URL=... python load_wcad_socrata.py [--dry-run]
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

import psycopg2

FIPS = "48491"
BASE = "https://data.wcad.org/resource"
SEGMENT = "4kxj-e8c3"
PROPCHAR = "cvyp-ab5t"
PAGE = 50000
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")


def fetch_all(dataset, select, order):
    """Paginate a Socrata dataset, yielding row dicts."""
    offset = 0
    while True:
        params = {"$select": select, "$order": order,
                  "$limit": str(PAGE), "$offset": str(offset)}
        url = f"{BASE}/{dataset}.json?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=120) as resp:
                    rows = json.load(resp)
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(3 * (attempt + 1))
        if not rows:
            break
        for r in rows:
            yield r
        offset += len(rows)
        if len(rows) < PAGE:
            break


def to_int(v, lo, hi):
    try:
        n = int(float(v))
    except (TypeError, ValueError):
        return None
    return n if lo <= n <= hi else None


def parse_dt(v):
    if not v:
        return None
    try:
        return date.fromisoformat(v[:10])
    except ValueError:
        return None


def main():
    dry = "--dry-run" in sys.argv

    # ---- Segment -> improvements[] per quickrefid
    improvements = {}
    n = 0
    t0 = time.time()
    for r in fetch_all(SEGMENT, "quickrefid,description", "quickrefid"):
        q = (r.get("quickrefid") or "").strip()
        d = (r.get("description") or "").strip()
        if not q or not d:
            continue
        improvements.setdefault(q, []).append(d)
        n += 1
        if dry and n >= 20000:
            break
    print(f"segments: {n:,} rows -> {len(improvements):,} properties ({time.time()-t0:.0f}s)", flush=True)

    # ---- Property Characteristics -> sale date / sqft / year / garage
    chars = {}
    m = 0
    t0 = time.time()
    for r in fetch_all(PROPCHAR, "quickrefid,deeddate,garage,sqftcur,actyrbuilt,transfervaliditycode", "quickrefid"):
        q = (r.get("quickrefid") or "").strip()
        if not q:
            continue
        chars[q] = (
            parse_dt(r.get("deeddate")),
            to_int(r.get("sqftcur"), 1, 2_000_000),
            to_int(r.get("actyrbuilt"), 1800, date.today().year + 1),
            str(r.get("garage") or "").strip() in ("1", "1.0", "1.000000", "true", "T"),
        )
        m += 1
        if dry and m >= 20000:
            break
    print(f"characteristics: {m:,} properties ({time.time()-t0:.0f}s)", flush=True)

    keys = set(improvements) | set(chars)
    print(f"total distinct quickrefids: {len(keys):,}", flush=True)
    if not keys:
        print("nothing to load")
        return
    _db_phase(keys, improvements, chars, dry)


def _connect():
    for a in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1,
                                 keepalives_idle=30, keepalives_interval=10,
                                 keepalives_count=10, connect_timeout=20)
            cur = c.cursor()
            cur.execute("SET lock_timeout='2s'")
            c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {a+1}: {e}", flush=True)
            time.sleep(5)
    raise RuntimeError("could not connect")


def _db_phase(keys, improvements, chars, dry):
    conn = _connect()
    cur = conn.cursor()
    cur.execute("""CREATE TEMP TABLE wcad_stage (
                       qid TEXT PRIMARY KEY, improvements JSONB, sale_dt DATE,
                       sqft INT, yr INT, garage BOOLEAN
                   )""")
    buf = io.StringIO()
    for q in keys:
        imps = improvements.get(q)
        dt, sqft, yr, garage = chars.get(q, (None, None, None, False))
        improv = json.dumps(imps).replace("\\", "\\\\") if imps else r"\N"
        buf.write("\t".join([
            q, improv,
            r"\N" if dt is None else dt.isoformat(),
            r"\N" if sqft is None else str(sqft),
            r"\N" if yr is None else str(yr),
            "t" if garage else "f",
        ]) + "\n")
    buf.seek(0)
    cur.copy_expert("COPY wcad_stage (qid, improvements, sale_dt, sqft, yr, garage) FROM STDIN", buf)

    cur.execute("""SELECT count(*), count(*) FILTER (WHERE s.improvements IS NOT NULL),
                          count(*) FILTER (WHERE s.sale_dt IS NOT NULL)
                   FROM wcad_stage s
                   JOIN parcels p ON p.county_fips=%s AND p.source_property_id=s.qid""", (FIPS,))
    j, ji, js = cur.fetchone()
    print(f"joinable parcels: {j:,} (improvements {ji:,}, sale dates {js:,})", flush=True)
    if j < 0.2 * len(keys):
        conn.rollback(); conn.close()
        raise SystemExit(f"ABORT: only {j:,}/{len(keys):,} join — key mismatch")

    if dry:
        conn.rollback(); conn.close()
        print("dry-run: rolled back")
        return

    cur.execute("""UPDATE parcels p SET
                       improvements     = COALESCE(s.improvements, p.improvements),
                       last_sale_date   = COALESCE(p.last_sale_date, s.sale_dt),
                       living_area_sqft = COALESCE(p.living_area_sqft, s.sqft),
                       year_built       = COALESCE(p.year_built, s.yr),
                       has_garage       = COALESCE(p.has_garage, FALSE) OR s.garage
                   FROM wcad_stage s
                   WHERE p.county_fips=%s AND p.source_property_id=s.qid""", (FIPS,))
    print(f"parcels updated: {cur.rowcount:,}", flush=True)
    conn.commit()

    cur.execute("""SELECT count(*) FILTER (WHERE improvements IS NOT NULL),
                          count(*) FILTER (WHERE last_sale_date IS NOT NULL),
                          count(*) FILTER (WHERE has_garage)
                   FROM parcels WHERE county_fips=%s""", (FIPS,))
    imp, sd, g = cur.fetchone()
    print(f"[{FIPS}] now: improvements {imp:,}, sale dates {sd:,}, has_garage {g:,}", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
