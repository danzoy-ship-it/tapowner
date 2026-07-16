# Texas Building-Permit Coverage — the crack-the-system log

**Roofer vertical #2, data lane.** Mining free public building-permit data into the `permits` table (Miner lane owns it, alongside `parcels`; app session owns `parcel_signals`). Unblocks roofer signals #2 (re-roof permit dates) + #3 (solar-permit tell), reusable across remodeler/solar/pool verticals. Metros first.

**Method (same as the CAD campaign):** identify each jurisdiction's permit SYSTEM, crack it once, apply to every jurisdiction on it. Capture ALL permit types (roof/solar flagged roofer-priority; everything kept for other verticals). Join permit → parcel: jurisdiction's own parcel id → else spatial `ST_Contains(parcels.geom, point)` → else normalized address.

**Files:** `data/permits_setup.py` (idempotent table) · `data/permit_categorize.py` (category normalizer) · `data/load_socrata_permits.py` (`--dataset ID` loads extra datasets under one jurisdiction, e.g. Dallas fiscal-year files) · `data/load_arcgis_permits.py` · `data/load_csv_permits.py` (CKAN/CSV bulk w/ pyproj State-Plane→WGS84 reprojection) · `data/join_permits_to_parcels.py` · `data/recategorize_permits.py`.

