# Texas Building-Permit Coverage — the crack-the-system log

**Roofer vertical #2, data lane.** Mining free public building-permit data into the `permits` table (Miner lane owns it, alongside `parcels`; app session owns `parcel_signals`). Unblocks roofer signals #2 (re-roof permit dates) + #3 (solar-permit tell), and is reusable across remodeler/solar/pool verticals. Metros first — that's where the roofs are.

**Method (same as the CAD campaign):** identify each jurisdiction's permit SYSTEM, crack it once, apply to every jurisdiction on it. Capture ALL permit types (roof/solar flagged roofer-priority; everything else kept for other verticals). Join permit → parcel by the jurisdiction's own parcel id → else spatial `ST_Contains(parcels.geom, point)` → else normalized address.

**Schema:** `data/permits_setup.py` (idempotent). Category normalizer: `data/permit_categorize.py` (roof, solar, pool, addition, remodel, new_build, hvac, electrical, plumbing, demolition, irrigation, fence, sign, other). Loaders: `data/load_socrata_permits.py` (+ `join_permits_to_parcels.py`).

## Permit SYSTEMS in Texas (the ~handful to crack)
| System | How to pull | Loader | Status |
|---|---|---|---|
| **Socrata open-data** (`data.{city}.gov`) | SODA API `/resource/{4x4}.json`, paginate `$offset` | `load_socrata_permits.py` | ✅ CRACKED (Austin, Dallas) |
| **ArcGIS Hub / FeatureServer** | whole-layer `/query?where=1=1&outFields=*` (reuse `load_bis_gis.py` pattern) | TBD `load_arcgis_permits.py` | ⏳ survey |
| **Accela Citizen Access** | ACA portal; often an ArcGIS/report export behind it | — | ⬜ not surveyed |
| **Tyler EnerGov / CityView** | portal; look for an open-data/report export | — | ⬜ not surveyed |
| **CivicPlus / other** | varies | — | ⬜ not surveyed |

## Jurisdiction coverage log
| ☑ | Jurisdiction | County | System | Dataset / URL | Rows | Join | Status |
|---|---|---|---|---|---|---|---|
| ☑ | **Austin** | Travis 48453 | Socrata | data.austintexas.gov `3syk-w9eu` (Issued Construction Permits) | ~2.37M | tcad_id→apn (97%) | LOADING |
| ☐ | **Dallas** | Dallas 48113 | Socrata | www.dallasopendata.com `e7gq-4sah` (Building Permits) | ~127K | address (no coords/key in dataset; `6ik7-4gqj` Permit Points has coords if needed) | queued |
| ☐ | **San Antonio** | Bexar 48029 | not Socrata | — | — | — | needs survey (ArcGIS/Accela) |
| ☐ | **Houston** | Harris 48201 | not Socrata | data.houstontx.gov = ArcGIS | — | — | needs survey |
| ☐ | **Fort Worth** | Tarrant 48439 | ArcGIS (Socrata entry is a dead legacy Hub) | — | — | — | needs survey |
| ☐ | **El Paso** | El Paso 48141 | not Socrata | — | — | — | needs survey |

## Impasse / revisit notes
- **Fort Worth** `data.fortworthtexas.gov` Socrata catalog lists "Development Permits" (`quz7-xnsy`) but the endpoint is a decommissioned ArcGIS-Hub legacy page ("site no longer supported") → their live permits are on a current ArcGIS/Accela endpoint, needs discovery.
- **San Antonio / Houston / El Paso** have no Socrata permit dataset → ArcGIS FeatureServer or Accela. Crack-fleet survey pending (ask before dispatching, per standing rule).
- **Dallas** rich dataset has no lat/lon or parcel key — joined by normalized address (partial). The `6ik7-4gqj` "Permit Points" set has xcoord/ycoord if a spatial join is preferred later.
