# Roofer Vertical — Signal Portfolio (vertical #2)

**The shared coordination doc for TapOwner vertical #2 (roofers).** Two lanes work off this file
(same clean-split model as the realtor Miner/Product sessions):
- **Signal STRATEGY lane** (Frederick + a separate brainstorm chat): defines WHICH signals, their
  trigger logic ("why they need a roof now"), priority, and GTM angle. Writes definitions into the
  table below.
- **Data ENGINEERING lane** (this build session): implements each signal as a loader into
  `parcel_signals` (new `signal_type` per signal), reusing the spatial/address-join machinery already
  built for foreclosures. Reads this doc; builds what's defined + prioritized.

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
| 1 | **Hail/storm damage** — property sat under a recent damaging hail swath | NOAA/NWS (MRMS MESH hail-size grids, SPC storm reports, NCEI Storm Events) — free public | spatial: hail polygon/point ∩ parcel geom | NEW (weather) | flagship | ⏳ feasibility spike (this session) |
| 2 | **Roof aging out of warranty** — asphalt shingle ~20–25yr life; homes built/re-roofed that long ago are due | `year_built` (ALREADY collected statewide) + re-roof permit date (source #4) | derived attribute, no join needed | REUSE (have year_built) | high (year-round) | ⬜ defined, not built |
| 3 | **Solar-permit tell** — a filed solar permit means roof load/age is top-of-mind; many need a new roof first and don't know it | building-permit data (city/county permit portals) | address/parcel match | NEW (permits) | high (year-round) | ⬜ needs permit source |
| 4 | **Probate / inherited property** — heir inheriting an older house that likely needs roof + renovation | county probate court filings | address/legal spatial join (SAME lane as foreclosures) | REUSE (court-record machinery) | high (year-round) | ⬜ defined; cheap add |
| 5 | **[Frederick's separate chat to add more — permit-for-addition, recent-sale-of-older-home, insurance-claim proxies, neighbor-just-replaced clustering, etc.]** | | | | | ⬜ |

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
