# TapOwner — App Bible

**This is the deep onboarding brain for anyone doing app / product / UX work on TapOwner.**
Read this FIRST, in full, before answering a change request about the app. It is the layer the
other docs don't cover: `TAPOWNER_BUILD.md` is the spec, `BRAND_AND_PRODUCT_BRIEF.md` is the brand
story, `HANDOFF.md` is the ops runbook + decision log, `CURRENT_STATE.md` is ground truth of what
works. **This file is "how the app actually works, screen by screen, and how to work with
Frederick."**

> **The one rule that prevents bad handoffs: READ BEFORE YOU ACT.** When Frederick asks for a
> change, open the actual screen/route/module involved and read it before you answer. Never reason
> from a shallow first look or a guess. Most fumbled handoffs come from a session responding
> without having read the code it's about to change. He can tell instantly, and it erodes trust.

---

## 0. How to use this doc

- **Doing app UX work?** Read §1 (product), §2 (how Frederick works), §3 (screens), §7 (flows),
  §8 (guardrails). Then read the specific screen file before editing.
- **Touching the API / data / billing?** Add §5 (API) and §6 (data model).
- **About to ship?** §9 (ritual). Mobile-only change = just a build. Anything touching the
  `/config` shape or an endpoint = API deploy **and** a build.
- Keep this current. When a screen changes materially or a decision is made, update the relevant
  section (and the `HANDOFF.md` decision log for the "why").

---

## 1. What TapOwner is (product in one page)

An **iPhone app for Texas real-estate agents** that turns prospecting into a pocket workflow:

- **Tap a property on the map → see the owner of record, free** (public county records, all 254
  Texas counties, via the state TxGIO StratMap program).
- **Unlock verified phone & email for 29¢** — licensed, DNC-scrubbed contact data from BatchData,
  purchased per lookup ("trace"). Verified / DNC / TCPA-risk badges shown.
- **AI-drafts the outreach** — a personalized email from the agent's own Mail app (7 templates ×
  3 tones), never sent from our servers.
- **Mini-CRM** — save owners with notes + a pipeline status; keep read-only access even if the
  subscription lapses.
- **Farm / Reverse Prospecting (the flagship)** — draw an area on the map, see every owner inside
  (up to 500), filter by beds/baths/sqft/pool, and act on the whole list: email them, save them,
  or export a CSV for a direct-mail campaign.

**Pricing:** Prospector **$9.99/mo** (map + unlimited owner lookups + 29¢ pay-as-you-go traces,
vCard export) · Closer **$19.99/mo** (everything + 10 included traces/mo + AI drafting + CRM +
Reverse Prospecting). **30-day full-Closer trial**, card required. Account creation + billing
happen on **tapowner.com**, not in the app (App Review reasons).

**The positioning that matters to Frederick:** *"does so much in such a small package for such a
small price"* — everything the **$99–232/mo** prospecting tools (DealMachine, BatchLeads, etc.) do,
for $9.99–19.99. The **data moat** (sqft/beds/baths/pools mined free from ~29 county appraisal
districts) is what lets the farm filtering work at this price. **Reverse Prospecting is the
flagship** — lead with it. The highest-response line in real estate — *"I may have a motivated,
qualified buyer looking for a home exactly like yours…"* — woven with the agent's filter criteria,
kept honest at scale.

---

## 2. How to work with Frederick

He is the founder and product owner — a **non-developer**. His on-device evaluation is the single
best source of product truth this project has. Treat his feedback as gold, and translate it
faithfully into good implementation.

**Decision boundaries (money = his, technical = yours):**
- **His:** anything involving money, legal, business, or brand — LLC/EIN/bank, Stripe-live, pricing
  numbers, legal/compliance sign-off, vendor contracts, the referral/commission economics, and all
  final UX calls. Route these to him; don't decide them.
