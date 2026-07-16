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
| ✅ | **Buda** | Hays 48209 | ArcGIS (MGO/MyPermitNow) | services6.arcgis.com/vXZW4vAaPRr14z2s `.../Permits/FeatureServer/0` | 137 | 1 / 0 | spatial 92% |

**POC total: 3,600,637 permits; 2,945,129 matched to a homeowner parcel.** Corridor (the roofer's SA↔Austin I-35 territory: Travis/Bexar/Comal/Guadalupe/Hays) = 3.17M; Dallas = 435K bonus metro. Roofer signals unlocked: **66,480 parcels with a roof-permit date (signal #2); 38,220 parcels with a solar permit (signal #3; 6,057 since 2024)** — each a real homeowner name + address.

**Data-accuracy pass (2026-07-16):** SA and Dallas were under-counted on first load and were re-mined.
- **San Antonio** was 102,894 (an ArcGIS layer that only holds a rolling ~18-mo window, 2025+). Re-pulled the CKAN historical CSV (`c22b1ef2…`, 368K rows 2020-07→2024-12) via `load_csv_permits.py` → **423,293** (now correctly > NB/Seguin, matching city size).
- **Dallas** was 126,840 (only the rich 2018-2020 `e7gq` file). Loaded the 4 fiscal-year files (FY2011-12 → FY2017-18) → **435,311** (full contiguous 2010→Aug-2020 history). ⚠️ **Dallas publishes no free building-permit data after Aug 2020** — the open-data feed was discontinued; this is a source limit, not a capture gap, and is why Dallas (10-yr window) trails Austin (100-yr history) despite being a bigger city.

**Perf note:** the spatial join MUST scope parcels to the county in a temp table + fresh GIST — a correlated `county_fips` filter forces a per-permit BitmapAnd over the whole county (New Braunfels: >5min → 6s after the fix).

## Corridor cities with NO free bulk source (records-request only, verified 2026-07-16)
Closed permit portals (EnerGov-CSS / CityView / MyGovernmentOnline) with no published ArcGIS/Socrata/CKAN mirror after full org-directory enumeration:
- **Kyle** (Hays) — Tyler EnerGov CSS; ArcGIS org has only geocoding reference layers, no permit table.
- **Dripping Springs** (Hays) — MyGovernmentOnline; city ArcGIS has only zoning/parcels.
- **Schertz** (Guadalupe) — CityView Portal (per-property search only); ArcGIS has only CityView basemap layers.
- **Cibolo** (Guadalupe) — MyGovernmentOnline; ArcGIS has only subdivision/plat tracking.
- **Hays County / Guadalupe County unincorporated** — no county-wide permit dataset (TX counties have little building-permit authority outside city limits; both open-data catalogs confirmed zero permit layers). Buda is thin (137, rolling ~6-mo window) — re-pull periodically to accumulate history.

## Not-yet-mined metros (next targets)
- **Houston** (Harris 48201) — no Socrata; ArcGIS/Accela mirror to survey.
- **Fort Worth** (Tarrant 48439) — Socrata entry is a dead legacy Hub; live ArcGIS/Accela to survey.
- **El Paso** (El Paso 48141) — no Socrata; survey.
- + suburbs (Plano, Arlington, Frisco, Round Rock, Sugar Land …) — mostly ArcGIS/CivicPlus/EnerGov.

## Notes / caveats
- **New Braunfels & San Marcos** carry `Contractor_Name` (+ NB has `Contractor_Regnbr` license #) — bonus roofer-competitor intel (who's already working which streets).
- **San Antonio** `X_COORD/Y_COORD` are mixed-projection in the raw CKAN CSV (some WGS84, some State-Plane-feet / EPSG 2278); `load_csv_permits.py` detects projection by magnitude and reprojects the State-Plane rows via pyproj, sanity-checking the result falls inside Texas (else falls back to address join). The ArcGIS 2025+ mirror is kept as a top-up for the newest permits.
- **Dallas** — the rich `e7gq` file (2018-2020) has street_address + work_description + value and joins by address (~52% of the addressed rows). The 4 older fiscal-year files (2011-2018) are **thin — only permit#/type/date/mapsco, no address** — so they add accurate counts + roof/solar-by-type but can't be parcel-matched (hence the 15% overall join). `6ik7-4gqj` "Permit Points" carries xcoord/ycoord if a future spatial pass is wanted. No free source exists for Dallas post-Aug-2020.
- Dallas parcel `situs_address` embeds the city/zip inline (`4508  GILBERT AVE   ,DALLAS, TX 752192121`) vs permits' clean street; the join's address normalizer now cuts at the first comma / unit token, which is what took Dallas from 0% → matched.
- All sources verified live/current as of 2026-07-16 (samples returned permits issued within days), **except Dallas** whose open data ends Aug 2020.
