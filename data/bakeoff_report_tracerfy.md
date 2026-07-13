# Phase 6 Skip-Trace Bakeoff — Tracerfy

**Date:** 2026-07-13
**Sample:** 100 real Texas residential addresses, pulled from our own loaded parcels (Bexar 34, Dallas 34, Harris 32 — San Antonio, Dallas, and Houston metros; Travis/Tarrant excluded this round due to a query-performance issue on the sampling query, not a vendor limitation)
**Endpoint tested:** `POST /v1/api/trace/lookup/` (the sync, single-address endpoint — the one that matches TapOwner's real usage pattern of one on-demand lookup per tap, not the cheaper bulk-CSV endpoint, which doesn't fit an instant in-app unlock)
**Input:** situs address + city + state + zip + owner first/last name (parsed from our own data), matching what Phase 6 will actually send in production

## Results

| Metric | Result |
|---|---|
| Hit rate (any match) | 92/100 = **92.0%** |
| **Phone match rate** (the doc's actual gate) | 90/100 = **90.0%** — clears the ≥70% bar comfortably |
| Total cost | 460 credits = **$9.20** |
| Cost per address (misses free) | $0.092 |
| Cost per phone-match | $0.1022 (~flat $0.10/hit, matches the sync-endpoint rate discovered earlier) |
| Average response time | ~1.4s (one outlier at 5.7s) |

## Pricing correction (important, found during this bakeoff)

Tracerfy's own pricing page advertises "$0.02/hit" for skip tracing, but that rate is specific to their **bulk CSV batch endpoint**. The **sync/instant endpoint** — the only one that fits TapOwner's real UX (an agent taps a property and needs an answer immediately, not a batch job) — is a flat **5 credits ($0.10) per hit**, confirmed by two live test calls (with and without supplying the owner's name — cost was identical). This is still within the build doc's own cost assumption (~$0.15/match), just not the bargain the marketing page implies.

## Name-accuracy nuance (context, not a pass/fail signal)

A naive "does the returned name match our own database" check looked weak (59.8%) until broken down by why:

| Category | Count | Note |
|---|---|---|
| Business/LLC-owned properties | 19 | Skip trace can't return "the LLC's phone" — it returns an associated human (owner, registered agent). Expected behavior, not a data error. |
| Multi-owner (joint/married, `&` in our record) | 31 | Tracerfy can correctly return *either* co-owner; a strict single-name comparison can't tell if that's right or wrong. |
| Clean single-owner cases | 42 | Where a strict name comparison actually means something |
| — of those, matched our ground truth | 31/42 = 73.8% | Remaining mismatches could be genuine errors, *or* our StratMap snapshot (annual refresh) being staler than Tracerfy's live data — can't fully separate the two without deeper per-case research |

None of this affects the pass/fail call — the build doc's actual bar is phone match rate, not exact name match, and that cleared at 90%.

## Bottom line

**Tracerfy clears the ≥70% bar decisively on the metric that matters (90% phone match).** Real effective cost for our actual usage pattern is $0.10/hit, not the advertised $0.02. This is one of two vendors required before a pick — BatchData still needs to run through the same test before any vendor decision or contract signing.
