-- TapOwner core parcels schema (Phase 1).
-- Vertical-agnostic per TAPOWNER_BUILD.md platform note: no real-estate-specific
-- naming here. Extend, don't rename, per §5.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS parcels (
    id                          BIGSERIAL PRIMARY KEY,
    apn                         TEXT,               -- GEO_ID: county-facing parcel/account number
    source_property_id          TEXT,               -- Prop_ID: CAD's internal property id (may repeat across sub-units)
    county_fips                 TEXT NOT NULL,
    county_name                 TEXT NOT NULL,
    geom                        geometry(MultiPolygon, 4326) NOT NULL,

    situs_address                TEXT,
    situs_number                TEXT,
    situs_street                TEXT,
    situs_street_1              TEXT,
    situs_street_2              TEXT,
    situs_city                  TEXT,
    situs_state                 TEXT,
    situs_zip                   TEXT,

    owner_name                  TEXT,
    owner_name_care             TEXT,
    mailing_address              TEXT,
    mailing_line1                TEXT,
    mailing_line2                TEXT,
    mailing_city                 TEXT,
    mailing_state                TEXT,
    mailing_zip                  TEXT,

    is_absentee                 BOOLEAN,            -- NULL when situs/mailing insufficient to compare
    is_protected                 BOOLEAN NOT NULL DEFAULT FALSE,

    land_use                    TEXT,               -- raw state land-use code, undecoded in v1
    legal_description            TEXT,
    source_date                 DATE,               -- CAD/StratMap extract date, NOT a sale date

    -- Full CAD record per §5. StratMap's common schema (v1 source) does not carry
    -- living area, beds/baths, stories, pool, garage, or sale price for ANY county —
    -- see PROGRESS.md "StratMap schema gap" note. Populated only once a richer
    -- source (direct CAD export) is ingested; null until then, per county.
    living_area_sqft            NUMERIC,
    year_built                  INTEGER,
    bedrooms                    INTEGER,
    baths_full                  INTEGER,
    baths_half                  INTEGER,
    stories                     NUMERIC,
    lot_size_sqft                NUMERIC,
    has_pool                    BOOLEAN,
    has_garage                  BOOLEAN,
    assessed_land_value          NUMERIC,
    assessed_improvement_value   NUMERIC,
    assessed_total_value         NUMERIC,
    last_sale_date               DATE,
    last_sale_price              NUMERIC,

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parcels_geom_gist ON parcels USING GIST (geom);
CREATE INDEX IF NOT EXISTS parcels_county_fips_idx ON parcels (county_fips);
CREATE INDEX IF NOT EXISTS parcels_apn_idx ON parcels (apn);
CREATE INDEX IF NOT EXISTS parcels_source_property_id_idx ON parcels (source_property_id);

-- Per-county mapping of source column -> parcels column, since CAD/StratMap
-- column names and coverage vary by county. Same normalization pattern the
-- future permit-adapter work will reuse.
CREATE TABLE IF NOT EXISTS cad_field_map (
    id                  BIGSERIAL PRIMARY KEY,
    county_fips         TEXT NOT NULL,
    source_column_name  TEXT NOT NULL,
    target_field        TEXT NOT NULL,
    notes               TEXT,
    UNIQUE (county_fips, source_column_name, target_field)
);
