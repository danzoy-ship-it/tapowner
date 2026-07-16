# Roofer Vertical — Signal Portfolio (vertical #2)

**The shared coordination doc for TapOwner vertical #2 (roofers).** Two lanes work off this file
(same clean-split model as the realtor Miner/Product sessions):
- **Signal STRATEGY lane** (Frederick + a separate brainstorm chat): defines WHICH signals, their
  trigger logic ("why they need a roof now"), priority, and GTM angle. Writes definitions into the
  table below.
- **Data ENGINEERING lane** (this build session): implements each signal as a loader into
  `parcel_signals` (new `signal_type` per signal), reusing the spatial/address-join machinery already
  built for foreclosures. Reads this doc; builds what's defined + prioritized.

> **Doc roles (no drift):** `TAPROOFERS_SIGNALS.md` = the full 21-signal CATALOG (product/strategy —
> which signals exist, their pitch, priority, build-tier). THIS doc = ENGINEERING status + lane
> coordination + feasibility (what's built, who's building what). Gap analysis mapping the catalog's
> 21 signals to real engine capabilities is in the session that created this + summarized below.

Architecture is already in place (see `VERTICALS_STRATEGY.md`): one shared engine, `parcel_signals`
holds every vertical's signals keyed by `signal_type`, spatially joined to `parcels`. A roofer signal
is just a new `signal_type` on the same table.

## ⭐ The core insight (Frederick, 2026-07-16)
**Storms are seasonal and reactive — do NOT build a hail-only app.** Every roofer competitor chases
the same hail maps. The moat is a PORTFOLIO of year-round, always-on signals so the app produces leads
in the 9 non-storm months too. Hail is the flagship, not the whole product.

## Signal table (STRATEGY lane fills/refines; ENGINEERING lane builds)
| # | Signal (trigger = "why they likely need a roof now") | Data source | Join method | New vs reuse | Priority | Status |
|---|---|---|---|---|---|---|
| 1 | **Hail/storm damage** — property sat under a recent damaging hail swath | NOAA SPC daily storm reports (free/public, carries hail SIZE) — `load_hail_roof_damage.mjs` | spatial: report buffered → ∩ parcel geom (GIST index, no full scan) | NEW (weather) | flagship | ✅ **BUILT + proven** — 89,888 parcels from the 2024-05-28 event; `signal_type='roof_damage'`, no expiry, threshold(≥1")/buffer tunable. NEXT: full recent-window backfill (window = strategy call) + optional MRMS MESH GRIB2 upgrade for true swaths |
| 2 | **Roof aging out of warranty** — asphalt shingle ~20–25yr life; homes built/re-roofed that long ago are due | `year_built` (ALREADY collected statewide) + re-roof permit date (source #4) | derived attribute, no join needed | REUSE (have year_built) | high (year-round) | ⬜ defined, not built |
| 3 | **Solar-permit tell** — a filed solar permit means roof load/age is top-of-mind; many need a new roof first and don't know it | building-permit data (city/county permit portals) | address/parcel match | NEW (permits) | high (year-round) | ⬜ needs permit source |
| 4 | **Probate / inherited property** — heir inheriting an older house that likely needs roof + renovation | county probate court filings | address/legal spatial join (SAME lane as foreclosures) | REUSE (court-record machinery) | high (year-round) | ⬜ defined; cheap add |
| 5 | **[Frederick's separate chat to add more — permit-for-addition, recent-sale-of-older-home, insurance-claim proxies, neighbor-just-replaced clustering, etc.]** | | | | | ⬜ |

## Gap analysis — TAPROOFERS_SIGNALS.md 21 signals → real engine (2026-07-16)
Reality is BETTER than the catalog's tiers assumed (hail already built, probate already cracked,
last_sale_date already loaded). Buckets:
- **ALREADY SUPPORTED on data we have (no new pipeline):** #1 hail (BUILT, 89,888 parcels), #5 ACV
  cliff ⭐⭐ (approx from `year_built`), #6 non-renewal, #7 class-4 (messaging overlay), #8 (year_built
  side), #10 subdivision cohorts ⭐, #20 absentee portfolios ⭐ (`is_absentee` × year_built × the
  owner-portfolio grouping the realtor side already built), #3 repeat-hit (a query once ≥2 storm dates
  accumulate — the hail loader already stores history, no expiry), #18 coarse "sold last year"
  (`last_sale_date`), #19-probate part (CRACKED). → **Family B, the strongest pitch, is essentially
  FREE on existing data.** The insurance-cliff signals need NO permits to ship a v1 (year_built alone);
  permits only SHARPEN them (exclude already-reroofed homes).
