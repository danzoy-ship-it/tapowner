# TapOwner

**Read `TAPOWNER_BUILD.md` in full before writing any code. It is the single source of truth for this project** — architecture, business model, build phases, acceptance tests, and working rules. If anything in a session contradicts that file, the file wins unless Frederick explicitly overrides it.

**Then read `HANDOFF.md`** — the operational runbook (deploy/build/DB rituals, the county data-mining campaign queue, the decision log, and the ranked next actions). It exists so a new session loses zero context; keep it current when its facts change.

**Before touching the marketing site, brand, or referral/promo portal, read `BRAND_AND_PRODUCT_BRIEF.md`** — the real logo assets + exact brand colors (navy `#052158` + orange `#F27F09`, NOT the app's bright blue), the full product story (Reverse Prospecting is the flagship), and the canonical commission/referral model.

**Before ANY app / product / UX work (any change to the iOS app), read `TAPOWNER_APP_BIBLE.md` in full** — the deep onboarding brain: every screen + data flow, the API surface and trace/billing/entitlement logic, the data model, the invariants, the ship rituals, and how to work with Frederick. Then **read the actual screen/route before you edit it** — never answer a change request from a shallow first look. That "read before you act" discipline is what keeps handoffs from failing.

Ground truth of what actually works: `CURRENT_STATE.md`. Running log: `PROGRESS.md`.
