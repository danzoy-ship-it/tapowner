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
| 1 | **Hail/storm damage** — property sat under a recent damaging hail swath | NOAA SPC daily storm reports (free/public, carries hail SIZE) — `load_hail_roof_damage.mjs` | spatial: report buffered → ∩ parcel geom (GIST index, no full scan) | NEW (weather) | flagship | ✅ **BUILT + proven** — 89,888 parcels from the 2024-05-28 event; `signal_type='roof_damage'`, no expiry, threshold(≥1")/buffer tunable. **MRMS MESH upgrade path PROVEN 2026-07-16** (see below) — same event, true radar swath: 933,575 parcels ≥1.0in. ⚠️ **The "10.4x" is that SINGLE date, NOT the general case** — corrected-window sampling shows blended ≈1.6x (≥1.0in) and MRMS<SPC on ~38% of dates; see the 2026-07-16 CORRECTIONS entry in the feasibility log. Per-parcel replace is **BLOCKED on disk (~770 MB free)**; MRMS **swaths** loaded to `hail_swaths` (corrected windowing) with `hail_spc` KEPT — plan is UNION-at-query, deferred to Frederick |
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
- **GENUINELY NEW pipeline:** #2 high-wind — actually BUILT (SPC wind, 3.04M `wind_spc` rows, 2.02M
  parcels); #11 builder-grade (plat/builder data) still not scoped.
- **#21 code-violations — BUILT 2026-07-16.** `signal_type='code_violation'`, `load_code_violations.mjs`.
  Roof/structure-relevant code-enforcement cases from city open-data portals (filtered to dangerous/
  substandard structure + deteriorated roof; open or closed ≤180d): **Austin 5,441, San Antonio 2,259,
  Fort Worth 1,172 = 8,872 parcels tied**, 0 gov-owner leakage. One of the highest-intent signals (the
  CITY has flagged the roof/structure). Dallas + Houston have datasets but they're STALE (frozen 2017–18,
  same open-data discontinuation as Dallas permits) → documented as genuine absence, NOT loaded. NEXT:
  extend to the other major TX cities to exhaust the source.
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
   year_built proxy > user_confirmed override**.
   ⚠️ **REALITY CHECK (verified live 2026-07-16 — do not assume "statewide floor"):** `year_built`
   covers only **62.3% of parcels statewide; 106 of 253 counties have ZERO year_built** (2 counties
   ≥90%, 73 at 50–90%). Tier 3 is NOT a universal floor, and its holes OVERLAP the permit holes
   (rural/unincorporated counties lack BOTH). **tier-2 imagery is the fastest ZERO-human-effort
   254-county roof-age source** — but NOT the only one (see FINAL below: the blind counties are
   PIA-recoverable, not data-less). The insurance-cliff signals (#5/#6) ship on year_built ONLY in the
   ~147 counties that have it (strongest in the metros); they are NOT statewide until year_built is
   backfilled (PIA or imagery).
   **FINAL 2026-07-16 (Miner EXHAUSTED the free-crack pass on all 106 blind counties — BIS Orion-direct,
   True-Prodigy token, SWData webbld, StratMap, cloud+Wayback; note my earlier "statewide floor" AND
   "CAD data-availability ceiling" calls were BOTH wrong):**
   - **TRUE CEILING (CAD never recorded the year): 0 counties.** Every blind county's CAD demonstrably
     HAS year_built, confirmed live per-property (BIS eSearch GetImprovements returns Year Built; TP
     `/improvement details[]` carries actualYearBuilt). It is an ACCESS gap, not a data gap.
   - **FREE-RECOVERABLE & loaded: Shelby (48419) only** (+10,477). The deep pass cracked 0 further free
     bulk sources.
   - **GATED → records-request: the remaining ~105.** year_built exists but only per-property
     (mass-harvest is ethics-vetoed) or behind a PIA. PIA list w/ contacts + exact ask drafted for the
     30 biggest in RECORDS_REQUESTS.md; the ~70 rural tail is impractical to PIA individually.
   **What this means for the CAPE/ZestyAI decision:** imagery is NOT filling "data that was never
   recorded" — it is buying BULK ACCESS to data that provably exists but has no free bulk export. So the
   honest imagery target = the ~70 rural-tail counties where a PIA isn't practical (plus an optional
   speed play for the 30 PIA-able ones). That is a smaller, more precise target than "106 counties," and
   it reframes imagery as convenience/speed over free-but-manual PIAs — not the sole path to the data.
   **One remaining free lever:** Van Zandt (48467, 43,963 parcels) advertises a weekly standalone
   appraisal DBF — a $0 records-ask to admin@vzcad.org for that DBF is worth trying before imagery there.
   **Enrichment now free:** `parcels.roof_material` (~860K homes, ~50K metal) — use as a reroof-market
   filter (asphalt/composition = reroof target; metal/tile = long-life, deprioritize) on the roof-age and
   insurance-cliff signals. Rules: a reroof permit's date OVERRIDES `year_built`
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
**DESIGN RULE (disk-driven):** materialize signals only when they can't be a query. Storm signals
SHOULD live as store-the-swath + intersect-at-query (a few thousand polygon rows) — leaner and tunable.
**REALITY (corrected 2026-07-16 by the claims audit):** BOTH storm signals are currently MATERIALIZED
in `parcel_signals` — hail 3,394,527 rows (`hail_spc`) AND wind 3,038,919 rows (`wind_spc`), 6.43M
roof_damage rows ≈ 3.5GB. The earlier "wind backfill FAILED / do not re-materialize wind" note was
WRONG: the wind rows are live and are a primary driver of the disk pressure below. De-materialization
to swaths has NOT happened. (A wind backfill run did hit an `mdzeroextend` disk-full at one point, but
3.04M rows had already landed.)
**DISK / COST decision for Frederick (LIVE — this is the real blocker):** DB is 24GB on Railway
(parcels 18GB is inherent, storm rows ~3.5GB, permits 3GB) — at/near the volume ceiling. Two paths to
unblock a statewide permit expansion (which would grow the permits table ~10–40×): (a) **de-materialize
the storm signals to swaths** — reclaims ~3GB for free and reverts to the intended design, but needs a
runtime swath-intersect query path built; or (b) **upgrade the Railway volume** — a cost/plan decision.
His call. Permit signals stay queries.

