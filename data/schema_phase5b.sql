-- Phase 5b: referral & commission system, per TAPOWNER_BUILD.md §5.

ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_closer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS partners (
    id              BIGSERIAL PRIMARY KEY,
    type            TEXT NOT NULL CHECK (type IN ('user_referral', 'founding_agent', 'affiliate')),
    user_id          BIGINT REFERENCES users(id),
    name            TEXT NOT NULL,
    code            TEXT NOT NULL UNIQUE,
    comp_model       TEXT NOT NULL DEFAULT 'recurring' CHECK (comp_model IN ('recurring', 'flat')),
    rate            NUMERIC,
    months_cap       INT,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partners_user_id_idx ON partners (user_id);

CREATE TABLE IF NOT EXISTS referrals (
    id              BIGSERIAL PRIMARY KEY,
    partner_id       BIGINT NOT NULL REFERENCES partners(id),
    referred_user_id BIGINT NOT NULL REFERENCES users(id),
    attributed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_paid_at    TIMESTAMPTZ,
    status          TEXT NOT NULL DEFAULT 'attributed' CHECK (status IN ('attributed', 'activated')),
    UNIQUE (referred_user_id)
);
CREATE INDEX IF NOT EXISTS referrals_partner_id_idx ON referrals (partner_id);

CREATE TABLE IF NOT EXISTS commission_ledger (
    id              BIGSERIAL PRIMARY KEY,
    partner_id       BIGINT NOT NULL REFERENCES partners(id),
    referral_id      BIGINT NOT NULL REFERENCES referrals(id),
    invoice_id       TEXT NOT NULL,
    amount_cents     INT NOT NULL, -- negative for clawbacks
    stripe_event_id  TEXT NOT NULL UNIQUE, -- idempotency: Stripe webhooks can redeliver
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_out_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS commission_ledger_partner_id_idx ON commission_ledger (partner_id);
CREATE INDEX IF NOT EXISTS commission_ledger_invoice_id_idx ON commission_ledger (invoice_id);

UPDATE products SET config = config || '{
    "attribution_days": 60,
    "affiliate_rate": 0.25,
    "affiliate_months": 12,
    "affiliate_flat_cents": 2000,
    "payout_threshold_cents": 5000,
    "founding_agent_auto_affiliate_at": 10
}'::jsonb WHERE id = 'tapowner';
