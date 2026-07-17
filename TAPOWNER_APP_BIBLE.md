# TapOwner — App Bible

> ## ⚡ THIS IS THE CANONICAL V1 RE-GROUNDING DOCUMENT
> If you are a fresh session (zero prior memory) or a new engineer and need to rebuild your
> understanding of **V1 — the Texas real-estate-agent app** from nothing, do exactly this:
> 1. **Read this file in full.**
> 2. **Read the actual code** for whatever you're about to touch (this doc tells you where; never
>    trust a shallow first look — see the rule immediately below).
> 3. **Run `cd api && npm run smoke`** (~10s). It boots the current source tree against the real
>    database and proves the whole core loop still works: map-tap → owner (free) → $0.29 trace
>    unlock → AI draft → mini-CRM → farm mode, plus every route's auth gate. Green = V1 is intact.
>
> **V1 is frozen at git tag `v1-realtor-audited-2026-07-17`.** That tag points at commit `d425e95`
> ("Sanity check (2026-07-17): refresh CURRENT_STATE stale lines"). The very next commit,
> `b1507ed` ("Add V1 core-loop smoke test"), is the current `main` HEAD as of this audit and adds
> **only** the smoke-test tooling — `git diff v1-realtor-audited-2026-07-17..HEAD -- api/src mobile
> web/app` is **empty**. In other words: **V1's actual application source (`api/src/`, `mobile/`,
> `web/app/`) has not changed by a single line since the tag.** Everything below was verified
> directly against that frozen source on 2026-07-17 — routes read line by line, the live DB schema
> queried through the read-only proxy, the smoke test's 13 checks enumerated, the mobile screens
> read in full. Where this doc's predecessor had drifted from the code, it's corrected below and
> flagged inline as `[CORRECTED 2026-07-17]`. If a future change makes this doc wrong again, fix
> the doc in the same session — don't let it drift a second time.
>
> **This is the deep onboarding brain for anyone doing app / product / UX work on TapOwner.**
> `TAPOWNER_BUILD.md` is the original spec (some details below have evolved past it — normal and
> expected; this file is the current truth). `BRAND_AND_PRODUCT_BRIEF.md` is the brand story.
> `HANDOFF.md` is the ops runbook + decision log. `CURRENT_STATE.md` is the ground-truth snapshot
> of what's shipped/verified on-device. This file is "how the app actually works, screen by
> screen and route by route, why it's built that way, and how to work with Frederick."

> **The one rule that prevents bad handoffs: READ BEFORE YOU ACT.** When Frederick asks for a
> change, open the actual screen/route/module involved and read it before you answer. Never reason
> from a shallow first look or a guess. Most fumbled handoffs come from a session responding
> without having read the code it's about to change. He can tell instantly, and it erodes trust.

---

## 0. How to use this doc

- **Doing app UX work?** Read §1 (product), §2 (how Frederick works), §3 (screens), §7 (flows),
  §8 (guardrails). Then read the specific screen file before editing.
- **Touching the API / data / billing?** Add §5 (API) and §6 (data model).
- **Something feels off / you inherited this cold?** Read §9 (the WHY) and §10 (done vs pending)
  before you conclude anything is broken — a lot of apparent oddities are deliberate.
- **About to ship?** §11 (the safety kit + ship ritual). Mobile-only change = just a build.
  Anything touching the `/config` shape or an endpoint = API deploy **and** a build.
- Keep this current. When a screen changes materially or a decision is made, update the relevant
  section (and the `HANDOFF.md` decision log for the "why"). If you change V1 behavior, this doc's
  "byte-identical since the tag" claim above stops being true — say so explicitly rather than
  leaving the stale claim in place.

---

## 1. What TapOwner is (product in one page)

An **iPhone app for Texas real-estate agents** that turns prospecting into a pocket workflow:

- **Tap a property on the map → see the owner of record, free** (public county records, all 253
  loaded Texas counties, originally sourced via the state TxGIO StratMap program and since
  enriched county-by-county with real "house facts" — sqft/beds/baths/pool/etc — mined free from
  each county's own appraisal-district data).
- **Unlock verified phone & email for 29¢** — licensed, DNC-scrubbed contact data from BatchData,
  purchased per lookup ("trace"). Verified / DNC / TCPA-risk badges shown.
- **AI-drafts the outreach** — a personalized email from the agent's own Mail app (7 templates ×
  3 tones), never sent from our servers.
- **Mini-CRM** — save owners with notes + a pipeline status; keep read-only access even if the
  subscription lapses.
- **Farm / Reverse Prospecting (the flagship)** — draw an area on the map, see every owner inside
  (up to 500), filter by beds/baths/sqft/pool/tenure/senior-owner/pre-foreclosure, and act on the
  whole list: email them, save them, or export a CSV for a direct-mail campaign.

**Pricing:** Prospector **$9.99/mo** (map + unlimited owner lookups + 29¢ pay-as-you-go traces,
vCard export) · Closer **$19.99/mo** (everything + 10 included traces/mo + AI drafting + CRM +
Reverse Prospecting). **30-day full-Closer trial**, card required. Account creation + billing
happen on **tapowner.com**, not in the app (App Review reasons — see §9).

**The positioning that matters to Frederick:** *"does so much in such a small package for such a
small price"* — everything the **$99–232/mo** prospecting tools (DealMachine, BatchLeads, etc.) do,
for $9.99–19.99. The **data moat** (sqft/beds/baths/pools mined free from Texas county appraisal
districts, now with any-signal coverage on the large majority of counties — see §10 for the
current number, sourced from `CURRENT_STATE.md`) is what lets the farm filtering work at this
price. **Reverse Prospecting is the flagship** — lead with it. The highest-response line in real
estate — *"I may have a motivated, qualified buyer looking for a home exactly like yours…"* — woven
with the agent's filter criteria, kept honest at scale.

