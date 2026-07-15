"""QA audit for loaded parcel attributes — catch silent contamination.

Ran after each county-load wave. Flags counties whose bed/bath distributions
are implausible, the signature of a mis-mapped field. The classic trap
(caught on Liberty 2026-07-15): a PACS "Plumbing" attribute that holds a
FIXTURE count (5, 8, 11, 15…) loaded as bath counts → median baths ~8.

Heuristics (a FLAG is a "look here", not proof):
  BATHS-FIXTURE?  median baths >= 4 OR avg baths >= 4  (fixtures, not baths)
  BATH-OUTLIERS?  >2% of baths rows are >8
  BED-OUTLIERS?   >1% of beds rows are >8
  BATHS>>BEDS     avg baths > 1.8× avg beds on a county with real beds

Usage:
    DATABASE_URL=... python qa_attribute_audit.py
"""

import os
import sys

import psycopg2

Q = """
SELECT county_name,
       count(bedrooms) beds, count(baths_full) baths,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY bedrooms)  med_bed,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY baths_full) med_bath,
       round(avg(bedrooms), 2)   avg_bed,
       round(avg(baths_full), 2) avg_bath,
       count(*) FILTER (WHERE bedrooms > 8)   bed_gt8,
       count(*) FILTER (WHERE baths_full > 8) bath_gt8
FROM parcels
WHERE bedrooms IS NOT NULL OR baths_full IS NOT NULL
GROUP BY county_name
HAVING count(bedrooms) > 0 OR count(baths_full) > 0
ORDER BY count(baths_full) DESC
"""


def flags(r):
    beds, baths = r["beds"], r["baths"]
    out = []
    if baths >= 500 and (float(r["med_bath"] or 0) >= 4 or float(r["avg_bath"] or 0) >= 4):
        out.append("BATHS-FIXTURE?")
    if baths and r["bath_gt8"] > 0.02 * baths:
        out.append("BATH-OUTLIERS?")
    if beds and r["bed_gt8"] > 0.01 * beds:
        out.append("BED-OUTLIERS?")
    if beds >= 1000 and float(r["avg_bath"] or 0) > 1.8 * float(r["avg_bed"] or 1):
        out.append("BATHS>>BEDS")
    return out


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                            keepalives_interval=10, keepalives_count=10)
    cur = conn.cursor()
    cur.execute(Q)
    cols = [d[0] for d in cur.description]
    flagged = 0
    print(f"{'county':<15}{'beds':>9}{'baths':>9}{'medBed':>7}{'medBa':>7}{'avgBed':>7}{'avgBa':>7}  flags")
    for row in cur.fetchall():
        r = dict(zip(cols, row))
        fl = flags(r)
        if fl:
            flagged += 1
        print(f"{r['county_name']:<15}{r['beds']:>9,}{r['baths']:>9,}"
              f"{str(r['med_bed']):>7}{str(r['med_bath']):>7}"
              f"{str(r['avg_bed']):>7}{str(r['avg_bath']):>7}  {' '.join(fl)}")
    print(f"\n{flagged} county(ies) flagged for review.")
    if "--strict" in sys.argv and flagged:
        sys.exit(1)


if __name__ == "__main__":
    main()
