# TAPOWNER — FOUNDING BUILD DOCUMENT
### Handoff, architecture, build order, and implementation strategy for Claude Code
**This file is the single source of truth. Read it fully before writing any code. Place it (or a CLAUDE.md pointing to it) in the project root: `C:\Users\danzo\TapOwner\`. This project is fully independent — no files, code, or docs shared with any other project on this machine.**

> **PLATFORM NOTE (governs architecture decisions throughout):** TapOwner is vertical #1 on a shared owner-contact platform. Vertical #2 (a storm-lead app for roofers: NOAA hail swaths → affected parcels → filtered address reports → traces) will be built on this same `api/` and database after TapOwner ships. Therefore: keep `api/` vertical-agnostic — parcels, trace provider + cache, billing, drafting, referrals, and config must not assume "real estate agent" anywhere in their design (naming, schemas, endpoints). Vertical-specific behavior (templates, tier definitions, UI copy) belongs in config and the client apps, not the core. Two concrete requirements this creates now: (1) the trace cache is **shared across verticals by design** — a contact purchased by any product's user is a $0-cost cache hit for every product; (2) design `products`/tier config so a second app with different pricing can attach without schema changes. Do NOT build any roofing features in v1 — this note only shapes how the core is structured.

---

## 1. WHAT TAPOWNER IS

An iPhone app for Texas real estate agents. The agent sees a map centered on their GPS location, taps any property, and instantly sees the **owner of record** (free, from public county data). For **$0.29** they unlock the owner's **phone + email** (licensed skip-trace data). The app then drafts a personalized outreach email with AI (sent from the agent's own mail app) and saves the owner to their phone contacts with property notes — a mini-CRM for prospecting.

**Positioning:** the $9.99 alternative to DealMachine ($99–232/mo), for listing agents and new agents who do 20–80 lookups/month, not 500. Texas-only at launch.

**Non-negotiables:**
1. Never display or sell data we haven't verified from a real source. A wrong owner is worse than no owner.
2. Every tunable business value (prices, trial days, included traces, gates) is **server config, never hardcoded**.
3. Each build phase leaves the product fully working. No half-broken states. Commit per phase.
4. No people-search scraping, no unlicensed data. Parcel data = public county records (TxGIO StratMap). Contact data = licensed, DNC-scrubbed vendor API only.

---

## 2. LOCKED BUSINESS MODEL (implement exactly; values live in config)

| | **Prospector — $9.99/mo** | **Closer — $19.99/mo** |
|---|---|---|
| Map, GPS, unlimited parcel lookups (owner of record) | ✓ | ✓ |
| Skip traces (phone+email) | $0.29 each, pay-per-need | **10 included/mo**, then $0.29 each |
| vCard export (manual save) | ✓ | ✓ |
| AI email outreach drafting | ✗ | ✓ |
| Mini-CRM (auto save-to-contacts, notes, statuses) | ✗ | ✓ |

- **Trial:** every new signup gets Closer free for 30 days (`trial_days=30`), card required at signup. Trial includes the 10 traces. Clear label at signup: "Full Closer access free for 30 days, then $19.99/mo — or drop to Prospector at $9.99."
- **Cache rule (margin engine):** a purchased trace is stored. Same user re-views their purchase forever, free. A **different** user requesting the same owner within the cache TTL (90 days) is still charged $0.29 but costs us $0 — pure margin.
- **Unit economics for reference:** trace cost ≈ $0.15/match (pay-per-match), charge $0.29 → ~$0.14 margin/trace. Blended target ≈ $18/subscriber/mo net.

---

## 3. ARCHITECTURE (all decisions final — do not re-litigate)

```
tapowner/
├── mobile/     Expo (React Native, TypeScript) — the iPhone app
├── api/        Node 22 + TypeScript + Fastify — all business logic
├── web/        Next.js — marketing site + signup + Stripe billing portal
├── data/       StratMap ingestion scripts (TypeScript or Python)
└── TAPOWNER_BUILD.md (this file)
```

- **Database:** PostgreSQL 16 + PostGIS on **Railway** (one platform for API + DB; ~$20–40/mo).
- **Map:** `@maplibre/maplibre-react-native` with **OpenFreeMap** basemap tiles (free, no API key). Parcel boundaries served as **vector tiles from our own API** via PostGIS `ST_AsMVT`, LRU-cached in memory.
- **Auth:** email + 6-digit OTP code (passwordless). No social logins → avoids Apple's Sign-in-with-Apple mandate. JWT sessions.
- **Billing:** Stripe. Subscriptions + metered trace usage (see §7 — critical: never charge $0.29 as a standalone card transaction; Stripe's $0.30 fixed fee would exceed it).
- **Skip trace:** vendor behind a `TraceProvider` interface (see §8). Primary candidate BatchData (has address/APN skip-trace endpoint); bakeoff decides.
- **AI drafting:** Anthropic API, `claude-haiku-4-5` (Frederick's funded account). Server-side endpoint only; key never ships in the app.
- **App distribution:** Expo EAS cloud builds (no local Xcode needed; MacBook available as backup) → TestFlight → App Store. Bundle ID `com.tapowner.app`. iOS first; Android later from the same codebase.
- **Payments vs Apple (decided):** v1 app contains **no purchase UI and no purchase links**. Accounts and billing are created on tapowner.com (Netflix pattern). The app is login-only; "Get Contact" consumes plan usage. **Fallback if App Review objects (documented, don't build unless needed):** consumable IAP trace packs (10-pack $3.99 ≈ $0.34 net after Apple 15% → margin preserved), subscriptions stay on web. Build the trace-charging code behind an interface so the fallback is a swap, not a rewrite.

---

## 4. BUILD ORDER — 10 PHASES, EACH WITH AN ACCEPTANCE TEST

**Rules: one phase at a time. Do not start phase N+1 until the phase-N acceptance test passes. `git commit` at every green test. Update `PROGRESS.md` after each phase (one line: date, phase, status, notes).**

### Phase 0 — Accounts & scaffolding (Frederick actions §11 run in parallel)
Claude Code: init monorepo, git, TypeScript configs, Fastify hello-world, Expo blank app boots in Expo Go on Frederick's iPhone, Railway project with PostGIS enabled, `.env` scheme.
**Accept:** `GET /health` returns 200 from deployed API; blank app renders on the physical iPhone via Expo Go QR.

### Phase 1 — StratMap → PostGIS data pipeline
Download TxGIO StratMap Land Parcels (statewide, from TxGIO DataHub; GeoDatabase/shapefile). Load ALL available counties. Normalize into `parcels` table (schema §5). Handle: missing owner names (Texas Tax Code §25.025 protected records → `is_protected=true`), situs vs mailing address comparison → `is_absentee` flag, county FIPS, APN preservation (needed for skip-trace API calls).
**Capture the FULL CAD property record, not just owner/address** — StratMap's underlying county appraisal district source typically publishes these fields; pull all that are present per county rather than a minimal schema (adding them now is ~free; retrofitting after Phase 1 ships is not): living area (sqft), year built, bedrooms/full+half baths (where published — coverage varies by county), stories, lot size (acres or sqft), pool indicator, garage/carport indicator, assessed land value + improvement value + total assessed value, last sale date, last sale price (where the county publishes it — many Texas CADs withhold or lag sale price), property class/land use description. Store per-county source-field mapping in a small lookup (schema §5, `cad_field_map`) since column names vary by CAD — same normalization problem as the permit adapters, solved the same way. Null, don't guess, any field a given county doesn't publish.
**Accept:** `SELECT count(*) FROM parcels` in the millions; point query at a known San Antonio address returns correct owner in <100ms (GIST index verified with EXPLAIN); Bexar, Harris, Dallas, Travis, Tarrant all present; a known protected-record case renders as protected; a spot-checked known property (Frederick provides one) shows correct sqft/year-built/pool/lot-size/last-sale-price where the county publishes them, and cleanly null where it doesn't.

### Phase 2 — Parcel API
Endpoints: `GET /parcels/at?lat=&lng=` (point-in-polygon → parcel record), `GET /tiles/{z}/{x}/{y}.mvt` (parcel boundaries via ST_AsMVT, min zoom 15, LRU cache). Rate limiting (per-IP pre-auth, per-user post-auth).
**Accept:** curl at-point for 5 known addresses returns correct owners; tile endpoint returns valid MVT; repeated tile hits served from cache (log proof).

### Phase 3 — App shell: map + GPS
MapLibre map, OpenFreeMap basemap, GPS blue-dot centering (`expo-location`, when-in-use permission with string: "TapOwner uses your location to show properties around you."), parcel boundary overlay appears at zoom ≥ 16.
**Accept:** On the physical iPhone: app opens to user location, parcel lines visible when zoomed to street level, 60fps pan.

### Phase 4 — Tap-to-owner (the product moment)
Tap parcel → highlight polygon → bottom sheet: owner name, situs address, mailing address, **property details where available (sqft, year built, beds/baths, lot size, pool, last sale price + date — omit any field the county didn't publish rather than showing a placeholder)**, "Absentee owner" badge when flagged, "Protected record (Texas Tax Code §25.025)" state, and a **Get Contact Info — $0.29** button (disabled until Phase 6; show "coming in beta" pre-billing).
**Accept:** Frederick stands in front of a real San Antonio house, taps it, sees the correct owner in <1s, and sees correct sqft/year-built/pool/last-sale-price for that specific property (or a clean absence, not a blank/zero, where the county doesn't publish it).

### Phase 5 — Auth + Stripe subscriptions (web) + app login
`web/`: landing page + signup flow → email OTP → card capture → Stripe Checkout subscription (Closer trial, 30 days, card required) → welcome screen "download the app, log in with this email." Stripe products: `prospector_999`, `closer_1999`, metered price `trace_29`. Webhooks: subscription lifecycle → `subscriptions` table. App: login screen (email OTP), session persistence, tier awareness from `/me`.
**Accept:** full journey on real devices with Stripe test mode — sign up on phone browser, start trial, log into app, `/me` shows tier=closer, trial_ends_at correct; cancel in Stripe portal reflects in app within a minute (webhook).

### Phase 5b — Referral & commission system (parallel; web+API only, no mobile work)
Partner types and rewards (all values in config):
- **user_referral:** give-a-month-get-a-month (Stripe coupon: 1 free month to referred user at checkout; 1 free month credited to referrer on referred user's first PAID invoice).
- **founding_agent:** account flag `lifetime_closer=true` + user_referral loop; auto-promote to affiliate tier at 10 paid conversions.
- **affiliate (influencer/coach):** 25% of subscription revenue (`affiliate_rate=0.25`), first 12 months per referred user (`affiliate_months=12`), **subscription invoices only — trace/metered revenue explicitly excluded**. Alt flat bounty option `affiliate_flat_cents=2000` selectable per partner.
Mechanics: every partner gets code + link `tapowner.com/r/{CODE}` + auto-generated QR PNG (qrcode lib). Landing sets attribution (60-day window, `attribution_days=60`) → carried into Stripe Checkout metadata → `referrals` row on signup, activated on first paid invoice. Commission ledger computed ONLY from `invoice.paid` webhooks; automatic negative entries on refund/chargeback (clawback). No self-referral (email/card/device heuristics). Codes revocable. Support per-event codes (e.g., one per office demo) for channel measurement.
Partner dashboard (web, behind partner login): clicks, signups, trials, paid conversions, earned, paid-out. Payouts v1 = MANUAL (Frederick pays monthly, $50 minimum threshold, `payout_threshold_cents=5000`); do NOT build Stripe Connect in v1. Admin note in dashboard: collect W-9 from any partner crossing $400/yr (1099 required at $600).
**Accept:** full loop in Stripe test mode — referred signup via QR converts to paid → referrer month credited / affiliate ledger entry appears with correct amount; refund reverses it; trace usage generates NO commission; dashboard figures match ledger.

### Phase 6 — Skip trace: vendor bakeoff → integration → metering
1. **Bakeoff (gate):** Frederick funds sandbox/test credits at 2 vendors (BatchData + one API-first alternative, e.g. Tracerfy). Claude Code scripts 100 real Texas residential addresses through both, measures match rate and per-match cost. **Pick requires ≥70% phone match. Report results to Frederick before signing anything (his call — money).**
2. Implement `TraceProvider` interface: `trace(apn, countyFips, ownerName, situs) → {phones[], emails[], dncFlags[], matchQuality}`.
3. `POST /trace/{parcel_id}`: check user's purchases (free re-view) → check cache (charge, no vendor cost) → else vendor call → store in `trace_results` + `user_traces` → decrement included-trace balance or record metered usage (§7).
4. UI: result sheet with phones (mobile/landline + DNC badge), emails, "Save Contact," "Draft Email" (gated to Closer).
**Accept:** trace on a fresh parcel returns real contact data and records usage; second user tracing the same parcel is charged but no vendor call fires (log proof); Closer's included-trace counter decrements and resets logic is config-driven; DNC-flagged numbers visibly badged.

### Phase 7 — AI email drafting (Closer gate)
`POST /draft`: {parcel_id, template_id, tone} + agent profile (name, brokerage, phone — collected once in settings) → claude-haiku → {subject, body}. Launch templates (5): **just-sold farming, absentee owner, expired listing, FSBO, open-house neighbor invite**. Output opens in `expo-mail-composer` prefilled — sends from the agent's own mail account. No background sending in v1. Server-side rate limit (30 drafts/user/day, config).
**Accept:** tap Draft Email on a traced property → personalized, correct-details email opens in Mail on the iPhone; token cost logged (<$0.01/draft).

### Phase 8 — Mini-CRM (Closer gate)
Save property → `saved_properties` with status enum (New / Contacted / Follow-up / Appointment / Listed / Dead) + notes. "Save to Contacts" via `expo-contacts` (permission string: "TapOwner saves property owners to your contacts when you choose.") writing name, phone, email, and property address + notes into the contact. vCard export available to both tiers (share sheet). List view: saved properties filterable by status.
**Accept:** full loop on device — trace, save with note, status change, contact appears in iPhone Contacts with the note.

### Phase 9 — Config service, gates, paywall states
`GET /config` (cached, versioned): trial_days, closer_included_traces, trace_price_cents, tier feature flags, template list, rate limits. App fetches at launch. Feature gating: Prospector user tapping Draft Email / CRM sees upgrade sheet ("Closer — $19.99: 10 free traces monthly + outreach + CRM") linking to the web billing portal **only via the External Purchase flow decided in §3 — default v1: no link, instruct "manage your plan at tapowner.com."** Trial-expiry flow: day-27 push + email, expiry screen with the two tier choices.
**Accept:** flipping config values on the server changes app behavior with no code change; every gate shows the correct sheet; trial expiry path tested with a short-trial config override.

### Phase 10 — Polish, compliance, TestFlight, App Store
- Events instrumentation (see §9) verified end-to-end.
- Privacy policy + ToS pages on web (draft from templates; Frederick reviews). Privacy manifest + App Store privacy labels: location (app functionality), contacts (write, user-initiated), email, purchase/usage data. 
- App Review notes (include verbatim): "TapOwner displays property ownership from public county appraisal records (Texas TxGIO StratMap program). Contact information is provided by a licensed data provider with DNC scrubbing, purchased by the user per lookup as part of their subscription usage. Account creation and billing occur on tapowner.com."
- EAS production build → TestFlight → founding agents (Frederick's contacts) → fix cycle → submit.
**Accept:** TestFlight build on 5+ founding agents' phones; crash-free sessions ≥99%; App Store submission sent.

**Timeline estimate (Claude Code pace, Frederick testing evenings): Phases 0–2 week 1 · 3–4 week 2 · 5–6 week 3 · 7–8 week 4 · 9–10 week 5 → TestFlight ~week 5.** Accounts (LLC, DUNS, Apple org) run in parallel from day 1 — they're the long pole, not the code.

---

## 5. DATA MODEL (core tables — extend as needed, don't rename)

- `parcels` — id, apn, county_fips, county_name, geom (GIST), situs_address fields, owner_name, owner_mailing fields, is_absentee, is_protected, land_use, source_date, living_area_sqft, year_built, bedrooms, baths_full, baths_half, stories, lot_size_sqft, has_pool, has_garage, assessed_land_value, assessed_improvement_value, assessed_total_value, last_sale_date, last_sale_price (each nullable independently — coverage varies by county, null rather than guessed)
- `cad_field_map` — county_fips, source_column_name, target_field (parcels column), notes — per-county mapping since each CAD names columns differently; same pattern as the future permit-adapter normalization
- `users` — id, email, agent_profile jsonb (name, brokerage, phone), created_at
- `subscriptions` — user_id, stripe ids, tier, status, trial_ends_at, included_traces_remaining, period_end
- `trace_results` — parcel_id, owner_name_hash, payload jsonb, vendor, match_quality, fetched_at (TTL 90d, config)
- `user_traces` — user_id, parcel_id, trace_result_id, charged_cents, charged_via (included|metered|cache), created_at
- `saved_properties` — user_id, parcel_id, status, created_at; `notes` — saved_property_id, body, created_at
- `events` — user_id, name, props jsonb, created_at
- `app_config` — key, value jsonb, version
- `products` — id, name (v1 row: 'tapowner'), config jsonb (tiers, prices, trial, templates). users/subscriptions/events carry product_id. trace_results does NOT (cache is cross-product by design)
- `partners` — id, type (user|founding_agent|affiliate), user_id?, name, code, comp_model (recurring|flat), rate, months_cap, status
- `referrals` — partner_id, referred_user_id, attributed_at, first_paid_at, status
- `commission_ledger` — partner_id, referral_id, invoice_id, amount_cents (negative for clawbacks), created_at, paid_out_at

## 6. STRATMAP PIPELINE NOTES
- Source: TxGIO DataHub Land Parcels (statewide standardized schema; owner, address, value attributes; refreshed ~annually, varies by county; not all counties present).
- v1 = one full load. Design the loader **idempotent and re-runnable per county** so later we refresh big-metro counties quarterly from CAD exports directly (documented future task, not v1).
- Data is "as-is," not survey grade — display disclaimer in app footer: "Property data from county appraisal records; informational use only."

## 7. BILLING MECHANICS (get this exactly right)
- **Never** create a standalone $0.29 Stripe charge (fixed $0.30 fee makes it negative). Traces beyond included balance = **Stripe metered usage** on the subscription, billed on the monthly invoice (one transaction, one fee).
- Unbilled metered usage cap: $25 (config) → triggers immediate mid-cycle invoice (limits trial-abuse/chargeback exposure).
- Included traces reset each billing period from config (`closer_included_traces=10`). Consume included first, then meter.
- Downgrade/cancel honors period end. Failed payment → grace 7 days (Stripe smart retries) → tier locks to read-only (saved data visible, no new traces).

## 8. TRACE PROVIDER RULES
- Interface-first; vendor swappable by env var. Log every vendor call with cost, latency, match quality.
- Only display data the vendor returned for **this** owner/property. Never merge, guess, or fabricate. Vendor no-match → "No verified contact found — you were not charged."
- Pay-per-match preferred; if per-record vendor wins the bakeoff, no-match lookups must not charge the user (we eat the fee — margin math §2 already assumes effective per-match cost).
- Surface vendor DNC flags in UI; ToS states agents are responsible for their own outreach compliance.

## 9. METRICS (instrument from day 1 — these decide the business)
`signup_started/completed`, `trial_converted (tier)`, `upgrade_prospector_to_closer`, `trace_purchased (charged_via)`, `trace_no_match`, `draft_created`, `contact_saved`, `weekly_active`. Dashboards later; the events table now. **The two numbers Frederick watches monthly: trial→paid conversion and Prospector→Closer upgrade rate (model assumes 35%).**

## 10. WORKING RULES FOR CLAUDE CODE (Frederick's build discipline)
1. One phase at a time; acceptance test green before advancing; commit per phase; maintain PROGRESS.md.
2. Config, never hardcode, for any business value.
3. When a decision is technical, make it and note it in PROGRESS.md — do not ask Frederick to ratify engineering choices. Ask Frederick ONLY about: spending money, or business facts only he has.
4. Debug discipline: check the obvious cause first; if that fails, instrument and prove root cause with data before changing code.
5. If a step will incur new/recurring cost (vendor credits, paid tier, service upgrade), state the cost and get explicit approval first.
6. Never claim data quality we haven't measured. Match rates, latencies, costs — from logs, not vendor marketing.

## 11. FREDERICK'S ACTION CHECKLIST (the only things Claude Code can't do)
| # | Action | Cost | When |
|---|---|---|---|
| 1 | Buy tapowner.com + tapowner.ai (+.app if cheap); point DNS later | ~$25–120/yr | **Today** |
| 2 | Grab @tapowner on Instagram + Facebook | free | Today |
| 3 | File umbrella LLC (neutral name, e.g. "Danzoy Software LLC"; Texas SOSDirect, self-file, own registered agent) → EIN (IRS, free) → "TapOwner" as assumed name/DBA (~$25). All accounts (Apple, Stripe, vendor) go under the umbrella so vertical #2 reuses them | ~$325 | This week |
| 4 | DUNS number (free, dnb.com) → Apple Developer **organization** enrollment | $99/yr | When LLC exists (~wk 2) |
| 5 | Stripe account under TapOwner LLC | free | Week 2 |
| 6 | Expo/EAS account | free tier | Day 1 |
| 7 | Railway account | ~$20–40/mo | Day 1 |
| 8 | Skip-trace vendor accounts ×2 + test credits for the 100-address bakeoff | ~$30–60 | Week 2–3 (Phase 6 gate) |
| 9 | Anthropic API key for drafting endpoint | existing account | Week 3–4 |
| 10 | Review privacy policy + ToS drafts | free | Week 4–5 |
| 11 | Recruit 5–10 founding agents for TestFlight (LAUNCH_ASSETS.md, Asset 1) | free | Week 3+ |

**Default assumption (change if wrong): San Antonio is the first-QA metro (founding agents assumed local). All Texas counties load either way.**

---
*End of founding document. If anything in a session contradicts this file, this file wins unless Frederick explicitly overrides it. vNext items deliberately excluded from v1: Android release, background email sending (Gmail OAuth), county-level quarterly refresh, additional states (FL/NC/WI next), IAP fallback, team plans, and the entire roofing vertical (NOAA storm ingestion, permit data, area reports) — vertical #2 gets its own founding doc after TapOwner ships. The platform note at the top is the ONLY influence vertical #2 has on this build.*

---

## APPENDIX — PRE-LAUNCH LEGAL & COMPLIANCE GATE (hard gate: no public launch until every item below is done)

Researched 2026-07-13 (primary sources: Texas SOS/AG on the Data Broker Act; BatchData ToS/privacy policy). Context: TapOwner resells licensed contact data. The compliance model below matches how the entire category (DealMachine, BatchLeads, etc.) operates, adapted to TapOwner's lower-risk design.

**Structural advantages to PRESERVE (these are risk decisions, not just features):**
- NO dialer, NO mass texting, NO bulk list export in v1. Manual one-at-a-time lookups + one-to-one emails from the user's own mail account keep TapOwner out of the TCPA epicenter (autodialers/robocalls/mass texts). Adding any of these later = re-run this legal review first.
- DNC + litigator flags displayed in the trace UI (Phase 6) — keep mandatory, never config-off.

**The compliance stack (build/do before launch):**
1. **Vendor redistribution addendum.** The winning skip-trace vendor's standard self-serve ToS covers internal use only — embedding results in TapOwner for end users requires their API-partner/reseller terms. Sequencing: the Phase 6 bakeoff is fine under standard terms (internal evaluation); sign the addendum with the WINNER before any real user sees traced data. Frederick action (money/contract).
2. **TapOwner user ToS (Phase 10, one checkbox at signup — not a wall of disclaimers):** must include (a) lawful-use only; (b) NO FCRA uses — no tenant screening, employment, credit, insurance eligibility decisions; (c) user is solely responsible for their own outreach compliance (TCPA/DNC for calls, CAN-SPAM for email); (d) user must honor opt-outs; (e) no harassment/stalking use. Mirror the vendor's flow-down obligations verbatim where the addendum requires it.
3. **Texas Data Broker Act registration** (Bus. & Com. Code ch. 509/510): register with the Texas SOS (Form 4001, $300/yr), post the SOS-prescribed conspicuous "data broker" notice on tapowner.com and in the app, and maintain a written comprehensive information security program (12 statutory safeguards). Trigger analysis: the >50,000-individuals prong has no revenue-percentage floor, so TapOwner crosses it at modest scale. Default plan: register proactively at launch; attorney confirms timing. Penalty for skipping: up to $10k/12mo, actively enforced by the Texas AG.
4. **Insurance:** E&O + cyber liability quote for a micro-SaaS (~$500–1,500/yr est.). Frederick action.
5. **Attorney review (one engagement, ~$1,000–2,500):** ToS + privacy policy + data-broker registration timing + the vendor addendum. This is the gate-keeper item — no launch without it.

**Estimated total first-year compliance cost: ~$2,000–4,500.** Line item, not a blocker.

**Claude Code implementation hooks:** Phase 10's privacy-policy/ToS drafts must cover item 2's clauses; the web footer + app settings screen need the item-3 notice slot (config-driven text); signup flow = ONE terms checkbox (competitor-standard, friction-free). Nothing else in the build changes.

---

## APPENDIX — FLAGGED FUTURE IDEA (roofing vertical, NOT v1, legal-gated — do not build without explicit sign-off)

**Probate/estate-sale lead trigger.** Concept: properties entering probate administration are likely to be sold soon, often need a pre-sale roof assessment/replacement, and the timing advantage of reaching out early (before a listing or estate-sale sign appears) is real and valuable — same shape as the storm-swath and neighbor-just-replaced plays.

**Explicitly rejected version:** sourcing this from **obituaries** (scraping death notices to identify heirs/decedents). Rejected because: (1) reputational risk is severe and spills onto the whole platform, not just this vertical — "company mines obituaries to solicit grieving families" is a predictable and damaging news story; (2) some jurisdictions have specific bereavement-solicitation restrictions separate from general DNC/TCPA rules, unverified for Texas; (3) no outreach framing avoids reading as predatory when the trigger is a recent death.

**Approved-in-concept alternative, IF built:** source the trigger from **Texas probate court filings** (public record, typically available a few weeks after death once an executor/administrator is appointed) rather than obituaries. This preserves the early-timing advantage while changing the outreach target from "grieving heir" to "executor administering an estate sale" — a standard, legitimate lead category already used in investor-facing real estate tools — and the outreach copy becomes ordinary "preparing a property for sale" language with no death-adjacent framing at all.

**Hard gate before this becomes a build phase:** requires explicit sign-off from Frederick AND a real attorney's review of Texas probate-solicitation rules and any applicable bereavement/solicitation statutes. Do not implement, prototype, or scope further without both. Not scheduled; parked here for the record.
