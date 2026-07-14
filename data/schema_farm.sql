-- Farm-mode export accounting (beta cap now, Stripe metering at launch).
CREATE TABLE IF NOT EXISTS farm_export_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id),
    rows        INT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_export_log_user_month_idx ON farm_export_log (user_id, created_at);

-- Pricing knobs (Frederick 2026-07-14): 10 cents/row at launch; beta = free
-- with a 100-row/month cap.
UPDATE products SET config = config
    || '{"farm_export_price_cents": 10, "farm_export_beta": true, "farm_export_beta_cap_rows": 100}'::jsonb
WHERE id = 'tapowner';
