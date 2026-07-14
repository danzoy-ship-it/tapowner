# TapOwner — CURRENT STATE (ground truth)

**Purpose:** the one honest snapshot of what actually works vs. what was only claimed.
Rewrite the top section every working session. If a phase says "PASSED" in PROGRESS.md
but isn't in the "Verified" table here with evidence, treat it as unverified.

**Last updated:** 2026-07-15 (early AM — Frederick asleep, standing order: keep mining
county attribute data; docs refreshed first per his anti-drift instruction).

---

## THE ORIGINAL INTENT (never drift from this)

TapOwner (`TAPOWNER_BUILD.md` is still the constitution): an iPhone app for Texas real
estate agents — tap any property → owner of record FREE → $0.29 unlocks phone/email →
AI-drafted outreach + mini-CRM. Two tiers (Prospector $9.99 / Closer $19.99, 30-day Closer
trial, card required). Core is vertical-agnostic (roofing app is vertical #2 later).
Frederick decides money/business; Claude decides technical; no "PASSED" without on-device
proof; costs stated before incurring them.

## WHERE IT IS RIGHT NOW

**The app is feature-complete for founding-agent beta and hardened.** Ten TestFlight builds;
build #9 confirmed on-device; #10 (tap-map-to-dismiss card, merged phone-first "Contact
owners" flow) submitted. The entire 6-agent audit backlog (A boot / B billing / C security /
D data / E mobile) is CLOSED — including C2 (data endpoints now REQUIRE auth; anonymous
scraping 401s) and D1 (51 mis-projected counties repaired in place). Farm mode grew into
**Reverse Prospecting**: draw area → filter by beds/sqft/pool/stories → one-button Contact
owners (auto-unlock w/ cost confirm → phones-first, emails secondary, ≤15 or CSV mail-merge)
→ criteria-woven AI letter. Export pricing: 10¢/row at launch; evaluator mode now = free,
300 rows/month (config-flip to enforce). tapowner.com is live (billing portal page works
end-to-end). Apple demo account live (review@tapowner.com, code in Railway env).

