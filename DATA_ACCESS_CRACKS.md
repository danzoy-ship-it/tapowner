# Texas CAD Data-Access Cracks — reusable recipes (both sessions)

**Purpose.** Texas appraisal data is public, but every county exposes it through
one of a handful of **vendor systems**, each with its own access method. This doc
is the canonical, cross-session reference for HOW to pull data from each vendor —
so any session (Miner OR app/signals) can reuse a crack without re-deriving it.
Cracked by fable-5 reverse-engineering agents, 2026-07-16. Loaders live in `data/`.

> **App/signals session:** the appraisal cracks below won't directly give you
> court-record signals (foreclosure/probate/liens live on county-clerk & district-court
> systems, a different campaign). BUT several of these APIs expose **owner name +
> mailing address + deed/sale history** that may help you join or enrich — e.g.
> True Prodigy `/public/property/{pid}/deeds`, BIS FeatureServer `SaleDate/DeedDate/OName`.
> No table overlap: Miner writes `parcels`, app writes `parcel_signals`.

**Beds/baths — CORRECTED (per-district config, present in MANY counties):** an
earlier claim that "CADs don't record beds" was WRONG. Beds/baths ARE public for
a large share of counties: (a) **PACS `IMPROVEMENT_DETAIL_ATTR`** "Number of
Bedrooms"/"Plumbing" (~30 loaded); (b) **HCAD fixtures.txt** RMB/RMF/RMH (Harris);
(c) **Dallas RES_DETAIL.CSV** NUM_BEDROOMS/NUM_FULL_BATHS; (d) **True Prodigy
`/improvement/{impID}/features`** (Tarrant/Denton/Ellis/Hidalgo/McLennan/Cooke —
"Bedrooms: N" — but per-IP rate-limited, so FILL-ON-BLANK, not bulk). GENUINE gaps
(district doesn't collect): Montgomery, Fort Bend, Webb, Wharton, ValVerde,
JimWells, Maverick, Limestone, all BIS/SWData/P&A, and bed-less PACS rolls
(Grayson, Wise, Bee, Lavaca, Hockley, Angelina, Orange, Gillespie) → MLS/vendor.

Texas is **non-disclosure** → sale PRICE is essentially never public (deed DATES yes).

---

## 1. PACS / True Automation certified roll (fixed-width) — `data/load_pacs_roll.py`
Most common system. Free zip from the CAD's WordPress media (`wp-json/wp/v2/media?search=certified export`) or a data page. Members: `APPRAISAL_IMPROVEMENT_DETAIL.TXT` (prop_id 0:12, type_desc 50:75, yr 85:89, area/sqft 93:108), `..._DETAIL_ATTR.TXT` (attr name 52:77, value 77: — "Number of Bedrooms"→beds, "Plumbing"→baths as full.half; watch fixture-contamination, guard median>3.5), `APPRAISAL_INFO.TXT` (prop_id 0:12, geo_id 547:596, deed_dt 2034:2058 MMDDYYYY, exemption T/F block hs=2609 ov65=2610…). **Join auto-detect** (source_property_id/apn × prop_id/geo_id). One command: `python data/load_pacs_roll.py <fips> <roll.zip>`. Yields improvements+sqft+year+beds+baths+sale+exemptions.

## 2. True Prodigy (open API) — recipe below (loader TBD)
SPA at `{county}.prodigycad.com` (marketing domain is same React bundle). **One shared open API, anonymous self-service token:**
```
host   = https://prod-container.trueprodigyapi.com
office = GET  /trueprodigy/officelookup/{county}.prodigycad.com          -> results.office
token  = POST /trueprodigy/cadpublic/auth/token   body {"office": office} -> user.token
   # GOTCHAS: POST w/ office in body (GET => wrong-office token => bogus MySQL error);
   #          header  Authorization: <jwt>  (NOT "Bearer"); token ~5 min.
year   = GET  /public/config/defaultyear
list   = POST /public/property/searchfulltext?page=P&pageSize=100
         body {"pYear":{"operator":"=","value":year},"fullTextSearch":{"operator":"match","value":TERM}}
         # TERM >=3 chars; no empty-all query -> enumerate terms (geoID/street/owner prefixes) + dedup pAccountID
   -> rows: pAccountID(key), pid, geoID, situs, land/imprv/market values
impr   = GET /public/propertyaccount/{acct}/improvement   -> livingArea, grossBuildingArea, actualYearBuilt,
          details[] segments (detailTypeDescription: Main Area/Attached Garage/Pool…, area)
feat   = GET /public/propertyaccount/improvement/{pImprovementID}/features  -> Plumbing "2FB"=2 full baths, Fireplace
land   = GET /public/propertyaccount/{acct}/land   -> sizeSqft (LOT), sizeAcres
deeds  = GET /public/property/{pid}/deeds           -> deed/sale dates (no price)
```
Fields: sqft/year/features/baths(via plumbing fixtures)/lot/sale ✅; bedrooms ✗ (not a field). Counties: Montgomery, Denton, Hidalgo, McLennan, Ellis, Webb, Hunt, Cooke, Wharton, ValVerde, JimWells, Burleson, Maverick, Limestone, Anderson, Bowie(also BIS eSearch), **Travis, and Tarrant (migrating)** — survey `{county}.prodigycad.com` for the full list. Operational: list=bulk; physical detail=1 call/acct (open API, respectful rate; rural ~hours, metros ~a day).
**CAVEATS (2nd crack, 2026-07-16):** (a) **Per-county CONFIG VARIANCE** — some CADs hide the improvement-segment rows in their public config (Maverick returns empty Improvement; Travis exposes full sqft/segments/features). Check per county; where hidden, only owner/value/deeds come through. (b) **Auth reconciliation:** the working path is POST `/auth/token` with the office in the body (a token minted without office context returns 500 on data calls). Two crackers disagreed on `Authorization: <jwt>` (raw) vs `Bearer <jwt>` and on the search-body shape (`{"pYear":2026,"fullTextSearch":"TERM"}` vs `{"pYear":{"operator":"=","value":year},"fullTextSearch":{"operator":"match","value":TERM}}`) — **test both when building the loader.** (c) Search results carry public **PropID**; detail sub-resources need the internal `propertyaccount` id (PropID→account map, e.g. 82212→826699); deeds keyed by PropID. (d) FBCAD/Hays officelookup returns 409 — they're Orion, NOT on this True Prodigy instance.

## 3. BIS Consultants — TWO surfaces — `data/load_bis_gis.py` (surface 1)
**Surface 1 = ArcGIS FeatureServer = CLEAN BULK (preferred).** `https://gis.{county}cad.org/arcgis/rest/services/{County}CADWebService/MapServer/{parcelLayer}/query?where=1=1&outFields=*&returnGeometry=false&resultOffset=N&resultRecordCount=1000&f=json` (find layer via `?f=json`; auto-found by the loader). Fields: PROP_ID, QuickRefID, YearBuilt, **TotSqftLvg (living sqft)**, LandSizeFT (lot), SaleDate/DeedDate (epoch ms), IMPClass, values, owner+situs, Exemptions (Orion variant). NO beds/baths, no pool/garage breakout (coarse IMPClass only). **Proxied counties (~44, e.g. Uvalde/Medina) — CRACKED (no token, just a Referer header):** find the server via portal search `https://bisgis.maps.arcgis.com/sharing/rest/search?q=owner:bisconsulting {County}&f=json` → item `{County}CADWebService_Public` (its `.url` is the ready FeatureServer, `.id`=server id). Query `https://utility.arcgis.com/usrsvcs/servers/{SERVERID}/rest/services/{County}CADWebService/FeatureServer/0/query?where=1=1&outFields=*&resultOffset=N&resultRecordCount=2000&f=json` with header **`Referer: https://gis.bisclient.com/`** (no Referer → 403 GWM_0003; maxRecordCount 2000). `load_bis_gis.py` now sends the Referer automatically. **Field difference:** the proxied "…CADWebService" layers carry prop_id/geo_id/owner/values/**Deed_Date** but NOT TotSqftLvg/YearBuilt/Exemptions (ownership+value+deed variant) — so proxied counties yield **sale-date (tenure) + values** only; the direct-server Orion counties (Lubbock) also carry sqft/year/exemptions. Verified Uvalde (21,717) + Medina (46,659). ~45 county webmaps on `bisgis.maps.arcgis.com`. Run: `python data/load_bis_gis.py <fips> <FeatureServer-or-MapServer-url> [layer]`. Verified Lubbock direct (137,440, 166s).
**Surface 2 = eSearch (adds pool/garage features, per-property HTML):** `https://esearch.{county}cad.org/Property/GetImprovements?propertyId={int}&year={yr}` (sequential ids, no auth, no CAPTCHA where shouldUseRecaptcha=false) → living sqft, year, coded segments (AG=attached garage, DC=det carport, POL=pool, CP=covered porch, BS=basement) each w/ sqft. `/Property/View/{id}` = owner/value/deeds. `/search/SearchResultDownload?keywords=&pageSize=N` = CSV (PropertyID/GeoID/Owner/Value; needs a search session token). Exemptions partly masked. Counties: Atascosa, Hardin, SanPatricio, Brown, Bowie, Uvalde, Hale, Jackson, Falls, + the GIS ~45.

## 4. SWData (Southwest Data Solutions) WebForms — recipe (loader TBD)
`https://{frontdoor}.azurefd.net/webProperty.aspx?dbkey={DBKEY}&id=R00000####` (reach via `www.{county}cad.com` Azure Front Door; origin `iswdataclient.azurewebsites.net` 403s direct). Plain GET, no auth. Full record HTML: 5yr value history, Improvements table (Code|Desc|YearBuilt|SqFt|Perimeter), Land, Deed history, EXEMPTIONS (shown). Sequential R-ids. Join=account#. Counties on the CLASSIC WebForms (webProperty.aspx works, new front-door hosts): Hopkins (dbkey=HOPKINSCAD, azurefd), **Erath** (`azurefrontdoor-gwbqhvc2fyhaghgf.z01.azurefd.net/webProperty.aspx?dbkey=ERATHCAD&id={acct}`), **TomGreen** (`www.southwestdatasolution.com/webProperty.aspx?dbkey=TOMGREENCAD&id={acct}`). **True Blazor (SignalR, NO webProperty.aspx, NO REST — only map plumbing):** Sabine, Fannin (`{county}.southwestdatasolutions.com` plural). For Blazor, bulk = a **static COLLECTORS.zip** if the county posts one: `https://{county}.southwestdatasolutions.com/files/download/{DBKEY}/downloads/{yr}_{COUNTY}_COLLECTORS.zip` (Sabine posts one; Fannin only PDFs). The COLLECTORS.zip is **P&A COLLECTORS format** (pipe-delimited `collector_*` .txt + `_matrix`): collector_geoid/id/ownerid (keys), owner+addr, values, **exemptions** (hscode/hspct, dvcode/dvamt, exempt, solar…), **deed/sale** (deedvol/page/date, instnumber), legal/acres — **NO sqft/year/segments** (those are the P&A `webbld` export, records-request). Same P&A parser family as Midland/Hood `export_web*`.

## 5. Harris Govern "eSearch" certified-roll CSV — `data/load_harris_esearch_csv.py`
`https://{county}cad.org/Forms/ExcelDownload?subPath=Data Records&fileName=..._Certified+Appraisal+Roll+...csv` (GET only; HEAD 405). 108-col CSV: owner/value/**exemptions** (Homestead_Code='H'; State_* cols unused; over-65 not cleanly present — likely a tax-ceiling column). NO building features/beds/baths. Join spid==Parcel_ID. Counties: Eastland, DeWitt, Gonzales, Marion, Hutchinson, Panola, Houston, Freestone, Jones, Leon, Eastland… Run: `python data/load_harris_esearch_csv.py <fips> <url>`.

## 6. Socrata open-data API — `data/load_wcad_socrata.py` (WCAD pattern)
Some CADs publish to a Socrata portal. WCAD: `data.wcad.org` (quickrefid==source_property_id): Segment `4kxj-e8c3`→improvements, PropChar `cvyp-ab5t`→deeddate/sqft/garage. Collin publishes summary-only to `data.texas.gov vffy-snc6` (no segment features). Discover via `api.us.socrata.com/api/catalog/v1?domains=data.{cad}&q=...`.

## 7. HCAD (Harris) public CAMA — `data/load_hcad_extra_features.py`
`https://download.hcad.org/data/CAMA/2025/Real_building_land.zip` → `extra_features.txt` (acct, l_dscr plain-English features: Frame Detached Garage/Gunite Pool/Utility Shed/Carport/Boat Dock…), `fixtures.txt` (room fixtures — possibly beds/baths, under investigation), `building_res.txt`. Also `Real_jur_exempt.zip` (exemptions). Join acct==source_property_id (13-digit).

## 8. Dallas DCAD — `data/load_dallas_dcad.py`
`dallascad.org` DataProducts → `DCAD{yr}_CURRENT.ZIP` (via `ViewPDFs.aspx?type=3&id=…`) → `RES_ADDL.CSV` (ACCOUNT_NUM, IMPR_TYP_DESC: ATTACHED/DETACHED GARAGE, POOL, STORAGE, CABANA, SPA, BARN, TENNIS COURT…). Join ACCOUNT_NUM==source_property_id (17-char).

## 9. Tyler ORION — `data/load_fbcad_segments.py` (segments) + notes
Fort Bend/Hays: Orion "Certified Export" (Property/Owner/Exemption/Entity CSVs — thin, no features) + a **separate ResidentialSegments** export (fSegType codes: AG=attached garage, DG=detached, RP=pool[fSegClass GRP5], SPA, WD=deck, OP/PA/MA structural). Join **apn==PropertyNumber** (the numeric PropertyID does NOT match the DB — StratMap numbering; verify!). Tyler "Property Record Search" SPA (Brewster/Bosque) — crack pending.

## 10. TA "Property Data Export" (nested-zip CSV) — `data/load_ta_csv_export.py`
Hays-style: outer zip → inner IMPROVEMENT/SEGMENT/OWNER/SALES zips, each a quoted CSV. SEGMENT.Description = plain-English improvement type, keyed by PropertyID/QuickRefID/PropertyNumber. Join auto-detect.

## DEAD ENDS (no free bulk — records-request or gated)
- **TaxNetUSA "whoownsit.com" skin** — owner/address/legal only, 100-cap, $2.99/mo upsell. The county's REAL data is on one of the systems above (find its actual portal).
- **PDF-only rolls** (Matagorda, Walker, Grimes-as-96MB-print), **GIS-shapefile-only** (Starr, Hill, Jasper, Fayette), **Pritchard&Abbott records-request**, **Wix/static** (Shelby).

---
*Maintained by the Miner session. When a fable-5 crack lands, add its recipe here + a loader in `data/`. Verdicts + per-county status live in `data/texas_county_system_map.md`; the 254-county scoreboard in `COUNTY_COVERAGE.md`.*
