# Texas CAD Data-Hunting Playbook

**How to find property attributes (beds / baths / pool / sqft / year) that a Texas appraisal
district HAS but doesn't hand you in the obvious file.** Written after a hunt that cracked Bexar,
Travis, and Tarrant — three "confirmed not available" verdicts that were all wrong. Use this before
concluding any county "doesn't have" a field, and before ever paying a vendor.

---

## The mindset (read this first)

1. **The appraisal district ALWAYS has beds/baths.** They physically appraise every home. If a
   field is blank in the file you're looking at, it's an *access* problem, not an *existence*
   problem — until you've checked every door below and still find nothing.
2. **"Not in the bulk flat file" ≠ "doesn't exist."** The bulk export is often the *worst*,
   most-stripped view. The data lives in the improvement/detail records, a GIS layer, or the live
   portal API.
3. **Never conclude "absent" from a column name or a layout spec.** The data is frequently
   *coded* (a row typed `252 = BEDROOMS`, or a feature string `"Rooms: Bedrooms 3"`), which a
   name/keyword search cannot see. You must inspect the *actual data values*, not the schema.
4. **The big lever (systems, not counties):** Texas CADs run a *handful* of software systems.
   Identify the system a county runs, then apply that system's recipe. Crack the system once →
   every county on it falls the same way. Maintain the system→county map in `HANDOFF.md`.

---

## The cross-check rule: the system is the common denominator

If a field looks "missing" in a county, **check what software that county runs, then check whether
ANY other county on the same system has that field.** If one does, the field is a **reading failure,
not a data gap** — go back and apply that system's proven recipe (right file / layer / API / codes).
**Do NOT accept "not available."**

- **Two or more same-system counties both "missing" the same field is a red flag** that our recipe
  for that system is incomplete. Push harder — don't conclude absence.
- **Why:** a software system is consistent in what it CAN store. If True Prodigy exposes beds/baths
  for Travis, it exposes them for Tarrant too — the only difference is the access door. (This exact
  rule would have flagged the Tarrant near-miss instantly: Travis and Tarrant both run True Prodigy,
  so "Tarrant has no beds" should have been suspect the moment Travis was cracked.)
- **Mechanism:** the verified-county table below doubles as a *proven-fields-per-system* ledger. Any
  county on a system that lacks a field that system is PROVEN to carry = a bug to fix, not a gap.
- **Only** conclude a system genuinely doesn't expose a field after applying its FULL recipe (every
  door — bulk coded rows, the current GIS/detail layer, AND the live API) across MULTIPLE counties
  and still finding nothing — and even then, confirm against a property page a human can read.

---

## Universal per-county checklist (run in this order)

For each county, find which door the data is behind:

1. **Identify the software.** Look at the property-search portal URL and footer ("Powered by…"),
   the data-download page, and known vendor patterns (below). This decides the recipe.
2. **Bulk flat-file export — check the DATA, not the layout.** Download the actual file. Does it
   carry beds/baths as (a) a **named column** that is actually *populated* (verify a non-empty
   count — columns can exist but ship 100% blank, e.g. Tarrant `Num_Bedrooms`), or (b) **coded
   rows** in an improvement-detail file (a `type_cd`/description of BEDROOMS with the count in a
   generic `area` column)?
3. **GIS / ArcGIS REST — find the CURRENT, DETAIL layer.** The CAD's own layer is often *stale* or
   summary-only. Dump every field (`?f=json`, `outFields=*`) and check coverage
   (`returnCountOnly=true`). Then check **regional republications** — river authorities, councils
   of government, county open-data hubs often host the CAD's *full current export* as a feature
   layer (this is how Bexar was solved).
4. **Live portal / property API.** Reverse-engineer the property-detail API (watch the SPA's
   network XHR). Beds/baths are usually there even when the bulk export blanks them. Mind the
   auth quirks (below).
5. **Property-detail page = proof.** If the public detail page *displays* beds/baths, the data
   exists — now find the API/source it reads from. If it *doesn't* display them even there, that's
   real evidence of absence.
6. Only after 1–5 all fail → records request (PIA), then (last resort) a **licensed** vendor.

---

## Per-system recipes (the heart of this)

### 1. True Prodigy (Harris Govern's new CAMA) — `{county}.prodigycad.com`
**Counties confirmed: Tarrant, Travis.** Many CADs are migrating to it. Beds/baths are served by a
free anonymous API, coded as improvement *features*.

