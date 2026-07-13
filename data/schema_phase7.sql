-- Phase 7: AI email drafting config. No new tables -- reuses users.agent_profile
-- (already jsonb from Phase 5) and events (already exists) for rate-limiting +
-- analytics, per TAPOWNER_BUILD.md §5's "extend as needed, don't rename."

UPDATE products
SET config = config || '{
    "draft_rate_limit_per_day": 30,
    "draft_input_price_per_mtok": 1.00,
    "draft_output_price_per_mtok": 5.00
}'::jsonb
WHERE id = 'tapowner';
