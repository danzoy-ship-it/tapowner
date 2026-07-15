# TapOwner Direct-Mail Strategy

**The revenue feature that turns Reverse Prospecting's output into money — done cheaper than every
competitor by exploiting a USPS program they structurally ignore.** Frederick greenlit the strategy
2026-07-16; this doc is the execution plan for the day Stripe goes live. Lanes per the two-session
contract: the mail feature is Product-lane (api/mobile/web + a print-vendor integration); the
carrier-route + owner overlays draw on data the Miner already holds. No county-mining needed.

---

## ⛔ HARD GATE — Stripe live first

We cannot charge for postage/printing until Stripe is out of TEST MODE (Frederick's
LLC → EIN → bank chain; tracked by the `tapowner-legal-gate-reminder`). Everything below is
"build when Stripe is live." Until then the **CSV export is the free MVP** — agents take the list to
any mail vendor themselves. Bringing mail in-house is the revenue decision, not a capability gap.

---

## The core insight: two kinds of mail, competitors sell only one

- **Addressed mail** (what DealMachine / PropStream / PostGrid resell): buy/skip-trace a list, print
  each owner's name, first-class-ish postage → **57–86¢/piece**. Precise, but you pay for the list.
- **EDDM — Every Door Direct Mail** (USPS program built for neighborhood saturation): target by
  **carrier route** (300–600 homes each), **no list, no permit, no skip-trace** → **24.7¢/piece
  postage** (2026, unchanged after the Apr-26-2026 rate change), all-in printed+mailed **~33–46¢**.

Agents *farm neighborhoods* — that is literally the EDDM use case. Competitors are investor tools
that only think in addressed lists, so they'd mail a whole farm one name at a time and overcharge.
**TapOwner already draws the polygon and holds the owner data — it's the only tool that can pick the
right mail type, on the map, priced live.**

## The differentiator nobody has: the map knows the answer

Overlay USPS carrier routes on the farm map and, in one glance, offer both paths:
> "This route = 480 doors, 62% owner-occupied, median $340K → **blanket it for $118**. Or your
> filtered list = 23 absentee owners → **addressed-mail them for $22**."

No competitor offers saturation-vs-targeted chosen visually on the map with live pricing — it
requires the parcel/owner data AND the farm map AND route data in one place, which is our stack.

## Cost story (300-home neighborhood farm)

| | Subscription | Mail | Total |
|---|---|---|---|
| **TapOwner** | $19.99 | ~$150 EDDM | **~$170** |
| DealMachine (Starter) | $119 | ~$216 addressed (72¢) | ~$335 |

~Half the cost, and the agent never bought a list. À-la-carte pricing keeps our $19.99 base intact
(no forced $99–232/mo bundle) — mail is cost-plus-thin: EDDM ~50¢/piece all-in, addressed ~95¢.

## Build plan (staged, when Stripe is live)

1. **Phase 1 — addressed mail on filtered lists.** "Mail this farm / this filtered list": 2–3
   postcard templates with merge fields (owner name + the honest-at-scale "I may have a buyer…"
   language — never signal-specific per `SIGNALS_ROADMAP.md` outreach rule), a print-API call per
   row (PostGrid ~86¢ cost → ~95¢ retail), delivery-status tracking, Stripe per-piece charge with
   the same upfront cost-confirmation UX the farm-unlock flow already uses. Rides data we have.
2. **Phase 2 — EDDM saturation + route overlay (the moat).** Public USPS EDDM route data overlaid
   on the farm map; polygon snaps to carrier routes; per-route door count + owner-occupancy + median
   value from our parcel data; "blanket this route for $X." Real work — a phase, not a night. Needs
   a print vendor that does EDDM fulfillment/paperwork (retail EDDM requires bundling-in-50s + facing
   slips, or the vendor handles the permit/BMEU drop).
3. **Phase 3 — trigger mail (ties to signals).** New probate/absentee/foreclosure signal in a farm →
   auto-draft a compliant postcard → one-tap send. The SmartZip automation play at our price. Later.

## Print-vendor notes (VENDOR-SOURCED 2026, from their own pricing pages)

Addressed postcards, print + first-class postage, per piece, on the NO-monthly-fee entry tier:
- **Lob** — Developer plan: **$0.905/postcard, $0/mo, up to 6,000/mo.** RECOMMENDED START (biggest
  free-tier runway, most established API). Subscription tiers drop to ~$0.615–0.645 but carry
  $260–550/mo minimums — only worth it at real volume. (lob.com/pricing)
- **PostGrid** — Starter: **$0.902 (4×6), $1.023 (6×9), $0/mo, up to 500/mo.** Solid backup.
  (postgrid.com/pricing-print-mail)
- **Postalytics** (realtor-focused) — ~$0.72/piece but $199–399/mo flat plans; revisit only if we
  want its built-in triggered-drip campaigns for the signals tier.
- Two independent vendors at ~90¢ = that's the real pay-as-you-go market rate for addressed
  postcard+postage. Retail model: pass through at cost + modest handling (~$1.00–1.25 to the agent).
- **EDDM is a DIFFERENT vendor** — Lob/PostGrid are addressed-only. EDDM needs an EDDM-fulfillment
  partner (Phase 2). DealMachine's 57¢ is a top-tier-plan bait subsidized by its $232/mo sub +
  volume aggregation — not magic, just scale.

## Postcard templates (predesigned, merge-field driven)

Agents aren't designers — we ship a small **library of scenario templates**, each an HTML design
with two layers of merge fields the app fills automatically:
- **Agent branding (set once in profile):** name, photo, brokerage, logo, phone, license #.
- **Per-send data:** owner name (addressed only), property address, and the AI-drafted headline/body.

Lob and PostGrid both natively support HTML templates + merge variables, so this is a supported
path, not custom print work — design ~4–6 templates once, they render+merge+print each send.

Launch scenario set (maps to features we already have):
- **"I may have a buyer for your home"** — the Reverse Prospecting flagship; ties to a filtered farm.
- **Just Listed / Just Sold** — agent enters the subject address.
- **"Thinking of selling?"** neighborhood farm — no name needed → the natural EDDM template.
- **Absentee-owner / "do you still own…"** — ties to the Absentee + "owns N more" data.
- **Signal-based (Phase 3):** generic-framing ONLY per the outreach-ethics rule — never names the
  trigger.

**Two hard requirements baked into every template:**
1. **TREC advertising disclosures** — Texas real-estate ads must carry broker name + required
   disclosures; the templates bake these placeholders in so agents stay compliant by default.
2. **Honest-at-scale copy** — "may have a motivated, qualified buyer," never a fabricated specific
   buyer (build-doc rule), and never a sensitive signal (SIGNALS_ROADMAP.md).

The AI-draft engine we already ship (letters/emails) generates the postcard's words too — the
template is the physical skin over the same copy engine.

## Open decisions for Frederick

- Confirm à-la-carte (protect the $19.99 base) vs a "Closer includes N pieces/mo" bundle at launch.
- Print vendor pick (PostGrid to start) once Stripe is live.
- EDDM Phase 2 priority vs the signals tier — both are post-Stripe revenue plays.

Sources logged in chat 2026-07-16 (CRST EDDM rates, Postmarkr, PostGrid, DealMachine pricing).
Keep this doc current; log launch decisions in HANDOFF's decision log.