```
BASE = https://prod-container.trueprodigyapi.com     # always send -A 'Mozilla/5.0 (...)'
1. GET  /trueprodigy/officelookup/{county}.prodigycad.com      -> {"office":"Tarrant"}
2. POST /trueprodigy/cadpublic/auth/token   body {"office":"Tarrant"}   -> a 5-minute JWT (raw)
   ****  CRITICAL: send  Authorization: <raw-token>   with NO 'Bearer ' prefix.  ****
   ****  'Bearer <token>' returns HTTP 500. This one word hid the entire dataset last time. ****
3. POST /public/property/search?page=1&pageSize=1&searchField=pid&searchText=<PropID>
        (paging is 1-BASED; page=0 -> 409)   -> results[0].pAccountID   (accountId != PropID!)
        valid searchField (from /public/config/propertysearch): pid, geoID, ownerID, name, dba,
        propType, marketValue, legalDescription
4. GET  /public/propertyaccount/{pAccountID}/improvement        -> improvement rows w/ pImprovementID
        (details[] typed ResMain = main dwelling, ResG = garage, ResP = porch; area/class/effYearBuilt)
5. GET  /public/propertyaccount/improvement/{pImprovementID}/features
        -> features[] under category "Rooms":  "Rooms: Bedrooms 3", "Rooms: Bathrooms 2"
```
**Parse nuance:** some properties split rooms across multiple `ResMain` segments as *fractional*
values that SUM to whole counts (e.g. `0.4539 + 2.5461 = 3` bedrooms). **Sum per property.**
**Scale nuance:** this is per-property (no bulk file). Use **fill-on-blank + cache-forever** — fetch
a parcel's beds/baths the first time a user taps/farms it, cache permanently — so you never mass-
harvest the CAD's server.

### 2. PACS (True Automation / Harris Govern legacy) — bulk improvement-detail file
**Counties: Travis (bulk), Harris (HCAD variant), Collin, and many.** Beds/baths are **coded rows**
in the improvement-detail export, NOT a named column.
- File: an `improvement_detail_{year}.zip` / `IMP_DET.TXT` (PACS "Appraisal Export" **File #8
  `APPRAISAL_IMPROVEMENT_DETAIL`**). Columns include `pID`, `imprvDetailType`,
  `imprvDetailTypeDesc`, **`area`**.
- **The `area` column holds the COUNT for room rows.** Travis codes: `252 = BEDROOMS`,
  `251 = BATHROOM` (already decimal, e.g. 2.5), `250 = HALF BATHROOM`, `604/602/609 = POOL RES`,
  `522/521 = FIREPLACE`. Aggregate per `pID`. (Descriptions vary by CAD vocabulary — match on the
  DESC text `BEDROOM`/`BATH`/`POOL`, not just the numeric code, since codes differ per district.)
- Note the PACS *layout spec* does NOT name a bedroom field — the data is in the type-coded rows,
  so **inspect the data, not the layout.**