**Data moat (Frederick's active priority):** building attributes mined from FREE county
sources — see scoreboard below. `parcel_viewed` events log per-card attribute gaps so the
buy-vs-build API decision is made from real usage (~2-4 weeks of data; paid API assessed
and declined 2026-07-14 — unit economics + scraped-source legal risk).

## WHERE IT'S GOING (near-term order)

1. **Keep mining counties** (standing order): El Paso, Galveston, Brazoria, Bell, McLennan,
   Nueces, Lubbock, Smith next; the recipe is in Task #11 and the loaders in `data/`.
2. **Pending county arrivals:** BCAD (Bexar beds/baths/pool/casita — Frederick's PIA sent
   2026-07-14, due ≤10 business days) · Tarrant PIA + Travis code-legend (drafts given) ·
   Comal + Guadalupe PIA (texts given, Frederick sending).
3. **Business chain (Frederick, reminder running):** LLC → EIN → bank → Stripe live mode;
   legal gate (attorney ToS review, TX Data Broker reg, insurance, BatchData addendum).
4. **Then:** App Store submission (demo account + review notes ready; builds proven).

## COUNTY ATTRIBUTE SCOREBOARD (all free — statewide: 5,319,113 sqft · 420,477 pools · 1,842,774 beds · 20 counties)

| County | Parcels | Pools | Extras | Source/loader |
|---|---|---|---|---|
| Harris | 1,248,998 | 124,542 | beds/baths | HCAD zip (`load_harris_attributes.py`) |
| Bexar | 617,058 | pending BCAD | stories | county GIS (`load_bexar_attributes.py`) |
| Tarrant | 618,423 | 83,674 | — | TAD zip (`load_tarrant_attributes.py`) |
| Dallas | 589,491 | 64,367 | beds/baths/stories | DCAD zip (`load_dallas_attributes.py`) |
| Collin | 344,684 | 62,787 | — | Socrata (`load_collin_attributes.py`) |
| Travis | 342,851 | codes undecoded | stories | TCAD 30GB JSON (`load_travis_attributes.py`) |
| Denton | 311,480 | — | — | prodigy CSV (`load_prodigy_csv_attributes.py`) |
| Williamson | 233,017 | 17,212 | garage | WCAD Socrata (`load_williamson_attributes.py`) |
| Montgomery | 247,131 | — | stories | prodigy JSON (`load_prodigy_json_attributes.py`) |
| Fort Bend | 93,774 (partial, ⅓ id overlap — revisit) | — | — | FBCAD hub (`load_fortbend_attributes.py`) |
| Hays | 51,187 | 3,792 | beds | HaysCAD zip (`load_hays_attributes.py`) |
| Guadalupe | 69,123 | 4,285 | — | free certified roll (`load_pacs_impdetail_attributes.py`) |
| Galveston | 138,113 | 16,605 | — | full certified roll — found by hunt agent (PACS loader) |
| Bastrop | 32,461 | 1,999 | — | free data export (PACS loader) |
| Wilson | 16,684 | 2,597 | — | free appraisal roll (PACS loader) |
| Brazoria | 126,423 | 14,110 | — | ProTax export (`load_brazoria_attributes.py`) |
| Cameron | 126,420 | 8,290 | — | free PACS roll (hunt agent) |
| Nueces | 111,280 | 8,811 | — | free PACS roll (hunt agent) |
| El Paso | 26,978 (partial, ~5% id overlap — revisit w/ REAL_ESTATE export geo ids) | 948 | garage | EPCAD dump (`load_elpaso_attributes.py`) |

**Skipped/blocked:** Galveston (published export is the attribute-less PACS format — needs
PIA for improvement detail) · Comal (hunting agents dispatched; Guadalupe SOLVED — its roll was free on their certified-appraisal-roll page all along) ·
next fresh targets: Brazoria, Bell, McLennan, Nueces, Lubbock, Smith (Task #11 recipe).

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
- **Statewide data** — 253/253 StratMap counties, 14,336,257 parcels, 10 GB of the 30 GB
  volume; GIST index used, point lookup ~10 ms. **Caveat:** ~51 counties (~580K parcels, 4%)
  are mis-projected and effectively invisible (see fix D1).
- **Web** — signup→OTP→Stripe-checkout flow, referral landing, partner dashboard, ToS/privacy
  drafts (all 5 mandated clauses present), config-driven data-broker notice. Deployed.
- **AI drafting, trace caching/metering, CRM API** — built and server-verified.

## WHAT WAS CLAIMED BUT IS NOT TRUE / NOT VERIFIED

- Phase 10 "installs as a normal app" — the shipped TestFlight binary **hung on launch**.
- Phases 7/8/9 "PASSED" — server side real; on-device evidence lived in code later deleted.
- Phase 6 "reset logic is config-driven" — **no monthly reset of included traces exists.**
- ~75% of the current mobile app has **never executed on any device** (the redesign + tail).

---

## RANKED FIX BACKLOG (cross-checked across ≥2 agents where marked ✓✓)

### A. MUST FIX BEFORE THE NEXT BUILD (or we can't trust the result)
- **A1 ✓✓ Startup hang** — wrong-version `expo-font` in the icons chain threw at bundle eval.
  Fixed on disk (dedupe to 14.0.12; `newArchEnabled:false` reverted as it was independently
  fatal with MapLibre v11). *Unverified until a build launches.*
- **A2 ✓✓ Offline "Loading…" strand** — `App.tsx` auth bootstrap awaits `fetchMe` with no
  catch; a returning user launching offline/API-blip is stuck forever, looking exactly like
  "it hung again." Fix before rebuild so a flaky launch can't produce a false failure signal.
- **A3 Add an ErrorBoundary** — any release-mode render throw currently = silent frozen screen
  with no signal. Wrap the tree so failures are visible/recoverable.

### B. MONEY / BILLING (before the first paid subscriber; Stripe is still test-mode)
- **B1 ✓✓✓ Included traces never reset** (billing.ts upsert omits it; no period reset; upgrades
  grant 0). Closer users overcharged from month-2. THREE agents. First renewals ≈ 2026-08-12.
- **B2 ✓✓ Referral reward fires on the $0 trial invoice**, not first paid invoice → free months
  leak to signups that never pay; farmable (self-referral = email-only, attribution window uses
  a client-supplied timestamp).
- **B3 ✓✓ Trace charge is non-atomic + no Stripe meter idempotency key** → concurrent double-tap
  or network retry double-bills; included-balance can go negative.
- **B4 §7 $25 unbilled-metered cap unimplemented** — unbounded trial-abuse vendor spend.
- **B5 past_due users lose read access to their own CRM** (§7 wants 7-day read-only grace).
- **B6 Live Stripe webhook may be registered for only 3 event types** → commission system may be
  silently dead in production (verify enabled_events on the endpoint).
- **B7 No cancel path** — every surface says "manage at tapowner.com" but no billing portal
  exists (FTC click-to-cancel exposure); Prospector tier is unpurchasable (checkout hardcodes
  the Closer price).

### C. SECURITY
- **C1 Rotate the DB password** — it circulated in plaintext over a public proxy tonight.
- **C2 ✓✓ `/tiles`, `/parcels/at`, `/geocode` are unauthenticated** → the entire statewide
  owner dataset is scrapeable with no login, and `/geocode` can drain the Google budget.
- **C3 pg pool has no `error` listener** → a Railway DB blip crashes the whole API process.
- **C4 OTP request has no per-email throttle** (email-bomb / cost); admin-secret compare is
  timing-unsafe; `trustProxy` unset so per-IP limits are effectively global.

### D. DATA INTEGRITY
- **D1 ✓✓ 51 counties (~580K parcels) mis-projected** (Web Mercator stored as lon/lat) →
  invisible, never match a tap. Reproject-on-load + bbox assertion + reload those counties.
- **D2 Stacked condo parcels** — `LIMIT 1` tap-to-owner returns an arbitrary unit's owner
  (violates "a wrong owner is worse than no owner").
- **D3 Protected-record trace bug** — `owner_name_hash` is NOT NULL but null for the 405K
  protected parcels → tracing one 500s *after* the BatchData call (spend leak) and never caches;
  also protected parcels aren't gated from tracing at all (compliance + cost).
- **D4 ~24.8K placeholder owner strings** ("UNKNOWN OWNER", "CONFIDENTIAL", "-") shown as real.

### E. MOBILE PRODUCT REGRESSIONS (from the redesign)
- **E1 ✓✓ Owner mailing address no longer displayed anywhere** (the absentee-outreach datum,
  required by build-doc §4). Restore on PropertyCard/ContactScreen + carry in route params.
- **E2 First-tap-swallowed saves** — ContactScreen/AccountScreen ScrollViews dropped
  `keyboardShouldPersistTaps="handled"`.
- **E3 Contact form marks "In Contacts ✓" + logs contact_saved even when the user cancels.**
- **E4 Draft flow burns a metered AI draft before checking Mail availability**; a lone traced
  email can be deselected → composer opens unaddressed; sequential composers race on iOS;
  Gmail-only users can't send at all (no share-sheet fallback).
- **E5 Location denial bricks the whole app** (no tabs/logout/settings); prompt fires over the
  login screen. Move the request to first map use.
- **E6 Tap-race** — two quick parcel taps can show the wrong parcel's owner (no stale guard);
  `Number(id) || null` drops a legitimate feature id of 0.
- **E7 vCard share is iOS-only** (`Share({url})`), silently broken on Android; vCard fields
  unescaped.

### F. HYGIENE / DEDUP / DOCS
- Shared styles duplicated across screens (chips, badges, buttons, inputs); dead `statusLabel`
  export; hardcoded default tone; `is_absentee` compares city/state only (not full address);
  `charged_via='cache'` never recorded; no schema migration tracking; `founding_agent`
  auto-promote + `lifetime_closer` written but never read; in-app "informational use only"
  disclaimer never shipped; §8 per-vendor-call cost/latency logging absent.

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
