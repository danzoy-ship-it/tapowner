# TapOwner — BRAND, PRODUCT & REFERRAL BRIEF

**Paste this whole file into a session (or tell it "read BRAND_AND_PRODUCT_BRIEF.md")
before it touches the marketing site, the brand, or the referral/promo portal.** It fills the
gap the operational handoff left: what the product actually *is*, how it should *look*, and how
the commission/promo system is *supposed* to work. `TAPOWNER_BUILD.md` still wins on any conflict.

---

## 1. BRAND IDENTITY (this is where the web build drifted — fix here first)

### The logo is REAL — use the actual art, never re-draw it
The true logo already exists in the repo. **Do NOT invent an SVG** (the current
`web/app/logo.tsx` renders a generic blue map-pin that is NOT our logo — replace it).

- `mobile/assets/logo-wordmark.png` — horizontal lockup: the word **TapOwner**. Use in the
  web header and footer. **Copy it to `web/public/logo-wordmark.png`** and render as an
  `<img>` (or a Next `<Image>`), sized by height (~28–32px header, ~40px footer).
- `mobile/assets/logo-mark.png` — the square icon/app mark. Use as favicon source, the final-CTA
  glyph, social/OG image.
- `mobile/assets/splash-icon.png` — the app splash (wordmark on white).

**The mark's concept (so any illustration stays on-theme):** the word "TapOwner" in deep navy;
the **"a" in "Tap" is replaced by an orange house rooftop (a chevron) with an orange map-pin
beneath it** — literally "tap a house on a map to find its owner." Rooftop + pin = the whole
product in one glyph. If you ever need an icon-only mark, it's that orange rooftop-over-pin.

### Colors — NAVY + ORANGE is the brand (not the app's bright blue)
Sampled straight from the logo art:

| Role | Hex | Use |
|---|---|---|
| **Brand navy** | `#052158` | Headlines, logo text, nav bar, dark sections, primary text. The dominant color. |
| **Brand orange** | `#F27F09` | THE accent + energy: primary CTA buttons ("Start free trial"), the rooftop/pin motif, "free"/emphasis chips, active states, links-that-pop. |
| White | `#FFFFFF` | Default background. |
| Warm gray (body) | `#4B5563` | Body copy. |
| Light gray (panels) | `#F9FAFB` / `#F3F4F6` | Alternating section backgrounds, cards. |

**Why the site currently looks off:** it's built almost entirely in `blue-600` (`#2563eb`) +
`zinc` grays. That bright blue is the app's *in-UI action color*, not the brand. Re-skin the
marketing site to **navy structure + orange CTAs on white**. Concretely: hero headline navy;
the "Before you knock." accent → orange; every primary button (`bg-blue-600`) → orange
`#F27F09` (hover a shade darker, ~`#D96F06`); the "Most popular" pricing highlight border and
badge → navy or orange, not blue; step-number circles → navy; feature tags → orange-tinted.
Keep it clean and white-dominant; navy and orange are accents, not walls of color.

### Typography & feel
- Clean, slightly rounded geometric sans (the logo's face). System UI / Inter is fine on web.
- Generous whitespace, rounded corners (the app uses 10–16px radii), subtle shadows. Premium
  but approachable — a tool a working agent trusts, not a flashy SaaS.
- **Voice:** confident, plain-spoken, agent-to-agent. Short sentences. The north-star lines:
  *"A wrong owner is worse than no owner."* · *"Your next listing is on a street you already
  drive."* · the anti-bloat angle: *"the $9.99 alternative to $99–232/mo prospecting tools."*
  Honest, never hypey. Dark-mode is fine to support but the brand is a light/white identity.

---

## 2. THE COMPLETE PRODUCT (so copy covers everything, and sells the flagship)

TapOwner is an **iPhone app for Texas real-estate agents.** One-liner: *tap any property → see
the owner free → unlock their phone/email for 29¢ → AI-draft the outreach → work it in a
mini-CRM — and prospect a whole neighborhood at once.* The killer feature is **Reverse
Prospecting** (below) — the current site barely mentions it; it should be a hero-level story.

### Core loop
- **Tap-to-owner (FREE):** live GPS map of parcel boundaries across **all 254 Texas counties**;
  tap a house → owner of record instantly from public county appraisal data. Absentee-owner
  flag built in. Unlimited, free, on every plan.
- **Skip trace (29¢):** one tap unlocks the owner's **verified phone(s) + email(s)** — licensed,
  DNC-scrubbed data with Verified / DNC / TCPA-risk badges. **No-match is never charged.**
  Re-viewing a contact you already bought is always free.
- **Property attributes (the data moat):** square footage, beds/baths, **pools**, stories, year
  built — mined FREE from **29 Texas county appraisal districts** (~5.3M properties, ~460K
  verified pools as of mid-July 2026, growing). This is what powers filtering in Farm mode and
  makes the map cards rich. It cost $0 and no competitor at this price has it. Worth bragging
  about on the site (tastefully): "square footage, beds, baths, and pools on millions of Texas
  homes."

### Closer-tier tools
- **AI outreach drafting:** personalized emails from the agent's OWN mail app (never sent from
  our servers). **7 templates** — Just Sold (farming), Absentee Owner, Expired Listing, FSBO,
  Open House Neighbor Invite, Adjacent Lot Interest, and **Buyer Loves the Neighborhood**
  (the reverse-prospect letter). **3 tones** — professional, friendly, direct.