**One more thing worth knowing up front:** the `api/` core is deliberately **vertical-agnostic**
(see `TAPOWNER_BUILD.md`'s platform note). A second product — a storm-lead app for roofers — is
being prepped on the *same* database and, in places, the same `parcels` table (you'll see
`roof_material` / `effective_year_built` columns on `parcels` in §6 — those are vertical-2 data,
not read anywhere in V1's code). None of that roofer work is V1, none of it is wired into V1's
API routes or mobile app, and none of it should be touched while working on V1 unless you're
explicitly told otherwise.

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
- **Never conclude absence without a real hunt.** If a data source or capability looks unavailable,
  that needs to be *proven*, not assumed — this project has repeatedly found "no data" to actually
  mean "wrong door" (see the fill-on-blank and CAD-hunting stories in §9).

**Vocabulary he uses:** "evaluator mode" (on-device testing), "hunting mission" (a focused search
task), "the data moat," "reverse prospecting."

---

## 3. The app, screen by screen

Files live in `mobile/` (flat — screens are `mobile/<Name>Screen.tsx`; shared bits are top-level).
Palette note in §8. Every screen below was read in full for this audit (2026-07-17).

### ContactScreen.tsx — single owner's contact
Reached by tapping **"Contact this person"** on a `PropertyCard`. **Auto-traces on mount**
(`traceParcel`) — the trace (and its charge decision) happens here, server-side. Shows a
`freeReview` banner ("Already unlocked — no charge", green) when the owner was already paid for.
Renders phone numbers (top 2 by default with "show N more"; each with type + **Verified / DNC /
TCPA-risk** badges — Verified renders when the vendor's `reachable` flag is true), emails, then
actions: **Draft Email** (→ `DraftEmail`, gated to the `draft_email` feature = Closer), a **note
field + Save to CRM** (gated to `crm`), **Save to Contacts** (uses `Contacts.presentFormAsync` —
pops the native new-contact card, needs no address-book permission), and **Share Contact** (builds
a vCard file — with vCard 3.0 special-character escaping — and opens the share sheet).
**Known bug (open, see §10 F-hygiene):** `handleSaveToContacts` sets "In Contacts ✓" as soon as
`presentFormAsync` resolves without checking whether the user tapped Done or Cancel — a canceled
save still shows success.

### PropertyCard.tsx — the tap-a-parcel sheet
Not a route — a component `MapScreen` shows over the map. Two modes: a **compact bottom card** and
a **full-screen expanded** view (toggled by the "More ▴ / Less ▾" handle). Compact shows: address,
a badge row, OWNER + MAILING ADDRESS blocks, a facts line (built/sqft/stories/lot/assessed), and
the **CTA button**. The badge row (all conditional on the field being present) is: **Absentee
owner** (amber) · **Pool** (blue) · **Garage** (blue) · **"Owns N more"** (indigo — the
owner-portfolio badge, from `owner_portfolio_count` = other parcels sharing owner name AND mailing
address) · **"65+ exemption"** (amber — `senior_owner`) · **"Owned Ny"** (amber — shown once
`tenure_years >= 15`) · **"Pre-foreclosure"** (red — `event_signals` contains a `pre_foreclosure`
entry, which by construction only exists while the sale date is still pending; see §8's
pre-foreclosure recency rule) `[CORRECTED 2026-07-17 — the prior version of this doc only listed
the first four badges; the three signal-derived badges were missing]`. The CTA reads **"Contact
this person — Free"** (green) when `detail.already_unlocked` is true, else **"Contact this
person — $0.29"** (blue). Protected records (`is_protected`) show a red notice and no CTA. Expanded
view adds full property details (year, living area, stories, beds, baths, lot), **Pool/Garage
Yes-No rows + a Features line** (spa, casita, deck… from `features[]`, labels in
`featureTags.ts`), valuation (land/improvement/total assessed, last sale), an **Owned / Owner**
row (tenure years; "65+ exemption · owner-occupied" / "Owner-occupied (homestead)"), a **Public
filings** section when a pre-foreclosure signal exists (tax vs mortgage, sale month/year), and a
Record section with an **"Also owns"** row plus county/APN/land-use/legal-description.
`onGetContact` → navigates to `ContactScreen`.

### FarmResultsScreen.tsx — Reverse Prospecting results
Reached after drawing a polygon on the map (farm mode). Shows the count ("N properties" or "N of M
match"), a **Refine** button that opens a filter panel with: min sqft (text input), Beds/Baths
chip rows (Any/2+/3+/4+/5+/6+), Pool + Single-story chips, **data-driven feature chips** — the
canonical tag vocabulary (casita, shed/workshop, spa, fireplace, solar, RV, boat dock, barn,
basement, sport court, carport, garage_detached, waterfront…; generic `garage` and `single_story`
are deliberately excluded from this chip list since they have dedicated controls, and generic
`garage` alone is excluded from the whole tag vocabulary as a filter per Frederick's call — see
§9); only tags actually present in the drawn area render, each with a live count ("Casita / guest
house (4)"), multi-select = must-have-all — and an **Owned** row (Any/10+/15+/20+ years,
`tenure_years`) plus **65+ exemption** and **Pre-foreclosure** toggle chips
`[CORRECTED 2026-07-17 — the prior version of this doc's Refine list stopped at "single-story, plus
data-driven feature chips" and omitted the Owned/65+/Pre-foreclosure filter row entirely]`.
Below the filter panel: a non-clickable **status line** ("7 of 11 unlocked · 4 left to unlock" /
"✓ All 11 unlocked"), and a filled-blue **"Actions for these N homes"** button that opens a native
iOS action sheet. The sheet is **two-stage**:
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
- The AI-letter criteria object built from these filters (`FarmCriteria`) is a **hard whitelist**:
  only `min_sqft`/`min_beds`/`min_baths`/`pool`/`single_story` are ever put into it. The
  tenure/senior/pre-foreclosure filter selections are used to narrow *which homes* are in the list,
  but are never passed to the AI draft — see §8's outreach-ethics invariant, which this screen
  enforces on the client side (the server enforces it again independently — belt and suspenders).

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
section** (the phones — DNC-badged — and emails already paid for, surfaced from the trace, shown
3 at a time with "show N more"), the **Status** chips (New · Contacted · Follow-up · Appointment ·
Listed · Dead — read-only badge instead of chips when `readOnly`), and **Notes as a chronological
running log** — oldest first, newest at the bottom, auto-scrolls to the latest, each entry stamped
date + time with a timeline rail. A note input at the very bottom appends to the thread. Lapsed/
read-only users see everything but can't edit (status/notes hidden behind `readOnly`).

### PipelineScreen.tsx — the CRM list (tab is labeled "CRM")
Status-filterable `FlatList` of saved properties (`listSavedProperties`) with CSV export
(`exportSavedPropertiesCsv`). `canView = features.crm || readOnly` — a lapsed user sees a read-only
banner but keeps access; a never-Closer sees an upgrade wall. Reloads on focus (`useFocusEffect`).
Tap a row → `PipelineDetailScreen`.

### MapScreen.tsx — the home surface
The initial tab. A MapLibre map (OpenFreeMap "liberty" basemap, `tiles.openfreemap.org/styles/
liberty`) with a **parcel vector-tile overlay** from `${API_BASE}/tiles/{z}/{x}/{y}.mvt`
(`minzoom=16` on the client `VectorSource` — the server additionally rejects any request below
`z=15` with a bare 204, so the client's 16-floor is comfortably inside the server's floor; see §5).
Tapping a parcel → `fetchParcelAt` → opens a `PropertyCard`; tapping the map anywhere while a card
is open just **closes** it (the mental model is "sheet dismiss", not "re-select") via a `tapSeq`
ref that also guards against an out-of-order slow response landing after a newer tap. Has an
address search bar (`geocodeAddress`, flies the camera to the result), a permission-aware "My
location / Enable location" button (denial never blocks the app — falls back to a default San
Antonio-area region), and a **"Farm area" polygon-draw mode** (hidden when `readOnly`) whose
vertices call `farmSearch` → `FarmResults`. Native tile requests are authed by a MapLibre
`TransformRequestManager` that injects the Bearer token **only** for the API host, matched by
string ops on `API_BASE` (never RN's `URL` — flagged in-code as unreliable on this platform) — so
the JWT can never leak to the OpenFreeMap basemap host.

### DraftEmailScreen.tsx — single-contact AI email
Reached from `ContactScreen`'s "Draft Email." Pick a template (list, no preview here — preview is
farm-only) + tone, `draftEmail` generates subject/body, then opens **one `MailComposer` per
recipient** (recipients = a toggleable multi-select of the parcel's traced emails, at least one
required if any exist; an 800 ms gap between composers on iOS avoids an "already presenting"
crash), or falls back to the share sheet if no Mail account is configured. Params
`{ parcelId, emails }`.

### AccountScreen.tsx — the Account tab
Plan summary (tier + price from config, Closer traces remaining, trial end date), a config-driven
manage-plan link (→ `config.manage_plan_url`, plain text if empty), an editable **agent profile**
(name/brokerage/phone — used to sign AI emails, `updateAgentProfile`), the config-driven data-
broker notice (renders only when non-empty — currently empty, see §10), Logout, and legal links
(tapowner.com/terms, /privacy). When `readOnly`, shows an "inactive plan" amber notice + an "I
reactivated — refresh" button (`refreshMe`).

### LoginScreen.tsx — passwordless OTP
Two-step: email → `requestOtp`, then 6-digit code → `verifyOtp` returns the session token
(`onLoggedIn`). Rendered by `App` when logged out, **outside the navigator** — logged-out users
never mount the stack.

### UpgradeSheet.tsx — the Closer upsell
A modal sheet rendered at the App root whenever `showUpgrade()` fires. Billing CTA opens the web
portal (`config.manage_plan_url`) via `Linking`; falls back to plain text when the URL is empty (so
App Review pushback needs no rebuild). `ErrorBoundary.tsx` wraps the whole app — catches throws and
shows a "Try again" reset (with the raw error message + stack visible) so release builds fail
visibly, not white/frozen.

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
| `config` | `AppConfig` | `GET /config`; `FALLBACK_CONFIG` (hardcoded in `mobile/api.ts`) until it resolves. |
| `features` | `{ draft_email, crm }` | Computed: only when the sub is **usable** (`status` `trialing`\|`active`) AND `config.tiers[me.tier].features`; else both false. |
| `readOnly` | `boolean` | `!usable` (canceled/past_due/expired) → app stays open read-only. |
| `refreshMe` / `logout` / `showUpgrade` | fns | re-fetch `me` / clear token + reset / open `UpgradeSheet`. |

Gate paid actions with `if (!features.X) return showUpgrade();`. Because entitlements are
`config.tiers × me.status`, **tier pricing/features change server-side with no app build.**

**Startup / auth (`App.tsx`):** `authState` = `checking | loggedOut | loggedIn`. On mount: fetch
config (non-blocking) + read the stored token — none → loggedOut; present → `fetchMe` (valid →
loggedIn + `app_open` event; invalid → clear → loggedOut; **network error → loggedOut but the
stored token is left intact**, so a transient offline blip during boot doesn't wipe a good
session — the user just has to retry login, which will read the still-present token again). This
never strands the user on a frozen "Loading…" screen. Location permission is requested only
**after** login (denial never blocks — the map falls back to a default region). Logged-out users
render `LoginScreen` and **never mount the stack**.

---

## 5. The API surface & business logic
API is `api/` (Node 22, Fastify 5, ESM, PostgreSQL 16 + PostGIS on Railway). Deployed via
`railway up --service api --ci`. Public base: `https://api-production-7d11.up.railway.app`.
Boot sequence (`api/src/index.ts`): CORS (allowlists `WEB_BASE_URL` + local dev ports — the mobile
app isn't subject to browser CORS so this only matters for `web/`) → per-IP rate limiting
(`@fastify/rate-limit`, default 100 req/min, env-overridable) → `GET /health` → **12 route plugins
registered in this order**: parcels, tiles, auth, me, billing, partners, trace, draft,
savedProperties, geocode, config, events → the trial-reminder background job starts.

**Endpoints** (auth: **A** = `requireAuth` JWT · **D** = `dataAuth` grace-mode · **admin** =
`x-admin-secret` · **sig** = Stripe signature · **—** = public) — **32 routes total, every one
enumerated below; the smoke test's "anonymous access blocked" check exercises 8 of the A/D ones
directly (§11):**
- **Auth (2):** `POST /auth/otp/request` (—) emails a 6-digit code · `POST /auth/otp/verify` (—)
  code→JWT, upserts user.
- **Me (2):** `GET /me` (A) user + latest subscription · `PUT /me/profile` (A) agent
  name/brokerage/phone.
- **Trace (1):** `POST /trace/:parcelId` (A) — the only charging path (see below).
- **Parcels (3):** `GET /parcels/at?lat&lng` (D) tap→parcel, logs `parcel_viewed` · `POST
  /parcels/within` (A + usable) farm polygon→owners (caps 25 km²/500/50-verts; excludes protected +
  placeholder; JSON or CSV) · `POST /farm/export-log` (A) meter/cap CSV exports (beta free 300/mo).
- **Saved-properties / CRM (6):** `POST` (A+crm, needs a prior trace) · `GET` list + `GET /:id` +
  `GET /export` (**A only — lapsed users keep read-only**) · `PATCH /:id` status + `POST
  /:id/notes` (A+crm).
- **Draft (2):** `POST /draft` (A+draft_email, one traced parcel) · `POST /draft/farm`
  (A+draft_email, one honest-at-scale list letter, criteria whitelisted — see §8). Anthropic Haiku
  (`claude-haiku-4-5-20251001`, server-side key only), 30/day cap; prompts wrap untrusted county
  text in «» as literal-only (injection guard).
- **Billing (3):** `POST /billing/checkout-session` (—, email in body; Closer + 30-day trial +
  referral coupon) · `POST /billing/portal-session` (A) · `POST /webhooks/stripe` (sig, raw-body —
  the only route with a custom Fastify content-type parser, since Stripe's signature check needs
  the exact raw bytes).
- **Partners/referrals (8):** `POST /partners` (admin, creates a partner+code) · `GET
  /partners/:code` + `GET /partners/:code/qr` + `POST /referrals/click` (all —, public) · `GET
  /partners/me/dashboard` (A, a partner's own stats) · `GET /admin/partners` + `POST
  /admin/partners/:id/payout` + `POST /admin/partners/:id/status` (all admin).
- **Infra (5):** `GET /tiles/:z/:x/:yext` (D, PostGIS `ST_AsMVT`, server floor `z>=15`, LRU cache
  max 2000 / 1h TTL) · `GET /geocode?address` (D, Google Geocoding proxied server-side so the key
  never ships to the app, biased to Texas, 200/day/user default cap) · `GET /config` (—,
  whitelisted subset of `products.config`, 60s in-memory cache, `Cache-Control: max-age=60`) ·
  `POST /events` (A, whitelist `app_open`/`contact_saved` only — every other event is logged
  server-side at the moment it actually happens, never trusted from the client) · `GET /health`
  (—, no DB touch).

**Trace & charging (`routes/trace.ts` — the money path).** In order, everything before any vendor
spend:
1. **Free re-view:** a `user_traces` row for `(user, parcel)` → return the cached payload,
   `freeReview:true`, no checks/charge. That row's existence = "already paid."
2. **Usable sub required** for a NEW trace (`trialing`/`active`) — else `402`, checked *before* the
   vendor call so a lapsed account can't incur spend.
3. **$25 metered cap:** only when `closer` AND `included_traces_remaining <= 0`; sums metered
   `charged_cents` for this user in a window anchored to `subscriptions.period_end` minus one
   month (falls back to a rolling 30 days if `period_end` is unset); over cap → `402`. Config key
   `metered_cap_cents`, **confirmed live in `products.config` at 2500** (see §10 correction — a
   prior version of this doc claimed this key was never written; it is).
4. **Compliance rejects:** `is_protected` → `403` (never sent to vendor); placeholder/blank owner
   (`lib/owners.ts` — `"UNKNOWN OWNER"`, `"CONFIDENTIAL"`, punctuation-only strings, etc.) → `403`.
5. **Cross-user cache:** look up `trace_results` by `(parcel_id, sha256(owner_name))` within TTL
   (`trace_cache_ttl_days`, 90). Hit → reuse, no vendor call.
6. **Vendor on miss:** BatchData v3 (`POST https://api.batchdata.com/api/v3/property/skip-trace`).
   **No match → never charged** (inserts nothing into `trace_results`/`user_traces`). Match → one
   `trace_results` row; phones are deduped, ranked (vendor-reachable first, then vendor rank, then
   mobile-over-landline), and carry `dnc`/`tcpa`/`rank`/`reachable`/`tested` when the vendor
   returns them.
7. **Atomic charge decision:** `tryConsumeIncludedTrace` (a guarded `UPDATE … WHERE
   included_traces_remaining > 0`, relying on Postgres's row lock so two concurrent traces can't
   both decrement a balance of 1) → `included` (0¢) or `metered` (29¢, from `trace_price_cents`).
8. **Concurrency gate = the charge record:** `INSERT user_traces … ON CONFLICT (user_id,parcel_id)
   DO NOTHING`. Lost the race → refund the included trace, serve free. **Never billed twice.**
9. **Meter to Stripe** (metered only, only after step 8 is won): `meterEvents.create` with a
   deterministic identifier `trace-${userId}-${parcelId}` (idempotent — a retry or duplicate
   delivery is counted once by Stripe).

Two users tracing the same parcel = **two charges, one vendor call** (shared `trace_results`,
separate `user_traces`). **Nuance worth knowing:** `charged_via` (`'included'` or `'metered'` —
the DB column also allows the literal `'cache'` but **no code path ever writes it**, confirmed by
reading every write to `user_traces`) describes *how this user's own account was billed*, not
whether a vendor call actually fired. Whether the vendor was hit is a *separate* boolean
(`vendorCalled`, logged on the `trace_purchased` event and in the deploy logs) — a cross-user cache
hit still charges the user the normal `included`/`metered` price; only TapOwner's own vendor cost
drops to $0. Don't conflate the two when reading logs or writing new code against this table.

**Entitlements (`lib/entitlements.ts`).** `isSubscriptionUsable` = status `trialing`|`active`
(anything else = lapsed/read-only). `requireFeature(userId, feature, reply)`: not usable → `402`
(trial-expiry screen); usable but tier lacks the feature → `403` (upgrade sheet). `crm` gates
saved-property WRITES (reads are auth-only so lapsed users keep read-only access); `draft_email`
gates both draft routes. Trace + farm gate on *usable* only (tier only decides included-trace
mechanics). Features are pure `products.config.tiers[tier].features` → change with no redeploy.

**Billing / Stripe / commissions (`routes/billing.ts`).** Checkout: Closer price + 30-day trial;
referral attribution if the code is an `active` partner within `attribution_days` (60) and not
self-referral (matched by email); `user_referral`/`founding_agent` codes attach a reusable
100%-off-once Stripe coupon (`user-referral-free-month`, created on first use if missing). Portal:
plan switch + cancel happen in Stripe's own UI (app never touches cards). Webhook (raw-body,
signature-verified) handles `checkout.session.completed` (upsert user+subscription, insert
`referrals` row), `customer.subscription.updated`/`.deleted` (re-upsert; trialing→active logs
`trial_converted`; prospector→closer grants the config's included-trace count immediately, logs
`upgrade_prospector_to_closer`), `invoice.paid`, `charge.refunded`. **Included traces are set only
on subscription INSERT and on the prospector→closer upgrade path** — no mid-period refill; the
reset happens at each `invoice.paid` boundary (only for `closer` tier). **Rewards fire only on a
real paid invoice** (`amount_paid > 0` — skips the $0 trial/coupon invoices), and
`referrals.first_paid_at` is **claimed atomically** (`UPDATE … WHERE first_paid_at IS NULL
RETURNING id` — reward exactly once even under duplicate webhook delivery). give-a-month/
get-a-month credits the referrer's Stripe balance directly via `createBalanceTransaction` (idempotency
keyed to the referral id — no ledger row for this path); affiliates get a `commission_ledger` row
instead — **flat** (`affiliate_flat_cents`, $20, once) or **recurring** (`affiliate_rate` × revenue
computed from `nonMeteredRevenueCents` — every invoice line whose price is NOT
`STRIPE_PRICE_TRACE`, so trace/metered revenue is structurally excluded — capped at
`months_cap ?? affiliate_months`, 12). Refunds insert **negative prorated** clawback rows
(`refundFraction = amount_refunded / amount`, applied to the original commission); payouts
(admin-only) settle all currently-unpaid ledger rows for a partner.
**Confirmed still genuinely unimplemented (checked directly, not assumed):**
`founding_agent_auto_affiliate_at` (config value = 10) is never read by any code in `billing.ts` or
`partners.ts` — a founding agent's 10th paid conversion does **not** auto-promote them to
affiliate today; the config knob exists for a feature that hasn't been built.

**Auth (`routes/auth.ts`, `auth/*`).** Passwordless email OTP: request throttled (1/60s per email,
≤5 unconsumed codes/hr) and **always** returns `{"message":"Code sent"}` regardless of whether the
throttle fired (no account/throttle-state leak); code stored as a sha256 hash (never plaintext),
10-min expiry, ≤5 verify attempts before the code is dead. Verify → upsert `users`
(`product_id='tapowner'`, unique on `(product_id, email)`) → **30-day HS256 JWT** signed with
`JWT_SECRET`, payload `{userId, email}` (the only session mechanism — there is no session table;
a JWT can't be revoked server-side before its 30-day expiry). **Demo bypass for App Review:** when
both `DEMO_EMAIL` and `DEMO_OTP_CODE` (≥6 chars) are set, that one email accepts the fixed code
with no `otp_codes` row involved at all — every other address goes through the real flow.
**Grace-mode `dataAuth`** (`tiles`/`parcels-at`/`geocode`): a syntactically valid-but-unverifiable
token → always `401`; a missing token → allowed **until** `products.config.data_auth_required =
true`, cached in-process for 60s. **Confirmed live: `data_auth_required` is `true` in the
production DB right now** — grace mode is off; every one of these three routes requires a real
token in production today.

**Jobs (`jobs/trialReminder.ts`).** Boot + 30s later, then every 6h: emails `trialing` users whose
`trial_ends_at` falls within `trial_reminder_days_before` (config, 3) days, deduped per-subscription
via a `trial_reminder_sent` event (`props->>'subscription_id'` — so the sweep can never double-
send even across restarts). Email only — a push (APNs) half is deferred to a future build (needs
`expo-notifications`, a native module).

**Cross-cutting.** Email = Resend (`email/resend.ts`) when `RESEND_API_KEY` is set, else a console
logger (`email/console.ts`, dev only). `logEvent` (`lib/events.ts`) never throws — a metrics-write
failure must never break the request that generated it — and backs analytics, the draft/geocode
daily rate caps, the trial-reminder dedupe, and the referral-click counter, all off the single
`events` table. `getProductConfig()` reads `products.config` fresh on every call except where
explicitly cached (`/config` 60s, the `dataAuth` flag 60s).

**A module that exists in `api/src/` but is NOT part of V1:** `api/src/integrations/jobnimbus.ts`
(+ its test file). This is a fully-built, unit-tested (`npm test` runs it) reference module for
pushing a lead into a roofer's JobNimbus CRM — explicitly built ahead of the roofer vertical
(#2), per its own file-header comment. **It is not imported by `index.ts` and has no registered
route.** There is no live JobNimbus account to test against, and its own header warns
`pushLeadToJobNimbus()` must never be called outside a mocked `fetchImpl`. If you're auditing V1
and stumble on this file wondering how it's wired in — it isn't, on purpose. Leave it alone unless
you're explicitly working on vertical #2.

---

## 6. Data model (PostgreSQL + PostGIS)

**Schema source of truth:** `data/*.sql` (phase files, applied in order) plus ad-hoc
production-safe `ALTER TABLE`s from the county-data campaign (see the bulk-DDL rule in
`HANDOFF.md` §3). The API defines **no** DDL (`api/src/db.ts` is just a `pg.Pool`). Multi-product
by design, but **only `users` carries `product_id`** — everything else scopes to a product
transitively via `user_id`. `parcels` and `trace_results` are deliberately **cross-product shared
caches** (no user/product coupling) — a contact purchased by any product's user is a $0-cost cache
hit for every product, per `TAPOWNER_BUILD.md`'s platform note.

**ER at a glance:** `products → users → subscriptions` (Stripe-mirrored) · `users + parcels →
user_traces → trace_results` · `users → saved_properties → notes` · `partners → referrals →
commission_ledger` · `events` (append-only analytics + rate-limit + referral-click log) ·
`otp_codes` (email login, pre-user; no session table — JWTs are the session) · `parcels ←
parcel_signals` (court-record events, read by V1 but written by a separate lane — see below).

**Tables (live schema, confirmed via the read-only DB proxy 2026-07-17; key columns only —
`id`/`created_at` etc. omitted where unremarkable):**
- **`products`** — `id` (PK, `'tapowner'`), `name`, `config` **jsonb = the entire app config**
  (below). One row in production.
- **`users`** — `id`, `product_id` (FK; the ONLY direct product link), `email`, `agent_profile`
  jsonb `{name,brokerage,phone}`, `lifetime_closer` bool. Unique `(product_id, email)`.
- **`subscriptions`** — Stripe mirror; **latest-by-`created_at` wins** (there's no
  "one active subscription" constraint — every route that reads a user's plan picks the newest
  row). `tier` (prospector|closer), `status`, `trial_ends_at`, `period_end`,
  `included_traces_remaining` (atomic decrement; set only on tier-upgrade or subscription INSERT,
  reset each `invoice.paid`). Unique `stripe_subscription_id`.
- **`parcels`** — the county data, **51 columns live** (materially more than early builds had —
  the county-data campaign has been additive). situs/mailing address fields (note: both a combined
  `situs_address`/`mailing_address` text column AND split `situs_street_1/2` /
  `mailing_line1/2` columns exist — `formatSitusAddress()` in `lib/address.ts` is the one function
  that reconciles a possibly-malformed combined value against the structured parts; use it, don't
  read `situs_address` raw), `owner_name` / `owner_name_care`, `is_absentee` (nullable),
  `is_protected` (§25.025 — compliance), `geom` (PostGIS MultiPolygon 4326, GIST-indexed → tap
  `ST_Contains` + farm `ST_Within`/`&&`), the mined "house facts" (`living_area_sqft`, `bedrooms`,
  `baths_full`/`baths_half`, `stories`, `lot_size_sqft`, `has_pool`, `has_garage`, assessed_*,
  `last_sale_date`/`last_sale_price` — TX is a non-disclosure state, so `last_sale_price` is
  effectively always null statewide, see §9), and the **feature/signal columns V1's API actually
  reads**: `improvements` (jsonb, raw CAD improvement labels, kept server-side, never shown
  verbatim to the client), `improvement_tags` (text[], the materialized canonical-tag column —
  preferred source for `tagsForParcel()`), `has_casita`, `has_shed`, `exemptions` (text[], Texas
  exemption codes like `HS`/`OV65` — the source for the tenure/senior "likely to sell" signals via
  `deriveOwnerSignals()`). **Two columns exist on this table that V1 does NOT read anywhere**
  (confirmed absent from `PARCEL_FIELDS` in `parcels.ts` and from `ParcelDetail` in
  `mobile/api.ts`): `effective_year_built` and `roof_material` — these are vertical-2 (roofing)
  data, landing on the shared table ahead of that product's build; ignore them for V1 work.
- **`trace_results`** — cross-product skip-trace cache. `parcel_id`, `owner_name_hash` (sha256 of
  owner at trace time — a changed owner invalidates the cache), `payload` jsonb
  `{phones:[{number,type,dnc,tcpa,rank?,reachable?,tested?}], emails:[{email}]}`, `vendor`
  (`batchdata`), `match_quality`, `fetched_at` (vs `trace_cache_ttl_days`=90). **No
  product_id/user_id** → one vendor call serves every product's users.
- **`user_traces`** — per-user "I unlocked & paid for this parcel." `charged_cents`,
  `charged_via` CHECK (`included`|`metered`|`cache` — `cache` is a defined-but-never-written value,
  see §5). **Unique `(user_id, parcel_id)`** — the concurrency gate guaranteeing no double-billing
  (loser refunded, served free). Existence = re-view is free + draft/save unlocked.
- **`saved_properties`** — mini-CRM; requires a prior `user_traces` row (enforced in the route, not
  a DB FK). `status` CHECK (`new`|`contacted`|`follow_up`|`appointment`|`listed`|`dead`). Unique
  `(user_id, parcel_id)`.
- **`notes`** — `saved_property_id` (FK), `body`, `created_at`.
- **`partners` / `referrals` / `commission_ledger`** — referral system. `partners` (`type` CHECK
  user_referral|founding_agent|affiliate, `code` unique, `comp_model` CHECK recurring|flat, rate,
  months_cap, `status` CHECK active|revoked). `referrals` (partner→referred_user, `first_paid_at`
  claimed once, **unique on `referred_user_id`** — one user can only ever be one partner's
  referral). `commission_ledger` append-only (negative amount = clawback; `stripe_event_id`
  unique — the webhook-idempotency key; `paid_out_at`).
- **`events`** — `user_id` (nullable — some events, like `signup_started` and
  `referral_click`, predate a user existing), `name`, `props` jsonb. Doubles as the referral-click
  counter, the AI-draft/geocode daily rate limiter, and the trial-reminder dedupe.
- **`otp_codes`** — email login codes (`code_hash`, `expires_at`, `consumed_at`, `attempts`).
- **`farm_export_log`** — `user_id`, `rows`, `created_at` (indexed by time) → powers the monthly
  export cap. **5 rows in production** as of this audit — real beta usage, not just test data.
- **`parcel_signals`** — **court-record / public-filing events tied to a parcel** (currently just
  `pre_foreclosure`, from the separate courthouse-signals data-mining campaign). `parcel_id`
  (nullable — some rows are unmatched to a parcel yet), `county_fips`, `signal_type`, `subtype`,
  `event_date`, `source`, `source_ref`, `address`, `lon`/`lat`, `meta` jsonb, `first_seen`/
  `last_seen`. **This table is written by a completely separate lane from V1's app code** (see the
  lane split immediately below) but is **read directly by two V1 routes**
  (`GET /parcels/at` and `POST /parcels/within`, both in `parcels.ts`) — so its data quality is a
  live V1 concern even though V1 doesn't write to it. See §8 for the two invariants this creates
  (the gov-owner guard and the pre-foreclosure recency gate).

**The `parcels` / `parcel_signals` lane split — why two tables, not one (`HANDOFF.md` §3b, the
"two-session contract"):** two workstreams mine Texas county data in parallel and were repeatedly
colliding — a long bulk `UPDATE`/`ALTER` on `parcels` from the county-appraisal-roll campaign once
took the live app down mid-evaluation because a second script's queued `ALTER TABLE` (waiting on
an ACCESS EXCLUSIVE lock) blocked *every* new query against `parcels`, including live user taps.
The fix wasn't better locking discipline alone — it was **structural**: the appraisal-roll campaign
("the Miner") owns `parcels` and never touches `parcel_signals`; the courthouse-signals campaign
("the app session") owns `parcel_signals` and never writes `parcels`. Two tables, two writers, zero
lock contention between them, by construction. If you're ever asked to add a new "signal" (probate,
tax delinquency, evictions, etc.), it goes in `parcel_signals`, not as a new `parcels` column.

**`products.config` (jsonb) — the whole app config.** Confirmed live keys (queried directly
2026-07-17 — this is the actual production row, not a guess from reading `?? fallback` code):
`tiers` (`{prospector: {price_cents:999, included_traces:0, features:{draft_email:false,
crm:false}}, closer: {price_cents:1999, included_traces:10, features:{draft_email:true,
crm:true}}}`), `trial_days` 30, `trace_price_cents` 29, `closer_included_traces` 10,
`trace_cache_ttl_days` 90, `metered_cap_cents` 2500 `[CORRECTED 2026-07-17 — the prior version of
this doc stated "isn't currently written to config"; it IS present and set to $25]`,
`attribution_days` 60, `affiliate_rate` 0.25, `affiliate_months` 12, `affiliate_flat_cents` 2000,
`payout_threshold_cents` 5000, `founding_agent_auto_affiliate_at` 10 (defined but never read — see
§5), `draft_rate_limit_per_day` 30, `draft_input_price_per_mtok` 1, `draft_output_price_per_mtok`
5 (drive the per-draft cost logged on `draft_created` events), `farm_export_price_cents` 10,
`farm_export_beta` true, `farm_export_beta_cap_rows` 300, `data_auth_required` true,
`trial_reminder_days_before` 3. **Keys that exist in code (with a `??` fallback) but are currently
absent from the live config row — meaning production is running on the coded default, not a DB
override:** `manage_plan_url` (falls back to `https://tapowner.com/billing`), `data_broker_notice`
(falls back to `""` — empty; consistent with the TX Data Broker Act registration still being
pending, see §10), `geocode_daily_limit` (falls back to `200`). None of this is a bug — it's just
worth knowing which knobs have actually been turned versus which are still sitting on their
in-code default. **`subscriptions.status` usable = `trialing` OR `active` only** — anything else
(`past_due`, `canceled`, `incomplete`, …) → 402 + read-only mode app-wide.

---

## 7. Core flows end-to-end

**Single prospect:** map → tap parcel → `PropertyCard` (owner free; badges for absentee/pool/
garage/portfolio/senior/tenure/pre-foreclosure; `already_unlocked` sets the button) → "Contact this
person" → `ContactScreen` auto-traces (charge decided server-side; included traces first, then 29¢
metered, no-match free, re-view free) → phones/emails with badges → Draft Email (own Mail app) /
Save to CRM / Save to Contacts / Share.

**Farm / Reverse Prospecting:** map → draw polygon → `/parcels/within` → `FarmResultsScreen` →
Refine (physical filters + signal filters: sqft/beds/baths/pool/single-story/feature tags/tenure/
senior/pre-foreclosure) → Actions → **Unlock remaining** (loops traces) → Actions again → **Email
owners** (`FarmDraftScreen`, template preview → per-owner Mail, physical-criteria-only in the
letter) / **Add to Contacts** (one card each) / **Save to CRM** / **Export for a direct-mail
campaign** (cost-confirm → CSV, which DOES include the traced phones/emails and the signal
columns — see the bulk-export guardrail in §8).

**CRM:** any Save-to-CRM writes `saved_properties` (needs a prior trace) → `PipelineScreen` list →
`PipelineDetailScreen` (facts + paid contacts + status + chronological notes). Read-only if lapsed.

**Referral/commission (web + admin):** `/r/{CODE}` → localStorage attribution (60-day window) →
carried into Stripe Checkout → `referrals` row on signup → activated on first paid invoice →
commission ledger entry (affiliate) or a Stripe balance credit (user_referral/founding_agent).
Three partner types (user_referral give-a-month, founding_agent lifetime-Closer + the same
give-a-month loop, affiliate 25%/12mo or $20 flat). Managed at `/admin` (Frederick, admin-secret
gated); partners see their own numbers at `/partner` (their own OTP login). Details in
`BRAND_AND_PRODUCT_BRIEF.md` §3 and `HANDOFF.md`.

---

## 8. Invariants & guardrails (do NOT quietly break these)

**Compliance (see `TAPOWNER_BUILD.md` pre-launch legal gate + `HANDOFF.md`):**
- **DNC + litigation-risk flags are mandatory** in the trace UI — never config-off. There is no
  config flag that suppresses them; the rendering is unconditional on the vendor's `dnc`/`tcpa`
  booleans. Keep it that way.
- **No dialer, no mass texting, no robocalls.** Contact is one-at-a-time; email is one-to-one from
  the agent's own account (never blasted from our servers — CAN-SPAM / Resend ToS hard line). Both
  `DraftEmailScreen` and `FarmDraftScreen` open one native `MailComposer` per recipient, never one
  message to a list.
- **Protected records** (Texas Tax Code §25.025, `is_protected`) are never traced (`trace.ts`
  rejects before any vendor call) and never appear as contactable in a farm result
  (`is_protected = false` is a hard `WHERE` clause in `/parcels/within`).
- **FCRA**: the product is not a consumer report; ToS forbids tenant/employment/credit/insurance
  uses (confirmed present in `web/app/terms/page.tsx`). Don't add features that invite those.
- **Privacy promises** (live on the site): we never read the user's address book — every
  "save to Contacts" flow, single or bulk, uses `Contacts.presentFormAsync` (a native blank-card
  hand-off, no permission grant) rather than `Contacts.addContactAsync` (which would need
  read/write address-book access). GPS isn't stored server-side; contact data is cached ~90 days.
- **Honest-at-scale**: farm/list outreach must never claim a specific committed buyer — the exact
  server-side prompt rule (`draft/templates.ts`, `buildFarmDraftPrompt`) says *"never claim
  anything specific to one house, and never claim a specific committed buyer — if the goal
  involves a potential buyer, say the agent 'may have' a motivated, qualified buyer"* and *"Open
  with a generic respectful greeting… no names."*
- **The outreach-ethics rule, exactly as it's enforced in code (not just policy):** seller-signal
  data (tenure, senior/homestead exemption, pre-foreclosure, and any future "likely to sell"
  signal) may be used to **select** which homes are on a farm list, but must **never reach the AI
  draft as content**. This is built as a **whitelist, not a blacklist**, in two independent places
  so a missed filter in one doesn't leak the data: (1) client-side, `FarmResultsScreen` builds the
  `FarmCriteria` object sent to `/draft/farm` from exactly `{min_sqft, min_beds, min_baths, pool,
  single_story}` — there is no code path that adds a signal field to that object; (2) server-side,
  `POST /draft/farm` in `draft.ts` independently re-constructs its own `criteria` object from the
  request body using the identical five-field whitelist, with an explicit in-code comment: *"Do
  NOT add signal fields here."* **If you're ever asked to let an agent filter or draft on a new
  signal (probate, divorce, tax delinquency…), the filter is fine — the draft whitelist is the one
  line you must NOT touch.**
- **Bulk phone export is legally sensitive** — the farm CSV currently includes traced phones/
  emails; this is on the attorney's list (vendor addendum + TCPA). Don't expand bulk-export of
  phone data without flagging it to Frederick first.

**Two data-integrity invariants specific to `parcel_signals` (read by V1, written by a separate
lane — see §6):**
- **The gov-owner guard exists only at write-time, not read-time.** Every loader that writes to
  `parcel_signals` (`api/scripts/signals/*.mjs`) filters out government-owned parcels before ever
  inserting a row — a shared regex (`GOV_OWNER`/`GOV_OWNER_RE`, matching things like `COUNTY OF`,
  `CITY OF`, `ISD`, `MUD`, `HOSPITAL DIST`, `SCHOOL DIST`…) is applied against `owner_name` so a
  courthouse or a school district can never be tagged as a pre-foreclosure. **`api/src/routes/
  parcels.ts` — the code that actually surfaces `event_signals` to the app — does no such
  filtering itself; it trusts every row in `parcel_signals` unconditionally.** If a future loader
  (or a manual `INSERT`) writes to this table without applying that guard, the bad row will render
  straight into the app with nothing in V1's own code to catch it. This has already caused and
  been fixed as real false positives in production once (a courthouse and a "City of X" parcel).
- **A `pre_foreclosure` signal is only "pre" while the sale date is still ahead of today.** Both
  `GET /parcels/at` and `POST /parcels/within` independently apply the exact same clause —
  `signal_type <> 'pre_foreclosure' OR event_date >= current_date` — before a row counts as an
  active badge/filter match. Rows for a past auction date are **not deleted** (the history stays
  in the table for a future "recent foreclosure" feature), they just silently stop matching. This
  logic is duplicated in two route handlers rather than centralized — if a third route or a new
  signal-consuming query is ever added, it must repeat this same date guard, or a stale
  "Pre-foreclosure" badge will reappear on a property whose sale already happened (owner may have
  changed by then — an honesty problem, not just a cosmetic one).

**Fill-on-blank data integrity (`api/src/cadattr/`):** the background job that fetches beds/baths/
sqft/year from a live CAD API for counties with no usable bulk file (`FILL_SOURCES` currently
covers **Tarrant, Ellis, Denton, and Travis** `[CORRECTED 2026-07-17 — a prior version of this doc
and of CURRENT_STATE.md/HANDOFF.md said only Tarrant + Ellis; Denton and Travis were added in a
later commit, `77826ef`, which IS inside the frozen V1 tag]`) writes with `COALESCE(existing,
new)` on every field, **never a plain overwrite**. This is deliberate: it guarantees a slower/
worse per-property API guess can never clobber a better value that a bulk county load already
established. If you ever touch this UPDATE, keep the COALESCE — a plain `SET bedrooms = $2` would
silently regress data quality for any county that later gets a real bulk load.

**A meta-invariant about the safety net itself:** `api/scripts/smoke_v1.mjs` deliberately **strips
`TRACE_PROVIDER`, `BATCHDATA_API_TOKEN`, `BATCHDATA_SANDBOX_TOKEN`, `TRACE_PROVIDER_API_KEY`, and
`RESEND_API_KEY`** from its child process's environment before booting the API, specifically so
the smoke test can **never** spend real skip-trace vendor money or send a real email, no matter
what's in the ambient environment. Do not "fix" this by re-adding those vars to make the trace
check "more real" — that would turn a free, safe, run-anytime health check into something that
silently costs money or emails a real inbox on every run.

**Trace economics (§5 discipline):** included traces consumed first (atomic), $25/cycle metered
cap (confirmed live), no-match never charged, re-view forever free, protected/placeholder owners
never traced.

**Brand vs app palette — important:** the **marketing site** (`web/`) is brand **navy `#052158` +
orange `#F27F09`** (confirmed live in `web/app/page.tsx`/`footer.tsx` via `brand-navy`/`brand-
orange` Tailwind theme tokens — see `BRAND_AND_PRODUCT_BRIEF.md`). The **iOS app** (`mobile/`)
still uses a **functional palette** — blue `#2563eb` (primary/links/active tab), near-black
`#111827` (dark buttons/text), green `#16a34a` (success / "Free" / selected), red `#b91c1c`/
`#fee2e2` (DNC / destructive), grays. The app has **not** been rebranded to navy+orange (confirmed
by reading every screen's `StyleSheet` — all still use the blue/near-black palette). Don't "fix"
app blues to brand navy unless Frederick asks.

**Data sources:** parcels/owners = public county records, originally seeded from **TxGIO
StratMap** and enriched with real county-appraisal-roll attribute data (informational use).
Contact data = **BatchData** (licensed, DNC-scrubbed), resold per-lookup. BatchData reseller terms
are informal only (see `HANDOFF.md` decision log) — a legal-gate item, see §10.

---

## 9. The WHY behind non-obvious decisions

A future editor who doesn't know these will make locally-reasonable changes that are actually
wrong. Read this before "fixing" anything that looks like an oversight.

- **Why there's no sale price on almost any parcel.** Texas is a **non-disclosure state** — county
  appraisal districts are not legally required to (and mostly don't) publish sale price in their
  public rolls. `last_sale_price` exists as a column and is populated where a county happens to
  publish it (Hill County is the one confirmed exception, per `HANDOFF.md`'s county-mining log),
  but statewide it is effectively always null. This isn't a data-pipeline gap to "fix" — it's a
  structural fact about Texas real property records. It also directly blocks a planned signal
  ("neighbor sold high") that needs a comparable sale price to work.
- **Why `parcels` and `parcel_signals` are two tables, not one.** Covered in full in §6 — in
  short, a real production outage (a queued `ALTER TABLE` blocking every live query) forced a
  structural fix: separate tables, separate writers, so two parallel data-mining lanes can never
  lock-contend on the same table again.
- **Why pre-foreclosure is a live query filter, not a stored boolean.** A `parcel_signals` row is
  never "expired" or deleted when its sale date passes — instead, every reader applies `event_date
  >= current_date` at query time (§8). This means the badge is always correct **the moment you
  read it**, with no background job needed to flip a flag before it goes stale, and the history is
  preserved for a possible future "recent foreclosure" category — at the cost of that date-guard
  clause needing to be replicated wherever the signal is consumed (a real footgun, flagged in §8).
- **Why year-built (and most house facts) are a "nice to have," not a launch blocker.** The
  original data source (TxGIO StratMap) never carried living area, beds/baths, stories, pool, or
  sale price/date for *any* county — confirmed against the real files in `PROGRESS.md`'s Phase-1
  notes. `TAPOWNER_BUILD.md` Phase 1 explicitly designs for this: *"Null, don't guess, any field a
  given county doesn't publish."* V1 shipped and passed its Phase-1/4 acceptance tests with those
  fields legitimately blank, and the subsequent county-mining campaign has been additive
  enrichment on top of a product that already worked without it — not a prerequisite that blocked
  launch.
- **Why skip-trace billing goes through Stripe metered usage instead of a real $0.29 charge.**
  Stripe's fixed per-transaction fee (~$0.30) would exceed a standalone 29-cent charge, making it
  *negative* margin. `trace.ts` never creates a standalone charge for a trace — it either consumes
  an included-trace slot (free to the user right now, already paid for in the subscription) or
  reports a Stripe metered usage event that gets billed once, in bulk, on the next invoice.
- **Why the app has a demo-account bypass in `/auth/otp/*`.** Apple's App Review needs a login
  that actually works without receiving a real email. Rather than compromise the OTP flow's
  security model for everyone, a single reserved email/code pair (env-var gated, off unless both
  vars are set) skips the OTP table entirely — every other address is unaffected.
- **Why a lapsed/canceled subscription still gets to *read* their CRM data.** This was a
  deliberate reversal of an earlier "hard lock" design (see `HANDOFF.md`'s decision log) —
  Frederick's call: read-only access to data you already paid to collect is a reactivation hook,
  not a giveaway; only *new* spend (traces, drafts, new saves) requires an active plan.
- **Why farm CSV export has a monthly row cap instead of a per-export cap.** A per-export cap is
  trivially defeated by exporting in smaller batches; a monthly cumulative cap
  (`farm_export_beta_cap_rows`, tracked in `farm_export_log`) can't be gamed that way.
- **Why `improvements`/raw CAD labels never reach the client.** County improvement-type codes are
  inconsistent, sometimes cryptic, and occasionally wrong (e.g., a "Detached=3" field that turned
  out to mean building *levels*, not additional structures — a real false lead documented in
  `PROGRESS.md`). Rather than expose that noise, the server derives a small canonical tag
  vocabulary (`lib/improvementTags.ts`, the crosswalk) and only ever ships the clean tags —
  keeping the messy source data as a server-side implementation detail that can be corrected
  without an app release.
- **Why "generic garage" was deliberately removed as a farm filter tag** (but the boolean
  `has_garage` still drives the property-card Yes/No row): Frederick's own street is almost
  uniformly attached-garage, so a plain "has a garage" filter matched nearly everything and told
  him nothing useful — only *detached* garage (`garage_detached`) discriminates, so that's the tag
  that survives as a filter chip.

---

## 10. V1 status: DONE vs PENDING

*(Business/data numbers below are sourced from `CURRENT_STATE.md`'s most recent audit,
2026-07-16/17 — a living document owned jointly by the product and data-mining sessions. This
Bible doesn't re-verify millions of parcel rows itself; it re-verified the **code** that reads and
writes them. Re-check `CURRENT_STATE.md` directly before a business decision that hinges on an
exact coverage number.)*

**DONE — the product works, end to end, and is code-frozen at the V1 tag:**
- All 10 build phases from `TAPOWNER_BUILD.md` §4 have shipped and were device-verified by
  Frederick; Phase 10 (polish/compliance/App Store) is code-complete but the *submission* step
  (App Store review) hasn't happened — see Pending.
- Statewide parcel data: 253/253 loadable Texas counties, ~14.3M parcels, ~97% owner-name
  coverage (the remaining gap is almost entirely §25.025 protected records, not a data hole).
- The full core loop (this doc's §5/§7) is live in production and covered end-to-end by `npm run
  smoke` — 13 automated checks, see §11.
- The county attribute "data moat" (sqft/beds/baths/pool/etc) has any-signal coverage on the large
  majority of counties (231/253 per the last refresh) via a mix of free bulk CAD rolls and the
  live-API fill-on-blank path (§6/§8), at $0 vendor cost.
- Reverse Prospecting (farm mode), the mini-CRM, AI drafting (7 templates × 3 tones), the referral/
  commission system, and the web signup/billing/admin/partner surfaces are all built and verified.
- Seller-signal filters (tenure, senior/homestead, pre-foreclosure) are live in both the property
  card and the farm filter panel, sourced from data the county roll and a public-records campaign
  already deliver for free.

**PENDING — business/legal, explicitly NOT a code or data gap:**
- **Stripe is in TEST mode**, not live. Blocked on Frederick's LLC → EIN → business bank account
  chain (all still in progress as of the last handoff).
- **The full pre-launch legal gate** (`TAPOWNER_BUILD.md`'s compliance appendix) is open:
  attorney review of ToS/privacy policy, Texas Data Broker Act registration (SOS Form 4001,
  triggers the `data_broker_notice` config text once done — currently empty, see §6), E&O + cyber
  liability insurance, and a **signed** BatchData reseller/redistribution addendum (as of the last
  handoff, only an informal "won't sue at this volume" AE email exists — not a binding right to
  resell their data to end users).
- App Store **submission** hasn't happened yet — TestFlight-only distribution to founding agents
  so far; the demo account and App Review notes are ready (`review@tapowner.com`, static OTP code
  in Railway env) but the actual submission is a still-future step.
- A short, genuinely-open engineering backlog exists (none of it launch-blocking) — see
  `CURRENT_STATE.md`'s "ranked fix backlog" for the current list; as of the last refresh it was:
  the contact-save-shows-success-on-cancel bug (§3), a non-timing-safe admin-secret comparison,
  Fastify `trustProxy` unset (per-IP rate limits are effectively global), and a handful of small
  hygiene items (style duplication, a hardcoded default draft tone, `charged_via='cache'` never
  written, no schema-migration tracking directory, the founding-agent auto-promote gap noted in
  §5, no in-app data disclaimer, no per-vendor-call cost/latency logging).

---

## 11. The safety kit + dev & ship rituals

### The safety kit (read this before touching anything V1)

1. **The frozen reference point:** git tag **`v1-realtor-audited-2026-07-17`**. Diff your working
   tree against it (`git diff v1-realtor-audited-2026-07-17 -- api/src mobile web/app`) any time
   you want to know exactly what's changed since this document was last verified against the code.
2. **The tripwire: `cd api && npm run smoke`** (`api/scripts/smoke_v1.mjs`, ~10s). Boots the
   **current source tree** (via `tsx`, not a stale deploy) against the real production database,
   using a dedicated fixture user (`v1-smoke-test@tapowner.com`, reset to a known-good state and
   swept of its transactional rows every run — never touches Frederick's or the demo reviewer's
   data). **Cannot spend real vendor money or send real email** — see the meta-invariant in §8.
   Prints a PASS/FAIL table and exits nonzero on any failure. Run it before *and* after any change
   to `api/src`, the DB schema, or `products.config`. **The exact 13 checks it runs, in order:**

   | # | Check | What it proves |
   |---|---|---|
   | 1 | API boots + `/health` | The current source tree starts cleanly |
   | 2 | `/config` shape | Config route serves tiers + trace price + draft templates |
   | 3 | Auth: OTP round-trip (demo account) | `/auth/otp/request` + `/auth/otp/verify` really work |
   | 4 | Anonymous access blocked on data/write routes | 8 core routes all correctly 401 with no token — proves they're registered *and* gated |
   | 5 | Owner lookup — `GET /parcels/at` | Map-tap → owner, the free core moment |
   | 6 | Pre-foreclosure signal surfaces — `GET /parcels/at` | The signal join + recency gate (§8) work |
   | 7 | Farm-area query — `POST /parcels/within` | Reverse Prospecting's core query |
   | 8 | Vector tile — `GET /tiles/:z/:x/:y.mvt` | The map actually renders parcel boundaries |
   | 9 | Geocode — `GET /geocode` | Address search |
   | 10 | `/me` reflects session + entitlements | Tier/status drive the app correctly |
   | 11 | Trace unlock — `POST /trace/:parcelId` | The $0.29 charge path, included-trace branch (cache-seeded — never calls the real vendor or Stripe) |
   | 12 | AI outreach draft — `POST /draft` | A real Anthropic call produces a usable subject+body |
   | 13 | Mini-CRM — save / list / detail / status / note | The whole CRM round-trip |

   Verified (by the session that built it) to actually catch breakage: temporarily disabling a
   route registration turned the trace/draft/CRM/401 rows red immediately.
3. **If it's green, V1's core loop is intact.** If it's red, the failure message tells you which
   step and why — fix that before doing anything else.

### Typecheck (do this before every build/deploy)
PowerShell blocks `npx`; call tsc via node:
```
node "C:/Users/danzo/Tapowner/mobile/node_modules/typescript/bin/tsc" --noEmit -p "C:/Users/danzo/Tapowner/mobile/tsconfig.json"
node "C:/Users/danzo/Tapowner/api/node_modules/typescript/bin/tsc"    --noEmit -p "C:/Users/danzo/Tapowner/api/tsconfig.json"
```
`api/` also has a small regression test suite: `cd api && npm test` (runs the True-Prodigy parser,
improvement-tags crosswalk, owner-signals, address-formatting, and JobNimbus-mapping unit tests —
`tsx --test` over 5 files).

### Ship the mobile app (TestFlight)
```
cd mobile && npx expo-doctor            # expect 18/18
npx eas-cli build --platform ios --profile production --auto-submit --non-interactive
```
Build ~4 min → auto-submit ~2 min → Apple processing ~5–10 min → appears in TestFlight. App is
`1.0.0 (<build#>)`; EAS auto-increments the build number. Export-compliance is pre-declared
(`app.json` `ITSAppUsesNonExemptEncryption: false`) so builds don't stick on "Missing Compliance."

**Stack (verify before SDK/dependency work — confirmed live in `mobile/package.json` 2026-07-17):**
Expo **SDK 54** (`expo ^54.0.35`), React Native **0.81.5**, React **19.1.0**, TypeScript **5.9.2**.
Map = `@maplibre/maplibre-react-native` v11.3.6 + OpenFreeMap. Nav = React Navigation 7. Per
`mobile/AGENTS.md`, read `docs.expo.dev/versions/v54.0.0/` before touching Expo APIs — this SDK
differs from older training data.
- **If the auto-submit stalls** (EAS Submit outages happen): re-submit client-side by build id,
  which works during outages: `npx eas-cli submit --platform ios --id <buildId> --non-interactive`.
- Check builds: `npx eas-cli build:list --platform ios --limit 2 --non-interactive`.

### Deploy the API
From repo root: `railway up --service api --ci` (NEVER `railway redeploy` — it restarts the OLD
image). Verify: `curl <base>/health` → 200 and `/config` contains `"tiers"`. Then re-run
`npm run smoke` against production if the change touched anything the smoke test covers.

### Which changes need what
- UI text, layout, client logic, `templatePreviews.ts` → **mobile build only.**
- New/changed `/config` field the app reads (like `farm_export`) → the server already sends it;
  add to the mobile `AppConfig` type + `FALLBACK_CONFIG`, **build only** (no deploy) **unless** you
  also changed what the server emits.
- New/changed endpoint or response shape, trace/billing/entitlement logic → **API deploy + build.**

### Config-driven knobs (flip in `products.config` jsonb — no redeploy, `/config` caches 60s)
trace price, metered cap, farm export price/beta/cap, rate limits, `manage_plan_url`,
`data_broker_notice`, `data_auth_required`. **Reading the config live (read-only, from `api/`):**
```
INTERNAL=$(railway variables --service api --kv | grep '^DATABASE_URL=' | cut -d= -f2-)
PROXY=$(echo "$INTERNAL" | sed 's#db.railway.internal:5432#tokaido.proxy.rlwy.net:54841#')
```
Node one-offs against the DB must run from `api/` (the `pg` module lives there); delete any
`_tmp_*.mjs` scratch script after use and never print secrets.

### Git
Commit to `main` (solo-dev project norm), push to `github.com/danzoy-ship-it/tapowner`. **Never**
`git add` the untracked **`admin commission access.txt`** at repo root — it may hold the admin
secret. Stage explicit paths, not `-A`.

### Windows quirks
PowerShell blocks `npx` (use the Bash/Git-Bash tool or `cmd`); heredocs mangle backslashes; run
`pg`/node DB scripts from `api/`; background commands cap ~10 min; Git Bash's `/tmp` is not
`C:\tmp` — Node resolves the latter and will `ENOENT` on the former.

### Two-session model
A **data session** owns county mining / loaders / `parcels` / `parcel_signals` writes; the **app
session** owns the app + product + UX (this doc's domain) and reads/surfaces `parcel_signals`
without writing it. Keep the roles separate — don't route app-UX surgery to the data session. They
share one working tree (no `git pull` between them), so **coordinate before builds/deploys** (only
one EAS build in flight at a time; tell the other session what you shipped).

---

## 12. The other docs & when to read them
- **`TAPOWNER_BUILD.md`** — the original spec / source of truth: architecture, build phases, the
  pre-launch legal & compliance gate, the referral model §5b. Read for "what were we originally
  supposed to build / what are the non-negotiable rules." Some specifics have evolved past it
  (e.g. it specs 5 draft templates; the shipped product has 7) — that's normal evolution, not a
  contradiction; this Bible is the current truth on anything that's drifted.
- **`BRAND_AND_PRODUCT_BRIEF.md`** — brand (navy+orange, real logo assets), full product story with
  Reverse Prospecting as flagship, canonical commission/promo model. Read before any
  marketing-site, brand, or referral-portal work.
- **`HANDOFF.md`** — the ops runbook: deploy/build/DB rituals, the county data campaign queue, the
  **decision log** (the "why," in more granular day-to-day detail than §9 above), Frederick's open
  business items, ranked next actions. Keep current.
- **`CURRENT_STATE.md`** — ground truth of what actually works right now, and the current data-
  coverage scoreboard. This is the doc to check for an up-to-the-day number; this Bible's §10
  intentionally cites it rather than duplicating numbers that go stale fast.
- **`PROGRESS.md`** — the full running build log, one entry per work session. The best source for
  "why does this weird-looking piece of code exist" if §9 doesn't already answer it.
- **Project memory** (`.claude/.../memory/`) — loads into every session on this machine:
  Frederick's working style, Windows quirks, the session-start ritual, the BatchData position.

---

*Keep this Bible honest and current. If you change how a screen or route works, or make a product
decision, update the matching section here (and log the "why" in `HANDOFF.md`/`PROGRESS.md`). If a
change means V1's source is no longer byte-identical to the `v1-realtor-audited-2026-07-17` tag,
say so explicitly at the top of this file rather than leaving the stale freeze claim in place — the
next zero-memory session needs to know whether "the tag" or "current `main`" is the ground truth.
A future session — or a future you — will be grateful.*
