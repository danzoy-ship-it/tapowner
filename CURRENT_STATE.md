# TapOwner — CURRENT STATE (ground truth)

**Purpose:** the one honest snapshot of what actually works vs. what was only claimed.
Rewrite the top section every working session. If a phase says "PASSED" in PROGRESS.md
but isn't in the "Verified" table here with evidence, treat it as unverified.

**Last updated:** 2026-07-13 (after the 6-agent full re-evaluation).
**Reports backing this doc:** `scratchpad/reeval/01..06` (spec, api, mobile, web/compliance, data/infra, timeline).

---

## THE ONE-LINE TRUTH

**The production app has never successfully launched.** The startup hang was root-caused
with source-level evidence (a wrong-version `expo-font` thrown at bundle eval) and fixed on
disk — but that fix has NOT yet been proven by a real build. The backend, data, and web are
genuinely built and largely verified; the entire problem is the mobile app's unverified tail.

**Single next action:** apply the must-fix-before-rebuild items (below), then ONE production
build → confirm it launches + login works on a real device → only then resume feature work.

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
- **Founding-agent TestFlight:** + Resend domain-verified (in progress, Cloudflare) so login
  codes email to anyone; a static-code demo account for Apple review; B1/B3 at minimum.
- **Public launch:** + the full legal gate (LLC, attorney review, TX Data Broker registration,
  insurance, signed BatchData reseller addendum), Stripe live mode, cancel path (B7),
  security C1–C2, data D1.

## FREDERICK'S ACTION LIST (only he can do)
- **In progress:** Resend domain verification via Cloudflare one-click (see RESEND_SETUP.md).
- **Next:** point tapowner.com at the web app; business inbox (Apple support contact); activate
  Stripe live mode; the legal gate items above.
- **Done:** Apple Developer, Expo/EAS, Railway, Anthropic, BatchData, Google Geocoding, domain
  purchase, social handles, App Store Connect record.

## WORKING RULES RE-AFFIRMED (these broke this session)
1. **No "PASSED" without device verification** for anything user-facing. Server-verified ≠ done.
2. **Any native dependency/plugin/asset change requires a dev-client device launch BEFORE any
   production build.** The redesign + native modules went straight to production unproven.
3. **Prove root cause with data before changing code** (rule 4). Two hypothesis builds shipped
   without proof this session; both were wrong.