- **Mini-CRM:** save any traced property; notes; pipeline statuses (New → Contacted → Follow-up
  → Appointment → Listed → Dead); one-tap "Save to phone Contacts"; **Export CRM to CSV**.
  Lapsed/canceled users keep **read-only** access to what they already saved (reactivation hook).

### ⭐ Farm mode → Reverse Prospecting (THE flagship — lead with this)
The reason an agent picks TapOwner over a $200/mo tool:
1. **Draw an area** on the map (tap the corners around a neighborhood/block).
2. **See every owner inside** — protected records auto-excluded, absentee flagged.
3. **Refine by criteria** — min sqft, beds, baths, pool, single-story. Live count ("23 of 148
   match"). *This is the magic: "find every 4-bed, 3-bath home with a pool in this
   neighborhood."*
4. **Act on the whole list at once** — one "Contact owners" flow: unlock everyone's contacts
   (with an up-front cost confirm, included traces used first, no-match free), then choose:
   **email each owner** (one pre-addressed message per home, sent one by one from the agent's
   mail — never a blast), **draft one letter** for postcards/mail-merge (any template + tone),
   **add all to Contacts**, **save all to CRM**, or **export CSV**.
5. **The signature play — "Reverse Prospecting":** *"I may have a motivated, qualified buyer
   looking for a home exactly like yours…"* — the Buyer-Match letter, criteria woven in,
   honest-at-scale ("may have"). Agents call this reverse prospecting; it's the highest-response
   outreach that exists, and TapOwner makes it one screen.
- **Export pricing:** farm CSV export is metered at **10¢/row** at launch; right now in
  **evaluator (beta) mode it's free, 300 rows/month.**

### Plans
- **Prospector — $9.99/mo:** unlimited map + owner lookups; pay-as-you-go 29¢ traces; vCard export.
- **Closer — $19.99/mo:** everything + **10 included traces/month** + AI drafting + Mini-CRM +
  Farm mode/Reverse Prospecting.
- **Every new account = 30 days of full Closer FREE** (incl. the 10 traces), card required,
  cancel anytime, then keep Closer or drop to Prospector. Billing managed at
  **tapowner.com/billing** (Stripe portal).

### Trust / compliance (keep the site honest)
- Real data only — never an unverified owner. Contact data from a **licensed, DNC-scrubbed
  provider**. Ownership from Texas **TxGIO StratMap** public county appraisal data.
- Texas Data Broker registration + attorney-reviewed ToS/Privacy are pre-launch gates
  (in progress) — don't claim certifications we don't yet hold.

---

## 3. REFERRAL & PROMO-CODE / COMMISSION SYSTEM (the portal decisions, canonical)

This is `TAPOWNER_BUILD.md` §"Phase 5b" — the authoritative model. The API exists
(`api/src/routes/partners.ts`, admin-gated by `ADMIN_SECRET`); the web has an admin page
(`web/app/admin/`) and a partner dashboard (`web/app/partner/`). **Verify they implement
exactly the model below — several of these are easy to get subtly wrong.**

### Three partner types
1. **user_referral (give-a-month / get-a-month):** the referred *user* gets **1 free month at
   checkout** (via a reusable 100%-off-once Stripe coupon). The *referrer* gets **1 free month
   credited to their own Stripe balance** — but ONLY when the referred user pays their **first
   PAID invoice** (NOT the $0 trial invoice). This "credit the referrer's own tier price" is
   dynamic, not hardcoded.
2. **founding_agent:** account flag `lifetime_closer=true` (free Closer for life) + the same
   user_referral loop; **auto-promotes to affiliate** after **10 paid conversions**.
3. **affiliate (influencer / coach / brokerage):** **25% of SUBSCRIPTION revenue**
   (`affiliate_rate = 0.25`), for the **first 12 months** per referred user
   (`affiliate_months = 12`). **Subscription invoices ONLY — trace/metered ($0.29 + export)
   revenue is explicitly EXCLUDED from commission.** Alternative: a **flat bounty of $20 per
   activated referral** (`affiliate_flat_cents = 2000`), selectable per partner (recurring vs
   flat comp model).

### Mechanics (must match)
- Every partner gets a **code** + link **`tapowner.com/r/{CODE}`** + an **auto-generated QR PNG**.
- Visiting `/r/{CODE}` sets **60-day attribution** (`attribution_days = 60`), stored client-side,
  carried into **Stripe Checkout metadata** → a `referrals` row on signup → **activated on the
  first paid invoice.**
- The **commission ledger is computed ONLY from `invoice.paid` webhooks.** Refunds/chargebacks
  write **automatic negative (clawback) entries** (partial refunds prorate the clawback).
- **No self-referral** (email / card / device heuristics reject it).
- Codes are **revocable**. Support **per-event promo codes** (e.g. one code per office demo or
  campaign) for channel measurement.

### Data model (tables already exist)
- `partners` — id, type (user|founding_agent|affiliate), user_id?, name, code, comp_model
  (recurring|flat), rate, months_cap, status.
- `referrals` — partner_id, referred_user_id, attributed_at, first_paid_at, status.
- `commission_ledger` — partner_id, referral_id, invoice_id, amount_cents (negative for
  clawbacks), created_at, paid_out_at.

### What the ADMIN portal (Frederick's) should let him do
- **Create a partner:** name, pick type, pick comp model (25% recurring for 12mo vs $20 flat),
  generate its code + link + QR.
- **See the ledger:** per partner and overall — earned, clawed back, net owed, marked paid
  (`paid_out_at`). This is what he pays out from.
- **Manage codes:** revoke a code; create per-event/promo codes; see conversions per code.
- **Founding agents:** flag someone `lifetime_closer`, watch the 10-conversion auto-promote.
- The **partner dashboard** (`/partner`, partner logs in via OTP) is the *partner's* read-only
  view of their own code, QR, clicks, conversions, and earnings — separate from the admin.

### Correctness gotchas (these were real bugs fixed this project — don't regress)
- Referrer's free month fires on the **first PAID** invoice, never the $0 trial invoice
  (else free months leak to signups that never pay).
- Commission comes from **subscription revenue only** — filter the trace/metered line items OUT.
- Clawbacks are **idempotent per ledger row** and **prorated** for partial refunds.
- First-paid milestone is claimed **atomically** so duplicate webhooks can't double-credit.

---

## 4. LANDING PAGE — what's already good vs. what to change

The current `web/app/page.tsx` has a solid skeleton (hero → how-it-works → features → pricing →
trust → CTA) and decent copy. Don't rebuild it from scratch — **re-skin and enrich:**

**Fix (brand):** swap the invented `LogoMark` for the real `logo-wordmark.png` in header/footer
and `logo-mark.png` for the CTA glyph/favicon; recolor `blue-600` → brand **orange `#F27F09`**
on all primary CTAs and accents, headings → **navy `#052158`**; retire the bright-blue theme.

**Add (story) — the current copy undersells the product:**
- Give **Reverse Prospecting / Farm mode** a hero-level section of its own (draw → filter by
  pool/beds/sqft → contact the whole neighborhood → "I may have a buyer for your house"). It's
  the flagship and it's currently one small feature card.
- Mention the **data moat**: sqft/beds/baths/pools on millions of Texas homes, which powers the
  neighborhood filtering.
- Add a short **referral** touch ("Refer an agent, you each get a free month") linking to signup,
  since the give-a-month program is live in the model.
- Keep the honest anti-bloat + trust framing already there.

**Don't invent facts:** everything true is in §2 above. No fake testimonials, no "SOC-2", no
claimed certifications, no Android (iPhone only in v1).

---

*Written by Claude Fable 5, 2026-07-15, at Frederick's request to end the "loss in translation."
The brand is navy + orange with the real rooftop-pin logo; the flagship is Reverse Prospecting;
the referral model is give-a-month + 25%/12mo (or $20 flat) affiliates, commissions from
subscription revenue only. Match these and the site will finally look and read like TapOwner.*
