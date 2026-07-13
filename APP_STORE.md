# TapOwner — App Store / TestFlight Playbook (Phase 10)

Everything needed to go from dev build → TestFlight → App Store review, in order.
Claude Code prepared the answers; the App Store Connect clicks are Frederick's
(they happen under his Apple account).

## 1. Create the app record (one time)

App Store Connect → My Apps → "+" → New App:
- Platform: iOS · Name: **TapOwner** · Language: English (U.S.)
- Bundle ID: **com.tapowner.app** (already registered by EAS)
- SKU: `tapowner-ios` (internal only)

## 2. Production build & submit to TestFlight

From `mobile/` in Command Prompt:
```
npx eas-cli build --profile production --platform ios
npx eas-cli submit --platform ios --latest
```
The first command builds the real (non-dev) app — no Metro/dev server involved,
so none of the dev-mode reload quirks exist in it. The second uploads it to
TestFlight. Build number auto-increments (managed by EAS).

## 3. TestFlight → founding agents

App Store Connect → TapOwner → TestFlight:
- Internal testing: add yourself first, confirm login + a real trace works.
- External testing: create a group "Founding Agents," add 5–10 emails, submit
  the build for Beta App Review (usually <24h). Testers install via the
  TestFlight app.
- **Acceptance gate (build doc):** 5+ founding agents' phones, crash-free ≥99%
  (watch TestFlight → Crashes), then App Store submission.

## 4. App privacy labels (App Store Connect → App Privacy)

Declare exactly this ("Data Linked to You" unless noted):

| Data type | Collected? | Purpose | Notes |
|---|---|---|---|
| Email address | Yes | App functionality (account) | login identity |
| Name + phone (agent profile) | Yes | App functionality | signs outreach drafts |
| Purchase history | Yes | App functionality | subscription + per-trace usage |
| Product interaction (usage data) | Yes | Analytics | events table (app_open, traces, drafts) |
| Precise location | Yes — **not linked**, not tracked | App functionality | centers the map; never stored server-side |
| Contacts | **No** | — | app WRITES a contact via the system form only; it never reads the address book — that means "Contacts" is NOT collected under Apple's definition |

"Used for tracking": **No** for everything (no ads, no cross-app tracking).

## 5. App Review notes (paste verbatim into the Review Notes field)

> TapOwner displays property ownership from public county appraisal records
> (Texas TxGIO StratMap program). Contact information is provided by a licensed
> data provider with DNC scrubbing, purchased by the user per lookup as part of
> their subscription usage. Account creation and billing occur on tapowner.com.

Also provide a demo login: use a real test account (e.g. danzoy@gmail.com) and
note that the login code is emailed — Apple requires a way in, so before
submission either (a) set up Resend so codes actually email, or (b) create a
review-only account with a documented static path. **(a) is the real fix and
is a 10-minute setup — do it before submission.**

## 6. Listing content checklist

- Subtitle (30 chars): "Tap a property. Reach the owner."  *(29 chars)*
- Category: Business · Secondary: Productivity
- Age rating questionnaire: all "No" → 4+
- Support URL: tapowner.com · Marketing URL: tapowner.com
- Privacy Policy URL: tapowner.com/privacy  *(live; marked DRAFT until attorney review)*
- Screenshots: 6.7" (1290×2796) + 6.1" (1179×2556) — take on the physical
  iPhone in TestFlight build: map view with parcels, owner card, trace results
  with Verified/DNC badges, draft-email flow, saved-properties list.
- App icon: generated placeholder (blue field / white house) ships in the
  build — replace `mobile/assets/icon.png` anytime a designed one exists.

## 7. Pre-submission gates that are NOT App Store items

From the compliance appendix (all Frederick, all before PUBLIC launch — 
TestFlight to a closed founding-agent group is fine before these close, per
the appendix's internal-use sequencing, but confirm timing with the attorney):
1. BatchData reseller/API-partner addendum signed (email already sent).
2. Attorney review of ToS + privacy drafts (remove the DRAFT banners after).
3. Texas Data Broker Act registration (Form 4001, $300/yr) → paste the
   SOS-prescribed notice into `products.config.data_broker_notice` — footer
   and app Settings pick it up automatically, no deploy.
4. E&O + cyber insurance quote.
5. LLC + move accounts under it (per §11 checklist).
