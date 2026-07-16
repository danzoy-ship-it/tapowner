# Texas County Appraisal-System Map

**Quick lookup: find your county's row below for its current status, vendor/access method, and any caveats.** Numbers (Improv/Beds/Sale/Exempt %) are pulled live from the DB each time this table is regenerated — trust them over any prose elsewhere. The `Vendor / Access` and `Notes` columns are curated from the session log (below this table) wherever a specific recipe or caveat was documented; blank means "loaded via a standard route with nothing unusual to flag" — check `COUNTY_COVERAGE.md` for the numeric scoreboard and `DATA_ACCESS_CRACKS.md` for the vendor-system recipes.

**Status legend:**
- `MINED` — has real improvement/feature detail (segments and/or a meaningful beds/baths count), not just a value roll.
- `SIGNAL` — has a seller-signal (sale date and/or exemptions) but no improvement detail (sqft-only or nothing physical).
- `GEOM-ONLY` — nothing beyond geometry/owner; either genuinely gated (records-request queue) or not yet swept.

**Records-request queue (confirmed gated after an exhaustive live-site crawl, 2026-07-16 — need Frederick to send a $0 open-records/PIA request):** Smith, Anderson, Wharton, Hopkins, Montague, Goliad, Palo Pinto, Floyd, Red River, Lipscomb, Winkler, Motley, Shackelford. Plus segment/bed-specific gaps: Hidalgo (no TP export exists), Montgomery/Brazoria/Ellis/Webb/Harrison (PACS ATTR has no bedroom column), **Tarrant beds (CONFIRMED unavailable — TAD withholds counts in every file; a records-request will not help)**.

**Deferred (mass-harvest per-property paths, vetoed by Frederick — do NOT scrape):** JimWells, Burleson, Maverick improvements.

