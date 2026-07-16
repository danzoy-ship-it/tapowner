"""Create the `permits` table (idempotent — safe to re-run). The Miner lane owns
this table alongside `parcels`; the app session owns `parcel_signals` (no overlap).

Design goals:
- One row per (jurisdiction, permit_number) — UNIQUE for idempotent upsert.
- permit_type_raw (verbatim source) + permit_category (normalized, see
  permit_categorize.py) so downstream signals filter on a stable category.
- geom Point(4326) from lat/lon for the spatial parcel-join; parcel_id caches
  the match to parcels(id).
- Captures ALL permit types (roof/solar are roofer-priority but everything is
  kept — remodel/addition/pool/hvac/new serve the other verticals).

Usage: DATABASE_URL=... python permits_setup.py
"""
import os
import psycopg2

DDL = """
CREATE TABLE IF NOT EXISTS permits (
    id              BIGSERIAL PRIMARY KEY,
    jurisdiction    TEXT NOT NULL,          -- 'austin','san_antonio','dallas',...
    source_system   TEXT,                   -- 'socrata','arcgis','accela','energov',...
    permit_number   TEXT NOT NULL,
    permit_type_raw TEXT,                   -- verbatim type/desc/class from source
    permit_category TEXT,                   -- normalized: roof,solar,pool,addition,remodel,new_build,hvac,electrical,plumbing,demolition,irrigation,other
    issued_date     DATE,
    description     TEXT,
    valuation       NUMERIC,
    address         TEXT,
    city            TEXT,
    zip             TEXT,
    county_fips     TEXT,
    lat             DOUBLE PRECISION,
    lon             DOUBLE PRECISION,
    geom            geometry(Point, 4326),
    source_parcel_key TEXT,                 -- jurisdiction's own parcel id if present (e.g. Austin tcad_id)
    parcel_id       BIGINT,                 -- matched parcels(id), NULL until joined
    loaded_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (jurisdiction, permit_number)
);
CREATE INDEX IF NOT EXISTS permits_geom_gix       ON permits USING GIST (geom);
CREATE INDEX IF NOT EXISTS permits_category_idx   ON permits (permit_category);
CREATE INDEX IF NOT EXISTS permits_parcel_idx     ON permits (parcel_id);
CREATE INDEX IF NOT EXISTS permits_jurisdiction_idx ON permits (jurisdiction);
CREATE INDEX IF NOT EXISTS permits_issued_idx     ON permits (issued_date);
"""


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)
    cur = conn.cursor()
    cur.execute("SET lock_timeout='5s'")
    cur.execute(DDL)
    conn.commit()
    cur.execute("SELECT count(*) FROM permits")
    print(f"permits table ready — {cur.fetchone()[0]:,} rows currently", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
