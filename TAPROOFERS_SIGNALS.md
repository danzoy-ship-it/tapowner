TAPROOFERS — SIGNAL CATALOG (vertical #2, planning only — DO NOT BUILD in TapOwner v1)

Purpose: the roofer vertical sells reasons to knock on a specific door. Each signal below is a data-derived trigger identifying homeowners likely to need a roof. All ride the shared platform engine (parcels DB, permit adapters, config-driven products). Compiled 2026-07; insurance-family facts verified against 2026 Texas market reporting.

Build-tier legend: [HAVE] = runs on data already loaded (parcels/CAD). [PERMITS] = runs on the 5-metro permit adapters already scoped. [STORM] = needs the NOAA/NWS storm pipeline (the one planned-new pipeline for this vertical). [GRIND] = county-clerk or per-source scraping effort. [ADV] = advanced/v3+, do not scope.

A. Storm & weather

1. Hail swaths [STORM] — NOAA/MESH hail polygons intersected with parcels. The core trigger.
2. High-wind events [STORM] — separate NWS wind-damage product; wind lifts shingles without hail dents. Second layer, same pipeline.
3. Repeat-hit compounding [STORM] — parcels hit 2+ times in 3 years = weakened roofs. Requires storing storm events historically, not just latest.
4. Claim-window countdown [STORM] ⭐ — policies have filing deadlines after date-of-loss. Homes in swaths from ~10–20 months ago with no subsequent roof permit = "window closing" lists. Honest urgency; requires swath dates + permit cross-ref.

B. Insurance pressure (the 2026 Texas macro wave — strongest pitch in the industry)

5. The 15-year ACV cliff [HAVE] ⭐⭐ — many TX policies auto-convert to actual-cash-value at roof age 15 (some carriers at 10). Owners approaching the cliff have rational incentive to reroof BEFORE it. Identified via year_built + absence of reroof permit. Neighborhoods built ~2010 are entering the zone now.
6. Non-renewal risk cohort [HAVE] — carriers non-renew/refuse roofs ~20+ yrs without passing inspection. "Replace to stay insured." Same data as #5, older band.
7. Class-4 discount upsell [HAVE] — impact-resistant shingles earn 10–30% premium discounts in hail markets. ROI pitch overlay on any aging-roof list; strongest in high-hail zones.

C. Roof lifecycle & age

8. Year-built + no reroof permit [HAVE/PERMITS] — original roof aging out. The established fallback.
9. Prior reroof permit dated 18–25 yrs ago [PERMITS] — precisely-aged replacement roofs due again.
10. Subdivision cohort waves [HAVE] ⭐ — whole subdivisions age out together (2005–2010 booms hitting 15–20 now). Sell the subdivision, not the house: group-by year_built × geography.
11. Builder-grade inference [GRIND] — production-builder subdivisions = cheapest shingles, shorter life. Builder names from plat/permit data.

D. Neighbor & social proof

12. Fresh reroof clustering [PERMITS] — reroof permit on a street = canvass the block while the crew is visible.
13. Metal-roof upgrades [PERMITS] — permit descriptions naming metal = premium anchor for the whole block ("your neighbor went metal").

E. Adjacent permits (intent & budget)

14. Solar permits [PERMITS] — solar needs a sound roof, often forces reroof first; also proves budget. Referral-channel angle with installers.
15. Major remodel/addition permits [PERMITS] — owner in spending mode; additions require roof tie-ins.
16. Pool permits [PERMITS] — discretionary budget + investment-protection motive.
17. Storm-adjacent repair permits [PERMITS×STORM] ⭐ — swath ∩ non-roof repair permits (fence/window/gutter) afterward = acknowledged storm damage, roof possibly never claimed. Pure query once both datasets exist.

F. Transaction & life-event

18. Just-sold (30–90 days) [GRIND] — new owners hold inspection reports itemizing roof defects, often with negotiated roof credits. Deed transfers at county clerk.
19. Pre-sale prep [GRIND/shared] — expired listings, FSBO, probate: roofs fixed to pass buyer inspections. Sources shared with the agent vertical — cost amortizes across products.
20. Landlord/absentee portfolios [HAVE] — is_absentee flag × aging-roof bands = one owner, many roofs. Portfolio ROI pitch.

G. Observable distress

21. Roof-condition code violations / tarps [GRIND] — city code-enforcement open data for roof citations. (Aerial blue-tarp detection = [ADV], catalog only, do not scope.)

Standing rules for this vertical

* Ethics rule (non-negotiable): the trigger may be an insurance cliff, code violation, or claim window; the outreach educates generically and NEVER reveals the specific trigger ("Texas carriers are switching older roofs to depreciated coverage — here's what that means"), same discipline as the probate rule in TAPOWNER_BUILD.md's appendix.
* Priority when this vertical kicks off: Family B first (5,6,7 — free on existing data, strongest pitch), then storm pipeline (1–4), then permit family (9,12–17), then grinds (11,18,21). #10 and #20 are near-free quick wins.
* Compliance: all signals inherit the pre-launch legal gate framework (vendor addendum, ToS flow-down, TX data-broker registration). Insurance-related messaging gets its own line in the attorney review.

## Clarifications: insurance facts (Family B) + FSBO/expired sourcing (#19)

Insurance facts for messaging accuracy + attorney review (Family B #5/#6/#7)
All verified against 2026 Texas-market sources. These support the pitch but MUST stay generic in user-facing copy; specifics live here for legal review.

* The ACV shift is real and dated to roof age. Many Texas policies convert roof coverage from Replacement Cost (RCV) to Actual Cash Value (ACV) as the roof ages; the 15-year mark is the common trigger, and some carriers apply it as early as 10 years in high-hail Texas markets. (Sources: RoofVista "Roof Insurance Requirements by State 2026"; TexasBayCU "Did Roof Coverage Change on Your Renewal"; JRH Construction "Roof Depreciation Schedule for Texas 2026.")
* Representative depreciation schedule (one published example of a roof payment schedule): 11–15 yrs → ~60% of replacement cost covered; 16–20 yrs → ~40%; 21+ yrs → ~20%. Carriers use proprietary tables (State Farm, Allstate, USAA, Farmers, Liberty Mutual, Travelers, Texas Farm Bureau each differ); asphalt depreciates ~4–6%/yr in Texas. Treat as illustrative, not universal. (Source: TexasBayCU; JRH Construction.)
* Non-renewal / new-policy refusal: many Texas carriers won't write a NEW policy on roofs older than 15–20 yrs, and Farmers (among others) requires inspection on roofs over ~15–20 yrs before renewal, with non-renewal if it fails. (Sources: CBS Austin "How to Get Insurance to Pay for Roof Replacement 2026"; Winik.io "15 Year Roof Insurance Rule"; Insurance.com.)
* Class-4 impact-resistant discount: Texas carriers offer roughly 5–30% premium discounts for UL-2218 Class 4 shingles; cumulative discount often exceeds the upgrade cost over the roof's life. (Sources: CBS Austin; GoNano 2026 guide; RoofVista.)
* Two Texas-specific legal landmines the messaging must avoid:
   * Tex. Insurance Code §27.02 makes it a violation for a contractor to advertise waiving/absorbing/rebating the homeowner's insurance deductible. App copy must never imply this.
   * "Cosmetic damage" endorsements increasingly exclude hail dents that don't cause leaks (hits metal roofs hardest) — so don't promise claim payouts as automatic.
   * §542A governs weather-claim pre-suit notice timelines — relevant to the "claim window" signal (#4); confirm exact current windows with counsel before any "your window is closing" copy ships.
* ATTORNEY-REVIEW LINE (explicit): any insurance-related messaging in the roofer vertical must be reviewed against §27.02 (deductible), §542A (claim notice), and cosmetic-exclusion realities, and must stay educational/generic rather than making carrier-specific or payout-specific promises.

FSBO / expired-listing data (#19) — BUY, don't build
This is the one "genuinely new" signal with an access-restricted path. Resolution: it's a purchased data feed, not a scrape.

* Do NOT scrape MLS (licensed) or FSBO listing sites (ToS-restricted). That's the dead-end to avoid.
* Legitimate vendors sell FSBO + Expired/Withdrawn/Cancelled + Pre-foreclosure (Lis Pendens / Notice of Default / Notice of Trustee Sale) as daily-delivered records with owner contact info, DNC-flagged, filterable by zip/radius. Established players: REDX, Vulcan7, Landvoice, my+plus leads (Austin TX-based), ArchAgent, Mojo. Most are subscription (~$40–60/mo tiers) and several expose native API/CRM integrations.
* Integration approach when this vertical is built: treat as a `TraceProvider`-style vendor behind the same interface pattern as BatchData — signed terms + API, matched to parcels by address. Note many of these overlap the AGENT vertical's needs (expired/FSBO/pre-foreclosure are agent signals too), so a single vendor deal could feed both products — cost amortizes across verticals, consistent with the shared-engine model.
* Compliance note: these vendors DNC-flag their data and rely on FSBO "implied consent," but our standing outreach rule still applies — generic/educational, honor opt-outs, and this feed inherits the pre-launch legal gate.

## Roof-age data strategy (resolves the "permits only go back 4–5 years" problem)

Where roof-replacement dates actually live (and don't)

* MLS / Texas Seller's Disclosure Notices — the source realtors use: prior listing remarks + the seller-completed disclosure form (asks roof type/age/repairs), archived as MLS documents. Licensed, per-property, human-readable. NOT a feedable dataset — do not pursue programmatically. Only exists for homes that sold with an agent since the reroof.
* Permit records, deep history — city open-data portals often expose only ~4–5 years, but the underlying permit history goes back decades and Verisk (BuildFax) aggregates it nationally as a commercial product (insurers buy it). Hard limit: most unincorporated Texas county areas have NO residential permitting at all — the record was never created. Permit data can never cover all 254 counties, regardless of vendor.
* CAD/assessor records — carry roof material sometimes, essentially never roof age (like-for-like reroofs don't trigger reassessment). Dead end for age.
* Aerial-imagery AI (the industry's real answer) — insurers solved this exact problem with historical-imagery change detection: CAPE Analytics (Moody's) and ZestyAI analyze 20+ years of aerial photos to identify the year a roof was replaced. ZestyAI: ~92% accuracy, ~97% US coverage, permits-as-ground-truth cross-validated with imagery, confidence score per result, API/batch access; carrier references include Texas-focused use. CAPE: 200M+ structures, returns year-of-last-replacement + confidence, on-demand API. This is the only method with true 254-county coverage. Caveat: priced for insurance carriers; per-lookup pricing for a contractor-lead app unknown — inquiries in flight (see actions below).

The four-tier strategy (best → fallback; UI must label the source)

1. Permit history where it exists (metro adapters; optionally deepened later via a Verisk/BuildFax feed) — ground truth.
2. Imagery-derived roof age via API (CAPE or ZestyAI) — statewide gap-filler, contingent on workable per-lookup pricing. Plausibly viable inside a premium tier: roofers pay $1,000+/yr for storm tools; a sub-$2 roof-age lookup on a qualified lead pencils easily.
3. Year-built proxy — the honest floor, already in the parcel data. Displayed as "estimated — original roof assumed."
4. User-confirmed (the compounding moat) — every roofer learns the true roof age at the door. A one-tap "confirm roof age" input banks it into a proprietary dataset with `source=user_confirmed`. Over time this becomes roof-age data nobody can buy — same corroborate-and-bank pattern as the platform's trace cache. Design rule when built: user confirmations override lower tiers but never silently overwrite permit ground truth (flag conflicts for review instead).

Frederick actions (money/vendor — NOT engineering)

* Sales inquiry to ZestyAI (Roof Age product) — SENT 2026-07-16. Asked: (1) whether non-carrier use is permitted (embedding results in a contractor lead-qualification app), (2) per-lookup or small-volume pricing; framed as low-thousands of lookups/mo across Texas, scaling with user base. AWAITING REPLY — nudge once after ~1 week of silence, then mark dead.
* Same inquiry to CAPE Analytics / Moody's (Roof Age API) — SENT 2026-07-16, same two questions. AWAITING REPLY — same nudge rule.
* Optional third if both stall: Verisk (BuildFax legacy) deep permit-history feed pricing for Texas metros.
* On any reply: log the outcome here (per-lookup price + terms verdict) and apply the decision rule below.
* Decision rule: if any vendor lands under ~$2/lookup with redistribution-compatible terms → tier 2 ships in the roofer Pro tier. If all decline or price enterprise-only → ship tiers 1+3+4 and revisit at scale.
