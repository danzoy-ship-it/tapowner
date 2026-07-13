# Phase 6 Skip-Trace Bakeoff — Final Comparison

**Date:** 2026-07-13
**Sample:** The same 100 real Texas residential addresses (Bexar/Dallas/Harris) run through both vendors, for a true apples-to-apples comparison.
**Gate:** build doc requires ≥70% phone match rate before either vendor can be picked.

## Head-to-head

| Metric | Tracerfy | BatchData |
|---|---|---|
| Hit rate (any match) | 92% | 90% |
| **Phone match rate (the actual gate)** | **90%** | **88%** |
| Real cost per hit | $0.10 | $0.07 |
| Total cost for this 100-address test | $9.20 | $6.30 (see note) |
| Avg response time | ~1.4s | ~2.1s per 20-address batch (~0.1s/address effective, since batched) |
| Clean single-owner name accuracy | 73.8% | 73.2% |
| Business/LLC-owned properties in sample | 19 | 18 |
| Multi-owner (joint/married) properties in sample | 31 | 31 |

**Both comfortably clear the ≥70% phone-match bar.** Match rate and accuracy profile are essentially equivalent between the two — expected, since skip-trace vendors largely license from overlapping underlying identity-graph data sources. The meaningful difference is **cost: BatchData is ~30% cheaper per hit** ($0.07 vs $0.10), and its batch endpoint (up to 100 properties per call) is architecturally a better fit if a future bulk/CSV feature is ever added, though Phase 6's actual product need (one on-demand lookup per tap) doesn't lean on that.

**Note on BatchData's $6.30:** an address-matching bug in my own test script (whitespace-formatting difference between our data and BatchData's echoed address) caused a bad first read of the results; I fixed it and re-ran, but because BatchData bills per real match at the time of the API call (not based on how I parse the response afterward), the first run's ~$6.37 in genuine matches was already billed before I caught the bug. Real total spent testing BatchData across both runs: ~$12.67, not $6.30 — the $6.30 figure above reflects only the second (correct) run's cost, which is the right number for evaluating BatchData's real per-hit economics going forward.

## Recommendation

Both vendors pass the gate. If cost-per-trace is the deciding factor (it directly sets your margin per the build doc's unit economics: $0.29 charge − vendor cost = margin), **BatchData's $0.07/hit vs Tracerfy's $0.10/hit means ~$0.03 more margin per trace** at the same $0.29 price point (~13% margin improvement). This is the one number that's genuinely different between them; everything else (accuracy, match rate) is a wash.

This is your call, not a technical one — signing the reseller/redistribution addendum only needs to happen with whichever vendor you actually pick, before real users see traced data.
