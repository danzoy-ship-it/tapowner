"""Roof-age model — the roofer scheme's core signal (quantifier + reference SQL).

Business logic (per Frederick): homeowners insurers drop/limit coverage on a roof
around 15 years old, so a roof older than ~15 years is a live re-roof lead. We
estimate each parcel's CURRENT roof age as:

    last_roof_date = GREATEST(year_built(Jan 1), latest re-roof permit issued_date)
    roof_age       = today - last_roof_date
    EXPIRED (lead) = last_roof_date < today - 15 years

- `year_built` (from the CAD/parcels load) = the ORIGINAL roof date (baseline).
- a `permit_category='roof'` permit = a RE-ROOF that resets the clock (correction layer).
- GREATEST ignores NULLs, so a parcel is "estimable" if it has EITHER a year_built
  OR a roof permit. Depth of permit history bounds how far back we can catch a
  re-roof: where permits are shallow (San Antonio = 2020+ only), a re-roof done
  before the window is invisible and a year_built-only "expired" flag risks a
  false positive (roof actually replaced, we just can't see it). That risk is
  reported as `expired_yb_only`.

This script only QUANTIFIES + prints the reference query. Writing the signal into
`parcel_signals` is the APP session's lane (miner lane owns parcels + permits).

Usage: DATABASE_URL=... python roof_age_model.py [--sample FIPS N]
"""
import os
import sys
import psycopg2

CORRIDOR = ['48453', '48029', '48091', '48187', '48209']  # Travis Bexar Comal Guadalupe Hays
NAMES = {'48453': 'Travis/Austin', '48029': 'Bexar/San Antonio', '48091': 'Comal/New Braunfels',
         '48187': 'Guadalupe/Seguin', '48209': 'Hays/San Marcos'}

# --- Canonical roof-age CTE (hand this to the app session for parcel_signals) ---
MODEL_SQL = """
WITH rp AS (   -- latest re-roof permit per parcel
    SELECT parcel_id, max(issued_date) AS last_reroof
    FROM permits
    WHERE permit_category = 'roof' AND parcel_id IS NOT NULL AND issued_date IS NOT NULL
    GROUP BY parcel_id
),
m AS (
    SELECT p.id, p.county_fips,
           CASE WHEN p.year_built BETWEEN 1850 AND EXTRACT(year FROM CURRENT_DATE)::int
                THEN make_date(p.year_built, 1, 1) END        AS yb_date,
           rp.last_reroof,
           GREATEST(CASE WHEN p.year_built BETWEEN 1850 AND EXTRACT(year FROM CURRENT_DATE)::int
                         THEN make_date(p.year_built, 1, 1) END,
                    rp.last_reroof)                            AS last_roof_date
    FROM parcels p
    LEFT JOIN rp ON rp.parcel_id = p.id
    WHERE p.county_fips = ANY(%(fips)s)
)
SELECT county_fips,
   count(*)                                                                          AS parcels,
   count(last_roof_date)                                                             AS estimable,
   count(last_reroof)                                                                AS has_reroof_permit,
   count(*) FILTER (WHERE last_roof_date <  CURRENT_DATE - INTERVAL '15 years')      AS expired_lead,
   count(*) FILTER (WHERE last_roof_date >= CURRENT_DATE - INTERVAL '15 years')      AS fresh,
   count(*) FILTER (WHERE last_reroof IS NOT NULL
                      AND yb_date < CURRENT_DATE - INTERVAL '15 years'
                      AND last_reroof >= CURRENT_DATE - INTERVAL '15 years')         AS permit_saved,
   count(*) FILTER (WHERE last_roof_date < CURRENT_DATE - INTERVAL '15 years'
                      AND last_reroof IS NULL)                                       AS expired_yb_only
FROM m GROUP BY 1
"""


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)
    cur = conn.cursor()

    if "--sample" in sys.argv:
        i = sys.argv.index("--sample")
        fips, n = sys.argv[i + 1], int(sys.argv[i + 2])
        cur.execute("""
            WITH rp AS (SELECT parcel_id, max(issued_date) last_reroof FROM permits
                        WHERE permit_category='roof' AND parcel_id IS NOT NULL AND issued_date IS NOT NULL
                        GROUP BY parcel_id)
            SELECT p.owner_name, p.situs_address, p.year_built, rp.last_reroof,
                   GREATEST(CASE WHEN p.year_built BETWEEN 1850 AND 2026 THEN make_date(p.year_built,1,1) END, rp.last_reroof) AS last_roof_date
            FROM parcels p LEFT JOIN rp ON rp.parcel_id=p.id
            WHERE p.county_fips=%s
              AND GREATEST(CASE WHEN p.year_built BETWEEN 1850 AND 2026 THEN make_date(p.year_built,1,1) END, rp.last_reroof) < CURRENT_DATE - INTERVAL '15 years'
              AND p.owner_name IS NOT NULL AND p.situs_address IS NOT NULL
            ORDER BY p.assessed_total_value DESC NULLS LAST LIMIT %s""", (fips, n))
        print(f"\n== sample expired-roof leads, {NAMES.get(fips,fips)} (top by value) ==")
        for own, addr, yb, lr, lrd in cur.fetchall():
            src = f"re-roof {lr}" if lr else f"built {yb} (no re-roof on record)"
            print(f"  {str(addr)[:40]:40} | {str(own)[:26]:26} | roof est {lrd} ({src})")
        conn.close(); return

    cur.execute(MODEL_SQL, {"fips": CORRIDOR})
    rows = {r[0]: r for r in cur.fetchall()}
    hdr = ["county", "parcels", "estimable", "reroofPmt", "EXPIRED", "fresh", "pmtSaved", "yb_only"]
    print(f"{hdr[0]:20}{hdr[1]:>10}{hdr[2]:>10}{hdr[3]:>10}{hdr[4]:>9}{hdr[5]:>9}{hdr[6]:>9}{hdr[7]:>9}")
    tot = [0] * 6
    for f in CORRIDOR:
        if f not in rows:
            continue
        _, parcels, est, rr, exp, fresh, saved, ybo = rows[f]
        print(f"{NAMES[f]:20}{parcels:>10,}{est:>10,}{rr:>10,}{exp:>9,}{fresh:>9,}{saved:>9,}{ybo:>9,}")
        for k, v in zip(range(6), (parcels, est, rr, exp, fresh, saved, ybo)[:6]):
            tot[k] += v
    print(f"{'TOTAL':20}{tot[0]:>10,}{tot[1]:>10,}{tot[2]:>10,}{tot[3]:>9,}{tot[4]:>9,}{tot[5]:>9,}")
    print("\nEXPIRED = last roof event >15yr ago (the leads). pmtSaved = year_built says expired")
    print("but a re-roof permit proves it's fresh (false-positives the permit data prevented).")
    print("yb_only = expired on year_built alone, no roof permit -> higher false-pos risk where")
    print("permit history is shallow (esp. San Antonio 2020+ / Comal).")
    conn.close()


if __name__ == "__main__":
    main()
