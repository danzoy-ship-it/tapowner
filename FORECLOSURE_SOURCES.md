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

## ✅ LOADED — 20 counties, ~1,348 foreclosures tied to parcels (as of 2026-07-15)
The CivicPlus/CivicLive PDF path (dismissed as "phase-2, not built" in the older survey notes
below) **is built and running.** Workhorse loader: `api/scripts/signals/load_pdf_foreclosures.mjs`
(OCR + text-layer PDF → multi-strategy join: direct situs match + free Census geocode +
legal-description). Bexar stays on the ArcGIS `load_county_foreclosures.mjs`. Run one county:
`node scripts/signals/load_pdf_foreclosures.mjs <source>` (idempotent; ON CONFLICT bumps last_seen).

| platform | counties (source `<name>_cc`, tie %) |
|---|---|
| arcgis | Bexar 97 |
| CivicPlus | Fort Bend 72, Bell 72, Ellis 51, Hays 78, Kaufman 75, Rockwall 80, Randall 81, Parker 72\*, Ector 35, Comal 82, McLennan 41, Wise 42, Andrews (tiny) |
| CivicLive | Guadalupe 57, Bowie 25, Lubbock 32 |
| metro / custom | Harris 36 (FRCL_R.aspx WebForms GridView → per-notice PDF w/ embedded OCR; biggest TX county), Dallas 56 (clerk PDF tree, backlog Mar–May only → current months moved to Kofile), Williamson 27 (wilco files.aspx) |

\*Parker migrated to a React DocumentCenter whose antiforgery-token flow couldn't be replayed from
curl/fetch → its config uses a **pinned monthly doc URL**; needs a monthly pin refresh (stable
folder ids in the loader config comment). Everything else auto-discovers its current month.

**GOV_OWNER guard** (threaded through all 3 match queries): courthouse / county / city / ISD / MUD
parcels can NEVER become a foreclosure match — notices name the courthouse VENUE and the foreclosing
PARTY (e.g. "ELLIS COUNTY OF") as addresses, which otherwise false-match a gov parcel. Verified 0
gov false positives across all 20 counties. NB: Postgres `\m`/`\M` word-boundary escapes silently
fail through param binding on this DB — the guard uses bare substrings for the two-word civic phrases.

**Platform migrations found (the survey tables below are STALE — always re-verify a county's CURRENT
foreclosure page before assuming its platform):** Ector left CivicLive → CivicPlus. Midland's
CivicPlus feed died in 2019; Jefferson publishes no notice PDFs; Smith is search-only. All three
→ **Kofile-only** (parked, see below).

**Next targets:** Kofile is now **CRACKED + RUN (2026-07-15)** but **paywall-limited** — see the
Kofile section below for the fix, the clean-IP requirement, and the property-address paywall ceiling
(net 60 metro ties, not the ~40-county landslide once hoped). Best remaining leads: the
**returnAddress join lever** (below) to lift the 0%-tie Kofile counties, and the still-uncracked
non-Kofile metros: **Collin** (Blazor w/ coords — best remaining geocoded source after Bexar) and
**Travis**.

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
| Harris | 48201 | cclerk.hctx.net/applications/websearch/FRCL_R.aspx | custom-app (.aspx search) | WebForms POST dance (GET→ddlYear postback→btnSearch→Page$N) → ViewECdocs.aspx?ID= streams per-notice PDF w/ embedded OCR layer, no auth | ✅ LOADED (`harris_cc` in load_pdf_foreclosures.mjs, 2026-07-15: 750 notices Jul-Sep, 268 tied 36% — legal_description ~empty for 48201 so legal-only notices (~40%) can't tie; run with FC_LEGAL_MS=1) — **"HCAD APN = future lever" DISPROVEN 2026-07-16:** only 2 of 750 notices print an HCAD account number and both were already tied by address; Texas trustee's-sale notices aren't required to carry it. The 40% gap is a legal-description/ADDRESS-match problem → the real lever is applying the improved address/legal matcher (the one being built for the Kofile loader) to Harris's untied notices, NOT an unused identifier |
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

## 🎯 VENDOR SURVEY — THE BIG UNLOCK (agent, 2026-07-16; corrects the pessimism above)
The deep vendor survey found the consolidation the first two agents missed. Frederick's crack-by-
system thesis holds far better than the "fragmented" read suggested:
- **Kofile == GovOS PublicSearch are ONE platform** (`{county}.tx.publicsearch.us` AND
  `{county}.tx.ds.search.govos.com` = byte-identical app, same `ko-search-api` GraphQL backend).
  **~46 TX counties**, incl. nearly every metro: Dallas, Tarrant, Bexar, Collin, Denton, Hidalgo,
  Cameron, Nueces, Williamson, Montgomery, Bell, Smith, Grayson, Guadalupe, Brazos, Midland, Potter
  + ~30 rural. **The INDEX is PUBLIC (no login)**; foreclosures are a dedicated "department" with
  doc types NOTICE OF FORECLOSURE / FORECLOSURE SALE / SUBSTITUTE TRUSTEE. Only document IMAGES are
  paywalled. Data via a Web-Worker GraphQL call (page-derived `ort` token) OR a "Download Report"
  export. **ONE crack ≈ 46 counties.** This is the single highest-leverage move in the project.
  Verified param format: `https://{county}.tx.publicsearch.us/results?department=RP&searchType=quickSearch&recordedDateRange=YYYYMMDD,YYYYMMDD`.
- **Tyler/Govern `countygovernmentrecords.com`** = ~33 more counties (mostly rural + Waco/McLennan),
  but LOGIN-gated (free registration). Second crack ≈ 33 counties.
- **Big one-offs Kofile misses:** Harris (own foreclosure GridView w/ SaleDate, queryable, HTTP 200),
  Travis (own), Fort Bend (free monthly PDF). Handle individually.
- Aggregators (texasnts/foreclosure.com) + TexasFile = ToS-restricted, DO NOT scrape.

**✅ THE CRUX — ANSWERED (2026-07-15):** the Kofile FREE index does NOT carry the property street
address. `ocrText` in the search response is a **~199-char header PREVIEW** (clerk boilerplate), NOT
the notice body; `returnAddress` is the FILER's mailing address (trustee/law-firm/borrower — not
reliably the property); the full text + address are in the **paywalled** document image. So parcels
tie ONLY via `legalDescription`, which SOME counties' index includes (Tarrant, Nueces) and many do
NOT (Hidalgo, Cameron → 0% tie). Verdict: Kofile is a **partial** unlock — great for foreclosure
ACTIVITY (who/when across ~46 counties), limited for parcel-MAPPING. NOT the ~40-county landslide.