## Feasibility log
- 2026-07-16: **hail-data (#1) feasibility CONFIRMED (green light).** Free public sources exist and
  are spatial:
  - **NOAA MRMS MESH** (Maximum Estimated Size of Hail), NOAA/NSSL — free, CONUS, 1km grids, 2-min
    cadence, GRIB2 format. Authoritative/granular but GRIB2 needs GDAL/wgrib2 to process.
  - **✅ PROVEN FREE + WORKING (2026-07-16).** Source: `s3://noaa-mrms-pds/CONUS/MESH_Max_1440min_00.50/
    YYYYMMDD/MRMS_MESH_Max_1440min_00.50_YYYYMMDD-HHMMSS.grib2.gz` — public, anonymous/unsigned S3
    (no AWS account needed), 30-min cadence, deep historical archive confirmed back to at least
    2020-10 through today (not just a rolling real-time window). `MESH_Max_1440min` = trailing
    24-hour max; the 23:30Z file of a day = that day's "daily hail swath." Grid: 0.01° (~1km),
    regular lat/lon, values in mm (-3 = no-coverage flag). Cross-validated against the SPC
    2024-05-28 Hockley County report (reported 5.00in): MESH showed 2.3–3.3in in that footprint —
    consistent with MESH's documented underestimation bias at extreme sizes, not an error. One
    unresolved anomaly noted honestly: a compact high-value cell near Brownsville (5.6in, ~37px, no
    corroborating SPC report) — flagged as a possible coastal radar artifact, not silently dropped.
  - **Prototype built & proven end-to-end:** `api/scripts/signals/mrms_mesh_contour.py` (fetch GRIB2 →
    mask no-coverage → threshold at 0.75/1.0/1.5/2.0in bands → vectorize connected regions →
    simplify ~500m → GeoJSON) + `api/scripts/signals/load_mrms_hail_swaths.mjs` (loads into new
    `hail_swaths(event_date, min_hail_in, source, valid_time, geom MultiPolygon 4326)` table, GIST
    indexed, then counts intersecting parcels via ST_Dump-into-parts — needed because a whole-day
    swath's bbox can span nearly all of TX, which defeats a naive bbox prefilter; dumping to
    per-storm-cell parts first cut the ≥0.75in band from a 3min+ timeout to ~23s on 14.3M parcels).
  - **2024-05-28 result:** ≥0.75in: 1,580,432 parcels · ≥1.0in: 933,575 · ≥1.5in: 184,110 · ≥2.0in:
    18,318. vs. the SPC point-buffer method's 89,888 parcels at ≥1.0in for the same day (10.4x more
    coverage from the true radar swath vs. sparse buffered point reports). Disk footprint for the
    WHOLE event (4 bands, table+index): 384 kB — proves the polygon-swath design stays disk-lean.
  - **NEXT ENGINEERING STEP:** swap this in as the production loader (replace/augment
    `load_hail_roof_damage.mjs`'s SPC buffer join with `hail_swaths` ∩ parcels), decide the final
    band→signal mapping (probably ≥1.0in, tune with strategy lane), and backfill the recent-window
    event list.
  - Recency/attribution note for the strategy lane: hail damage is time-sensitive (roofers want the
    last ~6–24 months); decide the look-back window + whether to keep historical swaths for the
    "your neighborhood was hit" angle.
- 2026-07-16 **MRMS migration — CORRECTIONS + honest coverage + disk reality (read before quoting "10.4x"):**
  Attempted to swap MRMS in as the production per-parcel hail source. Two things surfaced that revise the
  earlier optimism; the swaps were done conservatively (see below).
  - **⚠️ WINDOWING BUG (fixed in `mrms_mesh_contour.py`).** SPC dates storm reports to the **12Z–12Z
    convective day**, NOT the calendar day. The prototype grabbed the **23:30Z-of-D** file, which
    misaligns and can badly under/over-count (SPC 2025-06-01: the 23:30Z-of-D file tied only 10,140
    parcels ≥1.0in; the correct **12Z-of-D+1** file tied **177,903**, matching SPC's 180,936). The
    contour script now defaults to the convective-day-aligned 12Z-of-D+1 file and stamps
    `event_date = SPC storm-day D` (pass `--no-shift` for old behavior). All numbers below use the fix.
  - **⚠️ "10.4x better coverage" was the SINGLE most favorable date (2024-05-28), NOT the general case.**
    A 16-date corrected-window sample gives a blended **MRMS/SPC ≈ 1.6x at ≥1.0in and ≈2.8x at ≥0.75in**,
    and it is **NOT uniform**: at ≥1.0in MRMS ties **FEWER** parcels than SPC on **~38% of sampled dates
    (6/16)** (e.g. 2025-03-25: MRMS 74,091 vs SPC 154,171; confirmed not a windowing artifact — the MESH
    footprint genuinely plateaus below SPC's buffered-point coverage some days). ≥0.75in is much safer
    (MRMS<SPC on only ~2 dates) but is the biggest row count. **Implication: a straight REPLACE at ≥1.0in
    would LOSE coverage on ~38% of storm-days — so the plan is UNION SPC + MRMS at query time, keep both.**
  - **⚠️ DISK: Railway db-volume is 29,230 MB / 30,000 MB used = ~770 MB FREE.** Materializing per-parcel
    MRMS for all 149 dates ≈ **5.5–6.5M rows (~3.5 GB) at ≥1.0in / ~10–12M rows (~5.8 GB) at ≥0.75in** —
    does NOT fit even after reclaiming hail_spc's ~2 GB (net growth ~1.5–3.8 GB ≫ 770 MB free). Per-parcel
    materialization is therefore **BLOCKED on disk** and was NOT done. This is the disk/cost decision
    already flagged above ("(a) de-materialize to swaths vs (b) upgrade the volume — his call").
  - **✅ WHAT WAS DONE (safe, non-destructive):** loaded the corrected MRMS **swaths** (all target
    storm-days, bands 0.75/1.0/1.5/2.0in, convective-day windowing) into the small **`hail_swaths`** table
    (polygons, not per-parcel rows — disk-lean). **`hail_spc` was KEPT fully intact** (3,394,527 rows);
    nothing deleted or altered. The runtime UNION-at-query path and any hail_spc retirement are DEFERRED
    to Frederick (needs the app swath-intersect query built + the volume decision). hail_swaths totals +
    date coverage recorded in the session report.
