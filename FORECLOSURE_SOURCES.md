# Texas Foreclosure / Court-Record Signal Sources

**The system map for the courthouse-signals campaign** (app-session lane per HANDOFF §3b amendment).
Analog to the Miner's `texas_county_system_map.md`, but for the ~10 seller-signals that live in
county-CLERK/COURT records, not the appraisal roll. Goal (Frederick): 100% of the signals on all
254 counties, cracked BY SYSTEM (find the platform → crack once → apply to every county on it).

## Method (proven)
- **Spatial join, not address strings.** Foreclosure feeds carry point geometry; drop the point
  into parcel polygons (ST_Contains). Bexar: naive address match 7% → spatial match 97%.
- **Loader:** `api/scripts/signals/load_county_foreclosures.mjs` — handles ANY ArcGIS foreclosure
  feed; adding a county = one config entry. Idempotent daily-refresh (ON CONFLICT bumps last_seen;
  stale notices expire) = the daily-alerts diff (SIGNALS_ROADMAP.md).
- **Storage:** `parcel_signals` table (app-session DDL; separate from `parcels` → no lock collision).

## Honest reality (unlike CAD, this is fragmented)
CAD data had 2-3 dominant systems (PACS, True Prodigy) covering most counties. Foreclosure posting
is MORE fragmented — Bexar's clean ArcGIS feed is somewhat exceptional; Harris/Dallas/Tarrant each
run their own clerk-search web apps. **Leverage lives in (a) the few other ArcGIS-feed counties,
(b) shared clerk-record VENDORS serving many counties (survey in progress), and (c) the big metros
individually (they hold most of the foreclosure volume — ~top 20 counties ≈ most of the population).**

## System taxonomy
- `arcgis` — queryable ArcGIS REST feed w/ geometry (BEST; loader handles it). e.g. Bexar.
- `custom-app` — bespoke web app (Blazor/esri-leaflet/.aspx/React); data via SignalR/private API →
  needs browser automation or API reverse-engineering. e.g. Collin (Blazor+esri-leaflet).
- `vendor` — third-party clerk-records platform (Kofile/GovOS/TexasFile/Tyler/…) → crack once = many.
- `pdf` / `search-only` — static list or search form, no bulk → hardest (OCR / per-record).
- `aggregator` — commercial (texasnts.com, foreclosure.com): has all 254 but ToS/paid = LEGAL RISK,
  do NOT scrape (same posture as the $0.003 vendor; attorney-gated).

## County → source (fills in as the 3 survey agents report)
| county | fips | foreclosure_url | system | data_endpoint | status |
|---|---|---|---|---|---|
| Bexar | 48029 | maps.bexar.org/foreclosures | arcgis | .../CC/ForeclosuresProd/MapServer (0 Mortgage,1 Tax) | ✅ LOADED (277/285, monthly) |
| Collin | 48085 | apps2.collincountytx.gov/ForeclosureNotices | custom-app (Blazor+esri-leaflet) | none public (SignalR) | ⏳ needs browser automation |
| Harris | 48201 | cclerk.hctx.net/applications/websearch/FRCL_R.aspx | custom-app (.aspx search) | TBD | ⏳ survey |
| Dallas | 48113 | dallascounty.org/.../foreclosures.php | search-only | TBD | ⏳ survey |
| Tarrant | 48439 | tarrantcountytx.gov/.../foreclosures | search-only | TBD | ⏳ survey |
| Bell | 48027 | bellcountytx.com/.../foreclosures.php | pdf/php | TBD | ⏳ survey |

*(3 agents surveying the top ~35 counties + the shared-vendor question, 2026-07-16. Their tables
land here; then I crack the ArcGIS + vendor families with the existing loader, and the big-metro
custom apps individually.)*

## Signal status
- ✅ **pre_foreclosure** — Bexar live (mortgage+tax). Surfaced in API (`/parcels/at.event_signals`,
  `/parcels/within.signal_types`). App UI (badge + "foreclosures in my farm" filter) = next build.
- ⏳ probate, divorce, evictions, liens, tax-delinquency, WARN, permits, code-violations — queued;
  same parcel_signals + (spatial or address) join pattern once each source is cracked.