- **SUPPORTED ONCE PERMITS SHIP (the Miner's current mission — unlocks ~8 signals):** #4 claim-window,
  #8 refinement, #9 reroof-age, #12 fresh-reroof clustering, #13 metal-roof, #14 solar, #15 remodel/
  addition, #16 pool, #17 storm-adjacent repair. Huge leverage — one adapter, many signals.
- **GENUINELY NEW pipeline (not scoped):** #2 high-wind (new NWS product, same pattern as hail),
  #11 builder-grade (plat/builder data), #21 code-violations (city code-enforcement open data — a new
  crackable source like permits).
- **VENDOR BUY, not a build (reclassified per the catalog's clarifications):** #19 expired/FSBO — it's
  a purchased daily feed (REDX/Vulcan7/Landvoice-class), integrated as a `TraceProvider`-style vendor
  (BatchData pattern: signed terms + API + address match), NOT a scrape (MLS licensed / FSBO ToS). One
  vendor deal feeds BOTH the roofer AND realtor verticals (expired/FSBO/pre-foreclosure are agent
  signals too) → cost amortizes.

### ⚠️ Engineering invariants (from TAPROOFERS_SIGNALS.md clarifications — bake these in)
1. **Roof age is a SOURCE-TIERED field, never one number** (upgraded 2026-07-16 per TAPROOFERS
   roof-age strategy). Schema when built: `roof_age_year`, `roof_age_source` enum
   (`permit` | `imagery_api` | `year_built_proxy` | `user_confirmed`), `roof_age_confidence`. The UI
   MUST show which tier it's displaying (e.g. year_built = "estimated — original roof assumed").
   Tier precedence (best→floor): **permit history > imagery API (CAPE/ZestyAI, vendor-pending) >
   year_built proxy > user_confirmed override**. Rules: a reroof permit's date OVERRIDES `year_built`
   (carriers get sued for that exact error); user confirmations override LOWER tiers but NEVER silently
   overwrite permit ground truth — flag conflicts for review. user_confirmed is a compounding moat
   (banked at the door, same pattern as the trace cache). Do NOT let any future schema assume roof age
   is a single authoritative value. Vendor tier-2 (imagery) ships only if a vendor lands <~$2/lookup
   with redistribution terms (Frederick's ZestyAI + CAPE inquiries sent 2026-07-16, awaiting reply).
2. **Never hardcode carrier-specific claims or depreciation %s into app copy.** Messaging stays
   generic/educational ("many Texas carriers now depreciate older roofs"); the sourced specifics live
   in TAPROOFERS_SIGNALS.md for the attorney. Insurance copy is gated on review vs. Tex. Ins. Code
   §27.02 (deductible), §542A (claim-notice window — relevant to signal #4), and cosmetic-exclusion
   realities. This is the same "signal never surfaces in outreach" discipline as probate/foreclosure.

## Lane assignments (2026-07-16)
- **Miner / data session → BUILDING-PERMIT mining** into a NEW `permits` table (its lane, alongside
  `parcels`). Unblocks ~8 roofer signals (see gap analysis) + reusable across remodeler/solar/pool.
  Crack-the-system survey (Socrata/ArcGIS open-data, Accela, Tyler EnerGov, CivicPlus), metros first.
  **CATALOG-SHARPENED CAPTURE SPEC (do all of these — they're what the signals need):**
  (a) `issued_date` — REQUIRED (aging #9, recency/clustering #12, claim-window cross-ref #4);
  (b) raw `permit_type` + `description` FREE-TEXT — REQUIRED (metal-roof #13 is detected from the
  description naming "metal"; roof-vs-non-roof-repair #17 needs it too — do NOT collapse to a code);
  (c) a normalized category covering at least: RE-ROOF, SOLAR, REMODEL/ADDITION, POOL, FENCE/WINDOW/
  GUTTER (the non-roof "storm-adjacent" repairs for #17), HVAC, NEW-CONSTRUCTION;
  (d) `valuation`, `address`, lat/lon; (e) keep the table VERTICAL-GENERIC (serves 4+ verticals).
- **App / build session (me) → `parcel_signals` signals:** probate (reuses the foreclosure court-
  record lane — cheapest first), and the hail spatial-intersect (`roof_damage`). Roof-age (#2) is
  DERIVED from `parcels.year_built` (have) + the Miner's `permits` re-roof dates once they land.
- No table collision: Miner writes `parcels`/`permits`; app writes `parcel_signals`.

## Notes for the engineering lane
- **Probate is the cheapest first non-storm signal** — it's the exact `parcel_signals` + court-record
  pattern already running for foreclosures; a new `signal_type='probate'` + a probate-notice loader.
- **Permit data (#3, and #2's re-roof dates)** is the one genuinely new data-mining problem — city
  building-permit portals (Accela, Tyler EnerGov, CivicPlus, Socrata open-data). Crack-the-platform,
  like the foreclosure CMS families. Worth a system survey once prioritized.
- **Ethics carry over verbatim**: bulk/public data only, no per-property scraping, and the
  outreach-copy guard (a signal like probate must NEVER surface in AI-drafted outreach — same rule as
  foreclosure/tenure on the realtor side).
- **Do NOT build the roofer APP or launch until TapOwner #1 is live/earning** (VERTICALS_STRATEGY.md
  sequencing). This doc is the DATA foundation only.

## ⚙️ Permit signals validated as QUERIES, not materialized rows (2026-07-16) — and why that matters
The Miner's `permits` table landed (3.6M rows, 2.95M tied, 6-county SA↔Austin corridor; cols:
permit_category/issued_date/description/valuation/address/parcel_id/geom). The permit-derived roofer
signals are **read-time queries joining permits × parcels × parcel_signals — they create NO new rows**:
- #14 solar-tell: `permits WHERE permit_category='solar' AND issued_date >= now()-24mo` → 4,251 parcels
- #12 fresh-reroof: `permit_category='roof' AND issued_date >= now()-6mo` → 2,697
- #4 claim-window ⭐: roof_damage hit 6–20mo ago `AND NOT EXISTS (roof permit since the storm)` →
  **502,709 parcels** (in the 6 permit counties alone)
- #8 roof-age: `roof_age = now() − COALESCE(latest roof-permit issued_date, year_built)` (the invariant)
**DESIGN RULE (disk-driven):** materialize signals only when they can't be a query. The storm/hail
signal was MATERIALIZED (3.3M parcel rows = 3.5GB) and that + the wind backfill hit the DB disk ceiling
(24GB total, `mdzeroextend` failure). Storm signals SHOULD move to store-the-swath + intersect-at-query
(a few thousand polygon rows) — leaner and tunable. Do NOT re-materialize wind. Permit signals stay
queries.
**DISK / COST decision for Frederick:** DB is at ~24GB on Railway (parcels 18GB is inherent). At the
6-county permit scale we're fine. Taking permits STATEWIDE (254 counties) would grow that table ~10–40×
and WILL need a bigger Railway volume (a cost/plan decision, his call) — flag before the Miner goes
statewide. Reclaiming the hail 3.5GB by de-materializing it to swaths is the free alternative.

## Feasibility log
- 2026-07-16: **hail-data (#1) feasibility CONFIRMED (green light).** Free public sources exist and
  are spatial:
  - **NOAA MRMS MESH** (Maximum Estimated Size of Hail), NOAA/NSSL — free, CONUS, 1km grids, 2-min
    cadence, GRIB2 format. Authoritative/granular but GRIB2 needs GDAL/wgrib2 to process.
  - **Hail-swath MRMS-MESH GIS polygons/lines** republished on ArcGIS open-data hubs — the SAME REST
    pull method already used for the Bexar foreclosure ArcGIS feed (`load_county_foreclosures.mjs`).
    Easier path; likely the one to prototype first.
  - **Planned build:** pull hail-swath polygons for TX → threshold to roof-damaging hail size (≈1"+;
    tune with the strategy lane) → `ST_Intersects(parcel.geom, swath)` → upsert
    `signal_type='roof_damage'` rows (event_date = storm date; expire/age-out policy TBD by strategy
    lane — recent storms matter most). NEXT ENGINEERING STEP: prototype the ArcGIS hail-swath pull +
    one real-TX-event parcel intersect to prove end-to-end, then productionize.
  - Recency/attribution note for the strategy lane: hail damage is time-sensitive (roofers want the
    last ~6–24 months); decide the look-back window + whether to keep historical swaths for the
    "your neighborhood was hit" angle.