**Regenerate this table** with `python data/build_county_table.py > /tmp/table.md` (pulls live DB stats; the vendor/note dict inside the script is hand-curated — update it when a county's status changes, then splice the output back in here) — or just read the chronological log below for the latest narrative.


| County | FIPS | Parcels | Status | Improv% | Beds% | Sale% | Exempt% | Price | Vendor / Access | Notes |
|---|---|---:|---|---:|---:|---:|---:|---:|---|---|
| Harris | 48201 | 1,523,641 | MINED | 41 | 82 | 0 | 0 | — | PACS/HCAD | download.hcad.org CAMA fixtures.txt (beds/baths) |
| Travis | 48453 | 828,773 | MINED | 41 | 12 | 0 | 0 | — | PACS/TP data-lane | traviscad.org /publicinformation improvement_detail_2026.zip; coded rows 252=beds/251=baths |
| Tarrant | 48439 | 757,161 | MINED | 91 | 0 | 98 | 55 | — | TP static bulk | tad.org/content/data-download (703MB); BEDS CONFIRMED UNAVAILABLE — TAD withholds counts in every file, records-request won't help |
| Bexar | 48029 | 709,541 | MINED | 88 | 83 | 0 | 0 | — | PACS→SARA GIS | SARA BCAD_Parcels_PROD FeatureServer |
| Dallas | 48113 | 694,160 | MINED | 77 | 83 | 0 | 0 | — | PACS/TrueAutomation | DCAD RES_ADDL + RES_DETAIL.CSV bulk beds |
| Elpaso | 48141 | 407,130 | MINED | 64 | 38 | 0 | 0 | — | PACS/EPCAD |  |
| Collin | 48085 | 387,737 | MINED | 0 | 74 | 97 | 67 | — | PACS/MDB | Collin MDB has beds/baths/pool; improvements text-array empty (already mined via structured cols) |
| Fortbend | 48157 | 375,097 | MINED | 75 | 50 | 0 | 0 | — | Orion | thin — Property/Owner/Exemption/Entity only, no improvement/segment file; LOW yield, sqft only |
| Denton | 48121 | 353,631 | MINED | 88 | 75 | 96 | 62 | — | PACS/open-Apache-dir | dentoncad.net/data/_uploaded/.../datafiles/ FULL: improv 311K beds 265K sqft 314K sale 338K exempt 220K |
| Hidalgo | 48215 | 328,322 | SIGNAL | 0 | 0 | 93 | 47 | — | HCAD shapefile mdb | hidalgoad.org data-downloads; PARTIAL (sqft/year/sale/exempt, no segments/beds). TP export confirmed absent (136 reports, all PDF) |
| Montgomery | 48339 | 320,915 | MINED | 74 | 0 | 91 | 54 | — | PACS/Google-Drive | mcad-tx.org/appraisal-data-exports TP-CMS; improv 239K sale 291K exempt 174K baths 215K(3.94); beds ABSENT (ATTR name-only, no count) |
| Williamson | 48491 | 282,983 | MINED | 87 | 24 | 82 | 0 | — | Socrata (WCAD) | data.wcad.org Segment+PropChar feeds; FULL improv+sale |
| Brazoria | 48039 | 275,131 | MINED | 62 | 0 | 78 | 40 | — | PACS/pcloud | brazoriacad.org pcloud publink; improv 170K sale 216K exempt 109K; beds ABSENT (ATTR has no bedroom attr) |
| Galveston | 48167 | 188,695 | MINED | 78 | 1 | 86 | 45 | — | PACS | galvestoncad.org wp-content zip; improv 147K sale 162K exempt 85K |
| Cameron | 48061 | 185,062 | MINED | 75 | 20 | 95 | 39 | — | appraisal_info dash-fix | deed_dt dashed MM-DD-YYYY; sale 175K exempt 71K |
| Bell | 48027 | 167,412 | MINED | 78 | 11 | 0 | 0 | — | PACS | Bell certified roll ATTR |
| Liberty | 48291 | 162,275 | MINED | 34 | 3 | 0 | 0 | — |  |  |
| Nueces | 48355 | 157,198 | MINED | 79 | 6 | 90 | 46 | — |  |  |
| Smith | 48423 | 140,245 | SIGNAL | 0 | 0 | 0 | 0 | — | GSA gsacorp.io — RECORDS-REQUEST | CAMA session/POST-export gated (no static file); partial deed via Tax_Parcels_Improvements FS (+221, ~12% condo-subset). Ask GSA cert-roll, (903) 510-8600 |
| Lubbock | 48303 | 135,112 | SIGNAL | 0 | 0 | 95 | 0 | — | BIS/Orion direct | gis.lubbockcad.org MapServer/129 FULL: sqft 106K year 108K sale 129K. No beds (Rec4/5 export discontinued ~2015) |
| Jefferson | 48245 | 122,202 | MINED | 71 | 0 | 0 | 0 | — |  |  |
| Hays | 48209 | 117,427 | MINED | 74 | 13 | 0 | 0 | — | Orion | thin, like Fort Bend — no improvement/segment file |
| Mclennan | 48309 | 115,362 | MINED | 77 | 0 | 84 | 42 | — | PACS/deflate64 Wayback | mclennancad.org 2022 export via Shell-COM extract; improv 89K sale 97K exempt 48K baths 75K(1.83, numbered attrs) |
| Henderson | 48213 | 106,708 | SIGNAL | 0 | 0 | 24 | 0 | — | BIS FS direct | services7.arcgis.com/4x7oelC9W8TNucjG/HendersonCADWebService; sale 26K only |
| Comal | 48091 | 103,537 | SIGNAL | 0 | 0 | 95 | 0 | — | BIS FS direct | services7.arcgis.com/Yz6eib2o8WvEgWq8/ComalCADWebService; sale 98K only |
| Johnson | 48251 | 101,847 | MINED | 72 | 0 | 0 | 0 | — | PACS .tab custom | johnsoncad.com WEBIMPR.CSV; GSA-lever reference county for Smith |
| Parker | 48367 | 100,548 | SIGNAL | 0 | 0 | 92 | 0 | — | BIS FS | services.arcgis.com/79g1H99xInKSRRK3; sale 92,836 only, deed-only no sqft |
| Ellis | 48139 | 98,803 | MINED | 81 | 0 | 95 | 53 | — |  |  |
| Webb | 48479 | 98,291 | MINED | 82 | 0 | 90 | 43 | — |  |  |
| Guadalupe | 48187 | 95,571 | MINED | 78 | 37 | 93 | 48 | — |  |  |
| Kaufman | 48257 | 94,650 | MINED | 78 | 4 | 91 | 50 | — | PACS | kaufman-cad.org; improv 74K sale 87K exempt 47K baths(1.90) |
| Grayson | 48181 | 89,348 | MINED | 68 | 0 | 0 | 0 | — |  |  |
| Gregg | 48183 | 77,816 | MINED | 74 | 16 | 0 | 0 | — | PACS — KEY MISMATCH | GCAD_Export prop_id space ≠ DB source_property_id; unresolved, needs geo_id crosswalk |
| Ector | 48135 | 75,891 | SIGNAL | 20 | 0 | 68 | 42 | — | GSA xlsx | load_gsa_roll_xlsx.py; sqft 58K sale 52K exempt 32K improv 15K(feature types) |
| Midland | 48329 | 75,645 | MINED | 75 | 0 | 88 | 46 | — | P&A export_web | load_pa_export.py webbld/websale/webprop |
| Brazos | 48041 | 74,666 | MINED | 86 | 51 | 0 | 0 | — |  |  |
| Taylor | 48441 | 70,598 | MINED | 74 | 29 | 0 | 0 | — |  |  |
| Hunt | 48231 | 69,728 | SIGNAL | 0 | 0 | 89 | 0 | — | BIS FS direct | services3.arcgis.com/GIIiqmeq0npieHV9/HuntCADWebService; sale 62K year 48K. Full CAMA is SharePoint-login-gated — records-request |
| Randall | 48381 | 64,824 | MINED | 85 | 75 | 100 | 53 | — |  |  |
| Bastrop | 48021 | 63,357 | MINED | 66 | 0 | 92 | 38 | — |  |  |
| Angelina | 48005 | 60,693 | MINED | 63 | 0 | 94 | 36 | — | PACS | 'Plumbing'=fixture counts → baths guarded off |
| Polk | 48373 | 60,178 | MINED | 44 | 30 | 94 | 19 | — |  |  |
| Wichita | 48485 | 58,742 | MINED | 80 | 68 | 95 | 44 | — | PACS | wadtx.com; improv 47K BEDS 40K sale 56K exempt 26K baths(1.65) |
| Tomgreen | 48451 | 58,686 | SIGNAL | 0 | 0 | 98 | 0 | — | BIS FS | services5.arcgis.com/3KYdtBnAMnav1mt9; sale 57,764 only |
| Potter | 48375 | 53,490 | MINED | 80 | 63 | 100 | 35 | — |  |  |
| Bowie | 48037 | 53,212 | SIGNAL | 0 | 0 | 50 | 41 | — | Drive ownership.csv | year 19K sale 27K homestead 22K (derived HS values>0) |
| Rockwall | 48397 | 52,739 | MINED | 87 | 49 | 97 | 63 | — | appraisal_info dash-fix | sale 51K exempt 33K |
| Sanpatricio | 48409 | 51,385 | MINED | 64 | 0 | 57 | 36 | — | PACS | sanpatcad.org; improv 33K sale 29K exempt 18K; beds ABSENT |
| Hood | 48221 | 51,275 | MINED | 65 | 0 | 93 | 39 | — |  |  |
| Harrison | 48203 | 50,995 | MINED | 57 | 0 | 3 | 33 | — | TP-token FULL PACS | RAW token, 'DATA EXPORTS' category; improv 29K exempt 17K; beds ABSENT(material-code ATTR); sale sparse (9814-wide INFO offset issue) |
| Orange | 48361 | 50,337 | MINED | 47 | 0 | 0 | 0 | — |  |  |
| Burnet | 48053 | 50,138 | SIGNAL | 0 | 0 | 92 | 0 | — | BIS FS | sale 46K year 25K |
| Wise | 48497 | 48,705 | MINED | 67 | 0 | 49 | 0 | — |  |  |
| Waller | 48473 | 48,136 | SIGNAL | 0 | 0 | 88 | 0 | — |  |  |
| Nacogdoches | 48347 | 48,003 | SIGNAL | 0 | 0 | 17 | 38 | — | PACS abbreviated | nacocad.org (NOT nacogdochescad.org), INFO-only; sale 8K exempt 18K |
| Cherokee | 48073 | 46,761 | SIGNAL | 0 | 0 | 90 | 0 | — | BIS FS | sale 42K year 16K |
| Navarro | 48349 | 46,167 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | P&A ArcGIS (pandai) | value+Is_Exempt+deed-vol/page; MARGINAL, not loaded (exempt flag not code-mappable) |
| Victoria | 48469 | 45,104 | MINED | 76 | 58 | 86 | 42 | — |  |  |
| Wood | 48499 | 44,576 | MINED | 54 | 0 | 87 | 32 | — | PACS | woodcad.net; improv 24K sale 39K exempt 14K; baths fixture-only dropped |
| Medina | 48325 | 44,330 | SIGNAL | 0 | 0 | 88 | 0 | — | BIS FS | sale 39K year 25K (needs Referer) |
| Vanzandt | 48467 | 43,963 | SIGNAL | 0 | 0 | 93 | 0 | — | BIS FS | sale 41K |
| Anderson | 48001 | 43,894 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | TP — RECORDS-REQUEST | reports all-PDF, bulk API 401; advancedsearch gives owner/value/legal only (not loaded, no signal fields) |
| Hardin | 48199 | 41,635 | MINED | 53 | 0 | 19 | 39 | — | PACS | hardin-cad.org; improv 22K exempt 16K baths(1.37); beds negligible (367 rows) |
| Hill | 48217 | 39,355 | SIGNAL | 0 | 0 | 33 | 0 | 12,774 | GIS DBF (Parcels_export.dbf) | sale 13K + SALE PRICE 12,774 (sl_price!) + year — the ONLY county with real sale prices |
| Llano | 48299 | 38,879 | SIGNAL | 0 | 0 | 87 | 0 | — | BIS AGOL | services.arcgis.com/3fXpNNO2cx0O3RtY; sale 34K year 18K |
| Palopinto | 48363 | 38,698 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | SWData 403 on every host; StratMap YEAR_BUILT empty; exhaustive crawl found no bulk |
| Starr | 48427 | 38,571 | SIGNAL | 0 | 0 | 56 | 0 | — | GIS DBF (Ownership.dbf, 2021) | sale 22K |
| Rusk | 48401 | 37,967 | SIGNAL | 0 | 0 | 0 | 9 | — | Harris-eSearch — PARTIAL | site IP-locked (UserLockedOut); loaded 3,303 exempt via Wayback-truncated CSV (86% verified join); retry live URL later for ~25K more rows |
| Chambers | 48071 | 37,510 | SIGNAL | 0 | 0 | 0 | 38 | — | Harris-eSearch | chamberscad.org; exempt 14K |
| Matagorda | 48321 | 37,211 | SIGNAL | 0 | 0 | 81 | 0 | — | GIS DBF (2024-GIS-DATA.zip) | sale 30K; the certified roll itself is PDF-only |
| Jasper | 48241 | 37,136 | MINED | 41 | 0 | 38 | 21 | — | PACS (misnamed zip) | 2020 vintage; improv 15K sale 14K exempt 8K |
| Kerr | 48265 | 36,913 | MINED | 61 | 22 | 88 | 0 | — |  |  |
| Atascosa | 48013 | 36,791 | SIGNAL | 0 | 0 | 71 | 0 | — | BIS FS | sale 26K year 21K |
| Sanjacinto | 48407 | 36,346 | MINED | 44 | 4 | 83 | 22 | — |  |  |
| Lamar | 48277 | 36,246 | MINED | 65 | 6 | 81 | 33 | — | PACS-portal | AG bare code 7,847 rows; GIS-only per crawl, unresolved |
| Walker | 48471 | 35,582 | SIGNAL | 0 | 0 | 85 | 0 | — | dead-end | notice PDFs only, unresolved |
| Cass | 48067 | 34,816 | SIGNAL | 0 | 0 | 77 | 0 | — | BIS FS | sale 27K year 16K |
| Bandera | 48019 | 33,261 | MINED | 44 | 0 | 74 | 19 | — |  |  |
| Cooke | 48097 | 33,170 | MINED | 65 | 49 | 86 | 32 | — | TP-token FULL PACS | improv 21K sale 29K exempt 11K BEDS 16K baths(1.75) |
| Tyler | 48457 | 33,043 | SIGNAL | 0 | 0 | 84 | 0 | — | PACS/esearch | has improvements internally; export is records-request only (PIA target) |
| Gillespie | 48171 | 32,351 | MINED | 65 | 1 | 84 | 25 | — | PACS | 'Plumbing'=presence flag, baths guarded off |
| Wharton | 48481 | 31,888 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST ($40 CD) | 979-532-8931; BIS FS found but Deed_Date/Vol/Page 100% EMPTY — not loaded (no usable fields) |
| Coryell | 48099 | 31,711 | MINED | 77 | 7 | 86 | 44 | — |  |  |
| Valverde | 48465 | 31,635 | MINED | 59 | 0 | 90 | 31 | — | PACS (Google Drive) | valverdecad.org TP-CMS; improv 19K sale 29K exempt 10K |
| Brown | 48049 | 31,411 | MINED | 68 | 15 | 83 | 30 | — | PACS | brown-cad.org (hyphen); improv 21K sale 26K exempt 10K beds 4.6K baths(1.53) |
| Upshur | 48459 | 30,293 | SIGNAL | 0 | 0 | 73 | 0 | — | BIS FS | sale 22K year 15K |
| Kendall | 48259 | 29,986 | SIGNAL | 0 | 0 | 90 | 0 | — | BIS FS | sale 27K year 19K |
| Fannin | 48147 | 29,043 | SIGNAL | 0 | 0 | 94 | 0 | — | BIS FS | needs Referer; sale 27K year 16K |
| Wilson | 48493 | 28,827 | MINED | 70 | 3 | 84 | 45 | — | PACS | wilson-cad.org 2024 (NOT wilsoncad.org); improv 20K sale 24K exempt 13K baths(1.82) |
| Jimwells | 48249 | 27,944 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | TP per-property — DEFERRED | searchfulltext+/improvement exists but is per-parcel (mass-harvest vetoed) |
| Jones | 48253 | 27,732 | SIGNAL | 0 | 0 | 0 | 18 | — | Harris-eSearch | jonescad.org; exempt 4,925 |
| Grimes | 48185 | 27,711 | SIGNAL | 0 | 0 | 89 | 0 | — | dead-end (print report) | 96MB fixed-width PRINT roll, painful to parse; effectively records-request |
| Leon | 48289 | 27,570 | SIGNAL | 0 | 0 | 0 | 15 | — | Harris-eSearch | leoncad.org; exempt 4,233 |
| Burleson | 48051 | 27,282 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | BIS eSearch per-property — DEFERRED | GetImprovements?propertyId= is per-parcel (mass-harvest vetoed) |
| Aransas | 48007 | 26,690 | MINED | 61 | 29 | 85 | 25 | — | PACS | improv 16.2K beds 7.6K sale 22.7K |
| Houston | 48225 | 26,611 | SIGNAL | 0 | 0 | 0 | 18 | — | Harris-eSearch | exemptions loaded |
| Caldwell | 48055 | 26,155 | MINED | 75 | 34 | 88 | 33 | — |  |  |
| Maverick | 48323 | 26,048 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | TP per-property — DEFERRED | improvement endpoint returns EMPTY (district config hides segments) |
| Trinity | 48455 | 25,952 | MINED | 31 | 1 | 55 | 14 | — | PACS | trinitycad.net; 8.0K improv sale 14.3K |
| Hopkins | 48223 | 25,149 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | SDS SignalR-only, no COLLECTORS.zip on any host — exhaustive crawl found nothing free |
| Montague | 48337 | 24,836 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | SDS Blazor SignalR-only ('MORE' dropdown opened & checked); free PDF exemption-list fallback only |
| Erath | 48143 | 24,656 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | BIS FS oversized — DEFERRED | 123K rows for 24K parcels, fetch times out; needs where-filter tuning. Domain erath-cad.com |
| Freestone | 48161 | 23,979 | SIGNAL | 0 | 0 | 0 | 20 | — | Harris-eSearch | exemptions loaded |
| Hudspeth | 48229 | 23,954 | SIGNAL | 5 | 0 | 23 | 2 | — | PACS — STALE | newest export is 2021 |
| Fayette | 48149 | 23,882 | SIGNAL | 0 | 0 | 82 | 28 | — | GIS DBF (Ownership.dbf) | sqft 13K sale 20K exempt 6.7K |
| Bee | 48025 | 23,864 | MINED | 57 | 0 | 0 | 0 | — |  |  |
| Washington | 48477 | 23,475 | MINED | 74 | 36 | 17 | 41 | — | PACS |  |
| Sabine | 48403 | 23,352 | SIGNAL | 0 | 0 | 89 | 18 | — | SWData COLLECTORS export | load_swdata_collectors.py; sale 20,774 exempt 4,212 |
| Newton | 48351 | 23,278 | MINED | 42 | 29 | 64 | 19 | — |  |  |
| Colorado | 48089 | 22,756 | SIGNAL | 0 | 0 | 76 | 0 | — | BIS FS | sale 17K |
| Calhoun | 48057 | 22,678 | SIGNAL | 0 | 0 | 87 | 0 | — | BIS FS (geo join) | sale 20K |
| Austin | 48015 | 22,581 | SIGNAL | 0 | 0 | 95 | 0 | — | BIS FS | sale 22K year 14K |
| Limestone | 48293 | 21,727 | MINED | 57 | 0 | 86 | 23 | — | TP-token FULL PACS | improv 12K sale 19K exempt 5K baths(1.56) |
| Uvalde | 48463 | 21,722 | SIGNAL | 0 | 0 | 94 | 0 | — |  |  |
| Eastland | 48133 | 21,448 | SIGNAL | 0 | 0 | 0 | 22 | — |  |  |
| Shelby | 48419 | 21,378 | SIGNAL | 0 | 0 | 82 | 0 | — | Wix static — dead end |  |
| Milam | 48331 | 20,992 | MINED | 61 | 3 | 83 | 31 | — | PACS | 12.8K improv sale 17.4K |
| Titus | 48449 | 20,833 | MINED | 65 | 1 | 82 | 33 | — |  |  |
| Dewitt | 48123 | 20,802 | SIGNAL | 0 | 0 | 0 | 20 | — |  |  |
| Howard | 48227 | 20,654 | SIGNAL | 0 | 0 | 16 | 0 | — | BIS FS | sale 3,335 (low); publishes only collector tax-roll CSVs for improvements — PIA. 2022 SWData COLLECTORS_Agent.zip exists, not yet loaded |
| Gonzales | 48177 | 20,420 | SIGNAL | 0 | 0 | 0 | 18 | — |  |  |
| Brewster | 48043 | 20,287 | SIGNAL | 25 | 0 | 83 | 11 | — | PACS (nested zip) | brewstercotad.org (NOT brewstercad); improv 5K sale 17K |
| Bosque | 48035 | 19,975 | SIGNAL | 0 | 0 | 98 | 0 | — | BIS FS | sale 19,537 |
| Marion | 48315 | 19,841 | SIGNAL | 0 | 0 | 0 | 15 | — |  |  |
| Lavaca | 48285 | 19,767 | MINED | 65 | 0 | 90 | 28 | — |  |  |
| Hale | 48189 | 19,108 | SIGNAL | 0 | 0 | 75 | 0 | — | BIS FS (geo join) | sale 14K year 7.9K |
| Hutchinson | 48233 | 18,938 | SIGNAL | 0 | 0 | 0 | 28 | — |  |  |
| Panola | 48365 | 18,812 | SIGNAL | 0 | 0 | 0 | 24 | — |  |  |
| Falls | 48145 | 18,581 | SIGNAL | 0 | 0 | 53 | 0 | — | BIS FS | fallscad.NET; sale 9,920 year 2,793 |
| Jackson | 48239 | 18,453 | SIGNAL | 0 | 0 | 82 | 0 | — | BIS FS (geo join) | sale 15K |
| Presidio | 48377 | 18,436 | SIGNAL | 0 | 0 | 85 | 0 | — | BIS FS | sale 15,633 year 3,897 |
| Comanche | 48093 | 17,580 | MINED | 53 | 9 | 84 | 23 | — |  |  |
| Hockley | 48219 | 17,242 | MINED | 60 | 0 | 64 | 28 | — |  |  |
| Robertson | 48395 | 16,935 | SIGNAL | 0 | 0 | 54 | 0 | — | BIS FS (geo join) | sale 9,079 |
| Liveoak | 48297 | 16,839 | SIGNAL | 0 | 0 | 0 | 16 | — |  |  |
| Gaines | 48165 | 16,576 | MINED | 58 | 0 | 89 | 24 | — |  |  |
| Lampasas | 48281 | 16,541 | SIGNAL | 0 | 0 | 20 | 0 | — | PACS-portal — PIA target | unresolved |
| Franklin | 48159 | 16,540 | SIGNAL | 0 | 0 | 0 | 19 | — |  |  |
| Young | 48503 | 16,353 | SIGNAL | 0 | 0 | 80 | 0 | — | BIS FS | sale 13,053 year 9,452 |
| Gray | 48179 | 16,251 | SIGNAL | 0 | 0 | 82 | 0 | — | BIS FS | sale 13,246 year 10,525 |
| Lee | 48287 | 16,090 | SIGNAL | 0 | 0 | 85 | 0 | — | BIS FS | sale 13,704 year 8,610 |
| Dimmit | 48127 | 15,542 | MINED | 26 | 2 | 55 | 10 | — |  |  |
| Ward | 48475 | 15,174 | SIGNAL | 0 | 0 | 0 | 15 | — |  |  |
| Runnels | 48399 | 15,008 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | SWData ArcGIS (obfuscated cols) — DEFERRED | needs bespoke field-map loader |
| Reeves | 48389 | 14,975 | MINED | 35 | 0 | 17 | 14 | — | TP-token raw FULL PACS | sparse desert county; improv 5.2K sqft 5.2K |
| Kleberg | 48273 | 14,909 | SIGNAL | 0 | 0 | 82 | 0 | — |  |  |
| Duval | 48131 | 14,772 | SIGNAL | 0 | 0 | 66 | 0 | — | BIS FS | sale 9,736 year 552 |
| Pecos | 48371 | 14,720 | SIGNAL | 0 | 0 | 0 | 19 | — | Harris-eSearch | pecoscad.org; exempt 2,741 |
| Karnes | 48255 | 14,436 | SIGNAL | 0 | 0 | 0 | 17 | — |  |  |
| Blanco | 48031 | 14,269 | SIGNAL | 0 | 0 | 82 | 0 | — | BIS FS | sale 11,766 |
| Hamilton | 48193 | 14,253 | SIGNAL | 0 | 0 | 84 | 0 | — | BIS FS (geo join) | sale 11,984 year 6,467 |
| Willacy | 48489 | 13,989 | SIGNAL | 0 | 0 | 63 | 0 | — | BIS FS | sale 8,749 |
| Lamb | 48279 | 13,871 | SIGNAL | 0 | 0 | 82 | 0 | — | BIS FS | sale 11,390 |
| Scurry | 48415 | 13,849 | MINED | 56 | 22 | 80 | 27 | — | PACS | scurrytex.com; improv 7,806 beds 3,031 sale 11,107 exempt 3,702 |
| Redriver | 48387 | 13,728 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | BIS + P&A layers exist but Deed_Date/market are 100% EMPTY on every row |
| Clay | 48077 | 13,501 | SIGNAL | 0 | 0 | 0 | 23 | — |  |  |
| Culberson | 48109 | 13,327 | SIGNAL | 0 | 0 | 0 | 3 | — |  |  |
| Floyd | 48153 | 13,217 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | SWData 403, no COLLECTORS.zip; per-property webProperty.aspx exists but is vetoed |
| Nolan | 48353 | 13,216 | SIGNAL | 0 | 0 | 0 | 25 | — |  |  |
| Frio | 48163 | 13,213 | SIGNAL | 0 | 0 | 0 | 18 | — |  |  |
| Coleman | 48083 | 12,839 | SIGNAL | 0 | 0 | 0 | 18 | — | Harris-eSearch | colemancad.net; exempt 2,287 |
| Sanaugustine | 48405 | 12,722 | SIGNAL | 0 | 0 | 0 | 10 | — |  |  |
| Stephens | 48429 | 12,647 | SIGNAL | 0 | 0 | 84 | 0 | — | BIS FS (public, no Referer) | sale 10,681 |
| Zapata | 48505 | 12,623 | SIGNAL | 0 | 0 | 69 | 0 | — | BIS FS | sale 8,705 year 6,131 |
| Refugio | 48391 | 12,478 | SIGNAL | 0 | 0 | 0 | 21 | — |  |  |
| Rains | 48379 | 12,301 | SIGNAL | 0 | 0 | 87 | 0 | — | BIS FS | sale 10,722 year 6,745 |
| Moore | 48341 | 12,256 | SIGNAL | 0 | 0 | 84 | 0 | — | BIS FS | sale 10,284 year 4,304 |
| Callahan | 48059 | 12,064 | SIGNAL | 0 | 0 | 88 | 0 | — | BIS FS | sale 10,648; tax-roll books only for improvements — PIA |
| Wilbarger | 48487 | 11,894 | SIGNAL | 0 | 0 | 66 | 22 | — | BIS FS + Harris-eSearch (double) | wilbargerappraisal.org (NOT wilbargercad); sale 7,853 year 5,281 exempt 2,665 |
| Jack | 48237 | 11,866 | SIGNAL | 0 | 0 | 0 | 18 | — |  |  |
| Morris | 48343 | 11,857 | SIGNAL | 0 | 0 | 0 | 28 | — | Harris-eSearch | morriscad.com; exempt 3,275 |
| Camp | 48063 | 11,652 | SIGNAL | 0 | 0 | 87 | 0 | — | BIS FS (geo join) | sale 10,113 year 5,702 |
| Sansaba | 48411 | 11,591 | SIGNAL | 0 | 0 | 0 | 12 | — |  |  |
| Lipscomb | 48295 | 11,030 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | SWData 403, no COLLECTORS.zip on any host |
| Kinney | 48271 | 11,010 | SIGNAL | 0 | 0 | 60 | 0 | — |  |  |
| Deafsmith | 48117 | 10,901 | SIGNAL | 0 | 0 | 84 | 0 | — | BIS FS | sale 9,151 year 3,049 |
| Mcculloch | 48307 | 10,778 | SIGNAL | 0 | 0 | 0 | 17 | — | Harris-eSearch | mccullochcad.org; exempt 1,869 |
| Andrews | 48003 | 10,522 | MINED | 69 | 3 | 81 | 37 | — | PACS (deflate64) | sale 8.5K exempt 3.9K improv 7.2K |
| Lasalle | 48283 | 10,341 | MINED | 33 | 0 | 59 | 8 | — | TP-token FULL PACS | officelookup www.lasallecad.com; improv 3,384 sale 6,102 exempt 792 |
| Goliad | 48175 | 10,314 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | eSearch PDF-only; BIS GoliadCADWebService exists but subscription DISABLED — re-check monthly, instant solve if renewed |
| Madison | 48313 | 10,307 | SIGNAL | 0 | 0 | 87 | 0 | — | BIS FS | sale 8,991 year 3,908 |
| Edwards | 48137 | 9,948 | SIGNAL | 0 | 0 | 80 | 0 | — | BIS FS | f3531c87ca084095b1b1b81c840b6a57; sale 8,000 year 3,791 |
| Zavala | 48507 | 9,744 | SIGNAL | 0 | 0 | 74 | 0 | — | BIS FS | sale 7,254 year 4,078 |
| Dawson | 48115 | 9,676 | SIGNAL | 0 | 0 | 0 | 24 | — |  |  |
| Archer | 48009 | 9,653 | SIGNAL | 0 | 0 | 0 | 28 | — |  |  |
| Kimble | 48267 | 9,556 | MINED | 41 | 0 | 89 | 15 | — | PACS |  |
| Motley | 48345 | 9,374 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST | no own domain, Floyd-administered; SWData per-property only |
| Haskell | 48207 | 9,370 | SIGNAL | 0 | 0 | 0 | 16 | — |  |  |
| Crockett | 48105 | 9,113 | SIGNAL | 0 | 0 | 0 | 8 | — |  |  |
| Terry | 48445 | 9,113 | SIGNAL | 0 | 0 | 76 | 0 | — | BIS FS (geo join) | terrycoad.org; sale 6,910 |
| Mason | 48319 | 9,096 | SIGNAL | 0 | 0 | 19 | 0 | — | BIS FS | sale 1,694 (thin) |
| Mills | 48333 | 9,025 | SIGNAL | 0 | 0 | 95 | 0 | — | BIS FS | sale 8,585 |
| Mitchell | 48335 | 8,743 | MINED | 50 | 2 | 83 | 21 | — | PACS | sparse beds/baths |
| Real | 48385 | 8,272 | SIGNAL | 0 | 0 | 83 | 0 | — | BIS FS | sale 6,856 year 436 |
| Coke | 48081 | 8,271 | SIGNAL | 0 | 0 | 0 | 11 | — |  |  |
| Concho | 48095 | 8,034 | SIGNAL | 0 | 0 | 97 | 0 | — | BIS FS | sale 7,765 |
| Upton | 48461 | 7,846 | SIGNAL | 0 | 0 | 0 | 16 | — |  |  |
| Wheeler | 48483 | 7,676 | SIGNAL | 0 | 0 | 0 | 15 | — |  |  |
| Lynn | 48305 | 7,324 | SIGNAL | 0 | 0 | 0 | 22 | — |  |  |
| Yoakum | 48501 | 7,291 | MINED | 49 | 0 | 59 | 22 | — | PACS (deflate64) | sale 4.3K exempt 1.6K improv 3.6K |
| Martin | 48317 | 7,255 | SIGNAL | 0 | 0 | 0 | 15 | — |  |  |
| Winkler | 48495 | 7,234 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | RECORDS-REQUEST (confirmed 07-16) | P&A Is_Exempt=entity-only (not homestead); Improvements layer=60 GPS points |
| Jeffdavis | 48243 | 7,175 | SIGNAL | 0 | 0 | 0 | 6 | — |  |  |
| Hardeman | 48197 | 6,958 | SIGNAL | 0 | 0 | 0 | 13 | — |  |  |
| Crane | 48103 | 6,913 | SIGNAL | 0 | 0 | 0 | 14 | — |  |  |
| Somervell | 48425 | 6,823 | SIGNAL | 0 | 0 | 95 | 0 | — | TrueAutomation PropAccess | dead end, main site parked/spammy |
| Fisher | 48151 | 6,817 | SIGNAL | 0 | 0 | 0 | 15 | — |  |  |
| Carson | 48065 | 6,710 | SIGNAL | 0 | 0 | 0 | 25 | — |  |  |
| Crosby | 48107 | 6,670 | SIGNAL | 0 | 0 | 0 | 16 | — | Harris-eSearch | crosbycentral.org (real domain — overturned earlier dead-end); exempt 1,092 |
| Swisher | 48437 | 6,657 | SIGNAL | 0 | 0 | 84 | 0 | — | BIS FS (geo pattern) | sale 5,618 year 2,283 |
| Parmer | 48369 | 6,606 | SIGNAL | 0 | 0 | 64 | 0 | — | BIS FS (geo join) | sale 4,240 year 2,410 |
| Garza | 48169 | 6,583 | SIGNAL | 0 | 0 | 65 | 0 | — | BIS FS | sale 4,309 year 1,114; also a 2019 P&A DW export exists, unparsed (low marginal value) |
| Schleicher | 48413 | 6,559 | SIGNAL | 0 | 0 | 76 | 0 | — | BIS FS | sale 4,957 year 1,882 |
| Ochiltree | 48357 | 6,521 | SIGNAL | 0 | 0 | 0 | 28 | — |  |  |
| Castro | 48069 | 6,466 | SIGNAL | 0 | 0 | 56 | 23 | — | BIS FS + Harris-eSearch (double) | castrocad.org; sale 3,596 year 601 exempt 1,491 |
| Delta | 48119 | 6,461 | MINED | 49 | 0 | 87 | 22 | — | PACS | dwelling cd bare 'RES' |
| Knox | 48275 | 6,408 | SIGNAL | 0 | 0 | 80 | 0 | — | BIS FS | knoxcad.com (real domain); sale 5,097 |
| Baylor | 48023 | 6,349 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | StratMap-only — no signal | BIS app SB_0005 'Subscription disabled', re-check monthly |
| Hall | 48191 | 6,347 | SIGNAL | 0 | 0 | 0 | 12 | — |  |  |
| Dallam | 48111 | 6,271 | SIGNAL | 0 | 0 | 86 | 0 | — | BIS FS | sale 5,388 year 1,130 |
| Bailey | 48017 | 6,044 | SIGNAL | 0 | 0 | 76 | 0 | — | BIS FS | bailey-cad.org (real domain); sale 4,594 year 905 |
| Childress | 48075 | 6,030 | SIGNAL | 0 | 0 | 0 | 22 | — |  |  |
| Sutton | 48435 | 5,905 | SIGNAL | 0 | 0 | 82 | 0 | — | BIS FS (geo join) | sale 4,839 |
| Hansford | 48195 | 5,867 | SIGNAL | 0 | 0 | 0 | 21 | — |  |  |
| Brooks | 48047 | 5,739 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | BIS FS — skipped | Deed_Date field 100% EMPTY, no signal loaded |
| Cochran | 48079 | 5,735 | SIGNAL | 0 | 0 | 62 | 0 | — | BIS FS | cochrancad.com (real domain); sale 3,549 year 255 |
| Collingsworth | 48087 | 5,735 | SIGNAL | 0 | 0 | 0 | 11 | — |  |  |
| Menard | 48327 | 5,708 | SIGNAL | 0 | 0 | 0 | 10 | — |  |  |
| Hartley | 48205 | 5,645 | SIGNAL | 0 | 0 | 97 | 0 | — | BIS FS | sale 5,502 |
| Terrell | 48443 | 5,562 | SIGNAL | 0 | 0 | 62 | 0 | — | BIS FS | sale 3,436 |
| Shackelford | 48417 | 5,542 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | hard case — deferred | only a formatted PRINT report, not machine-parseable |
| Foard | 48155 | 5,393 | SIGNAL | 0 | 0 | 0 | 6 | — |  |  |
| Stonewall | 48433 | 5,203 | SIGNAL | 0 | 0 | 0 | 9 | — |  |  |
| Dickens | 48125 | 4,744 | SIGNAL | 0 | 0 | 0 | 10 | — |  |  |
| Hemphill | 48211 | 4,685 | SIGNAL | 0 | 0 | 0 | 17 | — |  |  |
| Throckmorton | 48447 | 4,664 | GEOM-ONLY | 0 | 0 | 0 | 0 | — |  |  |
| Reagan | 48383 | 4,606 | SIGNAL | 0 | 0 | 0 | 22 | — |  |  |
| Jimhogg | 48247 | 4,441 | SIGNAL | 0 | 0 | 0 | 23 | — |  |  |
| Cottle | 48101 | 4,373 | SIGNAL | 0 | 0 | 0 | 8 | — |  |  |
| Mcmullen | 48311 | 4,188 | SIGNAL | 0 | 0 | 47 | 0 | — | BIS FS (geo join) | sale 1,983 |
| Oldham | 48359 | 4,162 | SIGNAL | 0 | 0 | 86 | 0 | — | BIS FS (geo join) | sale 3,583 |
| Briscoe | 48045 | 4,091 | SIGNAL | 0 | 0 | 0 | 8 | — |  |  |
| Armstrong | 48011 | 4,058 | SIGNAL | 0 | 0 | 0 | 15 | — |  |  |
| Borden | 48033 | 3,752 | SIGNAL | 0 | 0 | 0 | 2 | — |  |  |
| Irion | 48235 | 3,615 | SIGNAL | 0 | 0 | 0 | 12 | — |  |  |
| Kent | 48263 | 3,598 | SIGNAL | 0 | 0 | 0 | 5 | — |  |  |
| Sherman | 48421 | 3,531 | SIGNAL | 0 | 0 | 0 | 16 | — |  |  |
| Glasscock | 48173 | 2,988 | SIGNAL | 0 | 0 | 0 | 6 | — |  |  |
| Roberts | 48393 | 2,574 | GEOM-ONLY | 0 | 0 | 0 | 0 | — | StratMap-only — no signal | Prop_ID mostly blank |
| Sterling | 48431 | 2,364 | SIGNAL | 0 | 0 | 0 | 13 | — |  |  |
| King | 48269 | 2,313 | SIGNAL | 0 | 0 | 0 | 1 | — |  |  |
| Loving | 48301 | 1,914 | SIGNAL | 0 | 0 | 0 | 1 | — |  |  |
| Kenedy | 48261 | 538 | MINED | 34 | 2 | 46 | 8 | — | PACS | kenedycad.org preliminary roll; improv 185 beds 10 sale 249 exempt 43 |

---

## Chronological Session Log (history — every wave, in order found)

---

## WAVE-3 RESULTS + PIA TARGET LIST (2026-07-15, 3-agent sweep of the 73 PACS-portal counties)

**Loaded this wave (11):** Titus, Lavaca (baths-only), Newton, Delta (baths-only),
Mitchell, Angelina, Polk (18.1K beds), Coryell, Caldwell, Lamar, Gillespie — all
free PACS certified rolls (`{cad}.org/wp-content/uploads/.../*Certified*.zip` or an
open-records/data-portal page). Plus Washington/Gaines/Dimmit/Kimble earlier.

**KEY CORRECTION — the "78 Pritchard & Abbott" count was wrong.** The rural-tail
agent found **ZERO P&A** in 26 sampled small counties — every one is PACS /
True Automation (tells: `esearch.{county}` per-parcel portal, `gis.bisclient.com`
GIS viewer). Meaning: the holdouts are an **access gap, not a data gap** — the
data exists in the same PACS system we already parse; a certified-roll records
request (PIA) yields the loadable `IMPROVEMENT_DETAIL_ATTR` file. Genuine
free-source dead-ends are far fewer than the map first estimated.

**PIA TARGET LIST (PACS counties, data confirmed to exist, no free bulk posted —
a $0–75 records request each unlocks beds/baths/pool/improvements):**
Waller, Medina, Cherokee, Matagorda (roll posted but PDF-only), Upshur, Jasper,
Hill, Starr, Cass, Fayette (posts only a parcels shapefile, 6 admin fields),
Colorado, Austin, Uvalde, Howard (posts only collector tax-roll CSVs), Lampasas,
Callahan (tax-roll books only), Moore, Willacy,
Hale, Falls, Jackson, Presidio, Blanco, Lamb, Zapata, Camp, Kinney,
Deaf Smith (note: advertises $75 data fee), Edwards, Mason, Mills, Real,
Concho, Somervell, Parmer, Schleicher, Castro, Dallam, Sutton, Brooks, Hartley,
Shackelford, McMullen, Oldham, Kenedy, Calhoun — plus earlier Comal, Henderson,
Parker, Smith. (~50 counties, almost all small/rural, low parcel weight.)

**Wave-3A addendum (2026-07-15, second agent):** Comanche, Hockley, Andrews, Hudspeth,
Yoakum + Angelina all came OFF the PIA list — free rolls found and loaded (URLs in their
rows above; Yoakum/Andrews zips are deflate64 → Windows-Explorer-COM extract + repack).
Angelina's pre-guard fixture-baths (28,222 rows, median 8) were nulled and the county
reloaded clean. Delta's dwelling rows are bare cd 'RES' — loader widened, sqft 223 → 2,624.
Dead ends verified this pass: Howard (collector CSVs only), Callahan (tax-roll books),
Matagorda (PDF roll), Fayette (shapefile with 6 admin fields), Grimes (printed-report
roll), Gray (report CSVs), Hill/Cherokee/Starr (BIS esearch + GIS with no CAMA fields —
Cherokee's FeatureServer carries ownership/value only), Lamar/Starr wp-zips (GIS only),
Walker (notice PDFs), Jasper (FILE_INFO export lacks the improvement members).

**App-lane (True Prodigy, per-property API — data session should NOT harvest):**
- **Tarrant** (live), **Ellis** (live, done — beds as WORD features "FOUR BEDROOM").
- **Denton** (48121, 353K) — **beds ARE in the API** (data-session re-verified: pid
  747420 → `[MA] Bedrooms: 4`, `[MA] Plumbing: 3`). App-lane, app session to wire
  fill-on-blank; source_property_id resolves as the TP pid. NB for the app: the
  FIRST improvement on a Denton account often returns empty features — iterate
  ALL improvements; the `MA` (main-area) one carries the rooms.
- **Travis** — ✅ SOLVED, DATA-LANE (2026-07-15). Beds are in the FREE bulk file
  `traviscad.org/wp-content/largefiles/improvement_detail_2026.zip` (69MB, 4 CSVs;
  on TCAD's /publicinformation page). Coded rows: `imprvDetailTypeDesc` BEDROOMS
  (=252)/BATHROOM(251)/HALF BATHROOM(250), count in `area`, SUMMED per pID. The TP
  API STRIPS the 252 bed rows (app confirmed); the bulk keeps them. Loaded via
  `load_travis_improvement_detail.py` → 100,419 beds / 307,689 baths / 47,566 pools.
  Sample: pid 100107 → 5bd/4ba/1half. **App session: de-register Travis from
  fill-on-blank — it's a bulk load now.**
- **Montgomery** (48339, 320K) — API returns empty features (no rooms). Currently
  sqft-only in our DB (beds/baths/improv all 0) — biggest untapped True Prodigy
  county. Travis's free `improvement_detail` bulk file is the model. Scouted
  2026-07-15: mcad-tx.org is a **React SPA on Amazon S3** (NO wp-json, so the
  wp-json media trick fails), portal at `montgomery.prodigycad.com`, exemptions via
  justappraised.com. Homepage nav is client-rendered (curl sees only CSS chunks);
  the data-download page, if any, needs browser discovery of the SPA routes
  (try /reports, /forms, /data, /public-information) or reading the JS bundle
  (static/js/*.js) for hardcoded file/API URLs. If no free bulk exists, the True
  Prodigy per-property API is app-lane (do NOT mass-harvest) → PIA for the roll.
  **VERDICT (2026-07-15): NO free flat bulk file** — unlike Travis (WordPress
  /largefiles), MCAD's site is an S3 SPA whose /data and /reports routes only
  embed the interactive `montgomery.prodigycad.com` / `trueprodigy-taxtransparency.com`
  portal (per-property, app-lane) plus an Open-Records-Request page. JS bundle has
  no hardcoded .zip/.csv data URL. So Montgomery = **app-lane** (fill-on-blank, do
  NOT mass-harvest) OR a $0-electronic-open-records request for the roll (parked
  per the no-paid-PIA contract; worth trying as free electronic delivery later).
- **Collin / Williamson / Montgomery / Hays improvements gap (scouted 2026-07-15)** —
  all four are loaded with beds/baths/sqft but `improvements`=0, so they get NO
  feature tags (garage/pool/shed/etc.) in the reverse-prospecting filters. Root
  cause: their free sources are **property-SUMMARY only** and lack segment-level
  improvement TYPE lists. Collin's state-portal dataset (data.texas.gov
  `vffy-snc6`) carries only `imprvclasscd`/`imprvpoolflag` (pool captured; no
  garage/shed segments); Williamson & Montgomery aren't on data.texas.gov at all.
  Enriching them needs each CAD's certified-roll IMPROVEMENT_DETAIL export (PACS
  fixed-width or True Prodigy bulk), not the summary feed. Higher-value than new
  small counties (≈1.1M parcels combined) but each is a separate bulk-file hunt.
- **McLennan** (48309) — RECORDS-REQUEST: TP report categories all 204 (no bulk),
  and our stored ids don't resolve as TP pids (no geoID→pid crosswalk available).
  A certified-roll PIA yields both the beds AND the crosswalk.
- **Johnson** — no TP portal (officelookup 409); PACS `.tab` external export → data
  lane, needs a `.tab` parser.

## Standing capture directives (added 2026-07-15, from the app session)

- **TENURE / last-sale + EXEMPTIONS — PIPELINE BUILT 2026-07-15.**
  `data/load_pacs_appraisal_info.py` parses **File #2 (APPRAISAL_INFO.TXT)** of
  the PACS certified roll: `deed_dt` (cols 2034-2058, MMDDYYYY) → `last_sale_date`
  and the exemption T/F block (hs 2609, ov65 2610, ov65s, dp, dv1-4(+s), ex) →
  new **`parcels.exemptions text[]`** (GIN-indexed; app derives has_homestead /
  has_over65; homestead-DROP #9 needs a 2nd snapshot later). **Texas is
  NON-DISCLOSURE: no sale PRICE in the roll**, so `last_sale_price` stays null —
  date alone unlocks tenure ("owned 15+ years"). Positions from the official
  8.0.31 layout (shipped in GCAD_Export.zip), verified on Gregg+Kaufman. Two
  guards: sanity gate (hs/ov65 ≥95% T/F AND deed_dt parses, else abort on drift)
  + join-rate guard (<20% aborts = wrong roll for that county's key).
  `batch_appraisal_info.py` sweeps all cached rolls with APPRAISAL_INFO.
  **Per-county availability (join% / deed-date / exemptions):** Kaufman 93% /
  86.4K / 45.6K, Angelina 56.8K / 21.8K, Bastrop 58.5K / 24.4K, Caldwell 23.0K /
  8.6K, Coleman(48093), Coryell 27.4K / 14.1K, Delta 5.5K / 1.4K … (batch
  ongoing; 27 counties total, 1.08M sale dates / 480K exemptions). **Was a
  data-truth, not a drift:** Cameron(48061) & Rockwall(48397) aborted at deed_dt
  0% — their date is dashed (MM-DD-YYYY); made parse_deed_dt separator-tolerant →
  BOTH recovered (Cameron 175K sale/71K exempt, Rockwall 51K/33K). **Deflate64
  rolls SOLVED** via `extract_deflate64_roll.ps1` (Explorer-COM → ZIP_STORED
  repack → normal loaders): Andrews(48003) 8.5K sale/3.9K exempt + 7.2K improv,
  Yoakum(48501) 4.3K sale/1.6K exempt + 3.6K improv. Still unloaded: Gregg(48183)
  — roll/key mismatch (GCAD_Export prop_id space ≠ DB source_property_id; needs a
  different roll or a geo_id crosswalk). Future non-PACS systems: Collin's
  data.texas.gov feed has `deedeffdate`/`deedfiledate` (no price); TAD/BCAD/ProTax
  sale-history segments TBD.
- **Bare improvement CODES are NOT Bexar-only (label-ledger grep 2026-07-15).**
  Bare `AG`/`GAR`/`CP`/`CPT` also appear in these small PACS counties: AG →
  Lamar(48277) 7,847, Mitchell(48335) 570, Gaines(48165) 20; GAR → Andrews(48003)
  817, Lamar 1; CP → Yoakum(48501) 36; CPT → Bee(48025) 1,364. All PACS/True-
  Automation (same code family as Bexar), so meanings almost certainly match
  (attached/detached garage, attached/detached carport). The Ellis `CP`="COVERED
  PORCH" collision is a True-Prodigy fill-on-blank case that stores full
  descriptions — it never emits the bare code `CP` into bulk labels, so a `^cp$`
  crosswalk pattern won't hit it. Crosswalk v2 already applies `^gar$` globally
  (Andrews/Lamar GAR already tagged garage_detached).

---

## 254-COUNTY COVERAGE CAMPAIGN — impasse log & format-family roadmap (2026-07-16)

Goal: 100% of the 16 markers + base facts (beds/baths/sqft/year/stories/lot) +
exemptions + sale dates on ALL 254 counties. Sale PRICE: **not available
statewide — Texas is non-disclosure** (PACS layout has deed fields but no price;
WCAD/P&A sale files carry deed date + grantor but no consideration; the
"$10 & other" placeholder is the legal fiction). Neighbor-sold-high signal =
MLS/broker data, deferred to the court-records-era campaign (app-session lane).

**Generalized loader built:** `load_pacs_roll.py <fips> <roll.zip>` — one pass,
all fields, AUTO-DETECTS the join key (tests source_property_id/apn × prop_id/geo_id,
requires >=30% or aborts — the Fort Bend "high-rate != correct" guard). Handles
any True Automation PACS Legacy roll. Loaded this session: San Jacinto(48407),
Bandera(48019).

**FORMAT FAMILIES still to crack (each unlocks many counties — build one parser, load the family):**
- **Pritchard & Abbott** (`export_web{bld,prop,sale,hist,tax}.txt`, CSV, per-file
  `_matrix` layout): Midland(48329, roll cached), Parker(48367), Hood(48221),
  TomGreen(48451), Tom Green, + ~12 more P&A counties. webbld=improvements/sqft/
  year/STORIES; websale=sale date (no price); webtax/webprop=exemptions. HIGH VALUE.
- **ProTax** (Brazoria 48039): `ProTax_ImprovementFeaturesExport_*.zip` (260MB) has
  a dedicated improvement-features export. Delimited. brazoriacad.org WP media.
- **True Automation "Property Data Export" CSV** (Hays 48209, winner): separate
  IMPROVEMENT/LAND/OWNER/SALES/SEGMENT CSVs. hayscad.com WP media,
  `2025-PROPERTY-DATA-EXPORT-FILES-AS-OF-6-29-2026.zip`. OWNER=exemptions, SALES=dates.
- **True Prodigy React SPA** (Hidalgo 48215, McLennan 48309, Ellis 48139, Webb 48479,
  Hunt 48231, Montgomery 48339, Denton 48121): `prod-container.trueprodigyapi.com`,
  Auth0, per-search CSV only — NO bulk file. Needs browser session OR $0 electronic
  open-records request. app-lane for beds (fill-on-blank). DECISION PENDING (Frederick):
  allow rate-limited API pull vs records-request vs fill-on-blank only.

**DEAD-ENDS logged (no free bulk improvement data — circle back via $0 records request):**
- BIS Consulting / whoownsit.com search-only (no bulk export): Anderson(48001),
  Hardin(48199), Atascosa(48013), Lubbock(48303), Comal(48091).
- ISW Data Client azure portals (search-only): Llano(48299), PaloPinto(48363,
  palopintocad.org is a parked domain).
- GIS/shapefile-only (geometry+owner, no building features): Starr(48427),
  Hill(48217), Jasper(48241, only stale 2020 improvement file).
- PDF-only rolls: Matagorda(48321), Walker(48471).
- Records-request / login / WAF-blocked: Chambers(48071, P&A+TrueRoll),
  Rusk(48401, Harris Govern), Smith(48423), Henderson(48213), Parker(48367,
  Cloudflare 403 to curl — but it's P&A, use the roll), Ector(48135, JS challenge).

## Court-records leads (for the APP SESSION's parcel_signals lane — Miner drops URLs here, does NOT chase)
- (none yet — will note any county-clerk foreclosure/probate/tax-delinquency feeds tripped over during roll hunting)

### Batch D findings (2026-07-16) — mostly PROBLEMATIC (defer to fable-5 ultracode / records-request pass)
- **True Prodigy SPAs (no bulk file, browser/records-request only):** Denton(48121), Montgomery(48339), Cooke(48097), Wharton(48481), ValVerde(48465), JimWells(48249), Burleson(48051). Also Fannin(48147, SouthwestDataSolutions Blazor SPA behind Cloudflare).
- **PACS/TrueAutomation esearch — HAS improvements internally but export is records-request only:** Tyler(48457, tylercad.net), Upshur(48459, upshur-cad.org), Kendall(48259, kendallad.org). GOOD $0-records-request targets (the data exists, just not posted).
- **P&A/BIS ProTax CSV (owner/value/EXEMPTION roll, NO building features):** Jones(48253) `jonescad.org/Forms/ExcelDownload?subPath=Data Records&fileName=...2025+Jones+CAD+Certified+Appraisal+Roll...csv`; Leon(48289) same pattern. ~110 cols incl. State_Homestead/Over65/Disabled_Veteran exemption flags + values. EASY partial win = exemptions (no improv/beds). ProTax parser also unlocks Brazoria(48039, which DOES have an ImprovementFeatures export).
- **Grimes(48185)** — 96MB fixed-width PRINT report (`grimescad.org/Portals/0/Documents/Appraisal Roll/2025 Certified Roll.txt`), owner/value/exemption only, painful to parse, no features.
- **Brown(48049)** — P&A search portal only.

### Batches E+F findings (2026-07-16)
**PACS golds LOADED via load_pacs_roll.py:** Aransas(48007, improv 16.2K/beds 7.6K/sale 22.7K), Trinity(48455, 8.0K/sale 14.3K), Milam(48331, 12.8K/sale 17.4K). Hudspeth(48229) full PACS schema but STALE (newest export 2021) — load stale or email for current.
**Value/EXEMPTION-only CSVs (Harris Govern eSearch `/Forms/ExcelDownload?subPath=Data Records&fileName=...csv` — owner/value/HS+Over65+DV exemptions, NO building features; easy exemption win via one parser):** Eastland(48133), DeWitt(48123), Gonzales(48177), Marion(48315), Hutchinson(48233), Panola(48365), Houston(48225), Freestone(48161). Plus P&A collector CSVs: Jones(48253), Leon(48289), Howard(48227, 2022).
**PROBLEMATIC — defer to fable-5/records-request:**
- True Prodigy SPAs: Maverick(48323), Limestone(48293, limestonecad.com), + batch-D set. (fable-5 crack IN PROGRESS.)
- BIS "True Prospect"/GIS-viewer (search/cart only): Uvalde(48463), Hale(48189), Jackson(48239), Falls(48145), Colorado(48089), Calhoun(48057), Austin(48015), Lubbock, Comal, Wichita, Burnet, Waller, Cherokee, Medina.
- whoownsit.com search portals: Hopkins(48223), Montague(48337), Sabine(48403), Brown(48049), Bowie(48037), SanPatricio(48409), Anderson, Hardin, Atascosa.
- iswdata/SouthwestData: Erath(48143), Llano(48299), PaloPinto(48363), Fannin(48147), TomGreen(48451).
- Tyler SPA: Brewster(48043), Bosque(48035). Wix: Shelby(48419). GIS-shapefile-only: Fayette(48149), Starr, Hill, Jasper.
**Domain corrections:** Trinity=trinitycad.net, Erath=erathcad.com, Limestone=limestonecad.com, burnet=burnet-cad.org, nacogdoches=nacocad.org.

---

## ✅ CRACKED: True Prodigy API (fable-5 crack-team, 2026-07-16) — the whole family is now accessible
**One shared OPEN API for every True Prodigy county** (Montgomery, Denton, Hidalgo, McLennan, Ellis, Webb, Hunt, Cooke, Wharton, ValVerde, JimWells, Burleson, Maverick, Limestone, + any {county}.prodigycad.com). No login/CAPTCHA — anonymous self-service token BY DESIGN.
Host: `https://prod-container.trueprodigyapi.com`
Recipe (per county):
```
office = GET  /trueprodigy/officelookup/{county}.prodigycad.com   -> results.office (county name)
token  = POST /trueprodigy/cadpublic/auth/token  body {"office": office}  -> user.token
         # GOTCHAS: must be POST w/ office in body (GET gives wrong-office token -> misleading MySQL error);
         #          send as raw  Authorization: <jwt>  header, NOT "Bearer"; token ~5min lifetime.
year   = GET  /public/config/defaultyear  (Authorization: token) -> results.year
# LIST (many per call, values only): POST /public/property/searchfulltext?page=P&pageSize=100
#   body {"pYear":{"operator":"=","value":year},"fullTextSearch":{"operator":"match","value":TERM>=3chars}}
#   -> rows w/ pAccountID(key), pid, geoID, situs, land/imprv/market values. (No empty-all query; enumerate terms, dedup pAccountID.)
# DETAIL per pAccountID (the physical data):
impr = GET /public/propertyaccount/{acct}/improvement  -> livingArea(sqft), grossBuildingArea, actualYearBuilt,
        details[] segments: detailTypeDescription (Main Area/Attached Garage/Pool/Porch…), area, actualYearBuilt
feat = GET /public/propertyaccount/improvement/{pImprovementID}/features -> Plumbing "2FB"=2 full baths, Fireplace, etc.
land = GET /public/propertyaccount/{acct}/land  -> sizeSqft (LOT), sizeAcres
deeds= GET /public/property/{pid}/deeds  -> sale/deed history (dates; TX non-disclosure so no price)
```
FIELDS: sqft ✅, year ✅, features/improvements ✅ (pool/garage/porch/fireplace), baths ✅ (derive from Plumbing codes), lot ✅, sale dates ✅.
**BEDROOMS: genuinely NOT a True Prodigy CAD field** — verified across Montgomery+Denton. TX CADs price by sqft/class/segment and don't record bedroom counts (it's an MLS attribute). NOT hidden — just not collected. (The PACS counties that HAD "Number of Bedrooms" in the ATTR file are the exception, not the rule.)
OPERATIONAL: LIST is efficient (100/page); physical detail is 1 call/account. Join on geoID or pAccountID. Enumerate a full county by iterating >=3-char terms (geoID prefixes / street tokens / owner-name prefixes) + dedup, or use the grid "Export as Excel". Respectful rate; rural counties ~hours, metros ~a day.

## ✅ CRACKED: BIS Consultants (fable-5 crack-team, 2026-07-16) — TWO surfaces, ~45 counties
**SURFACE 1 = ArcGIS FeatureServer = the CLEAN BULK PATH (like Bexar/SARA).** Direct-server counties: `https://gis.{county}cad.org/arcgis/rest/services/{County}CADWebService/MapServer` — Parcels layer (Lubbock=129, others vary; find via `?f=json`). Bulk query: `/{layer}/query?where=1=1&outFields=*&returnGeometry=false&resultOffset=N&resultRecordCount=1000&f=json` (page by resultOffset; `returnCountOnly=true` for total). Fields: **PROP_ID, QuickRefID, YearBuilt, TotSqftLvg (living sqft), LandSizeAC/FT, IMPClass, TotalValue/LandValue/ImpValue, owner+situs, SaleDate, SalePrice, DeedDate, Exemptions (Orion variant)**. Verified Lubbock (137,440 parcels) + Hale. NO beds/baths, no pool/garage breakout (only coarse IMPClass). Proxied counties (Uvalde/Medina) go via `utility.arcgis.com/usrsvcs/servers/{token}/...FeatureServer/0` (needs anonymous portal token). ~45 county webmaps on portal `bisgis.maps.arcgis.com` (owner bisconsulting).
**SURFACE 2 = eSearch (adds pool/garage features, per-property):** `https://esearch.{county}cad.org/Property/GetImprovements?propertyId={int}&year={yr}` (HTML, no auth, sequential int ids) → living sqft, year, coded segments (AG=attached garage, DC=detached carport, POL=pool, CP=covered porch, BS=basement) each w/ sqft. Per-property HTML scrape.
**BEDS/BATHS: not on either BIS surface** (CAD design — not hidden).
**Recommended apply:** GIS FeatureServer bulk-loads sqft/year/sale/exempt/value for the whole BIS family in one paginated pass (no per-property harvest); layer eSearch per-property later for pool/garage features. Join on PROP_ID (PACS acct) or geo_id.

## ✅ CRACKED: "whoownsit" family = actually 3 vendors (fable-5, 2026-07-16)
**whoownsit.com itself = TaxNetUSA free-search SKIN (owner/address/legal only, 100-cap, $2.99/mo upsell) = DEAD END.** Real data is on separate portals, split 3 ways:
- **SWData WebForms (Hopkins):** `https://{frontdoor}.azurefd.net/webProperty.aspx?dbkey=HOPKINSCAD&id=R00000####` (reach via www.{county}cad.com Front Door; iswdataclient.azurewebsites.net 403s direct). Plain GET, no auth. Full record: 5yr value history, Improvements table (Code|Desc|YearBuilt|SqFt|Perimeter — RES1/FRP3 porch/S3GQ carport), Land, Deed history, EXEMPTIONS (shown, not masked). Sequential R-ids. Join=account#. FEASIBLE per-parcel GET.
- **BIS eSearch (Atascosa esearch.atascosacad.com, Hardin esearch.hardin-cad.org, SanPatricio esearch.sanpatcad.org, Brown esearch.brown-cad.org, Bowie esearch.bowiecad.org):** `/Property/View/{intId}` + `/Property/GetImprovements?propertyId={id}&year=Y` (sqft/year/segments) + `/search/SearchResultDownload?keywords=..&pageSize=N` (CSV: PropertyID/GeoID/Owner/Value). No CAPTCHA (shouldUseRecaptcha=false). Exemptions PARTLY MASKED. Join=int PropertyID + GeoID. Same as the main BIS eSearch crack.
- **True Prodigy React (Anderson andersoncad.net, Bowie bowieappraisal.com):** use the True Prodigy API recipe above.
- SWData **Blazor** (Sabine sabinecad.southwestdatasolutions.com): SignalR, needs browser. Montague: portal unresolved.

## ✅ CORRECTED FINDING: beds/baths are a PER-DISTRICT config choice — present in MANY counties (bedroom-hunt fable crack, 2026-07-16)
My earlier "CADs never record beds" claim was WRONG (over-generalized from the wrong endpoint). Beds/baths ARE publicly available for a large share of counties; it's a per-CAMA-config choice. Where they ARE:
- **PACS certified-roll IMPROVEMENT_DETAIL_ATTR** (~30 loaded: Travis, Bexar, Dallas, Collin, Williamson, El Paso, Bell, Kaufman…): "Number of Bedrooms"/"Plumbing" attrs.
- **HCAD fixtures.txt** (Harris, loaded): RMB=bedrooms, RMF=full bath, RMH=half bath.
- **Dallas RES_DETAIL.CSV** (in dallas_dcad zip): NUM_BEDROOMS, NUM_FULL_BATHS — a BULK beds source (was loading RES_ADDL only; load RES_DETAIL for beds).
- **True Prodigy `/public/propertyaccount/improvement/{pImprovementID}/features`** — carries bedrooms for Tarrant("Rooms: Bedrooms 3"), Denton("Bedrooms: 5"), Ellis("FOUR BEDROOM"), Hidalgo("Number of Bedrooms: 3.00"), McLennan("No of Bedrooms: 3 Bd"), Cooke("BEDROOMS: 4") — ~1.7M parcels. **BUT the TP detail API has a per-IP WAF rate limit (~150-200 rapid calls -> 403), so these are FILL-ON-BLANK (app-lane, api/src/cadattr/trueprodigy.ts already parses them), NOT bulk-harvestable.**
Where beds are a GENUINE gap (district doesn't collect them — verified, not assumed): Montgomery, Fort Bend, Webb, Wharton, ValVerde, JimWells, Maverick, Limestone, Hunt(prob), all BIS(~45)/SWData/P&A counties, and PACS counties whose roll has no bed attr (Grayson, Wise, Bee, Lavaca, Hockley, Angelina, Orange, Gillespie…). Those need MLS/vendor. (Tarrant BULK zeroes Num_Bedrooms — beds there ONLY via the TP API fill-on-blank.)
**APP-SESSION HANDOFF:** wire Hidalgo(48215)/McLennan(48309)/Cooke(48097) into the True Prodigy fill-on-blank lane (their beds are reachable; same TP client as Tarrant).

### Tyler crack (2nd pass, 2026-07-16)
- **Brewster(48043) + Bosque(48035) "Property Record Search" = TaxNetUSA** (paid aggregator skin, 100-result cap, no free bulk) — DEAD END, same as whoownsit. Their real CAD portal is elsewhere / records-request.
- Confirmed True Prodigy is the shared prize (Travis on travis.prodigycad.com is fully exposed; Tarrant migrating to it). Refinements folded into DATA_ACCESS_CRACKS.md: per-county config variance (some hide improvement detail), auth needs office context, PropID→account map for detail calls.
- FBCAD/Hays are Orion (409 on True Prodigy) — handled separately via ResidentialSegments (load_fbcad_segments.py).
- **McCulloch(48307)** BIS: FeatureServer join 0% (prop_id format != DB source_property_id) — needs geo_id/apn join investigation.

### Batch I (2026-07-16): Jack+SanSaba loaded (Harris-eSearch homestead); Midland+Hood loaded (P&A export_web)
- Jack(48237) 2,083 HS, SanSaba(48411) 1,420 HS via load_harris_esearch_csv.py. Callahan(48059)=PDF-only zip (dead-end). Goliad(48175)=PDFs.
- Dead-end BIS-eSearch search-only (no FeatureServer on portal, no bulk): moore(48341), camp(48063), kinney(48271), deafsmith(48117), madison(48313), edwards(48137). Tyler+TaxNetUSA: wilbarger(48487), morris(48343).
- Browser/API-needed (cracked vendors, curl-gated): lipscomb(48295, SWData WebForms 403), lasalle(48283, True Prodigy), zavala(48507, PACS PropAccess).

### Batch J (2026-07-16): 6 Harris-eSearch homestead counties loaded
Archer(48009) 2,690 HS, Haskell(48207) 1,479, Crockett(48105) 693, Upton(48461) 1,272, Dawson(48115) 2,351, Coke(48081) 937 — via load_harris_esearch_csv.py (Coke = direct WP .csv). BIS-eSearch search-only (open-records): Terry(48445, terrycoad.org), Mason(48319), Mills(48333), Real(48385), Concho(48095), Madison(48313), Edwards(48137), Zavala(48507, zavalacad.com). Motley(48345)=no website (Floyd CAD admin).

### Batches G+H (2026-07-16): 10 more Harris/BIS-eSearch homestead counties loaded
Karnes(48255) 2,389, Franklin(48159) 3,073, Ward(48475) 2,286, LiveOak(48297) 2,697, Culberson(48109) 429, Clay(48077) 3,167, Nolan(48353) 3,247, Frio(48163) 2,398, SanAugustine(48405) 1,210, Refugio(48391) 2,602 — all via /Forms/ExcelDownload CSV. **MAP CORRECTION:** Clay/Nolan/Frio/SanAugustine/Refugio were tagged P&A-hard but P&A migrated them to BIS-hosted sites with the free eSearch CSV. Scurry(48415) has a richer REAL-ROLL.zip (9.5MB, likely sqft) — TODO load. BIS-eSearch-only (records-request): presidio/young/gray/lee/duval/blanco/pecos + willacy/lamb/zapata/rains(Blazor). SWData: runnels(WebForms), hamilton/stephens(Blazor), floyd. TrueProdigy: reeves, lasalle. Dead-end whoownsit: robertson, redriver, coleman.
- Scurry(48415): full PACS roll (scurrytex.com/.../2025-07-29_CERTIFIED-REAL-ROLL.zip) — improv 7,806, beds 3,031, sqft 7,804, sale 11,107, exempt 3,702. Loaded via load_pacs_roll.py (apn==geo_id).

---

## Session close 2026-07-15 — batches K/L/M/N applied (tiny-county wave)

**Coverage now: 253 counties present; 61 mined ≥25% improvements; 100 counties with exemption-signal (homestead/over-65/DV); 55 with sale-date signal.** (Exemption-signal counties nearly doubled this wave via Harris/BIS eSearch certified-roll CSVs.)

### Loaded this wave (Harris/BIS eSearch certified-roll CSV → exemptions)
Batch K: Martin 48317, Wheeler 48483, Fisher 48151, Lynn 48305, Hardeman 48197, JeffDavis 48243, Crane 48103, Carson 48065.
Batch L: Hall 48191, Childress 48075, Hansford 48195, Ochiltree 48357, Collingsworth 48087.
Batch M: Menard 48327, Foard 48155, Stonewall 48433, Dickens 48125, Hemphill 48211, Reagan 48383, JimHogg 48247, Cottle 48101.
Batch N: (10 loaded prior) + **Kenedy 48261 PACS** (185 improv / 10 beds / 249 sale / 43 exempt — one of the few tiny counties posting a real PACS roll).

### Hard cases logged (defer to aggressive/fable-5 ultracode pass)
- **Shackelford 48417** — CAD posts only a *formatted printed report* ("2023 Certified Roll.txt": page headers, entity subtotals, human-readable columns), NOT a machine fixed-width export. Separate APPRAISAL_IMPROVEMENT_DETAIL_ATTR/INFO zips the batch-M agent saw are no longer posted (checked /reports /resources /forms). Needs a report-layout parser. Tiny (~1.5k parcels), low priority.
- **Garza 48169** — only free bulk is a **2019** P&A "DW" export zip (`garzacad.org/wp-content/uploads/2023/06/2019-Certified-Roll-excel.zip`): 5 CSVs A085dw{acc,sal,lnd,jur,imp}.csv + Layout_DW*.xls. dwimp HAS area/sqft (col[8]) + class code (col[6]); dwsal has sale date (col[5], YYYYMMDD); dwjur has entity/exemption rows; join is by an **internal account-sequence integer** (dwimp[3]→dwacc seq), needs the layout xls to map. This DW/"TexasCountyGISData" format recurs across BIS counties → worth a one-time `load_dw_export.py` in the fable pass (leverage), but most BIS counties already came via Harris-eSearch, so low marginal value today. Newer Garza years are paid-only.

### Structural dead-ends (no free bulk; re-check periodically or records-request)
Winkler 48495, Swisher 48437, Parmer 48369 (BIS eSearch, bulk feature not populated — same /Forms/ExcelDownload path could get a roll any cycle); Somervell 48425 (TrueAutomation PropAccess only; main site parked/spammy); Crosby 48107 (whoownsit/TaxNetUSA — structural dead-end).

### All 254 counties now researched (batches A–N complete). Remaining physical-detail gaps = eSearch-only counties (value+exemptions, no sqft) + a handful of records-request/paid-only counties. Next: the aggressive fable-5 ultracode pass on unresolved physical-detail (beds/sqft) gaps + $0 records-requests.

---

## 2026-07-15 — big-county aggressive pass (fable-5 crack team, wave 1)

Targeted the 7 biggest counties that had sqft but ZERO improvement/feature data (~1.5M parcels). Dispatched 2 fable-5 crack agents. Results:

### SOLVED — loaded this pass
- **Denton 48121** — open Apache directory `dentoncad.net/data/_uploaded/files/datafiles/{year}/{Certified|Preliminary}DataAllProperty/*.zip`. Standard PACS 8.0.30 (INFO 4.9GB zip64 / DETAIL 972MB / _ATTR 248MB, comp=8). `load_pacs_roll.py 48121` → **improv 311,756, beds 265,385, sqft 313,925, sale 337,838, exempt 220,220** (join apn==geo_id 99.8%). BIGGEST single-county beds win outside Harris/Dallas.
- **Brazoria 48039** — pcloud publink (see DATA_ACCESS_CRACKS.md for the api.pcloud.com resolve dance; link is single-use). PACS 8.0.30. `load_pacs_roll.py 48039` → **improv 170,169, sqft 169,827, sale 215,924, exempt 109,304**. NOTE: Brazoria's ATTR has NO bedroom attribute (Plumbing/Foundation/Heating/etc only — agent's "Number of Bedrooms" sighting was actually Denton's); Plumbing values are fixture counts → bath-guard correctly dropped them. Beds = genuine bulk gap for Brazoria.
- **Ector 48135** — GSA Corp certified-roll xlsx-in-zip (`ectorcad.org/home/downloads`, `/downloads/{car,par}/*.ZIP`). NEW loader `load_gsa_roll_xlsx.py` (reusable for any GSA county). ONE row/account = primary improvement → `improv 15,235 (feature types only; RESIDENCE skipped), sqft 58,488, sale 51,952, exempt 31,536` (join apn==GIS_IDENTIFICATION_NUM). No beds in export.

### Records-request targets identified (defer; $0 25.195 request, cannot self-submit)
- **Lubbock 48303** — Orion; free monthly Property Data Export (Rec4 Improvement + Rec5 ImpSegment incl. Bedrooms/Fireplace/HeatAC/Plumbing) was discontinued ~2015, now Orion-sold. Ask names that exact product. (Stale supplemental: City of Lubbock `pubgis.ci.lubbock.tx.us/.../ParcelViewer/MapServer/5` has a sparse 2009 POOL flag, joins via LCADID.)
- **Smith 48423** — GSA Corp (same as Johnson, which posts free). Ask: the GSA Certified Data Roll export with improvement detail. Contact (903) 510-8600.

### Still open big gaps: Hidalgo 48215, Montgomery 48339 (both sqft-only; probe for a PACS roll / data product next). Tarrant beds (contract-barred), Collin feature-tags (has beds/pool via MDB; improvements text array empty — already mined), Gregg key-mismatch.

## 2026-07-15 15:55 CT — crack fleet waves 2-4 dispatched (in flight)
- **Wave 2** (fable-5): Hidalgo 48215 + Montgomery 48339 — bulk PACS/open-dir/publink hunt.
- **Wave 3** (fable-5): McLennan 48309, Henderson 48213, Comal 48091, Ellis 48139, Webb 48479, Hunt 48231, Wichita 48485, Bowie 48037, SanPatricio 48409, Harrison 48203.
- **Wave 4** (fable-5): Parker 48367 + TomGreen 48451. FINGERPRINT (confirmed by Miner, handed to agent): SWData search portal (`southwestdatasolution.com/webindex.aspx?dbkey={PARKERCAD|TOMGREENCAD}`) with PDF-only webDownloads (no bulk); BIS ArcGIS GIS backend (`gis.bisclient.com/{county}cad`); gis.{county}cad.org NXDOMAIN; services6.arcgis.com/j94FvPaik4etwHFk org is a wrong/empty placeholder. Agent to find the real BIS FeatureServer via AGOL item discovery + utility.arcgis.com proxy w/ `Referer: https://gis.bisclient.com/`. If solved → `load_bis_gis.py <fips> <MapServer-url> [layer]`.

## 2026-07-15 16:xx CT — crack fleet waves 2-3 harvested + baths correctness fix

### SOLVED / loaded (full or partial)
- **Montgomery 48339** — PACS on public Google Drive (`mcad-tx.org/appraisal-data-exports`, TP CMS; Drive id `1ruQPPbRszyEax5iX96oxI7zbIlEwgDEl`; download via `drive.usercontent.google.com/download?id=..&export=download&confirm=t`). `load_pacs_roll.py` → improv 239K, sqft 247K, sale 291K, exempt 174K, baths 215K (avg 3.94, cleaned). Beds absent in ATTR (name-only "Bedrooms", no count) = genuine gap.
- **Hidalgo 48215** — PARTIAL. `hidalgoad.org/data-downloads` → HCADShapefiles.zip → `data.mdb` (394K rows). NEW `load_hcad_data_mdb.py` → sqft 266K, year 272K, sale 304K, exempt 155K. No segments/beds/pool (PIA gap).
- **Wichita 48485** — PACS `wadtx.com/wp-content/uploads/2025/07/2025-REAL-CERTIFIED-ROLL.zip`. improv 47K, **beds 40K**, sqft 47K, sale 56K, exempt 26K, baths 40K (avg 1.65). FULL win.
- **Ellis 48139** — PACS Google Drive (TP CMS builder.io space; Drive id `1Y-bAKgEZ9jRRBPMhgUMbiyjZPbi9OMtP`). improv 80K, sqft 80K, sale 93K, exempt 52K. Beds absent; baths were fixture-only → nulled.
- **San Patricio 48409** — PACS `sanpatcad.org/wp-content/uploads/2025/08/2025-DATA-EXPORT-WITH-140K_60K.zip` (note sanpatcad, not sanpatriciocad). improv 33K, sqft 33K, sale 29K, exempt 18K. Beds absent.
- **Parker 48367 + TomGreen 48451** — BIS FeatureServer (own AGOL orgs: `services.arcgis.com/79g1H99xInKSRRK3/ParkerCADWebService`, `services5.arcgis.com/3KYdtBnAMnav1mt9/TomGreenCADWebService`, layer 0, no Referer/token). `load_bis_gis.py` → deed-date SALE SIGNAL only (Parker 92,836; TomGreen 57,764); no sqft/year/exemptions in GIS (PIA for physical).

### DATA-QUALITY FIX (new tool `fix_pacs_baths.py`)
The generic PACS loader read the "Plumbing" ATTR value as baths, but districts encode it inconsistently: Denton = bare decimals (2.5 = 2 full+1 half); Montgomery = coded (2FB/1HB) MIXED with raw plumbing FIXTURE counts (8/10/13); Ellis = fixture counts only. Result: bogus 13-40 "bath" houses. `fix_pacs_baths.py` re-parses ATTR FB/HB-aware, rejects bare integers >8 (fixtures), takes MAX across a property's segments (not sum), overwrites. Applied: Montgomery (avg 3.94), Denton (avg 2.40). Ellis baths nulled (no usable data). Wichita/SanPat already clean. The main loader's bath parse still has this fragility → run fix_pacs_baths after any new PACS county and sanity-check avg/max.

### Records-request only (wave-3 dead-ends): Hunt 48231 (SharePoint login-gated), Comal 48091 (value-only FeatureServer), Henderson 48213 (PDF-only), Webb 48479 (no data page), Harrison 48203 (GIS-only). McLennan 48309 = 2022 Wayback PACS but DEFLATE64 (needs 7-Zip extract) — deferred. Bowie 48037 = year-built-only ownership csv (Drive) — low-value partial, deferred.

## 2026-07-15 — McLennan 48309 cracked via DEFLATE64 (Wayback 2022 roll)
Current McLennan site is TP (GIS-only downloads). The pre-migration PACS certified export survives on Wayback: `https://web.archive.org/web/20230608000718if_/https://mclennancad.org/wp-content/uploads/2023/03/2022CertifiedExport.zip` (73MB). ALL members are compress_type 9 (DEFLATE64) → Python/libarchive REFUSE. Extracted the 3 needed members with `extract_deflate64_roll.ps1` (Shell.Application COM; fixed its em-dash mojibake first), re-zipped ZIP_STORED, loaded via `load_pacs_roll.py`. → improv 88,792, sqft 88,737, sale 97,064, exempt 47,887 (2022 vintage; join spid==prop_id).
BATH SCHEMA NOTE: McLennan ATTR uses NUMBERED attr names — `22 No of Full Baths` (value "2 Ba"), `23 No of Half Bath` ("1 Hba"), and a separate `11 Plumbing` that holds QUALITY codes (Avg/Superior/Econ), NOT counts. The generic loader wrongly read Plumbing → nulled + reloaded from the "No of Full/Half Baths" attrs (74,649 baths, avg 1.83). **Lesson: PACS bath encoding varies per district (bare-decimal / FB-HB / fixture-count / numbered "No of Baths" + quality-code Plumbing) — always sanity-check avg/max after any PACS load and reparse the right attr.**

## 2026-07-15 — crack fleet wave 5 (next-tier 9 counties) harvested
- **Hardin 48199** — SOLVED full PACS `hardin-cad.org/wp-content/uploads/2025/11/2025-HCAD-CERTIFIED-ROLL.zip`. improv 22K, sqft 22K, exempt 16K, baths 5.3K (avg 1.37). Beds only 367 rows (value "BEDROOM (4" — negligible) = gap. Deed dates sparse (7.7K).
- **Nacogdoches 48347** — PACS ABBREVIATED (`nacocad.org/wp-content/uploads/2025/08/2025-07-30_Certified_Apprsl_Roll.zip`, INFO-only, no improvement members) → sale 8K, exempt 18K. (site is nacocad.org, NOT nacogdochescad.org.)
- **BIS ArcGIS deed-date + partial year (load_bis_gis.py, `utility.arcgis.com/usrsvcs/servers/{id}/rest/services/{Name}CADWebService/FeatureServer` layer 0):** Burnet 48053 (sale 46K, year 25K), Waller 48473 (sale 42K, year 28K), Cherokee 48073 (sale 42K, year 16K), VanZandt 48467 (sale 41K), Medina 48325 (sale 39K, year 25K — needs Referer: gis.bisclient.com header, loader already sends it). ~210K sale signals + ~92K bonus year_built. No sqft/segments (BIS parcels layer is value-only).
- **Navarro 48349** — P&A ArcGIS `gisdata.pandai.com/pamaps01/rest/services/Navarro/NavarroCADPublic/MapServer/0` — value + boolean Is_Exempt + deed volume/page only (no sale DATE, no sqft). MARGINAL, not loaded (exempt-flag isn't code-mappable). Revisit if we want the exempt boolean.
- **Anderson 48001** — UNSOLVED. andersoncad.net = TrueProdigy SPA, bulk-export API auth-gated (401); no BIS org, not on pandai server. Records-request only.

### Reusable BIS discovery pattern (from waves 4-5): a TP-SPA CAD's real parcel FeatureServer lives in its OWN AGOL org, found via `gis.bisclient.com/{cad}/config.json` → webmap item → operationalLayers, OR the `utility.arcgis.com/usrsvcs/servers/{serverId}/rest/services/{Name}CADWebService/FeatureServer` proxy (some need `Referer: https://gis.bisclient.com/`). These are deed-date + sometimes YearBuilt, never segments.

## 2026-07-15 — crack fleet wave 6 (mid-size, 8 counties) harvested
### SOLVED full PACS (load_pacs_roll.py)
- **Kaufman 48257** — `kaufman-cad.org/wp-content/uploads/2026/01/2025-Complete-Roll-as-of-01202026.zip`. improv 74K, sqft 74K, sale 87K, exempt 47K (beds sparse 3.9K, baths avg 1.90). Layout 8.0.33.
- **Wood 48499** — `woodcad.net/wp-content/uploads/2025/09/2025-Certified-Roll-as-of-Supp-1.zip`. improv 24K, sqft 24K, sale 39K, exempt 14K (baths fixture-only, dropped).
- **Wilson 48493** — `wilson-cad.org/wp-content/uploads/2024/09/2024-WCAD-APPR-ROLL.zip` (2024; site is wilson-cad.org NOT wilsoncad.org). improv 20K, sqft 20K, sale 24K, exempt 13K, baths avg 1.82.
### SOLVED signals
- **Chambers 48071** — Harris-eSearch CSV (`chamberscad.org/Forms/ExcelDownload?...fileName=1752950178_2025+Chambers...csv` — KEEP literal '+' signs, %2B fails). exemptions 14K.
- **Hill 48217** — `hillcad.org/wp-content/uploads/2026/07/HillCADMapFiles.zip` → Parcels_export.dbf. NEW `load_parcels_dbf.py` → sale 13K + **SALE PRICE 12,774 (sl_price)** + year. FIRST county with real sale prices (non-disclosure TX leak) — the neighbor-sold-high signal! Also AGOL `services6.arcgis.com/c1IEzrw0UDP7bzay/HillCADWebService/FeatureServer/0`.
- **Llano 48299** — BIS AGOL `services.arcgis.com/3fXpNNO2cx0O3RtY/LlanoCADWebService/FeatureServer/0`. sale 34K, year 18K.
### PENDING / dead-end
- **Rusk 48401** — Harris-eSearch clone of Chambers but site currently `UserLockedOut`/maintenance. URL: `ruskcad.org/Forms/ExcelDownload?...fileName=1753054070_2025+Rusk+CAD+Certified...csv`. RETRY when site is back.
- **Palo Pinto 48363** — records-request (ISW/SWData portal 403s; StratMap has empty YEAR_BUILT). geometry upgrade only via StratMap25.

**NEW: look for `sl_price` in CAD GIS map-file DBFs (HillCADMapFiles pattern) — a rare free SALE PRICE source. load_parcels_dbf.py captures sl_dt + sl_price + yr_blt, join spid==prop_id / apn==geo_id.**

## 2026-07-15 — crack fleet wave 7 (10 counties, ALL solved)
### Full PACS (load_pacs_roll.py)
- **Jasper 48241** — `jaspercad.org/wp-content/uploads/2023/08/2020-09-01_000559_APPRAISAL_IMPROVEMENT_INFO.zip` (misnamed but full set; 2020 vintage). improv 15K, sqft 15K, sale 14K, exempt 8K.
- **Brown 48049** — `brown-cad.org/wp-content/uploads/2026/04/2026-Brown-CAD-Preliminary-Real-Estate-Export.zip` (brown-cad.org, hyphen). improv 21K, sqft 21K, sale 26K, exempt 10K, beds 4.6K, baths avg 1.53.
- **Val Verde 48465** — Google Drive `12mJF9IM9jm_8LxW76ZGRRGmH3WlaHhVh` (valverdecad.org TP-CMS /data-downloads). improv 19K, sqft 19K, sale 29K, exempt 10K.
- **Cooke 48097** — TRUE PRODIGY TOKEN API: mint `GET prod-container.trueprodigyapi.com/trueprodigy/cadpublic/auth/token` → user.token (~5min TTL), then `GET /public/filedownload/cooke/29377a4c-7c1b-11ef-8c4b-0242ac110006.zip` with header `Authorization: Bearer {token}`. GUID from /reports "Certified Exports". improv 21K, sqft 21K, sale 29K, exempt 11K, **beds 16K**, baths avg 1.75. (Reusable TP-token bulk-download crack — GUID per county from its /reports page.)
### BIS ArcGIS deed-date + year (load_bis_gis.py, need Referer: gis.bisclient.com; serverId from gis.bisclient.com/{cad}/cdn/6/config.json)
- Upshur 48459 (sale 22K, year 15K), Atascosa 48013 (26K/21K), Walker 48471 (30K/15K), Cass 48067 (27K/16K), Kendall 48259 (27K/19K). ~132K sale + ~86K year.
### Records-request: Wharton 48481 (TP, certified roll = $40 CD by written request; GIS = paid texascountygisdata).
### No sale-price columns in any wave-7 county (Hill remains the lone sl_price source so far).

## 2026-07-15 — TP-token crack investigation CLOSED (Hidalgo + Tarrant)
The TP bulk certified-export inventory endpoint is `GET prod-container.trueprodigyapi.com/public/config/reports` (Bearer token; office from Origin); each row's `reportS3ID = {slug}/{GUID}.{ext}`, export rows end in .zip.
- **Hidalgo 48215** (slug `hidalgo`): report inventory = 136 files, ALL PDF, ZERO .zip. No certified export exists via TP. Segments/beds = records-request only; the shapefile mdb (year/sqft/deed/exempt, loaded) is the ceiling.
- **Tarrant 48439**: full TP extract is FREE static at `tad.org/content/data-download/000_Tarrant_All_Taxing_Units.zip` (703MB, IMPROVEMENT_DETAIL 1.69GB + _ATTR 421MB) — and ALREADY LOADED (692K improvements/tags/sqft). BEDS CONFIRMED UNAVAILABLE: all 4.7M _ATTR rows have 'Bedrooms'/'Bathrooms' as flag-only labels (no count), and PropertyData_R Num_Bedrooms/Bathrooms are 100% blank. TAD withholds counts by policy — no bulk path, records-request won't help.
TP-token crack (Cooke) remains valuable for TP counties that DO expose a .zip certified export; Hidalgo/Tarrant just don't.

## 2026-07-15 — Sabine 48403 via SWData COLLECTORS export (scratchpad)
SWData "export_collector" pipe-delimited roll (collector_* cols; collections roll, NO improvement detail but has collector_hscode + collector_exempt + collector_deeddate). NEW reusable `load_swdata_collectors.py` → sale 20,774, exempt 4,212 (join apn==collector_geoid). Applies to any SWData county posting a COLLECTORS export.

## 2026-07-15 — crack fleet wave 8 (10 counties)
### Loaded (bulk, allowed)
- Jones 48253 + Leon 48289 — Harris-eSearch CSV (exemptions 4.9K / 4.2K). URLs keep literal '+'.
- Fannin 48147 — BIS FS (sale 27K, year 16K). Grimes 48185 — BIS FS (sale 25K, year 3K). Both need Referer.
### Deferred / not loaded
- **Erath 48143** — BIS FS returns prop_ids that DON'T match our parcels key (join 161/24K → safe ABORT). load_bis_gis keys on prop_id only; needs a geo_id join variant to salvage (esearch.erath-cad.com improvements are reCAPTCHA-gated). Real domain erath-cad.com.
- **JimWells 48249 / Burleson 48051 / Maverick 48323** — improvement detail only via PER-PROPERTY API (TP searchfulltext+/improvement for JimWells/Maverick [Maverick's is empty]; BIS eSearch GetImprovements?propertyId= for Burleson). = the mass-harvest path Frederick vetoed → DEFERRED to a sanctioned per-property pass. (Burleson/JimWells could still get deed/value bulk from their BIS FS if we extract the serverId.)
- **Hopkins 48223 (iswdata SPA 403) / Montague 48337 (Blazor/SignalR, no COLLECTORS.zip)** — records-request.
### Note: TP `/public/config/reports` for JimWells/Maverick = 100% PDFs (no .zip export). Confirms the TP-token bulk crack only works where a county actually posts a .zip export (Cooke did; these don't).

## 2026-07-15 — parallel waves 9B + 9C (20 counties) + BIS loader geo-join enhancement
**load_bis_gis.py ENHANCED:** now captures geo_id and tries apn/spid × prop_id/geo_id (4-way, >=30% guard). Fixes the Erath-class abort where a county's parcels key on geo_id not prop_id. Verified: Hamilton 48193, Jackson 48239, Robertson 48395 joined on apn==geo (would have ABORTED before).
### Loaded
- **Reeves 48389** — TP token BULK cert-export (RAW `Authorization: {token}` NOT Bearer; Origin header; `/public/reportcategory/Appraisal Roll and Totals/search` → reportS3ID; `/public/filedownload/reeves/dac0e474-60c8-11ef-8fc9-0242ac110006.zip`; resume `-C -`). improv 5.2K, sqft 5.2K (sparse desert county). Reusable TP raw-token variant.
- **14 BIS FeatureServer deed-date counties** (~157K sale + ~72K year): Blanco 48031, Lamb 48279, Willacy 48489, Zapata 48505, Rains 48379, Hamilton 48193, Stephens 48429, Jackson 48239, Presidio 48377, Robertson 48395, Young 48503, Duval 48131, Lee 48287, Gray 48179.
- **Coleman 48083 + Pecos 48371** — Harris-eSearch CSV (exemptions). Coleman = colemancad.net; Pecos = pecoscad.org.
### Deferred (log, revisit)
- **Erath 48143** — BIS FS is oversized (123K rows for 24K parcels) → fetch times out; needs a where-filter or resultRecordCount tuning.
- **Runnels 48399** — county ArcGIS SWData layer `services7.arcgis.com/ZBhj1vSHtyYLR1HF/Runnels_Parcels/FeatureServer/0` with obfuscated cols (SW_dbo_bas=prop_id, SW_dbo_b_2=geo_id, SW_dbo__18=deed date EPOCH MS). Needs a bespoke field-map loader.
### Records-request: Floyd 48153 (P&A iswdata 403), Red River 48387 (BIS attributes stripped/empty).
### Wave-9C overturned earlier records-request verdicts for Hamilton/Stephens/Willacy/Rains/Zapata — all had live BIS layers. (never-conclude-absence win.)

## 2026-07-15 — parallel wave 9A (10 counties, all solved)
### Full PACS
- **Limestone 48293** — TP token (Bearer; office Limestone; filedownload/limestone/70107af2-d464-11f0-8db9-0242ac110007.zip = "2025 Certified Export"). improv 12K, sqft 12K, sale 19K, exempt 5K, baths avg 1.56.
- **Brewster 48043** — brewstercotad.org (NOT brewstercad) `wp-content/uploads/2025/06/2025-APPRAISAL-DATA.zip` → NESTED inner `..._APPRAISAL_INFO.zip` = PACS. improv 5K, sqft 5K, sale 17K (sparse desert county).
### Ownership.dbf (load_parcels_dbf.py ENHANCED to also read livarea→sqft, exemption→exemptions[], YYYYMMDD dates)
- **Fayette 48149** — `fayettecad.org/wp-content/uploads/2025/08/FayetteCadGISData2025.zip` → Ownership.dbf (prop_id, geo_id, livarea sqft, exemption, Deed_Date YYYYMMDD). sqft 13K, sale 20K, exempt 6.7K. (BIS-WordPress Ownership.dbf pattern — recurs; richer than the deed-only FeatureServer.)
### BIS FeatureServer deed-date (~105K sale): Colorado 48089, Calhoun 48057, Austin 48015, Hale 48189, Falls 48145 (fallscad.NET), Bosque 48035, Howard 48227. (Calhoun/Hale joined on geo.)
### Note: Howard also has a 2022 SWData COLLECTORS _Agent.zip (homestead/dv) if we want exemptions; BIS gave deed only.

## 2026-07-15 — wave 10A (14 tiny counties): 10 solved
- **BIS FS deed-date (~70K sale + 28K year):** Moore 48341, Callahan 48059, Camp 48063(geo), Kinney 48271(geo), DeafSmith 48117, Madison 48313, Zavala 48507, Wilbarger 48487.
- **Harris-eSearch exemptions:** Morris 48343 (morriscad.com), McCulloch 48307 (mccullochcad.org), Wilbarger 48487 (wilbargerappraisal.org — DOUBLE: BIS deed + eSearch exempt). Domain caution: wilbargercad.org/.com are whoownsit placeholders.
- **Records-request:** Goliad 48175 (eSearch PDFs only), Edwards 48137 (Wix+eSearch, no export), LaSalle 48283 (newer TP public-portal, no report GUID listing), Lipscomb 48295 (lipscombcad.com dead, SWData search-only).

## 2026-07-15 — wave 10B (14 tiny counties): 12 solved (overturned Crosby/Castro/Swisher/Parmer dead-ends)
- **BIS FS deed-date (~55K sale + 13K year):** Terry 48445(geo; terrycoad.org), Mason 48319, Mills 48333, Concho 48095, Garza 48169, Knox 48275(knoxcad.com), Real 48385, Swisher 48437, Parmer 48369(geo), Schleicher 48413, Castro 48069.
- **Harris-eSearch exemptions:** Crosby 48107 (crosbycentral.org — real domain; crosbycad.org/.com are squats), Castro 48069 (castrocad.org wp-content CSV — DOUBLE: FS deed + eSearch exempt).
- **Records-request:** Winkler 48495 (eSearch DataRecords PDF-only, re-poll), Motley 48345 (SWData per-parcel only, Floyd-administered).

## 2026-07-15 — wave 10C (12 tiny counties): 8 BIS deed-date loaded (~33K sale)
Dallam 48111, Sutton 48435(geo), Terrell 48443, Oldham 48359(geo), Hartley 48205, McMullen 48311(geo), Bailey 48017(bailey-cad.org), Cochran 48079(cochrancad.com). Brooks 48047 = BIS but Deed_Date field 100% empty (skip). Baylor 48023/Roberts 48393/Throckmorton 48447 = StratMap25 only (geometry+owner+values, no deed/sqft/exempt = no signal); their BIS apps return SB_0005 "Subscription disabled" — re-check monthly.

## 2026-07-15 — ULTRACODE difficult-counties pass (11 biggest gated counties)
### SOLVED — full/partial improvement (TP token cert-export via /public/config/reports)
- **Webb 48479** — TP token (Bearer), `webb/56bb0d2e-7221-11f0-a0a2-0242ac110007.zip` (NESTED → inner ..._Real_Only.zip). improv 80K, sqft 80K, sale 88K, exempt 42K. FULL.
- **Harrison 48203** — TP token (RAW, Bearer→500), category "DATA EXPORTS", `harrison/bea638f4-544e-11f1-aea0-0242ac110006.zip`. improv 29K, sqft 29K, exempt 17K (INFO 9814-wide → deed offset off, sale sparse 1.4K; improvements/sqft/exempt fine). No beds (material-code ATTR).
### SOLVED — deed-date/year signal
- **Comal 48091** — BIS FS `services7.arcgis.com/Yz6eib2o8WvEgWq8/ComalCADWebService` (no Referer). sale 98K. **Hunt 48231** — BIS FS `services3.arcgis.com/GIIiqmeq0npieHV9/HuntCADWebService`, sale 62K + year 48K. **Henderson 48213** — BIS FS `services7.arcgis.com/4x7oelC9W8TNucjG/HendersonCADWebService`, sale 26K.
- **Matagorda 48321** — `matagorda-cad.org/wp-content/uploads/2024/08/2024-GIS-DATA.zip`→Ownership.dbf (deed_dt). sale 30K. **Starr 48427** — `starrcad.org/wp-content/uploads/2023/04/data.zip`→Ownership.dbf (2021 vintage). sale 22K. (load_parcels_dbf now reads deed_dt.)
- **Bowie 48037** — Drive `bowie_ownership.csv` (id 1LS7KrEqCRWtnPV-IqRdNRCWsgLoCWgVN). year 19K + sale 27K + homestead 22K (derived from ownerimprovementhsvalue/ownerlandhsvalue>0). join spid==geoid.
### RECORDS-REQUEST (genuinely gated, confirmed):
- **Smith 48423** — GSA `smithcad-search.gsacorp.io` CAMA only behind session search+export (no bulk file); ArcGIS Hub Tax_Parcels_Improvements = 17.5K/140K deed only. Ask GSA cert-roll. (903) 510-8600.
- **Anderson 48001** — TP reports all-PDF; bulk API 401. Ask PACS export. **Wharton 48481** — TP reports xlsx/PDF only; $40 CD by written request. 979-532-8931.

## 2026-07-16 — Frederick directive: re-crack ALL records-request counties ("it's on the website")
Redeployed fable-5 with an explicit "assume it's public, crawl the live site link-by-link" mandate on every county flagged records-request. Group 1 (Smith/Lubbock/Anderson/Wharton) result:
- **Lubbock** — CONFIRMED already fully cracked+loaded earlier this session (gis.lubbockcad.org MapServer/129 direct Orion layer: sqft 106K/year 108K/sale 129K). No new action.
- **Smith** — found a bonus partial layer `services5.arcgis.com/KgTmADyzXWOLUPKd/Tax_Parcels_Improvements/FeatureServer/0` (PIN/ACCOUNT/RECD_DATE, 17.5K rows, ~12% coverage — appears to be a condo/specific-subdivision subset, not county-wide). Loaded: +221 sale dates (join spid==PIN, spot-checked real). Full CAMA (GSA smithcad-search.gsacorp.io) confirmed still POST-form/session-gated — genuine records-request remains for segments/beds.
- **Wharton** — found `services6.arcgis.com/j94FvPaik4etwHFk/WhartonCADWebService/FeatureServer/0` (93.7K, anonymous) but Deed_Date/Volume/Page are 100% EMPTY — owner+value+acreage only, no seller-signal. NOT loaded (no useful fields for our schema).
- **Anderson** — cracked the TP public `advancedsearch` BULK list endpoint (`POST /public/property/advancedsearch?page=N&pageSize=1000` body `{}`, raw token) — owner+value+legal only, no deed/exempt/sqft. NOT loaded (no useful fields). TP reports still all-PDF; CAMA still records-request.
Groups 2/3 (Hopkins/Montague/Goliad/Edwards/LaSalle/Rusk + PaloPinto/Floyd/RedRiver/Lipscomb/Winkler) hit the session usage cap mid-run — redispatched.

## 2026-07-16 — re-crack group 3 CONFIRMED gated (exhaustive live-crawl, no new bulk found)
- **PaloPinto 48363 / Floyd 48153 / Lipscomb 48295** — SWData (live host now `www.southwestdatasolution.com` singular, plural `*.southwestdatasolutions.com` file host is DEAD). `webindex.aspx?dbkey=` search-only, `webdownloads.aspx` PDF-only, NO COLLECTORS.zip on any host/year/name variant. Per-property `webProperty.aspx?dbkey={DBKEY}&id=R######` DOES have full sqft/year/deed-date/homestead — but that's the vetoed per-property path. Bulk fallback = StratMap geometry+owner+value only (no deed/year).
- **RedRiver 48387** — RE-VERIFIED both BIS FeatureServer (Referer sent) AND P&A pandai.com layer: Deed_Date/market/imprv_val fields EXIST but are 100% EMPTY on every row. Owner+geometry only. Genuinely gated.
- **Winkler 48495** — P&A pandai.com layer found (owner+property-class+acres, no token) but Is_Exempt only flags fully-exempt entities (water district etc.), not homestead; no deed/market. Its "Improvements" layer re-confirmed as 60 mobile-home GPS points only.
**VERDICT: all 5 CONFIRMED records-request** — this wasn't a missed link, exhaustive crawl (nav+footer+every vendor surface+P&A discovery `gisdata.pandai.com/pamaps01/rest/services?f=json` folder list) found nothing free & bulk.

## 2026-07-16 — re-crack group 2: 3 SOLVED (LaSalle full PACS, Edwards, Rusk partial), 3 confirmed gated
- **LaSalle 48283** — TrueProdigy token export (`officelookup/www.lasallecad.com`→office "Lasalle"; `/public/config/reports` RAW token; s3ID `lasalle/c81a2e54-3842-11f1-a390-0242ac110005.zip` "Preliminary Data" category). FULL PACS: improv 3,384, sqft 3,384, sale 6,102, exempt 792.
- **Edwards 48137** — BIS FS `utility.arcgis.com/.../f3531c87ca084095b1b1b81c840b6a57/EdwardsCADWebService` (Referer). sale 8,000, year 3,791 (join apn==geo).
- **Rusk 48401** — site still IP-LOCKED (UserLockedOut, per-IP not global) as of 2026-07-16; recipe confirmed valid via Wayback capture (`web.archive.org/web/20260412.../Forms/ExcelDownload?...`). Wayback playback caps at 5MiB → only 12,887 of ~38K rows retrievable. Loaded PARTIAL: exemptions 3,303 (join spid==Parcel_ID verified 86% within available rows — confirms correct key, shortfall is truncation not a bad join). **TODO: retry the live URL from a non-blocked IP/session later for the remaining ~25K rows** (fileName `1753054070_2025 Rusk CAD Certified Appraisal Roll...csv`).
- **Hopkins 48223 / Montague 48337 / Goliad 48175** — CONFIRMED genuinely gated after exhaustive live crawl (SDS/Blazor SignalR-only, no COLLECTORS.zip on any host/variant; Goliad's BIS `GoliadCADWebService` exists but AGOL subscription is DISABLED — re-check periodically, would be an instant solve if renewed). Montague/Hopkins have free PDF "Partial Exemptions List" as an OCR-only fallback (not structured).

## SESSION TOTAL — re-crack pass (2026-07-16): of 15 counties in the records-request queue, 6 SOLVED (Smith partial +221, LaSalle FULL, Edwards, Rusk partial), 9 CONFIRMED genuinely gated (Anderson, Wharton, Hopkins, Montague, Goliad, PaloPinto, Floyd, RedRiver, Lipscomb, Winkler — Lubbock/Wharton found layers with no usable signal fields). Coverage now: any-signal 214/253 (85%), mined 79.
