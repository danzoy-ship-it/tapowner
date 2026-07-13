-- Phase 9: config-driven feature gates + trial reminder settings.
-- Full rewrite of the tiers object (jsonb || is a shallow merge) to add
-- per-tier feature flags the gates read at request time.
UPDATE products
SET config = config || '{
    "tiers": {
        "prospector": {
            "price_cents": 999,
            "included_traces": 0,
            "features": {"draft_email": false, "crm": false}
        },
        "closer": {
            "price_cents": 1999,
            "included_traces": 10,
            "features": {"draft_email": true, "crm": true}
        }
    },
    "trial_reminder_days_before": 3
}'::jsonb
WHERE id = 'tapowner';
