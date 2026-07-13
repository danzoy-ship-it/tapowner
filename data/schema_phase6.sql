-- Phase 6: skip trace cache + usage tracking, per TAPOWNER_BUILD.md §5.

CREATE TABLE IF NOT EXISTS trace_results (
    id              BIGSERIAL PRIMARY KEY,
    parcel_id        BIGINT NOT NULL REFERENCES parcels(id),
    owner_name_hash  TEXT NOT NULL, -- hash of owner_name at trace time; if the parcel's
                                    -- current owner_name hashes differently, treat as stale
    payload         JSONB NOT NULL, -- {phones[], emails[]}
    vendor          TEXT NOT NULL,
    match_quality    TEXT NOT NULL,
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trace_results_parcel_id_idx ON trace_results (parcel_id);

CREATE TABLE IF NOT EXISTS user_traces (
    id              BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(id),
    parcel_id        BIGINT NOT NULL REFERENCES parcels(id),
    trace_result_id  BIGINT NOT NULL REFERENCES trace_results(id),
    charged_cents    INT NOT NULL,
    charged_via      TEXT NOT NULL CHECK (charged_via IN ('included', 'metered', 'cache')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, parcel_id)
);

UPDATE products SET config = config || '{"trace_cache_ttl_days": 90}'::jsonb WHERE id = 'tapowner';
