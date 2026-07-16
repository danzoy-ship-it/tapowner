# TapOwner → Multi-Vertical Platform Strategy

**How to build the next apps (roofers, remodelers, solar, …) on the SAME engine without conflict,
overlap, or a maintenance nightmare.** Captured 2026-07-16 at Frederick's request. This is product
direction — Frederick owns it; refine freely. Nothing here is built yet; TapOwner (vertical #1)
ships first (see sequencing at the bottom).

## The foundation already exists (this was designed in, not bolted on)
`TAPOWNER_BUILD.md`'s opening platform note mandates: keep `api/` and the database
**vertical-agnostic** — parcels, the trace provider + cache, billing, drafting, referrals, and config
must not assume "real estate agent" anywhere (naming, schemas, endpoints). Two rules were locked in
specifically to make future verticals cheap:
1. **The contact/trace cache is shared across every vertical by design** — a phone number a realtor
   pays to unlock is a **$0 cache hit** for a roofer who wants the same homeowner later.
2. **The `products` config was built so a new app with different pricing attaches with no schema
   change** (users/subscriptions/events carry `product_id`; `trace_results` deliberately does NOT —
   the cache is cross-product).

So the "engine independent from the car" that Frederick intuited is real and intentional.

## The one-sentence strategy
**One shared engine (API + database + property data), many thin vertical apps — differentiated ONLY
by (a) a `products` config row, (b) their lead-trigger data, and (c) their templates. Never fork the
engine.**

## What's shared vs. per-vertical
| Layer | Shared across ALL verticals (build once) | Per-vertical (cheap to add) |
|---|---|---|
| Property/owner data (`parcels`) | ✅ the whole dataset | — |
| Contact unlock + shared cache | ✅ the margin engine | — |
| Billing / referrals / CRM / AI drafting | ✅ | tiers + pricing + template wording live in config |
| The app | shared components/logic | its own branding, App Store listing, UX copy |
| **The lead trigger ("why reach out now")** | the machinery (spatial signal-join, `parcel_signals`) | **the actual signal differs per vertical** |

## The differentiator IS the signal layer (and it's already being built)
What makes a roofer app a *roofer* app is the signal that says "this house, right now." The machinery
for that is the **`parcel_signals` table + spatial-join pattern** built for foreclosures. Each vertical
plugs a different signal into the same slot:
- **Realtor** → likely-to-sell: `pre_foreclosure` (built), tenure, senior-owner, probate.
- **Roofer** → storm/hail: NOAA hail swaths (free) intersected with parcels → `roof_damage` signals.
  This is the slated vertical #2 — same spatial join already in use.
- **Remodeler** → recently-*sold* homes (new owners renovate within a year — sale dates already
  collected) + older homes (`year_built`).
- **Solar** → owner-occupied single-family, suitable roof, no existing solar.
- **Pool service / pool builders** → `has_pool` already collected (has one → service; none + big lot
  + high value → builder).
- **Property-tax-protest firms** → high assessed value + no homestead exemption (exemptions already
  collected).
- **Movers / estate services** → foreclosure + probate (already building).

**Key insight:** a large chunk of the data being mined right now already serves 4–5 verticals at once.
We're not building "realtor data" — we're building a property-signal layer every home-services vertical
wants. The multi-vertical moat is being poured now.

## The four anti-conflict disciplines (what prevents overlap/complications)
1. **Never hardcode a vertical into the core.** "Roofer" logic lives in the roofer app + config,
   never in `api/`.
2. **Tag everything with `product_id`** (users, subscriptions, events). The cache deliberately is NOT
   tagged — that's the shared-margin trick.
3. **One clear owner per signal type + loader.** Same lesson that prevented the two-session data
   collision: whoever writes a signal owns it, documented in one registry. With N verticals'
   signal-loaders running, this discipline is what keeps them from stepping on each other. (Foreclosure
   signals already follow this — app-session owns `parcel_signals`, Miner owns `parcels`.)
4. **Do NOT fork the codebase.** One repo, one engine. A billing fix should fix every vertical at
   once, not need patching in five places. Verticals are thin apps + config, not copies.

## Why this is a business moat, not just tidy engineering
- **The shared cache compounds.** Every new vertical makes contacts *cheaper* for every other vertical
  (more users buying the same homeowners = more $0 cache hits). A genuine network effect on cost of
  goods.
- **Near-zero marginal backend cost per vertical.** Vertical #2 ≈ a new app skin + a config row + one
  new signal loader. The expensive part (data, trace infra, billing) is already paid for.
- **Same market, multiple products** on the identical backend you already operate.

## How to actually build vertical #2 (roofers), concretely
1. **Ship + stabilize TapOwner first** — the build doc is explicit: don't start #2 until #1 is live and
   earning.
2. Add a `roofer` row to `products` (tiers, pricing, templates) — no schema change.
3. Build **one new signal loader**: NOAA hail swaths → spatial-join to parcels → `roof_damage` rows in
   the *same* `parcel_signals` table (identical pattern to the foreclosure loaders).
4. Build the **roofer app** (own branding/listing) pointing at the *same* API; reuse shared components.
5. Core API, database, billing, cache: **untouched.**

Roughly 15% new work, 85% reuse — and each additional vertical (solar, remodeler, pool, tax-protest,
mover) gets cheaper still, because the signal machinery and most of the data are already there.

## Parked / not-yet-decided
- Whether each vertical is a fully separate Expo app vs. a single re-skinnable shell (lean separate
  apps — App Store needs separate listings and UX diverges — but revisit when #2 starts).
- A formal **signal-type registry** doc (owner + loader + join method per signal) — create it when the
  second signal-writing lane appears, so ownership stays unambiguous.
- The roofing vertical also has a legal-gated probate/estate-sale idea (see `TAPOWNER_BUILD.md`
  appendix) — attorney sign-off required before it's a build phase.
