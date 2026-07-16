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