## Capture spec (per TAPROOFERS_SIGNALS.md / ROOFER_SIGNALS.md — the `permits` table serves ~8 roofer signals + remodeler/solar/pool)
The table is **vertical-generic** (no roofer-specific columns). Each permit captures what the signals need:
- **`issued_date`** (REQUIRED — aging / recency / claim-window / storm-window signals key on it). Coverage: Austin/SA/Dallas/Buda 100%; NB 60%, Seguin 73%, San Marcos 74% (the rest are applied-but-not-yet-issued — filter `issued_date IS NOT NULL`).
- **`description`** (raw free-text) + **`permit_type_raw`** (verbatim type/work/class strings) — kept RAW, not just a code, so the **metal-roof signal (#13)** reads "metal" from the text and **storm-adjacent-repair (#17)** can tell a re-roof from a fence/window/gutter job. (metal-in-text found: Austin 3,130 · Seguin 1,079 · NB 317 · others fewer.)
- **`permit_category`** (normalized) covers: **roof, solar, remodel, addition, pool, fence, window, gutter, hvac, new_build**, + electrical/plumbing/demolition/irrigation/sign/other. Roof + solar are roofer-priority; window/gutter/fence are split out for signal #17. Re-derive anytime with `data/recategorize_permits.py` after editing `permit_categorize.py`.
- Plus: `valuation` (where the source has it), `address`, `geom` (Point 4326), `parcel_id` (matched homeowner), `jurisdiction`, `source_system`.

## Permit SYSTEMS in Texas (crack once, apply to the family)
| System | How to pull | Loader | Status |
|---|---|---|---|
| **Socrata open-data** (`data.{city}.gov`) | SODA API `/resource/{4x4}.json`, paginate `$offset`; `--dataset` to sweep a city's multiple fiscal-year files | `load_socrata_permits.py` | ✅ CRACKED (Austin, Dallas) |
| **ArcGIS FeatureServer / MapServer** | whole-layer `/query?where=1=1&outFields=*`, paginate `resultOffset`; `outSR=4326` for coords from geometry | `load_arcgis_permits.py` | ✅ CRACKED (San Antonio, New Braunfels, San Marcos) |
| **CKAN open-data** (`data.{city}.gov` CKAN) | `package_show`/`resource_show` → whole-file CSV download; reproject mixed State-Plane/WGS84 X/Y via pyproj | `load_csv_permits.py` | ✅ CRACKED (San Antonio historical bulk) |
| **Accela Citizen Access** | per-permit portal — but cities usually publish an ArcGIS/CKAN MIRROR (crack the mirror, not the portal) | — | pattern known (SA/NB were Accela→mirror) |
| **Tyler EnerGov / CityView / CivicPlus** | look for the ArcGIS/open-data export the portal feeds | — | ⬜ (NB unifies Accela+Cityworks in one ArcGIS layer) |

## Jurisdiction coverage log
| ☑ | Jurisdiction | County | System | Source | Permits | roof / solar | Join |
|---|---|---|---|---|---|---|---|
| ✅ | **Austin** | Travis 48453 | Socrata | data.austintexas.gov `3syk-w9eu` | 2,365,555 | 51,167 / 26,940 | key+spatial **93% (2.20M)** |
| ✅ | **San Antonio** | Bexar 48029 | CKAN CSV (Accela) | data.sanantonio.gov `c22b1ef2…` PERMITS ISSUED 2020→2024 (+ArcGIS 2025+ mirror) | 423,293 | 28,339 / 15,853 | spatial+addr **93%** |
| ✅ | **Dallas** | Dallas 48113 | Socrata | www.dallasopendata.com `e7gq-4sah` + 4 fiscal-year files `azf5-sdcr`/`fs84-rv8z`/`rzm4-tcqx`/`w2uy-zn9f` | 435,311 | 9,583 / 3,139 | address **15% (68K)** — pre-2018 FY files are addr-less (see note); **open data ends Aug 2020** |
| ✅ | **New Braunfels** | Comal 48091 | ArcGIS (Accela+Cityworks) | gismaps.newbraunfels.gov `.../PlanningZoning/MapServer/10` | 184,664 | 6,455 / 2,959 | spatial **53%** (rest lack coords / in ETJ) |
| ✅ | **Seguin** | Guadalupe 48187 | ArcGIS (Tyler EnerGov mirror) | gis.seguintexas.gov `.../Permits/Permits/FeatureServer/0` | 141,389 | 6,317 / 627 | spatial **99%** |
| ✅ | **San Marcos** | Hays 48209 | ArcGIS (MyPermitNow) | smgis.sanmarcostx.gov `.../CoSM_BuildingPermits/FeatureServer/0` | 50,288 | 1,619 / 811 | spatial **93%** |
| ✅ | **Fort Worth** | Tarrant 48439 | ArcGIS Server (self-hosted) | mapit.fortworthtexas.gov `.../CIVIC/Permits/MapServer/0` | 707,960 | 7,945 / 18,852 | spatial+addr **87%** |
| ✅ | **Buda** | Hays 48209 | ArcGIS (MGO/MyPermitNow) | services6.arcgis.com/vXZW4vAaPRr14z2s `.../Permits/FeatureServer/0` | 137 | 1 / 0 | spatial 92% |

**POC total: 3,600,637 permits; 2,945,129 matched to a homeowner parcel.** Corridor (the roofer's SA↔Austin I-35 territory: Travis/Bexar/Comal/Guadalupe/Hays) = 3.17M; Dallas = 435K bonus metro. Roofer signals unlocked: **66,480 parcels with a roof-permit date (signal #2); 38,220 parcels with a solar permit (signal #3; 6,057 since 2024)** — each a real homeowner name + address.

**Data-accuracy pass (2026-07-16):** SA and Dallas were under-counted on first load and were re-mined.
- **San Antonio** was 102,894 (an ArcGIS layer that only holds a rolling ~18-mo window, 2025+). Re-pulled the CKAN historical CSV (`c22b1ef2…`, 368K rows 2020-07→2024-12) via `load_csv_permits.py` → **423,293** (now correctly > NB/Seguin, matching city size).
- **Dallas** was 126,840 (only the rich 2018-2020 `e7gq` file). Loaded the 4 fiscal-year files (FY2011-12 → FY2017-18) → **435,311** (full contiguous 2010→Aug-2020 history). ⚠️ **Dallas publishes no free building-permit data after Aug 2020** — the open-data feed was discontinued; this is a source limit, not a capture gap, and is why Dallas (10-yr window) trails Austin (100-yr history) despite being a bigger city.

## ★ Roof-age model — the roofer's flagship scheme (`data/roof_age_model.py`)
Homeowners insurers drop/limit coverage on a roof around **15 years** old, so a roof older than ~15 yr is a live re-roof lead. We estimate each parcel's **current roof age** as:

> `last_roof_date = GREATEST(year_built (Jan 1), latest re-roof permit issued_date)` → **EXPIRED (lead)** if `last_roof_date < today − 15 years`.

- **`parcels.year_built`** (from the CAD load) = the **original** roof date (baseline).
- a **`permit_category='roof'` permit** = a **re-roof** that resets the clock (the correction layer).
- This is exactly why permit **DEPTH matters more than recency**: to trust an "old roof" flag we must be able to see a re-roof going back ~20 yr. Where permits are shallow, a pre-window re-roof is invisible and a year_built-only "expired" flag risks a **false positive** (roof was actually replaced, we just can't see it).

**Corridor quantification (2026-07-16), 15-yr threshold:**
| County | parcels | estimable | has re-roof pmt | **EXPIRED (leads)** | pmt-saved | yb-only |
|---|---|---|---|---|---|---|
| Travis/Austin | 828,773 | 344,223 | 22,167 | **256,770** | 6,071 | 243,066 |
| Bexar/San Antonio | 709,541 | 625,370 | 26,474 | **465,843** | 25,109 | 465,843 |
| Comal/New Braunfels | 103,537 | 4,244 | 4,244 | **0** ⚠️ | 0 | 0 |
| Guadalupe/Seguin | 95,571 | 71,155 | 4,390 | **42,669** | 1,747 | 40,351 |
| Hays/San Marcos | 117,427 | 94,251 | 1,204 | **38,481** | 715 | 38,481 |
| **TOTAL** | 1,854,849 | 1,139,243 | 58,479 | **803,763** | **33,642** | — |

- **EXPIRED = the lead pool (803,763 corridor homes** with a >15-yr roof).
- **pmt-saved (33,642)** = homes whose age says "old roof" but a re-roof permit proves it's fresh — **false positives the permit layer already prevented.** This grows with permit depth; it's the concrete ROI of mining permits.
- **yb-only** = expired on year_built alone (no roof permit) → higher false-pos risk where permit history is shallow. Bexar/Hays are 100% yb-only because their permits only start 2020/2013 (any roof permit there is <15 yr = fresh, so it can't appear in the expired set).

**Roof-history DEPTH per jurisdiction (the number that governs false-positive rate):**
| Jurisdiction | roof permits back to | verdict |
|---|---|---|
| Austin (Travis) | **1978** | ✅ 48 yr — excellent |
| Seguin (Guadalupe) | **1994** | ✅ 32 yr |
| New Braunfels (Comal) | 2013 | ⚠️ 13 yr |
| San Marcos (Hays) | 2013 | ⚠️ 13 yr |
| San Antonio (Bexar) | **2020** | ❌ 6 yr — no free pre-2020 source (rely on year_built; records-request could add 2005-2019) |
| Dallas | 2018 | ❌ roofs only 2018-2020 (pre-2018 files are type-only, roofs unidentifiable) |

**Two data gaps this exposes (being worked):**
1. **Comal/New Braunfels has ZERO `year_built`** (parcels loaded from a GIS/ownership source without building detail) → the model is blind on the roofer's home turf (only 4% estimable). **Fix in flight:** cracking Comal Appraisal District's improvement roll to backfill year_built.
2. **San Antonio's 6-yr permit depth** means its 465K "expired" flags rest on year_built alone. year_built (88% coverage) is a sound baseline, but a City-of-SA records request for 2005-2019 re-roof permits would sharpen it (removes false positives from mid-2010s re-roofs).

**Handoff:** the canonical CTE lives in `data/roof_age_model.py` (`MODEL_SQL`). Writing the signal into `parcel_signals` is the **app session's lane** (miner lane owns `parcels`+`permits`); this doc + that query are the handoff.

**Perf note:** the spatial join MUST scope parcels to the county in a temp table + fresh GIST — a correlated `county_fips` filter forces a per-permit BitmapAnd over the whole county (New Braunfels: >5min → 6s after the fix).

## Corridor cities with NO free bulk source (records-request only, verified 2026-07-16)
Closed permit portals (EnerGov-CSS / CityView / MyGovernmentOnline) with no published ArcGIS/Socrata/CKAN mirror after full org-directory enumeration:
- **Kyle** (Hays) — Tyler EnerGov CSS; ArcGIS org has only geocoding reference layers, no permit table.
- **Dripping Springs** (Hays) — MyGovernmentOnline; city ArcGIS has only zoning/parcels.
- **Schertz** (Guadalupe) — CityView Portal (per-property search only); ArcGIS has only CityView basemap layers.
- **Cibolo** (Guadalupe) — MyGovernmentOnline; ArcGIS has only subdivision/plat tracking.
- **Hays County / Guadalupe County unincorporated** — no county-wide permit dataset (TX counties have little building-permit authority outside city limits; both open-data catalogs confirmed zero permit layers). Buda is thin (137, rolling ~6-mo window) — re-pull periodically to accumulate history.

## Next metros — surveyed 2026-07-16
- ✅ **Fort Worth** (Tarrant 48439) — **CRACKED + LOADED.** Self-hosted ArcGIS Server `mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Permits/MapServer/0` — **707,960 permits, 2016→2026** (live), WGS84 lat/lon pre-supplied → **spatial+addr join 87% (613,912)**. roof 7,945 / solar 18,852 (solar verified real — descriptions are "SOLAR ROOFTOP"/"roof-mounted PV"). OID field is `CAPID` (not OBJECTID; loader now takes a per-city `oid`). (Socrata `quz7-xnsy` is a dead Hub ghost — ignore.) NOTE depth is 2016 (10 yr) — short of the 20-yr roof-scheme ideal.
- ❌ **Houston** (Harris 48201) — **no free bulk source** (verified exhaustively: CKAN has only monthly-aggregate xlsx; the ArcGIS "SF_BuildingPermits" items are 88-row analyst extracts, not feeds; public UI is a rolling 3-yr window). → **records request** (TPIA, 832-394-8800; their retention is residential 1988→present, commercial 1972→present — ask for a bulk CSV export filtered to roof/re-roof).
- ⚠️ **El Paso** (El Paso 48141) — free open data (`gis.elpasotexas.gov` NewResidential/NewCommercial) is **new-construction only** (1994-2026, 0 roof rows). The full permit universe (incl. re-roofs) is on **CivicData.com** (Accela mirror, `BuildingPermitsV2`/`PermitsV4`) but **login-gated** — needs a free CivicData.com account (a Frederick task; I can't create accounts). Once in: `datastore_search` the resource, filter roof/reroof, verify min/max issued_date (Accela depth = usually only back to the city's system-migration date, so 20-yr not guaranteed).
- + suburbs (Plano, Arlington, Frisco, Round Rock, Sugar Land …) — mostly ArcGIS/CivicPlus/EnerGov.

## Permit records-requests / gated sources (need Frederick — roofer lane)
| Metro | What / how |
|---|---|
| **Houston** (Harris 48201) | TPIA request, City of Houston Permitting Center Open Records — 832-394-8800 / houstontx.gov/publicinformation. Ask: bulk digital (CSV/Excel) export of residential+commercial building permits filtered to type/description ROOF/RE-ROOF/REROOF, full retained range (residential 1988→present). |
| **El Paso** (El Paso 48141) | Register free at civicdata.com → pull `BuildingPermitsV2` (pkg `15eadb61-877d-41b0-b4a3-67f14b12a48c`) via `datastore_search`; filter roof/reroof; check depth. |
| **San Antonio pre-2020** (Bexar 48029) | Optional depth-booster: City of SA records request for 2005-2019 re-roof permits, to reduce roof-age false positives (free source only reaches 2020). |

## Notes / caveats
- **New Braunfels & San Marcos** carry `Contractor_Name` (+ NB has `Contractor_Regnbr` license #) — bonus roofer-competitor intel (who's already working which streets).
- **San Antonio** `X_COORD/Y_COORD` are mixed-projection in the raw CKAN CSV (some WGS84, some State-Plane-feet / EPSG 2278); `load_csv_permits.py` detects projection by magnitude and reprojects the State-Plane rows via pyproj, sanity-checking the result falls inside Texas (else falls back to address join). The ArcGIS 2025+ mirror is kept as a top-up for the newest permits.
- **Dallas** — the rich `e7gq` file (2018-2020) has street_address + work_description + value and joins by address (~52% of the addressed rows). The 4 older fiscal-year files (2011-2018) are **thin — only permit#/type/date/mapsco, no address** — so they add accurate counts + roof/solar-by-type but can't be parcel-matched (hence the 15% overall join). `6ik7-4gqj` "Permit Points" carries xcoord/ycoord if a future spatial pass is wanted. No free source exists for Dallas post-Aug-2020.
- Dallas parcel `situs_address` embeds the city/zip inline (`4508  GILBERT AVE   ,DALLAS, TX 752192121`) vs permits' clean street; the join's address normalizer now cuts at the first comma / unit token, which is what took Dallas from 0% → matched.
- All sources verified live/current as of 2026-07-16 (samples returned permits issued within days), **except Dallas** whose open data ends Aug 2020.