- **Yours:** how to implement, architecture, code quality, catching bugs, and telling him the
  honest technical truth (including when something he believes isn't quite right).

**How he communicates:**
- **Voice-dictated** — expect run-ons, homophones, and artifacts ("no onzet" = "Know who owns it").
  Parse for intent; don't take transcription literally.
- **Layman terms, step by step.** When you give him instructions, assume no dev knowledge. Number
  the steps. Never hand him a command without saying what it does and why.
- **UX-truth-driven & iterative.** He runs the app on his phone, finds real friction, and sends
  precise notes. The loop is: **you build → ship to TestFlight → he reviews on-device → he sends
  the next round.** Expect many small rounds. His instincts are usually right — when he says
  something is confusing, it is.
- **Plain-English obsessive.** He kills ambiguity and jargon in UI copy. ("Included traces first,
  no-match never charged" → "No charge if no contact is found." "you were not charged" moved so it
  clearly applies only to the no-matches.) Match that bar.
- **Craft-sensitive.** Never stretch a logo; keep things consistent; small details matter.
- **One-word ship approvals** ("ship it", "yes please"). He gives standing orders and trusts you to
  execute. But **outward/irreversible actions still deserve a confirm** unless he's clearly
  authorized them.

**North-star values (his stated ones):**
- **Honesty over confidence.** He would rather hear "this isn't done / this is a risk / I'm not
  sure" than false certainty. He has said so directly. Do not oversell.
- **Best result, every time.** He worries about work that's "less than the best we can get." Bias
  toward doing it right over doing it fast.

**Vocabulary he uses:** "evaluator mode" (on-device testing), "hunting mission" (a focused search
task), "the data moat," "reverse prospecting."

---

## 3. The app, screen by screen

Files live in `mobile/` (flat — screens are `mobile/<Name>Screen.tsx`; shared bits are top-level).
Palette note in §8. Screens already read in depth this session are detailed here; the rest are
filled from the codebase scrub in §3b.

### ContactScreen.tsx — single owner's contact
Reached by tapping **"Contact this person"** on a `PropertyCard`. **Auto-traces on mount**
(`traceParcel`) — the trace (and its charge decision) happens here, server-side. Shows a
`freeReview` banner ("Already unlocked — no charge", green) when the owner was already paid for.
Renders phone numbers (top 2 by default with "show N more"; each with type + **Verified / DNC /
TCPA-risk** badges), emails, then actions: **Draft Email** (→ `DraftEmail`, gated to the
`draft_email` feature = Closer), a **note field + Save to CRM** (gated to `crm`), **Save to
Contacts** (uses `Contacts.presentFormAsync` — pops the native new-contact card, needs no address-
book permission), and **Share Contact** (builds a vCard file and opens the share sheet).

### PropertyCard.tsx — the tap-a-parcel sheet
Not a route — a component `MapScreen` shows over the map. Two modes: a **compact bottom card** and
a **full-screen expanded** view (toggled by the "More ▴ / Less ▾" handle). Compact shows: address,
badges (Absentee owner / Pool / Garage / **"Owns N more"** — the owner-portfolio badge, from
`owner_portfolio_count` = other parcels sharing owner name AND mailing address), OWNER + MAILING
ADDRESS blocks, a facts line (built/sqft/stories/lot/assessed), and the **CTA button**. Expanded
Property details also carries **Pool (Yes/No), Garage (Yes/No), and a Features line** (spa, casita,
deck… from `features[]`, labels in `featureTags.ts`), and Record carries an **"Also owns"** row. The CTA reads **"Contact this person —
Free"** (green) when `detail.already_unlocked` is true, else **"Contact this person — $0.29"**
(blue). Protected records (`is_protected`) show a red notice and no CTA. Expanded view adds full
property details (year, living area, stories, beds, baths, lot), valuation (land/improvement/total
assessed, last sale), and record fields (county, APN, land use, legal description). `onGetContact`
→ navigates to `ContactScreen`.

### FarmResultsScreen.tsx — Reverse Prospecting results
Reached after drawing a polygon on the map (farm mode). Shows the count ("N properties" or "N of M
match"), a **Refine** button (filters: min sqft, beds, baths, pool, single-story, **plus
data-driven feature chips** — the canonical 16-tag vocabulary (casita, shed/workshop, spa,
fireplace, solar, RV, boat dock, barn, basement, sport court, carport, garage, waterfront,
corner lot); only tags present in the drawn area render, each with a live count
("Casita / guest house (4)"), multi-select = must-have-all; tags arrive per-parcel as
`features[]` from `/parcels/within`, derived server-side via `api/src/lib/improvementTags.ts` +
the embedded crosswalk — after ANY `data/improvement_crosswalk.json` edit run
`cd api && npm run sync:crosswalk` and redeploy), a non-clickable **status line** ("7 of 11 unlocked · 4 left to unlock" / "✓ All 11
unlocked"), and a filled-blue **"Actions for these N homes"** button that opens a native iOS action
sheet. The sheet is **two-stage**:
- **While any home is locked:** leads with a **red (destructive) "🔓 Unlock remaining X · up to
  $Y"** row (X = buyable count, cost = X × trace price), with "N already paid — $0" in the
  subtitle, plus **"📮 Export for a direct-mail campaign"**. Unlocking loops `traceParcel` over the
  locked homes (included traces first, no-match never charged, stops on cap/inactive).
- **Once all worked:** **"📧 Email owners (N have emails)"** (→ `FarmDraftScreen`, only when 1–15
  have emails — `EMAIL_MAX`), **"👤 Add N to Contacts"** (one native card at a time via
  `runBulkContacts`), **"💼 Save N to CRM"**, and **"📮 Export for a direct-mail campaign."**
- **Export** always shows a **cost confirmation** first (`handleExport` → `runExport`): "This
  export of N addresses would cost $X (N × 10¢) — waived free during our beta" (or the paid wording
  once beta flips off). Price/beta come from `config.farm_export`. The CSV is built client-side to
  match the on-screen filter and shared out.
- Farm caps (server-enforced, in `parcels.ts`): **500 parcels**, **25 km²**, **50 polygon
  vertices**.

### FarmDraftScreen.tsx — farm email outreach (EMAIL-ONLY)
Reached from the farm actions "Email owners." **Email-only** — there is deliberately **no in-app
"letter"** (physical mail is a CSV export the agent designs in their own tool; 2026-07-14 decision).
It has a scope line, a **template accordion** (tap a template to expand a one-paragraph sample
preview from `templatePreviews.ts`, then "Select this one"), **tone** chips, and a Generate button.
Generate calls `farmDraft` (one AI draft, honest-at-scale generic — "Hello neighbor", "may have a
buyer") then opens a **pre-addressed `MailComposer` per owner**, one at a time. If no mail app is
set up, it shares the text instead.

### PipelineDetailScreen.tsx — a CRM record
Reached from `PipelineScreen`. Shows address, owner, a facts line, mailing address, a **Contact
section** (the phones — DNC-badged — and emails already paid for, surfaced from the trace), the
**Status** chips (New · Contacted · Follow-up · Appointment · Listed · Dead), and **Notes as a
chronological running log** — oldest first, newest at the bottom, auto-scrolls to the latest, each
entry stamped date + time with a timeline rail. A note input at the very bottom appends to the
thread. Lapsed/read-only users see everything but can't edit (status/notes hidden behind
`readOnly`).

### PipelineScreen.tsx — the CRM list
The pipeline list of saved properties (`listSavedProperties`, optional status filter). Rows show
owner/address/status + latest-note preview; tap → `PipelineDetailScreen`. (Read the file before
editing — light coverage here.)

### MapScreen.tsx — the home surface
The initial tab. A MapLibre map (OpenFreeMap "liberty" basemap) with a **parcel vector-tile
overlay** from `${API_BASE}/tiles/{z}/{x}/{y}.mvt` (min zoom 16). Tapping a parcel → `fetchParcelAt`
→ opens a `PropertyCard`; tapping the map dismisses it (a `tapSeq` ref guards against out-of-order
taps). Has an address search bar (`geocodeAddress`), a permission-aware "My location / Enable
location" button, and a **"Farm area" polygon-draw mode** (hidden when `readOnly`) whose vertices
call `farmSearch` → `FarmResults`. Native tile requests are authed by a MapLibre
`TransformRequestManager` that injects the Bearer token **only** for the API host (never the
basemap).

### DraftEmailScreen.tsx — single-contact AI email
Reached from `ContactScreen`'s "Draft Email." Pick template + tone, `draftEmail` generates
subject/body, then opens one `MailComposer` per recipient (800 ms gap on iOS to avoid the "already
presenting" crash), or falls back to the share sheet if no Mail account. Params `{ parcelId, emails }`.

### PipelineScreen.tsx — the CRM list (tab is labeled "CRM")
Status-filterable `FlatList` of saved properties (`listSavedProperties`) with CSV export
(`exportSavedPropertiesCsv`). `canView = features.crm || readOnly` — a lapsed user sees a read-only
banner but keeps access; a never-Closer sees an upgrade wall. Reloads on focus. Tap → `PipelineDetail`.

### AccountScreen.tsx — the Account tab
Plan summary (tier + price, Closer traces remaining, trial end), a config-driven manage-plan link
(→ web portal), an editable **agent profile** (name/brokerage/phone — used to sign AI emails,
`updateAgentProfile`), the config-driven data-broker notice, Logout, and legal links. When
`readOnly`, shows an "inactive plan" notice + an "I reactivated — refresh" button (`refreshMe`).

### LoginScreen.tsx — passwordless OTP
Two-step: email → `requestOtp`, then 6-digit code → `verifyOtp` returns the session token
(`onLoggedIn`). Rendered by `App` when logged out, **outside the navigator** — logged-out users
never mount the stack.

### UpgradeSheet.tsx — the Closer upsell
A modal sheet rendered at the App root whenever `showUpgrade()` fires. Billing CTA opens the web
portal (`config.manage_plan_url`) via `Linking`; falls back to plain text when the URL is empty (so
App Review pushback needs no rebuild). `ErrorBoundary.tsx` wraps the whole app — catches throws and
shows a "Try again" reset so release builds fail visibly, not white.

---

## 4. Navigation & global state (AppContext)

**Two navigators** (`@react-navigation`), assembled in `App.tsx`, mounted **only when logged in**:
- **Root** = native stack (`RootStackParamList`), initial route `Tabs`.
- **Tabs** = bottom tabs: **Map** (initial, own header), **Pipeline** (labeled **"CRM"**), **Account**.

`RootStackParamList` (`navigation.ts`):

| Route | Params |
|---|---|
| `Tabs` | `undefined` |
| `Contact` | `{ parcelId: number; address: string \| null; ownerName: string \| null }` |
| `DraftEmail` | `{ parcelId: number; emails: string[] }` |
| `PipelineDetail` | `{ savedPropertyId: number }` |
| `FarmResults` | `{ polygon: [number,number][]; result: FarmResult }` |
| `FarmDraft` | `{ mode: 'email' \| 'letter'; criteria: FarmCriteria; emailGroups: string[][] }` |

(`FarmDraft.mode` is vestigial — the screen is email-only now; only `'email'` is ever passed.)

**Global state — `useApp()` (`AppContext.tsx`)**, value built in `App.tsx` (memoized on
`[token, me, config]`, **null until a token exists**):

| Field | Type | Origin |
|---|---|---|
| `token` | `string` | Session JWT; loaded at boot from `expo-secure-store` (key `tapowner_session_token`) or set on login. |
| `me` | `Me \| null` | `GET /me` — id, email, `agent_profile`, tier, status, `trial_ends_at`, `included_traces_remaining`, `period_end`. |
| `config` | `AppConfig` | `GET /config`; `FALLBACK_CONFIG` until it resolves. |
| `features` | `{ draft_email, crm }` | Computed: only when the sub is **usable** (`status` `trialing`\|`active`) AND `config.tiers[me.tier].features`; else both false. |
| `readOnly` | `boolean` | `!usable` (canceled/past_due/expired) → app stays open read-only. |
| `refreshMe` / `logout` / `showUpgrade` | fns | re-fetch `me` / clear token + reset / open `UpgradeSheet`. |

Gate paid actions with `if (!features.X) return showUpgrade();`. Because entitlements are
`config.tiers × me.status`, **tier pricing/features change server-side with no app build.**

**Startup / auth (`App.tsx`):** `authState` = `checking | loggedOut | loggedIn`. On mount: fetch
config (non-blocking) + read the stored token — none → loggedOut; present → `fetchMe` (valid →
loggedIn + `app_open` event; invalid → clear → loggedOut; network error → loggedOut but keep the
token). Location permission is requested only **after** login (denial never blocks — the map falls
back to a default region). Logged-out users render `LoginScreen` and **never mount the stack**.

---

## 5. The API surface & business logic
API is `api/` (Node 22, Fastify, ESM, PostgreSQL 16 + PostGIS on Railway). Deployed via
`railway up --service api --ci`. Public base: `https://api-production-7d11.up.railway.app`.

**Endpoints** (auth: **A** = requireAuth JWT · **D** = `dataAuth` grace-mode · **admin** =
`x-admin-secret` · **sig** = Stripe signature · **—** = public):
- **Auth:** `POST /auth/otp/request` (—) emails a 6-digit code · `POST /auth/otp/verify` (—) code→JWT, upserts user.
- **Me:** `GET /me` (A) user + latest subscription · `PUT /me/profile` (A) agent name/brokerage/phone.
- **Trace:** `POST /trace/:parcelId` (A) — the only charging path (see below).
- **Parcels:** `GET /parcels/at?lat&lng` (D) tap→parcel, logs `parcel_viewed` · `POST /parcels/within`
  (A + usable) farm polygon→owners (caps 25 km²/500/50-verts; excludes protected + placeholder; JSON
  or CSV) · `POST /farm/export-log` (A) meter/cap CSV exports (beta free 300/mo).
- **Saved-properties (CRM):** `POST` (A+crm, needs a prior trace) · `GET` list + `GET /:id` +
  `GET /export` (**A only — lapsed users keep read-only**) · `PATCH /:id` status + `POST /:id/notes` (A+crm).
- **Draft:** `POST /draft` (A+draft_email, one traced parcel) · `POST /draft/farm` (A+draft_email, one
  honest-at-scale list letter). Anthropic Haiku, 30/day cap; prompts wrap untrusted county text in «»
  as literal-only (injection guard).
- **Billing:** `POST /billing/checkout-session` (—, email in body; Closer + 30-day trial + referral
  coupon) · `POST /billing/portal-session` (A) · `POST /webhooks/stripe` (sig, raw-body).
- **Partners/referrals:** `POST /partners`, `GET /admin/partners`, `POST /admin/partners/:id/{payout,status}`
  (admin); `GET /partners/:code`, `/qr`, `POST /referrals/click` (—); `GET /partners/me/dashboard` (A).
- **Infra:** `GET /tiles/:z/:x/:y` (D, PostGIS MVT, min-zoom 15, LRU 2000/1h) · `GET /geocode?address`
  (D, Google, 200/day/user) · `GET /config` (—, whitelisted, 60s cache) · `POST /events` (A, whitelist
  `app_open`/`contact_saved`) · `GET /health` (—).

**Trace & charging (`routes/trace.ts` — the money path).** In order, everything before any vendor spend:
1. **Free re-view:** a `user_traces` row for `(user, parcel)` → return the cached payload,
   `freeReview:true`, no checks/charge. That row's existence = "already paid."
2. **Usable sub required** for a NEW trace (`trialing`/`active`) — else `402`, checked *before* the
   vendor call so a lapsed account can't incur spend.
3. **$25 metered cap:** only when `closer` AND `included_traces_remaining <= 0`; sums metered
   `charged_cents` in the billing window; over cap → `402`. (Soft ceiling; can overshoot cents under load.)
4. **Compliance rejects:** `is_protected` → `403` (never sent to vendor); placeholder/blank owner
   (`lib/owners.ts`) → `403`.
5. **Cross-user cache:** look up `trace_results` by `(parcel_id, sha256(owner_name))` within TTL (90d).
   Hit → reuse, no vendor call.
6. **Vendor on miss:** BatchData v3. **No match → never charged** (inserts nothing). Match → one
   `trace_results` row.
7. **Atomic charge decision:** `tryConsumeIncludedTrace` (guarded `UPDATE … WHERE included_traces_remaining > 0`)
   → `included` (0¢) or `metered` (29¢).
8. **Concurrency gate = the charge record:** `INSERT user_traces … ON CONFLICT (user_id,parcel_id) DO NOTHING`.
   Lost the race → refund the included trace, serve free. **Never billed twice.**
9. **Meter to Stripe** (metered only): `meterEvents.create` with a deterministic identifier (idempotent).

Two users tracing the same parcel = **two charges, one vendor call** (shared `trace_results`, separate
`user_traces`).

**Entitlements (`lib/entitlements.ts`).** `isSubscriptionUsable` = status `trialing`|`active`
(anything else = lapsed/read-only). `requireFeature(userId, feature, reply)`: not usable → `402`
(trial-expiry screen); usable but tier lacks the feature → `403` (upgrade sheet). `crm` gates
saved-property WRITES (reads are auth-only so lapsed users keep read-only access); `draft_email` gates
both draft routes. Trace + farm gate on *usable* only (tier only decides included-trace mechanics).
Features are pure `products.config.tiers[tier].features` → change with no redeploy.

**Billing / Stripe / commissions (`routes/billing.ts`).** Checkout: Closer price + 30-day trial;
referral attribution if the code is an `active` partner within `attribution_days` (60) and not
self-referral; `user_referral`/`founding_agent` codes attach a 100%-off first-month coupon. Portal:
plan switch + cancel happen in Stripe's own UI (app never touches cards). Webhook (raw-body,
signature-verified) handles `checkout.session.completed` (upsert user+subscription, insert
`referrals`), `customer.subscription.updated/.deleted` (re-upsert; trialing→active logs
`trial_converted`; prospector→closer grants traces), `invoice.paid`, `charge.refunded`. **Included
traces are set only on subscription INSERT** — no mid-period refill; the reset happens at each
`invoice.paid` boundary. **Rewards fire only on a real paid invoice** (`amount_paid > 0` — skips the
$0 trial/coupon invoices), and `referrals.first_paid_at` is **claimed atomically** (reward exactly
once). give-a-month/get-a-month credits the referrer's Stripe balance (no ledger row); affiliates get
a `commission_ledger` row — **flat** ($20 bounty once) or **recurring** (25% × *subscription-only*
revenue, capped 12 invoices). Refunds insert **negative prorated** clawback rows; payouts settle net
unpaid.

**Auth (`routes/auth.ts`, `auth/*`).** Passwordless email OTP: request throttled (1/60s, ≤5
unconsumed/hr) and **always** returns "Code sent" (no account/throttle leak); code stored as sha256,
10-min expiry, ≤5 attempts. Verify → upsert `users` (`product_id='tapowner'`) → **30-day HS256 JWT**
(the only session; no session table). **Demo bypass for App Review:** when `DEMO_EMAIL`+`DEMO_OTP_CODE`
are set, that one email accepts the fixed code with no OTP row. **Grace-mode `dataAuth`**
(tiles/parcels-at/geocode): valid token → userId; present-but-invalid → always 401; missing → allowed
until `products.config.data_auth_required=true` (currently **true** — enforced).

**Jobs (`jobs/trialReminder.ts`).** Boot + every 6h: emails `trialing` users ~3 days before
`trial_ends_at`, deduped via a `trial_reminder_sent` event (can't double-send). Email only — push
(APNs) deferred to a future build.

**Cross-cutting.** Email = Resend when `RESEND_API_KEY` set, else console (dev). `logEvent` never
throws (metrics must never break a request) and backs analytics/dedupe/rate-caps/partner dashboards.
`getProductConfig()` reads `products.config` live (most routes) or briefly cached (`/config` 60s,
`dataAuth` flag 60s).

---

## 6. Data model (PostgreSQL + PostGIS)

**Schema source of truth:** `data/*.sql` (phase files, applied in order). The API defines **no** DDL
(`api/src/db.ts` is just a `pg.Pool`). Multi-product by design, but **only `users` carries
`product_id`** — everything else scopes to a product transitively via `user_id`. `parcels` and
`trace_results` are deliberately **cross-product shared caches** (no user/product coupling).

**ER at a glance:** `products → users → subscriptions` (Stripe-mirrored) · `users + parcels →
user_traces → trace_results` · `users → saved_properties → notes` · `partners → referrals →
commission_ledger` · `events` (append-only analytics + rate-limit + referral-click log) ·
`otp_codes` (email login, pre-user; no session table — JWTs are the session).

**Tables (key columns):**
- **`products`** — `id` (PK, `'tapowner'`), `config` **jsonb = the entire app config** (below).
- **`users`** — `id`, `product_id` (FK; the ONLY direct product link), `email`, `agent_profile`
  jsonb `{name,brokerage,phone}`, `lifetime_closer` bool. Unique `(product_id, email)`.
- **`subscriptions`** — Stripe mirror; latest-by-`created_at` wins. `tier` (prospector|closer),
  `status`, `trial_ends_at`, `period_end`, `included_traces_remaining` (atomic decrement; set only on
  INSERT, reset each `invoice.paid`). Unique `stripe_subscription_id`.
- **`parcels`** — the county data. situs/mailing/owner fields, `is_absentee` (nullable), `is_protected`
  (§25.025 — compliance), `geom` (PostGIS MultiPolygon 4326, GIST-indexed → tap `ST_Contains` + farm
  `ST_Within`), and the mined "house facts" (`living_area_sqft`, `bedrooms`, `baths_full/half`,
  `stories`, `lot_size_sqft`, `has_pool`, `has_garage`, assessed_*, last_sale_*). **House facts are
  populated per-county by the data pipeline** — present for mined counties (Bexar + the ~29-county
  campaign), null where a county hasn't been enriched yet; `parcel_viewed` events instrument the blank
  rate. (The columns are nullable, so schema-only reading looks empty — but many counties are loaded.)
- **`trace_results`** — cross-product skip-trace cache. `parcel_id`, `owner_name_hash` (sha256 of owner
  at trace time — a changed owner invalidates the cache), `payload` jsonb
  `{phones:[{number,type,dnc}], emails:[{email}]}`, `vendor` (`batchdata`), `match_quality`,
  `fetched_at` (vs `trace_cache_ttl_days`=90). **No product_id/user_id** → one vendor call serves all.
- **`user_traces`** — per-user "I unlocked & paid for this parcel." `charged_cents`, `charged_via` CHECK
  (`included`|`metered`|`cache`). **Unique `(user_id, parcel_id)`** — the concurrency gate guaranteeing
  no double-billing (loser refunded, served free). Existence = re-view is free + draft/save unlocked.
- **`saved_properties`** — mini-CRM; requires a prior `user_traces` row. `status` CHECK
  (`new`|`contacted`|`follow_up`|`appointment`|`listed`|`dead`). Unique `(user_id, parcel_id)`.
- **`notes`** — `saved_property_id` (FK ON DELETE CASCADE), `body`, `created_at`.
- **`partners` / `referrals` / `commission_ledger`** — referral system. `partners` (type
  user_referral|founding_agent|affiliate, `code` unique, `comp_model` recurring|flat, rate, months_cap,
  status). `referrals` (partner→referred_user, `first_paid_at` claimed once; unique per referred_user).
  `commission_ledger` append-only (negative = clawback; `stripe_event_id` unique for webhook idempotency;
  `paid_out_at`).
- **`events`** — `user_id` (nullable), `name`, `props` jsonb. Doubles as referral-click counter &
  AI-draft/geocode daily rate limiter & trial-reminder dedupe.
- **`otp_codes`** — email login codes (`code_hash`, `expires_at`, `consumed_at`, `attempts`).
- **`farm_export_log`** — `user_id`, `rows`, `created_at` (indexed) → powers the monthly export cap.

**`products.config` (jsonb) — the whole app config**, e.g.: `trial_days` 30, `trace_price_cents` 29,
`closer_included_traces` 10, `trace_cache_ttl_days` 90, `tiers.{prospector 999¢ / closer 1999¢}
.{included_traces, features:{draft_email, crm}}`, `attribution_days` 60, `affiliate_rate` 0.25,
`affiliate_months` 12, `affiliate_flat_cents` 2000, `payout_threshold_cents` 5000,
`founding_agent_auto_affiliate_at` 10, `draft_rate_limit_per_day` 30, `farm_export_price_cents` 10,
`farm_export_beta` true, `farm_export_beta_cap_rows` 300, `data_auth_required`, `manage_plan_url`,
`data_broker_notice`. (`metered_cap_cents` is read in `trace.ts` with a `?? 2500` fallback but isn't
currently written to config.) **`subscriptions.status` usable = `trialing` OR `active` only** —
anything else → 402 + read-only mode.

---

## 7. Core flows end-to-end

**Single prospect:** map → tap parcel → `PropertyCard` (owner free; `already_unlocked` sets the
button) → "Contact this person" → `ContactScreen` auto-traces (charge decided server-side; included
traces first, then 29¢ metered, no-match free, re-view free) → phones/emails with badges → Draft
Email (own Mail app) / Save to CRM / Save to Contacts / Share.

**Farm / Reverse Prospecting:** map → draw polygon → `/parcels/within` → `FarmResultsScreen` →
Refine (filter) → Actions → **Unlock remaining** (loops traces) → Actions again → **Email owners**
(`FarmDraftScreen`, template preview → per-owner Mail) / **Add to Contacts** (one card each) /
**Save to CRM** / **Export for a direct-mail campaign** (cost-confirm → CSV).

**CRM:** any Save-to-CRM writes `saved_properties` (needs a prior trace) → `PipelineScreen` list →
`PipelineDetailScreen` (facts + paid contacts + status + chronological notes). Read-only if lapsed.

**Referral/commission (web + admin):** `/r/{CODE}` → attribution → first paid invoice → commission
ledger. Three partner types (user_referral give-a-month, founding_agent lifetime-Closer,
affiliate 25%/12mo or $20 flat). Managed at `/admin`. Details in `BRAND_AND_PRODUCT_BRIEF.md` §3
and `HANDOFF.md`.

---

## 8. Invariants & guardrails (do NOT quietly break these)

**Compliance (see `TAPOWNER_BUILD.md` pre-launch legal gate + `HANDOFF.md`):**
- **DNC + litigation-risk flags are mandatory** in the trace UI — never config-off.
- **No dialer, no mass texting, no robocalls.** Contact is one-at-a-time; email is one-to-one from
  the agent's own account (never blasted from our servers — CAN-SPAM / Resend ToS hard line).
- **Protected records** (Texas Tax Code §25.025, `is_protected`) are never traced or shown as
  contactable.
- **FCRA**: the product is not a consumer report; ToS forbids tenant/employment/credit/insurance
  uses. Don't add features that invite those.
- **Privacy promises** (live on the site): we never read the user's address book (that's why
  contacts use `presentFormAsync`, not `addContactAsync`); GPS isn't stored server-side; contact
  data is cached ~90 days.
- **Honest-at-scale**: farm/list outreach must never claim a specific committed buyer — use "may
  have a motivated, qualified buyer." Generic greeting to a list, no fabricated specifics.
- **Seller-signals outreach rule** (`SIGNALS_ROADMAP.md`, Frederick 2026-07-15): when signals
  ship (probate/divorce/foreclosure/etc.), the trigger can be a public record but outreach must
  NEVER reveal the sensitive part — "I help homeowners in your neighborhood," never "I saw your
  divorce filing." AI-draft prompts get a hard guard in the same build that first surfaces a
  signal: signal types must never appear in or shape generated copy.
- **Bulk phone export is legally sensitive** — the farm CSV currently includes traced phones/emails;
  this is on the attorney's list (vendor addendum + TCPA). Don't expand bulk-export of phone data
  without flagging it.

**Trace economics (§7 discipline):** included traces consumed first (atomic), $25/cycle metered
cap, no-match never charged, re-view forever free, protected/placeholder owners never traced.

**Brand vs app palette — important:** the **marketing site** is brand **navy `#052158` + orange
`#F27F09`** (see `BRAND_AND_PRODUCT_BRIEF.md`). The **iOS app** still uses a **functional palette**
— blue `#2563eb` (primary/links), near-black `#111827` (dark buttons/text), green `#16a34a`
(success / "Free" / selected), red `#b91c1c`/`#fee2e2` (DNC / destructive), grays. The app has NOT
been rebranded to navy+orange. Don't "fix" app blues to brand navy unless Frederick asks.

**Data sources:** parcels/owners = public county records via **TxGIO StratMap** (informational
use). Contact data = **BatchData** (licensed, DNC-scrubbed), resold per-lookup. BatchData reseller
terms are informal only (see `HANDOFF.md` decision log) — a legal-gate item.

---

## 9. Dev & ship rituals

**Typecheck (do this before every build/deploy).** PowerShell blocks `npx`; call tsc via node:
```
node "C:/Users/danzo/Tapowner/mobile/node_modules/typescript/bin/tsc" --noEmit -p "C:/Users/danzo/Tapowner/mobile/tsconfig.json"
node "C:/Users/danzo/Tapowner/api/node_modules/typescript/bin/tsc"    --noEmit -p "C:/Users/danzo/Tapowner/api/tsconfig.json"
```

**Ship the mobile app (TestFlight):**
```
cd mobile && npx expo-doctor            # expect 18/18
npx eas-cli build --platform ios --profile production --auto-submit --non-interactive
```
Build ~4 min → auto-submit ~2 min → Apple processing ~5–10 min → appears in TestFlight. App is
`1.0.0 (<build#>)`; EAS auto-increments the build number. Export-compliance is pre-declared
(`app.json` `ITSAppUsesNonExemptEncryption: false`) so builds don't stick on "Missing Compliance."

**Stack (verify before SDK/dependency work):** Expo **SDK 54** (`expo ^54.0.35`), React Native
**0.81.5**, React **19.1**, TypeScript 5.9. Map = `@maplibre/maplibre-react-native` + OpenFreeMap.
Nav = React Navigation 7. Per `mobile/AGENTS.md`, read `docs.expo.dev/versions/v54.0.0/` before
touching Expo APIs — this SDK differs from older training data. (An old commit message says "Pin
SDK 56," but `package.json` + RN 0.81.5 confirm SDK 54 is what ships.)
- **If the auto-submit stalls** (EAS Submit outages happen): re-submit client-side by build id,
  which works during outages: `npx eas-cli submit --platform ios --id <buildId> --non-interactive`.
- Check builds: `npx eas-cli build:list --platform ios --limit 2 --non-interactive`.

**Deploy the API:** from repo root `railway up --service api --ci` (NEVER `railway redeploy` — it
restarts the OLD image). Verify: `curl <base>/health` → 200 and `/config` contains `"tiers"`.

**Which changes need what:**
- UI text, layout, client logic, `templatePreviews.ts` → **mobile build only.**
- New/changed `/config` field the app reads (like `farm_export`) → the server already sends it;
  add to the mobile `AppConfig` type + `FALLBACK_CONFIG`, **build only** (no deploy) **unless** you
  also changed what the server emits.
- New/changed endpoint or response shape, trace/billing/entitlement logic → **API deploy + build.**

**Config-driven knobs (flip in `products.config` jsonb — no redeploy, `/config` caches 60s):**
trace price, metered cap, farm export price/beta/cap, rate limits, `manage_plan_url`,
`data_broker_notice`, `data_auth_required`.

**Git:** commit to `main` (solo-dev project norm), push to
`github.com/danzoy-ship-it/tapowner`. **Never** `git add` the untracked **`admin commission
access.txt`** at repo root — it may hold the admin secret. Stage explicit paths, not `-A`.

**Windows quirks:** PowerShell blocks `npx` (use the Bash/Git-Bash tool or `cmd`); heredocs mangle
backslashes; run `pg`/node DB scripts from `api/`; background commands cap ~10 min.

**Two-session model:** a **data session** owns county mining / loaders / DB; the **app session**
owns the app + product + UX (this doc's domain). Keep the roles separate — don't route app-UX
surgery to the data session. They share one working tree (no `git pull` between them), so
**coordinate before builds/deploys** (only one EAS build in flight at a time; tell the other
session what you shipped).

---

## 10. The other docs & when to read them
- **`TAPOWNER_BUILD.md`** — the spec / source of truth: architecture, build phases, the pre-launch
  legal & compliance gate, the referral model §5b. Read for "what were we supposed to build / what
  are the rules."
- **`BRAND_AND_PRODUCT_BRIEF.md`** — brand (navy+orange, real logo assets), full product story with
  Reverse Prospecting as flagship, canonical commission/promo model. Read before any
  marketing-site, brand, or referral-portal work.
- **`HANDOFF.md`** — the ops runbook: deploy/build/DB rituals, the county data campaign queue, the
  **decision log** (the "why"), Frederick's open business items, ranked next actions. Keep current.
- **`CURRENT_STATE.md`** — ground truth of what actually works right now.
- **`PROGRESS.md`** — running log.
- **Project memory** (`.claude/.../memory/`) — loads into every session on this machine:
  Frederick's working style, Windows quirks, the session-start ritual, the BatchData position.

---

*Keep this Bible honest and current. If you change how a screen works or make a product decision,
update the matching section here and log the "why" in `HANDOFF.md`. A future session — or a future
you — will be grateful.*
