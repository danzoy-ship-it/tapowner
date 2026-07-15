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

## Print-vendor notes (from 2026 research)

- **PostGrid** ~86¢/piece addressed, $0–99/mo tiers — good Phase-1 start, no volume commit.
- **Lob** ~$260/mo floor — revisit at volume.
- EDDM: needs a fulfillment vendor (many do it); DealMachine's 57¢ is a top-tier-plan bait subsidized
  by their $232/mo subscription + volume aggregation — not magic, just scale.

## Open decisions for Frederick

- Confirm à-la-carte (protect the $19.99 base) vs a "Closer includes N pieces/mo" bundle at launch.
- Print vendor pick (PostGrid to start) once Stripe is live.
- EDDM Phase 2 priority vs the signals tier — both are post-Stripe revenue plays.

Sources logged in chat 2026-07-16 (CRST EDDM rates, Postmarkr, PostGrid, DealMachine pricing).
Keep this doc current; log launch decisions in HANDOFF's decision log.
