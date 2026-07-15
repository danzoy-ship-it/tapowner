"""One-off repair: set has_garage for Bexar parcels with AG/DG improvement codes.

BCAD's Imprv_Type codes AG (attached garage) / DG (detached garage) weren't in
the Bexar loader's GARAGE_CODES, so ~322K homes (incl. Frederick's — his farm
test caught it: garage filter matched only his neighbor's detached GAR) were
missing the flag. Loader fixed separately; this repairs the live rows.

Production-safe per the bulk-DDL rule: DML only, 100K-id batches, one short
transaction per batch on its own connection, lock_timeout set everywhere.

Usage: DATABASE_URL=... python repair_bexar_garage.py
"""

import os
import time

import psycopg2

BATCH = 100_000


def connect():
    for attempt in range(6):
        try:
            c = psycopg2.connect(os.environ["DATABASE_URL"], keepalives=1, keepalives_idle=30,
                                 keepalives_interval=10, keepalives_count=10, connect_timeout=20)
            cur = c.cursor()
            cur.execute("SET lock_timeout = '2s'")
            c.commit()
            return c
        except psycopg2.OperationalError as e:
            print(f"  connect retry {attempt+1}: {e}", flush=True)
            time.sleep(5)
    raise RuntimeError("could not connect")


def main():
    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT min(id), max(id) FROM parcels WHERE county_fips='48029'")
    lo, hi = cur.fetchone()
    conn.close()
    print(f"repairing Bexar garage flags, id {lo:,}..{hi:,}", flush=True)

    total, start, t0 = 0, lo, time.time()
    while start <= hi:
        end = start + BATCH - 1
        for attempt in range(6):
            conn = connect()
            try:
                cur = conn.cursor()
                cur.execute(
                    """UPDATE parcels SET has_garage = TRUE
                       WHERE county_fips = '48029' AND id BETWEEN %s AND %s
                         AND improvements ?| array['AG','DG']
                         AND has_garage IS DISTINCT FROM TRUE""",
                    (start, end),
                )
                n = cur.rowcount
                conn.commit()
                conn.close()
                total += n
                break
            except psycopg2.Error as e:
                print(f"  batch@{start:,} retry {attempt+1}: {e}", flush=True)
                try:
                    conn.close()
                except Exception:
                    pass
                time.sleep(5)
        start = end + 1
    print(f"garage flags set: {total:,} ({time.time()-t0:.0f}s)", flush=True)

    conn = connect()
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM parcels WHERE county_fips='48029' AND has_garage")
    print(f"Bexar has_garage now: {cur.fetchone()[0]:,}", flush=True)
    cur.execute("""SELECT has_garage FROM parcels
                   WHERE county_fips='48029' AND situs_address ILIKE '%2807%STOKELY%'""")
    print("2807 Stokely Hl has_garage:", cur.fetchone()[0], flush=True)
    conn.close()


if __name__ == "__main__":
    main()
