# Phase 6 Skip-Trace Bakeoff — Final Comparison

**Date:** 2026-07-13
**Sample:** The same 100 real Texas residential addresses (Bexar/Dallas/Harris) run through both vendors, for a true apples-to-apples comparison.
**Gate:** build doc requires ≥70% phone match rate before either vendor can be picked.

## Head-to-head

| Metric | Tracerfy | BatchData |
|---|---|---|
| Hit rate (any match) | 92% | 90% |
| **Phone match rate (the actual gate)** | **90%** | **88%** |
| **Email match rate** | **80%** | **80%** |
| Both phone + email | 78% | 78% |
| Phone only, no email | 12% | 10% |
| Email only, no phone | 2% | 2% |
| Neither | 8% | 10% |
| Avg emails per hit (where matched) | 1.99 | 2.06 |
| Real cost per hit | $0.10 | $0.07 |
| Total cost for this 100-address test | $9.20 | $6.30 (see note) |
| Avg response time | ~1.4s | ~2.1s per 20-address batch (~0.1s/address effective, since batched) |
| Clean single-owner name accuracy | 73.8% | 73.2% |
| Business/LLC-owned properties in sample | 19 | 18 |
| Multi-owner (joint/married) properties in sample | 31 | 31 |

**Both comfortably clear the ≥70% phone-match bar.** Match rate and accuracy profile are essentially equivalent between the two — expected, since skip-trace vendors largely license from overlapping underlying identity-graph data sources. Notably, **email match rate is identical (80%) between them**, as is the phone+email overlap (78% both) — a strong signal both are pulling from the same or heavily-overlapping underlying data providers, not independent data sets. The meaningful difference is **cost: BatchData is ~30% cheaper per hit** ($0.07 vs $0.10), and its batch endpoint (up to 100 properties per call) is architecturally a better fit if a future bulk/CSV feature is ever added, though Phase 6's actual product need (one on-demand lookup per tap) doesn't lean on that.

One product-design note: 8-10% of addresses returned *neither* phone nor email (a true miss), and another 2% returned an email with no phone. Per the build doc's UI spec (Phase 6: "Vendor no-match → 'No verified contact found — you were not charged.'"), the app needs to handle these gracefully — which it already does by design, since misses cost nothing either way.

**Note on BatchData's $6.30:** an address-matching bug in my own test script (whitespace-formatting difference between our data and BatchData's echoed address) caused a bad first read of the results; I fixed it and re-ran, but because BatchData bills per real match at the time of the API call (not based on how I parse the response afterward), the first run's ~$6.37 in genuine matches was already billed before I caught the bug. Real total spent testing BatchData across both runs: ~$12.67, not $6.30 — the $6.30 figure above reflects only the second (correct) run's cost, which is the right number for evaluating BatchData's real per-hit economics going forward.

## Recommendation

Both vendors pass the gate. If cost-per-trace is the deciding factor (it directly sets your margin per the build doc's unit economics: $0.29 charge − vendor cost = margin), **BatchData's $0.07/hit vs Tracerfy's $0.10/hit means ~$0.03 more margin per trace** at the same $0.29 price point (~13% margin improvement). This is the one number that's genuinely different between them; everything else (accuracy, match rate) is a wash.

This is your call, not a technical one — signing the reseller/redistribution addendum only needs to happen with whichever vendor you actually pick, before real users see traced data.
