# TapOwner — CURRENT STATE (ground truth)

**Purpose:** the one honest snapshot of what actually works vs. what was only claimed.
Rewrite the top section every working session. If a phase says "PASSED" in PROGRESS.md
but isn't in the "Verified" table here with evidence, treat it as unverified.

**Last updated:** 2026-07-16 (full project sanity check — 3 parallel read-only audit
agents verified every section below against live code/git/DB, not against the prior
version of this doc. The prior "2026-07-14" version was ~2 days and 100+ commits stale
on data-coverage numbers specifically — see the scoreboard section for the scale of that
drift as a caution against trusting this doc uncritically either; re-verify before a
big decision.)

---

## THE ORIGINAL INTENT (never drift from this)

TapOwner (`TAPOWNER_BUILD.md` is still the constitution): an iPhone app for Texas real
estate agents — tap any property → owner of record FREE → $0.29 unlocks phone/email →
AI-drafted outreach + mini-CRM. Two tiers (Prospector $9.99 / Closer $19.99, 30-day Closer
trial, card required). Core is vertical-agnostic (roofing app is vertical #2 later).
Frederick decides money/business; Claude decides technical; no "PASSED" without on-device
proof; costs stated before incurring them.

## WHERE IT IS RIGHT NOW

**The app is feature-complete for founding-agent beta and hardened. Latest build: #22**
(commit `38182f2`, 2026-07-15 — courthouse-signal badge/filter UI). **Frederick has
personally tested every build/functionality thoroughly on-device** (confirmed directly
by him 2026-07-16) — this was simply never logged per-build in PROGRESS.md, which is
why the doc/commit trail alone couldn't confirm it (a documentation gap, not a real
product-quality gap). **What genuinely hasn't happened yet: founding agents have NOT
been given TestFlight access.** This was deliberate — Frederick didn't consider the app
ready to share until now. He's decided he's ready and wants to invite them **primarily
to generate buzz/momentum, not for their testing help** (he doesn't need it). A one-time
reminder is scheduled for 2026-07-16 10:00 AM Central to prompt him to send the invites.

**Phases 0-9 of the original 10-phase build (TAPOWNER_BUILD.md §4) are all DONE and
device-verified.** Phase 10 (polish/compliance/App Store) is PARTIAL: TestFlight-only,
**not yet submitted to Apple for public review** (that's still a future step, not done).

**The 2026-07-14 "ranked fix backlog" (A-F below) is almost entirely resolved** — of
~30 tracked items, only 6 are still genuinely open (confirmed by direct code read, not
assumption): E3 (contact-save shows "✓" even if the user cancels), C4b (admin-secret
compare is not timing-safe; `trustProxy` still unset so per-IP rate limits are effectively
global), and 4 hygiene items (hardcoded draft tone, `is_absentee` city/state-only,
`charged_via='cache'` never recorded, no schema-migration tracking, founding_agent
auto-promote-at-10-conversions never implemented, no in-app data disclaimer, no
per-vendor-call cost/latency logging). None are launch-blocking; see the updated
backlog section for the full resolved/open breakdown.

**A whole new workstream exists that predates this doc: the COURTHOUSE-SIGNALS
campaign** (pre-foreclosure, and later probate/tax-delinquency/etc.), running in
`parcel_signals` — a table separate from the CAD `parcels` table by design (two-session
no-collision rule, HANDOFF §3b). As of 2026-07-16: **71 foreclosure sources live
(1 ArcGIS + ~65 CivicPlus/CivicLive/Granicus/WordPress/AgendaSuite/etc. PDF counties +
Collin [368 tied, 100%, coordinate-based] + Travis [sample] + Kofile [paywall-limited,
~60 tied across Dallas/Denton/Nueces]), ~1,950+ foreclosures tied to real parcels**,
zero gov-owned false positives, surfaced as a "Pre-foreclosure" badge/farm-filter in the
app (only while the sale date is still pending — past auctions correctly drop the label).
Still expanding; see PROGRESS.md for the latest wave count. Kofile's biggest lever
(a `returnAddress` join, code-complete but untested) needs a clean/cellular IP to validate.

Farm mode grew into **Reverse Prospecting**: draw area → filter by beds/sqft/pool/stories/
tenure/senior-owner/pre-foreclosure → one-button Contact owners (auto-unlock w/ cost
confirm → phones-first, emails secondary, ≤15 or CSV mail-merge) → criteria-woven AI
letter (ethics rule: signal fields like tenure/pre-foreclosure are structurally excluded
from ever reaching AI draft copy). Export pricing: 10¢/row at launch; evaluator mode now
= free, 300 rows/month. tapowner.com is live. Apple demo account live
(review@tapowner.com, code in Railway env).

**Stripe is still TEST MODE** (confirmed via `api/.env` prefix check) — blocked on
Frederick's LLC → EIN → business bank chain, all still pending. The full pre-launch
legal gate (attorney ToS review, TX Data Broker Act registration, insurance, and
specifically the BatchData vendor-redistribution addendum — still only an informal
AE "won't sue ≤40k records/mo" email, NOT a signed reseller right) remains open.

**Data moat (Frederick's active priority):** building attributes mined from FREE county
sources — see scoreboard below. `parcel_viewed` events log per-card attribute gaps so the
buy-vs-build API decision is made from real usage (~2-4 weeks of data; paid API assessed
and declined 2026-07-14 — unit economics + scraped-source legal risk).

**True Prodigy fill-on-blank — LIVE + verified for Tarrant + Ellis (2026-07-15, app session).**
For counties whose beds/baths sit only behind TP's per-property API, the app fetches + caches them
on first tap of a null-beds parcel (`api/src/cadattr/`, deployed). Verified live end-to-end through
the deployed endpoint: Tarrant `250-3-14` → 3bd/2ba, Ellis `300915` → 4bd/3ba. Parser reads
digit / spelled-word / `1/2`-fraction counts and rejects code-values (`Number of Bedrooms: 91`).
Probing all 7 flagged TP metros showed **only Tarrant + Ellis expose beds via the API**; Travis /
Denton / Montgomery / McLennan / Johnson are data-session (bulk/PIA). Details in PROGRESS + HANDOFF.

## WHERE IT'S GOING (near-term order)

1. **Keep mining counties** (standing order): El Paso, Galveston, Brazoria, Bell, McLennan,
   Nueces, Lubbock, Smith next; the recipe is in Task #11 and the loaders in `data/`.
2. **Pending county arrivals:** ~~BCAD (Bexar beds/baths/pool/casita)~~ **SUPERSEDED
   2026-07-15** — a SARA regional ArcGIS republication of BCAD's own data delivered
   beds/baths/pools/casitas for all of Bexar for free the day after this line was
   written; the PIA was never needed for this data (verified live 2026-07-16: 41,162
   pools / 13,269 casitas / 587K beds+baths county-wide; Frederick's own house confirms
   pool+spa+garage). What Bexar STILL genuinely lacks: sale-date and exemption signals
   (0% coverage, verified live) — the seller-signals retrofit hasn't reached it yet.
   Also pending: Tarrant PIA + Travis code-legend (drafts given) · Comal + Guadalupe PIA
   (texts given, Frederick sending).
3. **Business chain (Frederick, reminder running):** LLC → EIN → bank → Stripe live mode;
   legal gate (attorney ToS review, TX Data Broker reg, insurance, BatchData addendum).
4. **Then:** App Store submission (demo account + review notes ready; builds proven).

## COUNTY ATTRIBUTE SCOREBOARD (verified live against the DB 2026-07-16 — the table below
this doc used to carry was already 2 days / ~110 `data/` commits stale; per-county detail now
lives in `COUNTY_COVERAGE.md`, which the Miner session regenerates and owns — this section
is topline-only so it can't drift the same way again)

**Statewide, of 14,336,257 parcels (253/253 counties loaded geometrically):**

| Marker | Count | % of all parcels |
|---|---:|---:|
| Living area (sqft) | 8,240,069 | 57.5% |
| Bedrooms | 3,938,392 | 27.5% |
| Full baths | 5,059,948 | 35.3% |
| Has pool | 738,322 | 5.2% |
| Last sale date | 6,266,449 | 43.7% |
| Exemptions (HS/OV65/etc.) | 2,516,038 | 17.6% |
| Improvement tags (pool/garage/casita/etc.) | 5,565,250 | 38.8% |

**Counties with ANY attribute signal: 231 of 253 (91.3%)** — up from 29 two days ago. By
CAD-system family (see `data/DATA_ACCESS_CRACKS.md`): True Prodigy, BIS Consultants
(~45 counties), SWData, and the generalized PACS/Pritchard&Abbott loader are all cracked
and reusable — adding a new county on a known system is now a config change, not new
engineering. Sale PRICE remains essentially $0 statewide (TX is non-disclosure; Hill
County is the one known exception with real `sl_price` data).

**Records-request queue (genuinely free-source-exhausted, not just unattempted):**
Tarrant (beds/baths — confirmed policy-withheld), Collin (feature-tag segments), plus 10
counties confirmed structurally gated in the 2026-07-16 pass: Anderson, Wharton, Hopkins,
Montague, Goliad, Palo Pinto, Floyd, Red River, Lipscomb, Winkler. **Standing order:**
no PAID records requests; even $0-fee electronic PIAs are parked pending the
`parcel_viewed` felt-gap checkpoint (~2026-07-28). **Bexar's BCAD PIA was SUPERSEDED
2026-07-15** — a free SARA regional ArcGIS republication of BCAD's own data delivered
beds/baths/pools/casitas for essentially all of Bexar the day after the PIA was sent; the
PIA was never needed for this data (verified live 2026-07-16: 41,162 pools / 13,269
casitas / 587K beds+baths). Bexar's genuine remaining gap is sale-date/exemption signal
(0% coverage, verified live) — the seller-signals retrofit hasn't reached Bexar yet.

---

## SHIPPED SINCE THE RE-EVAL (deployed to Railway prod / committed for the build)

- **Boot trust (A1–A3):** expo-font deduped to 14.0.12, offline-bootstrap catch, ErrorBoundary.
  App confirmed launching on-device.
- **Billing (B1/B2/B3):** included-traces reset on invoice.paid + upgrade grant; referral reward
  moved to the first *paid* invoice with a zero-amount guard; atomic included-consume + Stripe
  meter idempotency key + concurrency gate. **B4:** $25 metered spend cap (config
  `metered_cap_cents`, per-cycle, checked before the vendor call). **H1:** partial-refund
  clawback is prorated. **H2:** referral first-paid milestone claimed atomically + idempotency
  key on the balance credit. **B6:** verified — all 5 webhook events are registered (not a bug).
  **B7:** resolved — signup-as-Closer-trial is by design; Prospector is via the Stripe portal
  (Frederick action), and the webhook already maps the downgrade.
- **Security (C3/C4-OTP):** pg pool error listener; per-email OTP throttle (1/min, 5/hr).
- **Data (D2/D3):** deterministic condo lookup (smallest-area, id tiebreaker); protected-record
  + null-owner gate returns 403 before any vendor call.
- **AI draft (M6):** owner name / address wrapped in delimiters with a "treat as literal, not
  instructions" rule — blocks prompt-injection via a crafted owner/LLC name.
- **Mobile (E1/E2/E5/E6 + UX):** mailing address restored; keyboard-persist taps; keyboard no
  longer covers the note field; address-search clear button; Pipeline→CRM rename; owner name
  wraps to 2 lines; tap-race stale guard + id-0 fix; **E5** location denial no longer bricks the
  app (default region + search fallback, self-healing "Enable location" button, prompt after
  login). Committed; reaching the device via build `e70ef8d4`.

---

## WHAT'S REAL AND VERIFIED

- **API / backend** — live-verified tonight: `/health`, `/config`, 5-county owner lookups,
  tiles (valid MVT + cache), geocode, feature gates (402/403). No IDOR, all SQL parameterized,
  Stripe webhook signatures verified, the §7 "never a standalone $0.29 charge" rule holds.
- **Statewide data** — 253/253 StratMap counties, 14,336,257 parcels. **DB is 24 GB (parcels 18 GB,
  parcel_signals 3.5 GB, permits 3 GB) — at/near the Railway volume ceiling, NOT 10 GB with headroom**
  (corrected 2026-07-16 by the claims audit; a wind backfill already hit `mdzeroextend` disk-full).
  Any statewide expansion (permits, storm materialization) is disk-gated. GIST index used, point
  lookup ~10 ms. **Caveat:** ~51 counties (~580K parcels, 4%) are mis-projected and effectively
  invisible (see fix D1).
- **Web** — signup→OTP→Stripe-checkout flow, referral landing, partner dashboard, ToS/privacy
  drafts (all 5 mandated clauses present), config-driven data-broker notice. Deployed.
  **Redesigned + rebranded 2026-07-14 (per BRAND_AND_PRODUCT_BRIEF.md):** real TapOwner logo
  art (navy #052158 + orange #F27F09, not the app's blue), marketing homepage with a
  **Reverse Prospecting flagship hero**, data-moat band, Closer-highlighted pricing, referral
  touch. Admin **`/admin`** commission/referral manager: list partners w/ owed + referral
  link/QR + comp terms, create (pick 25%/12mo vs $20 flat), record payout, revoke. Commission
  engine (billing.ts) verified against the §5b model. Both live on tapowner.com, verified.
- **AI drafting, trace caching/metering, CRM API** — built and server-verified.

## WHAT WAS CLAIMED BUT IS NOT TRUE / NOT VERIFIED (historical — as of 2026-07-14)

- Phase 10 "installs as a normal app" — the shipped TestFlight binary **hung on launch**
  at the time. **Now resolved** (A1-A3 fixed; builds #7 onward have run cleanly).
- Phases 7/8/9 "PASSED" — server side real; on-device evidence lived in code later deleted.
  **Now resolved** — PROGRESS.md documents a real on-device confirmation for 7/8/9.
- Phase 6 "reset logic is config-driven" — **now resolved**, `billing.ts handleInvoicePaid`
  actually resets `included_traces_remaining` on `invoice.paid`.
- ~75% of the current mobile app had **never executed on any device** as of 2026-07-14.
  **Status now, 2026-07-16: still a live risk, but narrower** — builds #18-22 (the entire
  seller-signals/owner-portfolio/courthouse-signals UI) have shipped and are NOT confirmed
  on any device per any doc/commit found. This is the top verification gap right now.

---

## RANKED FIX BACKLOG — REFRESHED 2026-07-16 (verified by direct code read, not assumption)

**Of ~30 tracked items, 24 are RESOLVED and 6 are still genuinely open.** None of the
open ones are launch-blocking; all are noted for whenever there's a slow moment.

### A. Boot — ALL RESOLVED
- **A1 Startup hang** — fixed (`expo-font` dedupe 14.0.12). Builds #7+ have run cleanly.
- **A2 Offline "Loading…" strand** — fixed, `App.tsx` bootstrap now has a catch.
- **A3 ErrorBoundary** — `mobile/ErrorBoundary.tsx` exists and is wired in.

### B. Money / billing — ALL RESOLVED (Stripe itself is still test-mode, see below — that's a business-chain blocker, not a bug)
- **B1 Included traces never reset** — fixed, `billing.ts handleInvoicePaid` resets on `invoice.paid`.
- **B2 Referral reward on $0 trial invoice** — fixed, early-return guard on `amount_paid<=0`.
- **B3 Non-atomic trace charge / no idempotency key** — fixed, `UNIQUE(user_id,parcel_id)` + deterministic Stripe meter identifier.
- **B4 $25 metered cap unimplemented** — fixed, checked in `trace.ts` before every vendor call.
- **B5 past_due loses CRM read** — resolved (superseded by read-only-grace design).
- **B6 webhook may register only 3 event types** — handler code dispatches all 5; the live Stripe dashboard config itself is unverifiable from source (flag if ever in doubt).
- **B7 no cancel path** — resolved by design: `/billing/portal-session` + `web/app/billing/page.tsx` exist; Prospector is reached via Portal downgrade (intentional, not a bug).

### C. Security — MOSTLY RESOLVED, 1 item still open
- **C1 DB password rotation** — claimed done 2026-07-14 (one-time action, unverifiable independently).
- **C2 unauthenticated data endpoints** — fixed, `dataAuth()` gates tiles/parcels-at/geocode.
- **C3 no pg pool error listener** — fixed, `db.ts` has `pool.on("error", …)`.
- **C4 — STILL PARTIALLY OPEN:** OTP per-email throttle IS implemented (1/min, 5/hr). But
  the admin-secret comparison in `partners.ts` is still a plain `!==` (not timing-safe), and
  `trustProxy` is still unset on the Fastify instance, so per-IP rate limits are effectively
  global rather than per-caller. Low urgency, but genuinely unfixed.

### D. Data integrity — ALL RESOLVED
- **D1** 51 mis-projected counties — reprojected via `data/fix_misprojected_counties.py`.
- **D2** stacked condo `LIMIT 1` — fixed, deterministic `ORDER BY ST_Area, id`.
- **D3** protected-record trace bug — fixed, gated before any vendor call in `trace.ts`.
- **D4** placeholder owner strings shown as real — fixed, `isPlaceholderOwner` filters display.

### E. Mobile regressions — 1 STILL OPEN
- **E1-E2, E4-E7** all confirmed fixed in code (mailing address restored, keyboard-persist-taps
  present, mail-availability + share-sheet fallback + vCard escaping done, location-denial
  self-heals, tap-race guarded).
- **E3 — STILL OPEN:** `ContactScreen.handleSaveToContacts()` marks "In Contacts ✓" and fires
  the `contact_saved` event as soon as `presentFormAsync` resolves, regardless of whether the
  user actually tapped Done or Cancel. A canceled save still shows success. Small, real, unfixed.

### F. Hygiene — 6 STILL OPEN (none urgent)
- Duplicated shared styles across screens — still open, no consolidation found.
- Hardcoded default AI-draft tone (`"professional"` literal) — still open.
- `is_absentee` compares city/state only, not full address — still open.
- `charged_via='cache'` value is defined in the type but never actually written — still open.
- No schema-migration tracking directory anywhere in `api/` — still open.
- `founding_agent` auto-promote-at-10-conversions — **never implemented at all** (only display
  aggregation exists); `lifetime_closer` is written once and never read anywhere — still open.
- In-app "informational use only" data disclaimer — never shipped — still open.
- §8 per-vendor-call cost/latency logging — absent from `api/src/trace/batchdata.ts` — still open.

---

## BLOCKERS BY MILESTONE

- **Working app on Frederick's phone:** A1–A3 fixed → one production build → device launch +
  login (Claude relays OTP from logs until Resend is live).
- **Founding-agent TestFlight:** ✅ Resend DONE — tapowner.com verified, `OTP_FROM_ADDRESS`
  + `RESEND_API_KEY` live on Railway, real login codes confirmed delivering to a Gmail inbox
  through the app path (2026-07-13, ~9:42pm). Still needed: a static-code demo account for
  Apple review; B1/B3 at minimum.
- **Public launch:** + the full legal gate (LLC, attorney review, TX Data Broker registration,
  insurance, signed BatchData reseller addendum), Stripe live mode, cancel path (B7),
  security C1–C2, data D1.

## FREDERICK'S ACTION LIST (only he can do)
- **✅ Done 2026-07-13:** Resend domain verified via Cloudflare; login codes email for real.
- **✅ Done 2026-07-14:** Stripe Customer Portal configured. Business inbox live
  (info@tapowner.com). Apple demo account BUILT+verified (review@tapowner.com, static code in
  Railway env — paste into App Store Connect review notes at submission; nothing to do now).
- **Waiting on Frederick:** add the 4 Cloudflare DNS records for tapowner.com/www (Railway
  domains already attached, records provided in chat 2026-07-14); LLC → EIN → business bank
  → THEN Stripe live mode (every-2-day scheduled reminder active, incl. the legal gate:
  attorney ToS review, TX Data Broker registration, insurance, BatchData addendum); RentCast
  account signup if the property-attributes pilot is approved.
- **Done:** Apple Developer, Expo/EAS, Railway, Anthropic, BatchData, Google Geocoding, domain
  purchase, social handles, App Store Connect record.

## ROADMAP (agreed 2026-07-14)
1. **Property attributes (CAD ingestion):** ✅ Bexar DONE (617,058 parcels: sqft/stories/
   year-built via the county's free ArcGIS layer — `data/load_bexar_attributes.py`). Next:
   Harris/Dallas/Tarrant/Travis (instant public downloads). Pool/casita need BCAD's
   improvement-detail export — **open-records request SENT by Frederick 2026-07-14**
   (statutory response ≤10 business days). Note: the GIS `Detached` field is NOT a
   casita/structure count — Frederick ground-truthed his own home (Detached=3 ≈ levels);
   do not surface it. Refresh quarterly per build doc §6.
2. **Farm mode (bulk area prospecting):** draw an area on the map (tap-to-drop corners) →
   `POST /parcels/within` (PostGIS polygon query, protected records excluded, capped) →
   results list with owners + absentee badges → v1 action: **Export CSV of owner names +
   mailing addresses** (mail-merge an open-house postcard/letter; zero trace cost). v1.5: AI
   one-letter template for the area. v2 (guardrails): bulk-trace selected homes with explicit
   cost confirm + the $25 cap; bulk email stays per-recipient. Rationale: for "invite the
   neighborhood," mailing addresses are already free data — no reason to pay per-trace.

## WORKING RULES RE-AFFIRMED (these broke this session)
1. **No "PASSED" without device verification** for anything user-facing. Server-verified ≠ done.
2. **Any native dependency/plugin/asset change requires a dev-client device launch BEFORE any
   production build.** The redesign + native modules went straight to production unproven.
3. **Prove root cause with data before changing code** (rule 4). Two hypothesis builds shipped
   without proof this session; both were wrong.
