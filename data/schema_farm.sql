-- Farm-mode export accounting (beta cap now, Stripe metering at launch).
CREATE TABLE IF NOT EXISTS farm_export_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    rows        INT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_export_log_user_month_idx ON farm_export_log (user_id, created_at);

-- Pricing knobs (Frederick 2026-07-14): 10 cents/row at launch; evaluator
-- ("beta") mode = free with a 300-row/month cap (raised from 100 same day).
UPDATE products SET config = config
    || '{"farm_export_price_cents": 10, "farm_export_beta": true, "farm_export_beta_cap_rows": 300}'::jsonb
WHERE id = 'tapowner';
