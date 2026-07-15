# TapOwner Property-Feature Taxonomy

**The canonical vocabulary of filterable property features, and the crosswalk that unifies every
county's wording into it.** This is what lets a search for "casita" reliably find a district's
`DLA`, another's "Guest House," and another's "Detached Living" — all as one result.

- **Canonical tags:** the 16 features below (approved 2026-07-15).
- **Machine-readable crosswalk (source of truth):** `data/improvement_crosswalk.json` — both the
  loaders (Python) and the app (TS) read this one file.
- **Raw-label log (grows as counties load):** `data/improvement_labels_seen.md` (data session).

**Where the 16 came from:** we captured the *live* search-filter panels of Zillow, Redfin, and
Realtor.com and kept only features that (a) at least one major platform filters on **and** (b) a
Texas appraisal district actually records. We deliberately dropped industry-standard filters the
appraisal data can't honestly back (see *Excluded*).

---

## The pipeline (how a county's words become a filter)

1. **Capture raw (data session).** While loading each county, store every property's improvement/
   feature labels **verbatim** into `parcels.improvements` (jsonb). Nothing is normalized or dropped
   at load. New/unseen labels are logged to `data/improvement_labels_seen.md`.
2. **Crosswalk (app session owns).** `improvement_crosswalk.json` maps raw labels → canonical tags.
   Matching: lowercase the raw label, regex-search each tag's `match` patterns (case-insensitive);
   the tag applies if any `match` hits AND no `exclude` hits. A property's tags = the **union** of
   tags across all its raw labels (a home can be `pool` + `garage` + `casita`).
3. **Materialize (re-tag pass).** A pass derives `parcels.improvement_tags` (a canonical `text[]`,
   GIN-indexed for fast filtering) from `parcels.improvements` via the crosswalk. Re-run it when the
   crosswalk gains mappings — cheap, and the raw labels are always preserved so nothing is lost.
4. **Filter + display (app).** Reverse Prospecting filters on `improvement_tags`; the app shows the
   canonical `label`; the user's settings choose which tags to surface (see *App side*).

**Maintenance loop:** county loads → new raw labels appear in `improvement_labels_seen.md` → add a
one-line pattern to the crosswalk → re-run the tag pass. That's how we guarantee we catch *all* the
sheds and casitas, not just the ones we thought of first.

---

## The 16 canonical tags

Consensus = how many of the 3 platforms filter on it. Source: `improvement` = a recorded CAD
improvement/extra-feature; `derived` = inferred from geometry / land influence code; `derived_field`
= computed from an existing parcels column.

| Tag | Label | Consensus | Source | Notes |
|---|---|:--:|---|---|
| `pool` | Pool | 3/3 | improvement | Rock-solid; recorded everywhere |
| `garage` | Garage (+ spaces) | 3/3 | improvement | Space count from improvement units where present |
| `single_story` | Single-story | 3/3 | derived_field | From `parcels.stories == 1` |
| `basement` | Basement | 3/3 | improvement | Rare in TX but recorded |
| `waterfront` | Waterfront | 3/3 | derived | Geometry / influence code; `boat_dock` implies it |
| `fireplace` | Fireplace | 2/3 | improvement | Common extra-feature line |
| `carport` | Carport | 2/3 | improvement | Recorded improvement |
| `solar` | Solar | 2/3 | improvement | Coverage varies by CAD |
| `rv` | RV parking | 2/3 | improvement | Pad/cover/hookup where recorded |
| `casita` | Guest house / casita | 1/3* | improvement | **Differentiator** — majors bury in keyword |
| `boat_dock` | Boat dock | 1/3* | improvement | **Differentiator**; also flags waterfront |
| `barn_stable` | Barn / stable | 1/3* | improvement | **Differentiator** (Realtor "horse facility") |
| `shed_workshop` | Shed / workshop | keyword-only | improvement | **Differentiator** — no major filters on it; we can |
| `spa` | Spa / hot tub | 1/3 | improvement | In-ground spa; portable not recorded |
| `corner_lot` | Corner lot | 1/3 | derived | Geometry / influence code |
| `sport_court` | Tennis / sport court | 1/3 | improvement | Court as an extra feature where recorded |

\* The five **differentiators** — `casita`, `boat_dock`, `barn_stable`, `shed_workshop`, `rv` — are
things Zillow/Redfin/Realtor mostly hide inside free-text keyword search, but Texas CADs record them
as physical improvements. Making them **first-class filters** is an edge the big platforms don't
offer for Reverse Prospecting.

*(Base facts — beds, baths, living sqft, lot size, year built — are assumed filters, not "features,"
and live in their own parcels columns. Beds/baths coverage varies by county; sqft/lot/year are the
most reliable.)*

---

## Excluded on purpose (industry filters on them; our data can't back them)

- **View** (city/mountain/water) — filtered by all 3 platforms, but a subjective MLS field. Not in
  appraisal data → excluded (don't ship a filter that returns garbage).
- **Central A/C** — all 3 platforms, but HVAC *type* isn't reliably recorded by CADs → excluded.
- **Gated** (neighborhood-level), **Accessible** (MLS-only) → excluded.

If we ever add MLS data, these become available — but as a data broker on appraisal records, we keep
them out of the structured vocabulary rather than assert something we can't verify.

---

## App side (built after the data is populated)

- **Filters:** Reverse Prospecting gains checkbox filters for the `improvement`/`derived` tags,
  querying `parcels.improvement_tags` (GIN-indexed).
- **Settings:** an agent chooses which tags to surface in their searches (a rural agent wants
  `barn_stable` / `boat_dock`; a suburban one wants `pool` / `casita`). Display uses the canonical
  `label`.
- **Confidence:** `derived` tags (waterfront, corner_lot, spa, rv, sport_court) surface as best-
  effort; `improvement` tags are asserted.

---

*Maintainer: the app session owns `improvement_crosswalk.json` + this doc. The data session captures
raw labels and logs new ones; it does NOT normalize. Keep this doc and the crosswalk in sync.*