## 🗄️ KOFILE — CRACKED + RUN, PAYWALL-LIMITED (2026-07-15). Don't re-derive the frame.
Kofile/GovOS PublicSearch is fully working in `api/scripts/signals/load_kofile_foreclosures.mjs`.
The earlier "parked, blocked on rate-limit" note was HALF WRONG: the fetch had NEVER actually run,
and the reverse-engineered frame was STALE. Both fixed below.
- **Access = YES**, free, no login, no CAPTCHA. Transport = **WebSocket** `wss://<county>.tx.publicsearch.us/ws` (redux-actions-over-socket, NOT GraphQL).
- **Token:** `GET https://<county>.tx.publicsearch.us/` → SPA embeds `window.__ort="<uuid>"` (+ httponly `authToken` cookie). Only credential.
- **THE REAL WORKING FRAME (captured from the live app 2026-07-15; the old v6 guess got silence):**
  `{type:"@kofile/FETCH_DOCUMENTS/v4", payload:{query:{limit:"50", offset:"0", department:"FC",
  keywordSearch:false, recordedDateRange:"YYYYMMDD,YYYYMMDD", searchOcrText:false,
  searchType:"advancedSearch"}, workspaceID:"search"}, authToken:<ort>, ip:"<caller public IP>",
  correlationId:<uuid>, sync:true}` → reply `@kofile/FETCH_DOCUMENTS_FULFILLED/v6`, data in
  `payload.data.byOrder` / `byHash`. **The `ip` field (your echoed public IP) and `/v4` and the
  `YYYYMMDD` (undashed) dates are all REQUIRED — omit any and the backend silently drops the frame.**
  `department:"FC"` = Foreclosures (docType "NOTICE OF FORECLOSURE").
- **CLEAN IP REQUIRED:** datacenter/VPN IPs (NordVPN etc.) are **TLS-handshake-blocked** by the CDN
  (`schannel: failed to receive handshake`). Home residential IP gets rate-limited after ~30 conns.
  A **phone CELLULAR HOTSPOT** clears both (used 2026-07-15). See [[cracking-blocked-records-apis]].
- **Free fields:** docNumber (dedup), recordedDate, `instrumentDate` (= SALE date, first-Tuesday),
  docType/docTypeCode, `legalDescription` (some counties), `returnAddress` (filer, not property),
  199-char `ocrText` preview. Loader upsert fixes applied: dedupe by source_ref (docs repeat across
  pages), per-county BEGIN/try/ROLLBACK, gov-owner guard on all 3 join queries.
- **Result (6 metros, --days=60):** notices pulled tarrant 569/dallas 744/denton 224/hidalgo 543/
  cameron 108/nueces 137; net TIED+live = dallas 22, denton 9, nueces 29 (= **60**); tarrant all
  past-sale (expired), hidalgo/cameron 0 (no legalDescription). source = `<county>_kofile`.
- **NEXT LEVER (unverified, main way to raise ties):** add `returnAddress.address1/city/zip` as an
  IN-COUNTY join candidate (situs + geocode) — it's sometimes the property; guard against out-of-
  county trustee/law-firm false matches (require in-county + house-number agreement).
- Run: `node load_kofile_foreclosures.mjs <county...> --days=60` from a clean IP (hidalgo canary).
  Configured: nueces cameron hidalgo dallas denton tarrant (+ add grayson/collin/montgomery/etc.,
  one `{sub,fips}` line each).

## Signal status
- ✅ **pre_foreclosure** — 15 counties live (Bexar arcgis + 14 CivicPlus/CivicLive PDF; table up
  top). Surfaced in API (`/parcels/at.event_signals`, `/parcels/within.signal_types`) AND in the
  app: "Pre-foreclosure" badge on the property card + "Pre-foreclosure" farm filter (shipped). New
  counties surface automatically via the generic `parcel_signals` read — no app change per county.
- ⏳ probate, divorce, evictions, liens, tax-delinquency, WARN, permits, code-violations — queued;
  same parcel_signals + (spatial or address) join pattern once each source is cracked.
