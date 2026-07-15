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

## Survey results — mid counties (agent, 2026-07-16)
**Honest finding: Bexar is the EXCEPTION, not the template.** Zero of 20 mid counties (Galveston,
Lubbock, Jefferson, McLennan, Smith, Ellis, Hays, Guadalupe, Comal, Kaufman, Johnson, Parker,
Rockwall, Wichita, Webb, Bowie, Gregg, Midland, Ector, Randall) have an ArcGIS foreclosure feed.
They publish the legally-required notices as **PDF packets on a CMS**. So the leverage is at the
CMS-PLATFORM level (one scraper per platform), but the data is in PDFs → needs OCR + GEOCODE, not
a direct feed pull. Two platform clusters:
- **CivicPlus** (DocumentCenter `/DocumentCenter/View/<id>` + `Archive.aspx?AMID=<n>`): McLennan,
  Smith, Ellis, Hays, Kaufman, Parker, Rockwall, Midland, Randall, Comal (~10) + Galveston
  (Granicus variant, WAF-blocked to curl → needs headful browser). **One CivicPlus harvester ≈ 10 counties' PDF lists.**
- **CIRA / CivicLive** (`/page/<slug>` → `/upload/page/<id>/<file>.pdf`): Bowie, Ector, Guadalupe,
  Jefferson, Lubbock. Guadalupe's `/page/open/5894/0/<YYYY-MM-DD>` is the cleanest date-addressable URL.
- Kofile PublicSearch + Tyler Eagle (`*.publicsearch.us`, `*.tylerhost.net`) = search-only OPR,
  paywalled images, weak address, NO geometry → not useful. Webb = bespoke ASP.NET (one-off).
**Pipeline for these:** scrape CMS list → harvest PDF URLs → OCR/parse notice text (multi-notice
packets → segment) → geocode address to lat/lng → spatial join. Costlier than Bexar's clean feed.
STRATEGIC IMPLICATION: focus effort on (a) Bexar-style feed counties + (b) big metros (most volume,
pending their agent), and treat the CivicPlus/CivicLive PDF path as a phase-2 (OCR+geocode) build.

## Survey results — big metros (agent, 2026-07-16)
**Same verdict: no ArcGIS feed in any of the 15** (Harris, Dallas, Tarrant, Travis, Collin, Denton,
Fort Bend, Hidalgo, El Paso, Montgomery, Williamson, Cameron, Nueces, Bell, Brazoria). Bexar stays
the lone clean feed. Structure:
- **Kofile PublicSearch** (`<county>.tx.publicsearch.us`) covers Tarrant, Denton, Hidalgo, Cameron,
  Nueces (+Dallas/Collin/Fort Bend for records) — ONE headless-browser scraper, swap subdomain = ~6
  counties. But: session-gated (no open API), images paywalled, NO geometry → must geocode.
- **Predictable monthly PDFs, no auth/JS/CAPTCHA** (TIER-1 easy): Fort Bend (`fbctxdocs.../County_Clerk/<Year>/<Month>-<Year>.pdf`), Bell (Revize), Dallas (per-city/month tree), Williamson (`files.aspx` PDF index). Still need PDF-parse + geocode.
- **Collin** — the ONLY other geocoded source (Blazor app, lat/lng in the map markers); needs a
  Playwright scraper against its websocket. Best geo payoff after Bexar.
- **Legacy .aspx / login / reCAPTCHA** (hard/blocked): Harris (VIEWSTATE POST), Travis, Montgomery,
  Brazoria (login), El Paso (reCAPTCHA — do NOT bypass).
- Montgomery/Hidalgo/El Paso TAX foreclosures run on RealAuction (`*.realforeclose.com`, structured)
  but that's TAX sales only, not mortgage trustee notices.

## ⚠️ THE HONEST STRATEGIC READ (both agents agree)
Bexar was the lucky exception (1 of 35 surveyed). Statewide foreclosure is NOT a quick "add a
config" campaign like the ArcGIS beds/baths were — it's a real multi-part ENGINEERING build:
1. **Per-platform scrapers:** a PDF harvester (Tier-1 counties + CivicPlus/CivicLive), a Kofile
   headless-browser scraper, a Collin Blazor scraper. Each reusable across its platform's counties.
2. **PDF parsing / OCR:** notices are multi-notice packet PDFs → segment + extract address + sale date.
3. **GEOCODING:** no county but Bexar/Collin ships coordinates → every address needs geocoding to
   lat/lng before the spatial join. This is a COST + accuracy decision (Google geocode ~$5/1k, or a
   free geocoder at lower quality) — a Frederick money call.
Reusable extractors cover ~13-16 of the top 35, but each is real engineering, not a one-liner.
Recommended order: Bexar (done) → Tier-1 PDF counties (Fort Bend/Bell/Dallas/Williamson) → Kofile
cluster → Collin → the .aspx one-offs. Big metros hold most volume, so effort there pays off.

## Signal status
- ✅ **pre_foreclosure** — Bexar live (mortgage+tax). Surfaced in API (`/parcels/at.event_signals`,
  `/parcels/within.signal_types`). App UI (badge + "foreclosures in my farm" filter) = next build.
- ⏳ probate, divorce, evictions, liens, tax-delinquency, WARN, permits, code-violations — queued;
  same parcel_signals + (spatial or address) join pattern once each source is cracked.