### 3. Regional ArcGIS republication of the CAD's full export
**County confirmed: Bexar.** The CAD's OWN GIS layer may be stale/summary; the **current full
export** is often republished as a hosted feature layer by a regional body.
- Bexar: `https://gis.sara-tx.org/ags1/rest/services/FW_Bexar/BCAD_Parcels_PROD/FeatureServer/0`
  (San Antonio River Authority; from BCAD's Dec-2025 "Export Property Summary"). Fields:
  **`Bedrooms`, `Whole_Bath`, `Half_Bath`**, `Sq_ft`, `Yr_blt`, `Imprv_Type`. **99% coverage.**
  Join on **`Prop_id`** (= the PACS property id / our `source_property_id`). Pool: derive from
  `Imprv_Type LIKE '%RSW%'` (pool) / `%SPA%` (spa). Fields are strings; multi-improvement parcels
  are space-separated lists (`"2  2"`) — parse and sum.
- **How to find these:** search `"{county} parcels open data"`, check
  `gis-{county}.opendata.arcgis.com`, and regional hosts (river authorities, COGs, the county GIS
  vs. the CAD GIS). The CAD's own layer being stale is a *signal to look for the republication*,
  not to give up.

### 4. Direct CAD flat files with a SEPARATE building/fixtures file
**Counties: Harris, Dallas.** Beds/baths live in a *second* file, not the main parcel file.
- Harris (HCAD `Real_building_land.zip`): `building_res.txt` (sqft/year) + **`fixtures.txt`** (beds/
  baths as `type` RMB/RMF/RMH unit counts) + `extra_features.txt` (pools). Join on `acct`.
- Dallas: `NUM_BEDROOMS` / `NUM_FULL_BATHS` / `NUM_HALF_BATHS` + `POOL_IND`.
- **Lesson:** always look for a separate `fixtures` / `building` / `improvement` file beyond the
  main parcel/property export.

### 5. Tyler iasWorld / Orion
Native residential dwelling fields **`BEDRM`, `BATHRM`, `HF_BATHRM`, `ROOMS`** in the CAMA
residential extract. If a county runs iasWorld, these are usually populated — find the residential/
dwelling export or layer.

### 6. Pritchard & Abbott (small/rural + West TX)
Proprietary; data only via an owner-login portal (`datasearch.pandai.com`), no public bulk export,
no documented layout. **Treat as hard:** records request, or a licensed vendor. Don't burn days here.

---

## Capture the WHOLE improvement set, not just beds/baths (Reverse Prospecting gold)

Beds/baths/pool are the start, not the finish. Reverse Prospecting gets sharper with every
attribute a buyer might want: **casita / guest house / detached living, shed / workshop /
outbuilding, boat dock / waterfront, garage (type & count), solar, basement, greenhouse, RV/parking,
recreation court**, etc. All of it lives in the **same improvement/feature rows** you're already
parsing for beds/baths — it's nearly free to grab in the same pass.

Real improvement types seen live in the crawls:
- **Bexar** `Imprv_Type` codes: `RSW` (pool), `SPA`, `DLA`/`DLA1` (detached living / casita).
- **Travis / Tarrant** improvement types: `Pool-Swimming, Outbuilding 1–9, Storage Room, Studio,
  Enclosed Room, Boat Dock, Recreation Court, Green House, Basement, Porch, Elevator, Garage`.

**Do this:** while reading the improvement rows, capture the **full per-property improvement-type
list** into a flexible **`improvements` JSONB column on `parcels`** (add the column). Keep the raw
district descriptions for now — don't discard the long tail; we normalize to a common filter
vocabulary (`pool, casita, shed/workshop, boat_dock, solar, garage, …`) as a follow-up. Keep
dedicated booleans for the ones the app filters on first (`has_pool` exists; **casita** and
**shed/workshop** are the next most valuable). The app-side Reverse Prospecting filters for these
come later (app-session lane) once the data is populated — but capture it NOW, since re-parsing
every county later is the expensive path.

---

## Failure modes that hid the data last time (don't repeat these)

| Trap | What happened | Fix |
|---|---|---|
| **Name vs. code** | Searched for "bedroom"; data was `type 252` / `"Rooms: Bedrooms"` | Inspect data VALUES/codes, not just field names |
| **Layout vs. data** | Read the export *spec* (no bed field named); data was coded rows | Download and scan the actual data |
| **Stale/summary GIS** | Queried a 2021 summary layer with sqft-only | Find the CURRENT detail layer + regional republications |
| **`Bearer` prefix** | `Authorization: Bearer <jwt>` → HTTP 500 on every call | True Prodigy wants the RAW token, no `Bearer ` |
| **Empty-but-present column** | `Num_Bedrooms` column exists → assumed usable; 100% blank | Verify a *populated* count, not just presence |
| **accountId ≠ PropID** | Called improvement API with the public PropID | Do the `/property/search?searchField=pid` lookup first |
| **Fractional segments** | One dwelling's rooms split as `0.45 + 2.55` | Sum room values per property |

---

## Tooling gotchas
- **CAD sites 403 plain curl** — always `curl -sL -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'`.
- **ArcGIS REST:** `?f=json` (metadata + field list); `outFields=*&resultRecordCount=3&f=json`
  (sample rows); `where=<col><>''&returnCountOnly=true` (coverage %); check `supportedExportFormats`
  (bulk csv/geojson/filegdb) and `resultOffset` paging (some MapServers reject `resultRecordCount`
  — "Pagination is not supported" — then page differently or use the FeatureServer).
- **Big zips:** partial-inflate / stream `unzip -p file.zip member | head` to read a header or
  sample without downloading/expanding gigabytes.
- **SPA portals:** open the property-search page and watch the **network XHR** to discover the
  backing API base + endpoints; the JS bundle reveals endpoint paths.

---

## Verified results so far (grow this table as counties are cracked)

| County | Metro | System | Beds/baths source | Free? | Status |
|---|---|---|---|---|---|
| Harris | Houston | PACS (HCAD) | `fixtures.txt` bulk (RMB/RMF/RMH) | ✅ | **loaded** |
| Dallas | Dallas | — | `NUM_BEDROOMS` bulk | ✅ | **loaded** |
| Bexar | San Antonio | PACS → SARA ArcGIS | `BCAD_Parcels_PROD` FeatureServer (`Bedrooms`/`Whole_Bath`/`Half_Bath`), 99% | ✅ | **to build** (bulk) |
| Travis | Austin | PACS / True Prodigy | `improvement_detail` coded rows (252/251/250/604) | ✅ | **to build** (bulk parse) |
| Tarrant | Fort Worth | True Prodigy | live API `Rooms: Bedrooms/Bathrooms` | ✅ | **to build** (fill-on-blank API) |

---

## Legal note (matters — TapOwner registers as a data broker)
- **Clean / licensed:** anything from the appraisal district itself — bulk downloads, the CAD's
  GIS/ArcGIS layers, regional GIS republications, and the district's own public property API. This
  is **public appraisal record data**, fine to use and redistribute.
- **AVOID — legal risk:** scraped LISTING aggregators (MLS/Zillow/Redfin blends — e.g. RealtyAPI.io
  at ~$0.003/record, Datafiniti, listing-API resellers). Cheap because unlicensed; reselling it as
  a registered data broker is the exposure the legal gate exists to catch.
- If a licensed vendor is ever truly needed for a genuine holdout county, the clean options are
  **ATTOM / CoreLogic / Regrid** (authoritative public-record provenance) — never the scraped ones.
