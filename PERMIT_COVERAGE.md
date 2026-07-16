# Texas Building-Permit Coverage — the crack-the-system log

**Roofer vertical #2, data lane.** Mining free public building-permit data into the `permits` table (Miner lane owns it, alongside `parcels`; app session owns `parcel_signals`). Unblocks roofer signals #2 (re-roof permit dates) + #3 (solar-permit tell), reusable across remodeler/solar/pool verticals. Metros first.

**Method (same as the CAD campaign):** identify each jurisdiction's permit SYSTEM, crack it once, apply to every jurisdiction on it. Capture ALL permit types (roof/solar flagged roofer-priority; everything kept for other verticals). Join permit → parcel: jurisdiction's own parcel id → else spatial `ST_Contains(parcels.geom, point)` → else normalized address.

**Files:** `data/permits_setup.py` (idempotent table) · `data/permit_categorize.py` (category normalizer) · `data/load_socrata_permits.py` · `data/load_arcgis_permits.py` · `data/join_permits_to_parcels.py`.

## Permit SYSTEMS in Texas (crack once, apply to the family)
| System | How to pull | Loader | Status |
|---|---|---|---|
| **Socrata open-data** (`data.{city}.gov`) | SODA API `/resource/{4x4}.json`, paginate `$offset` | `load_socrata_permits.py` | ✅ CRACKED (Austin, Dallas) |
| **ArcGIS FeatureServer / MapServer** | whole-layer `/query?where=1=1&outFields=*`, paginate `resultOffset`; `outSR=4326` for coords from geometry | `load_arcgis_permits.py` | ✅ CRACKED (San Antonio, New Braunfels, San Marcos) |
| **CKAN open-data** (`data.{city}.gov` CKAN) | whole-file CSV download, or `datastore_search` API | (SA is CKAN; its ArcGIS mirror was used) | ✅ (via ArcGIS mirror) |
| **Accela Citizen Access** | per-permit portal — but cities usually publish an ArcGIS/CKAN MIRROR (crack the mirror, not the portal) | — | pattern known (SA/NB were Accela→mirror) |
| **Tyler EnerGov / CityView / CivicPlus** | look for the ArcGIS/open-data export the portal feeds | — | ⬜ (NB unifies Accela+Cityworks in one ArcGIS layer) |

## Jurisdiction coverage log
| ☑ | Jurisdiction | County | System | Source | Permits | roof / solar | Join |
|---|---|---|---|---|---|---|---|
| ✅ | **Austin** | Travis 48453 | Socrata | data.austintexas.gov `3syk-w9eu` | 2,365,555 | 30,607 / 26,940 | key+spatial **93% (2.20M)** |
| ✅ | **San Antonio** | Bexar 48029 | ArcGIS (Accela mirror) | services.arcgis.com/g1fRTDLeMgspWrYp `Permits_Issued` | 102,894 | 9,519 / 1,573 | spatial **99%** |
| ✅ | **Dallas** | Dallas 48113 | Socrata | www.dallasopendata.com `e7gq-4sah` | 126,840 | 11,178 / 3,465 | address **0%** — needs `6ik7-4gqj` Permit-Points coords (bonus, not corridor) |
| ✅ | **New Braunfels** | Comal 48091 | ArcGIS (Accela+Cityworks) | gismaps.newbraunfels.gov `.../PlanningZoning/MapServer/10` | 184,664 | 6,324 / 2,959 | spatial **53%** (rest lack coords / in ETJ) |
| ✅ | **San Marcos** | Hays 48209 | ArcGIS (MyPermitNow) | smgis.sanmarcostx.gov `.../CoSM_BuildingPermits/FeatureServer/0` | 50,288 | 1,568 / 811 | spatial **93%** |
| ✅ | **Seguin** | Guadalupe 48187 | ArcGIS (Tyler EnerGov mirror) | gis.seguintexas.gov `.../Permits/Permits/FeatureServer/0` | 141,389 | 4,269 / 627 | spatial **99%** |
| ✅ | **Buda** | Hays 48209 | ArcGIS (MGO/MyPermitNow) | services6.arcgis.com/vXZW4vAaPRr14z2s `.../Permits/FeatureServer/0` | 137 | 1 / 0 | spatial 92% |

**POC total: ~3.07M permits across the SA↔Austin I-35 corridor** (Travis/Comal/Bexar/Hays/Guadalupe + Dallas bonus); **2.58M matched to a homeowner parcel.** Roofer signals unlocked: **34,692 parcels with a roof-permit date (signal #2); 22,742 parcels with a solar permit (signal #3; 4,355 since 2024).**

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
- **San Antonio** `X_COORD/Y_COORD` are mixed-projection in the raw CKAN CSV (some WGS84, some State-Plane-feet); the ArcGIS mirror we used returns them cleaner, and the loader rejects out-of-range coords (falls back to address join). Some SA permits will match by address only.
- **Dallas** dataset has no coords/parcel key → address join only (partial). `6ik7-4gqj` "Permit Points" has xcoord/ycoord if a spatial join is wanted later.
- All sources verified live/current as of 2026-07-16 (samples returned permits issued within days).
