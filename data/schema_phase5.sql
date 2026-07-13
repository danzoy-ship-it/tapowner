-- Phase 5: auth + billing core tables, per TAPOWNER_BUILD.md §5.
-- Vertical-agnostic: products.config carries all tunable business values
-- (trial days, included traces, prices) -- never hardcoded in application code.

CREATE TABLE IF NOT EXISTS products (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL,
    config  JSONB NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO products (id, name, config) VALUES (
    'tapowner',
    'TapOwner',
    '{
        "trial_days": 30,
        "closer_included_traces": 10,
        "trace_price_cents": 29,
        "tiers": {
            "prospector": {"price_cents": 999, "included_traces": 0},
            "closer": {"price_cents": 1999, "included_traces": 10}
        }
    }'::jsonb
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id             BIGSERIAL PRIMARY KEY,
    product_id     TEXT NOT NULL REFERENCES products(id),
    email          TEXT NOT NULL,
    agent_profile   JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (product_id, email)
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                          BIGSERIAL PRIMARY KEY,
    user_id                      BIGINT NOT NULL REFERENCES users(id),
    stripe_customer_id           TEXT,
    stripe_subscription_id       TEXT,
    tier                         TEXT NOT NULL DEFAULT 'closer',
    status                       TEXT NOT NULL DEFAULT 'incomplete',
    trial_ends_at                TIMESTAMPTZ,
    included_traces_remaining    INT NOT NULL DEFAULT 0,
    period_end                   TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_uidx ON subscriptions (stripe_subscription_id);

-- Not in the core §5 list -- implementation detail for passwordless email-OTP
-- auth (build doc §3). Short-lived, never joined against for reporting.
CREATE TABLE IF NOT EXISTS otp_codes (
    id           BIGSERIAL PRIMARY KEY,
    email        TEXT NOT NULL,
    code_hash    TEXT NOT NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    consumed_at  TIMESTAMPTZ,
    attempts     INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_codes_email_idx ON otp_codes (email);

CREATE TABLE IF NOT EXISTS events (
    id          BIGSERIAL PRIMARY KEY,
    user_id      BIGINT REFERENCES users(id),
    name        TEXT NOT NULL,
    props       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_user_id_idx ON events (user_id);
CREATE INDEX IF NOT EXISTS events_name_idx ON events (name);
