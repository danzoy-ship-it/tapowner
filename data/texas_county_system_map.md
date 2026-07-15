# Texas County Appraisal-System Map

Which CAMA/appraisal software each Texas county runs, its free bulk-roll URL where found, and the load verdict. Built to let the next wave batch-load the PACS counties and skip/flag the app-lane and Pritchard&Abbott holdouts. Sorted by parcel count (biggest first).

**Verdict legend**
- `PACS-loadable` — True Automation / Harris Govern PACS certified roll with IMPROVEMENT_DETAIL(+ATTR); run `data/load_pacs_impdetail_attributes.py <fips> <roll.zip>` (fixed-width) or `data/load_pacs_property_data_export.py` (CSV Segment export).
- `app-lane` — True Prodigy (`{county}.prodigycad.com`); no bulk file, per-property API only (fill-on-blank + cache). Do NOT mass-harvest.
- `P&A-hard` — Pritchard & Abbott (pandai.com / iswdata / southwestdata portals); no public bulk, records-request or licensed vendor.
- `BIS-gis` — BIS Consultants GIS layer (gis.bisclient.com); typically sqft-only, no beds.
- `PACS-portal(no bulk found)` — esearch/TrueAutomation portal present but bulk export page not located by the crawler; likely loadable with a manual download-page check.
- `unclassified` — site resolved, no fingerprint matched; needs a manual look.
- `no-domain` — CAD website domain not auto-resolved; needs a manual lookup.

**Verdict breakdown (all 253 counties in DB):**

- P&A-hard: 78
- PACS-portal(no bulk found): 73
- unclassified: 58
- PACS-loadable: 28
- no-domain: 11
- app-lane: 2
- BIS-gis (sqft only): 2
- PACS-loadable(custom): 1

**Load status** column: `beds+baths+sqft` = full attributes; `baths+sqft` = baths + sqft but the district publishes no bedroom count (real gap); `sqft only` = sqft/improvements only; `-` = nothing loaded yet. A trailing `*` = loaded/refreshed in the 2026-07-15 mid-size-county session.

| county | fips | parcels | system | verdict | load status | domain | free bulk roll URL |
|---|---|---|---|---|---|---|---|
| harris | 48201 | 1,523,641 | PACS (HCAD) | PACS-loadable | beds+baths+sqft | hcad.org | Real_building_land.zip (fixtures.txt) |
| travis | 48453 | 828,773 | PACS/True Prodigy | PACS-loadable | beds+baths+sqft | traviscad.org | FREE improvement_detail_2026.zip @ /wp-content/largefiles/ (coded rows 252=beds/251=baths); DATA-LANE not app-lane |
| tarrant | 48439 | 757,161 | True Prodigy | app-lane | sqft only | tad.org | live API Rooms: Bedrooms/Bathrooms |
| bexar | 48029 | 709,541 | PACS -> SARA ArcGIS | PACS-loadable | beds+baths+sqft | bcad.org | SARA BCAD_Parcels_PROD FeatureServer |
| dallas | 48113 | 694,160 | PACS/TrueAutomation | PACS-loadable | beds+baths+sqft | dallascad.org | NUM_BEDROOMS bulk export |
| elpaso | 48141 | 407,130 | PACS (EPCAD) | PACS-loadable | beds+baths+sqft | epcad.org | EPCAD improvements dump |
| collin | 48085 | 387,737 | PACS | PACS-loadable | beds+baths+sqft | collincad.org | Collin improvement export |
| fortbend | 48157 | 375,097 | Tyler ORION (not PACS) | orion-thin | sqft only | fbcad.org | FBCAD publishes an Orion Certified Export (56MB, /wp-content/uploads/2025/07/…Orion-2025-Certified-Export-REDACTED.zip) BUT it has NO improvement/segment or beds/baths file and NO sale/deed date — only Property/Owner/Exemption/Entity. Exemptions are OwnerQuickRefID-keyed (2-hop join to parcels). Improvements would need FBCAD's separate Residential-Segments zip (only 2022 found). LOW yield — skip unless a segments file for 2024/25 surfaces. |
| denton | 48121 | 353,631 | PACS/TrueAutomation | PACS-loadable | sqft only | dentoncad.com | DCAD certified export |
| hidalgo | 48215 | 328,322 | unknown | unclassified | sqft only | hidalgoad.org |  |
| montgomery | 48339 | 320,915 | PACS | PACS-loadable | sqft only | mcad-tx.org | MCAD certified export |
| williamson | 48491 | 282,983 | PACS (WCAD) | PACS-loadable ✅SOCRATA | beds+baths+sqft+improv+sale | wcad.org | **data.wcad.org SOCRATA API** (quickrefid=source_property_id): Segment 4kxj-e8c3→improvements, PropChar cvyp-ab5t→deeddate/sqft/garage; loaded 246,937 improv + 231,644 sale via load_wcad_socrata.py |
| brazoria | 48039 | 275,131 | PACS (BCAD ProTax) | PACS-loadable | sqft only | brazoriacad.org | ProTax_ImprovementExport.txt |
| galveston | 48167 | 188,695 | PACS/TrueAutomation | PACS-loadable ✅LOADED | improv+baths+sqft+sale+exempt | galvestoncad.org | galvestoncad.org/wp-content/uploads/2025/01/…APPRAISAL_IMPROVEMENT_DETAIL.zip is the FULL certified roll (std deflate): 146,673 improv (pool 14.7K, boat_dock/waterfront 3,608), 162,267 sale, 84,892 exempt. Found via wp-json probe 2026-07-16 |
| cameron | 48061 | 185,062 | unknown | unclassified | beds+baths+sqft | cameroncad.com |  |
| bell | 48027 | 167,412 | PACS | PACS-loadable | beds+baths+sqft | bellcad.org | Bell certified roll ATTR |
| liberty | 48291 | 162,275 | unknown | unclassified | beds+baths+sqft | libertycad.org |  |
| nueces | 48355 | 157,198 | unknown | unclassified | beds+baths+sqft | nuecescad.org |  |
| smith | 48423 | 140,245 | PACS/TrueAutomation | PACS-portal(no bulk found) | sqft only | smithcad.org |  |
| lubbock | 48303 | 135,112 | BIS Consultants (GIS) | BIS-gis (sqft only) | sqft only | lubbockcad.org | gis.bisclient.com/lubbockcad (sqft, no beds) |
| jefferson | 48245 | 122,202 |  | no-domain | sqft only |  |  |
| hays | 48209 | 117,427 | Tyler ORION | orion-thin | beds+baths+sqft | hayscad.com | 2020 "fixed-length" export is actually ORION (Property/Owner/Exemption/Entity only — NO improvement/segment file, like Fort Bend). Improvements gap unfillable from this; beds came from an earlier source. Skip unless a segments export surfaces. |
| mclennan | 48309 | 115,362 | unknown | unclassified | - | mclennancad.org |  |
| henderson | 48213 | 106,708 | unknown | unclassified | - | hendersoncad.org |  |
| comal | 48091 | 103,537 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | comalad.org |  |
| johnson | 48251 | 101,847 | PACS/TrueAutomation (.tab) | PACS-loadable(custom) | sqft only | johnsoncad.com | JCAD external*.tab OR WEBIMPR.CSV extract -- needs tab parser |
| parker | 48367 | 100,548 | Pritchard & Abbott | P&A-hard | - | parkercad.org |  |
| ellis | 48139 | 98,803 | unknown | unclassified | - | elliscad.org |  |
| webb | 48479 | 98,291 |  | no-domain | - |  |  |
| guadalupe | 48187 | 95,571 | PACS/TrueAutomation | PACS-portal(no bulk found) | beds+baths+sqft | guadalupead.org |  |
| kaufman | 48257 | 94,650 | PACS | PACS-loadable | beds+baths+sqft | kaufman-cad.org | Kaufman certified roll ATTR |
| grayson | 48181 | 89,348 | PACS | PACS-loadable | baths+sqft | graysonappraisal.org | Grayson certified roll ATTR |
| gregg | 48183 | 77,816 | PACS | PACS-loadable | beds+baths+sqft * | gcad.org | https://gcad.org/wp-content/uploads/2025/07/2025_gcad_certified_real_appraisal_data.zip |
| ector | 48135 | 75,891 | unknown | unclassified | sqft only | ectorcad.com |  |
| midland | 48329 | 75,645 | Pritchard & Abbott | P&A-hard | sqft only | midcad.org |  |
| brazos | 48041 | 74,666 | PACS | PACS-loadable | beds+baths+sqft * | brazoscad.org | https://brazoscad.org/wp-content/uploads/2025/08/2025-CERTIFIED-EXPORT.zip |
| taylor | 48441 | 70,598 | PACS | PACS-loadable | beds+baths+sqft * | taylor-cad.org | https://taylor-cad.org/wp-content/uploads/2026/06/TaylorCAD_2025_Cert_Appr_Roll_as_of_29Jun26.zip |
| hunt | 48231 | 69,728 | unknown | unclassified | - | hunt-cad.org |  |
| randall | 48381 | 64,824 | PACS (PRAD) | PACS-loadable | beds+baths+sqft | prad.org | Randall certified roll ATTR (loaded) |
| bastrop | 48021 | 63,357 | PACS/TrueAutomation | PACS-portal(no bulk found) | beds+baths+sqft | bastropcad.org |  |
| angelina | 48005 | 60,693 | PACS/TrueAutomation | PACS-loadable | sqft only * | angelinacad.org | https://www.angelinacad.org/media-records/2025Sup20_03102026.zip (open-records page; 'Plumbing'=FIXTURE counts — baths guarded off; beds not published) |
| polk | 48373 | 60,178 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | polkcad.org |  |
| wichita | 48485 | 58,742 | BIS Consultants | BIS-gis (sqft only) | - | wadtx.com | gis.bisclient.com/wichitacad |
| tomgreen | 48451 | 58,686 | Pritchard & Abbott | P&A-hard | - | tomgreencad.com |  |
| potter | 48375 | 53,490 | PACS (PRAD) | PACS-loadable | beds+baths+sqft | prad.org | Potter certified roll ATTR (loaded) |
| bowie | 48037 | 53,212 | unknown | unclassified | - | bowie-cad.org |  |
| rockwall | 48397 | 52,739 | unknown | unclassified | beds+baths+sqft | rockwallcad.com |  |
| sanpatricio | 48409 | 51,385 | unknown | unclassified | - | sanpatriciocad.org |  |
| hood | 48221 | 51,275 | Pritchard & Abbott | P&A-hard | - | hoodcad.net |  |
| harrison | 48203 | 50,995 | unknown | unclassified | - | harrison-cad.org |  |
| orange | 48361 | 50,337 | PACS (Property Data Export CSV) | PACS-loadable | sqft only * | orangecad.net | 2025-Certified-Export-Files.zip (Segment CSV; no beds published) |
| burnet | 48053 | 50,138 | unknown | unclassified | - | burnetcad.org |  |
| wise | 48497 | 48,705 | PACS | PACS-loadable | baths+sqft * | wise-cad.com | https://wise-cad.com/wp-content/uploads/2025/07/Certified-Roll-1_2025_07_23.zip |
| waller | 48473 | 48,136 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | waller-cad.org |  |
| nacogdoches | 48347 | 48,003 |  | no-domain | - |  |  |
| cherokee | 48073 | 46,761 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | cherokeecad.com |  |
| navarro | 48349 | 46,167 | Pritchard & Abbott | P&A-hard | - | navarrocad.com |  |
| victoria | 48469 | 45,104 | Pritchard & Abbott | P&A-hard | - | victoriacad.org |  |
| wood | 48499 | 44,576 | unknown | unclassified | - | woodcad.com |  |
| medina | 48325 | 44,330 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | medinacad.org |  |
| vanzandt | 48467 | 43,963 | unknown | unclassified | - | vzcad.org |  |
| anderson | 48001 | 43,894 | unknown | unclassified | - | andersoncad.org |  |
| hardin | 48199 | 41,635 | Pritchard & Abbott | P&A-hard | - | hardin-cad.org |  |
| hill | 48217 | 39,355 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | hillcad.org |  |
| llano | 48299 | 38,879 | unknown | unclassified | - | llanocad.org |  |
| palopinto | 48363 | 38,698 |  | no-domain | - |  |  |
| starr | 48427 | 38,571 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | starrcad.org |  |
| rusk | 48401 | 37,967 | Pritchard & Abbott | P&A-hard | - | ruskcad.org |  |
| chambers | 48071 | 37,510 | Pritchard & Abbott | P&A-hard | - | chamberscad.org |  |
| matagorda | 48321 | 37,211 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | matagorda-cad.org | wp-uploads 2025_CERTIFIED_APPRAISAL_ROLL.zip is PDF-only (like Webb) -> PIA |
| jasper | 48241 | 37,136 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | jaspercad.org |  |
| kerr | 48265 | 36,913 | PACS | PACS-loadable | beds+baths+sqft * | kerrcad.org | https://kerrcad.org/wp-content/uploads/2025/11/2025-Cert-Export-Files.zip |
| atascosa | 48013 | 36,791 | unknown | unclassified | - | atascosacad.org |  |
| sanjacinto | 48407 | 36,346 |  | no-domain | - |  |  |
| lamar | 48277 | 36,246 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | lamarcad.org |  |
| walker | 48471 | 35,582 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | walkercad.org |  |
| cass | 48067 | 34,816 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | casscad.org |  |
| bandera | 48019 | 33,261 | unknown | unclassified | - | banderacad.org |  |
| cooke | 48097 | 33,170 | unknown | unclassified | - | cookecad.org |  |
| tyler | 48457 | 33,043 | unknown | unclassified | - | tylercad.org |  |
| gillespie | 48171 | 32,351 | PACS | PACS-loadable | sqft only * | gillespiecad.org | https://gillespiecad.org/wp-content/uploads/2025/08/Gillespie-CAD-2025-Certified-Roll-Export.zip ('Plumbing'=presence flag — baths guarded off) |
| wharton | 48481 | 31,888 | unknown | unclassified | - | whartoncad.net |  |
| coryell | 48099 | 31,711 | PACS | PACS-loadable | beds+baths+sqft * | coryellcad.org | https://coryellcad.org/wp-content/uploads/2026/02/2025-Certified-Appraisal-Roll-as-of-Supplement-48.zip |
| valverde | 48465 | 31,635 | unknown | unclassified | - | valverdecad.org |  |
| brown | 48049 | 31,411 | unknown | unclassified | - | browncad.org |  |
| upshur | 48459 | 30,293 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | upshur-cad.org |  |
| kendall | 48259 | 29,986 | unknown | unclassified | - | kendallcad.org |  |
| fannin | 48147 | 29,043 | Pritchard & Abbott | P&A-hard | - | fannincad.org |  |
| wilson | 48493 | 28,827 | PACS/TrueAutomation | PACS-portal(no bulk found) | beds+baths+sqft | wilson-cad.org |  |
| jimwells | 48249 | 27,944 | unknown | unclassified | - | jimwellscad.org |  |
| jones | 48253 | 27,732 | Pritchard & Abbott | P&A-hard | - | jonescad.org |  |
| grimes | 48185 | 27,711 | BIS-gis-embed | unclassified | - | grimescad.org |  |
| leon | 48289 | 27,570 | Pritchard & Abbott | P&A-hard | - | leoncad.org |  |
| burleson | 48051 | 27,282 | unknown | unclassified | - | burlesoncad.com |  |
| aransas | 48007 | 26,690 | Pritchard & Abbott | P&A-hard | - | aransascad.org |  |
| houston | 48225 | 26,611 | Pritchard & Abbott | P&A-hard | - | houstoncad.org |  |
| caldwell | 48055 | 26,155 | PACS | PACS-loadable | beds+baths+sqft * | caldwellcad.org | https://caldwellcad.org/wp-content/uploads/2026/06/2026-Caldwell-CAD-export_June-5-2026.zip (posts fresh exports ~monthly) |
| maverick | 48323 | 26,048 | unknown | unclassified | - | maverickcad.org |  |
| trinity | 48455 | 25,952 | unknown | unclassified | - | trinitycad.com |  |
| hopkins | 48223 | 25,149 | unknown | unclassified | - | hopkinscad.org |  |
| montague | 48337 | 24,836 | unknown | unclassified | - | montaguecad.org |  |
| erath | 48143 | 24,656 | unknown | unclassified | - | erathcad.org |  |
| freestone | 48161 | 23,979 | Pritchard & Abbott | P&A-hard | - | freestonecad.org |  |
| hudspeth | 48229 | 23,954 | PACS | PACS-loadable | sqft only * | hudspethcad.org | https://hudspethcad.org/wp-content/uploads/2023/08/2021-HUDSPETH-PRELIMINARY-ROLL-EXPORT.zip (2021 latest; ATTR ~empty, mostly land) |
| fayette | 48149 | 23,882 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | fayettecad.org |  |
| bee | 48025 | 23,864 | PACS | PACS-loadable | baths+sqft * | beecad.org | BEE-CAD-2025-CERTIFIED-APPRAISAL-ROLL-CSV.zip (no beds published) |
| washington | 48477 | 23,475 | PACS | PACS-loadable | - | washingtoncad.org | https://washingtoncad.org/wp-content/uploads/2026/03/2025-Certified-Appraisal-Roll.zip |
| sabine | 48403 | 23,352 | unknown | unclassified | - | sabinecad.org |  |
| newton | 48351 | 23,278 | PACS | PACS-loadable | beds+baths+sqft * | newtoncad.org | https://newtoncad.org/wp-content/uploads/2025/08/2025-CERTIFIED-APP-ROLL.zip |
| colorado | 48089 | 22,756 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | coloradocad.org |  |
| calhoun | 48057 | 22,678 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | calhouncad.org |  |
| austin | 48015 | 22,581 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | austincad.org |  |
| limestone | 48293 | 21,727 | unknown | unclassified | - | limestonecad.com |  |
| uvalde | 48463 | 21,722 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | uvaldecad.org |  |
| eastland | 48133 | 21,448 | Pritchard & Abbott | P&A-hard | - | eastlandcad.org |  |
| shelby | 48419 | 21,378 | Pritchard & Abbott | P&A-hard | - | shelbycad.com |  |
| milam | 48331 | 20,992 | unknown | unclassified | - | milamcad.org |  |
| titus | 48449 | 20,833 | PACS | PACS-loadable | sqft only * | titus-cad.org | https://titus-cad.org/wp-content/uploads/2026/03/2025-CERTIFIED-AS-OF-LAST-SUPP.zip (beds/baths published only sparsely) |
| dewitt | 48123 | 20,802 | Pritchard & Abbott | P&A-hard | - | dewittcad.org |  |
| howard | 48227 | 20,654 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | howardcad.org | publishes only collector tax-roll CSVs (no improvement files) -> PIA |
| gonzales | 48177 | 20,420 | Pritchard & Abbott | P&A-hard | - | gonzalescad.org |  |
| brewster | 48043 | 20,287 | unknown | unclassified | - | brewstercad.org |  |
| bosque | 48035 | 19,975 | unknown | unclassified | - | bosquecad.org |  |
| marion | 48315 | 19,841 | unknown | unclassified | - | marioncad.org |  |
| lavaca | 48285 | 19,767 | PACS | PACS-loadable | baths+sqft * | lavacacad.com | https://lavacacad.com/wp-content/uploads/2025/07/2025-CERTIFIED-REAL-PROPERTY-FILES.zip (no beds published) |
| hale | 48189 | 19,108 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | halecad.org |  |
| hutchinson | 48233 | 18,938 | Pritchard & Abbott | P&A-hard | - | hutchinsoncad.org |  |
| panola | 48365 | 18,812 | Pritchard & Abbott | P&A-hard | - | panolacad.org |  |
| falls | 48145 | 18,581 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | fallscad.net |  |
| jackson | 48239 | 18,453 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | jacksoncad.org |  |
| presidio | 48377 | 18,436 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | presidiocad.org |  |
| comanche | 48093 | 17,580 | PACS | PACS-loadable | beds+baths+sqft * | comanchecad.org | https://comanchecad.org/wp-content/uploads/2025/07/Cert-Real-Roll-100000-Ex.zip |
| hockley | 48219 | 17,242 | PACS | PACS-loadable | baths+sqft * | hockleycad.org | https://www.hockleycad.org/wp-content/uploads/2026/04/2026-PRELIMINARY-APPRAISAL-ROLL.zip (no beds published) |
| robertson | 48395 | 16,935 | unknown | unclassified | - | robertsoncad.org |  |
| liveoak | 48297 | 16,839 |  | no-domain | - |  |  |
| gaines | 48165 | 16,576 | PACS | PACS-loadable | - | gainescad.org | https://gainescad.org/wp-content/uploads/2026/04/2025-Gaines-Real-Certified.zip |
| lampasas | 48281 | 16,541 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | lampasascad.com |  |
| franklin | 48159 | 16,540 | Pritchard & Abbott | P&A-hard | - | franklin-cad.org |  |
| young | 48503 | 16,353 | Pritchard & Abbott | P&A-hard | - | youngcad.org |  |
| gray | 48179 | 16,251 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | graycad.org |  |
| lee | 48287 | 16,090 | unknown | unclassified | - | leecad.org |  |
| dimmit | 48127 | 15,542 | PACS | PACS-loadable | - | dimmit-cad.org | https://dimmit-cad.org/wp-content/uploads/2025/08/2025-REAL-MH-CERTIFIED-ROLL.zip |
| ward | 48475 | 15,174 | Pritchard & Abbott | P&A-hard | - | wardcad.org |  |
| runnels | 48399 | 15,008 | unknown | unclassified | - | runnelscad.org |  |
| reeves | 48389 | 14,975 | unknown | unclassified | - | reevescad.org |  |
| kleberg | 48273 | 14,909 | unknown | unclassified | - | klebergcad.org |  |
| duval | 48131 | 14,772 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | duvalcad.org |  |
| pecos | 48371 | 14,720 | Pritchard & Abbott | P&A-hard | - | pecoscad.org |  |
| karnes | 48255 | 14,436 | Pritchard & Abbott | P&A-hard | - | karnescad.org |  |
| blanco | 48031 | 14,269 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | blancocad.com |  |
| hamilton | 48193 | 14,253 | Pritchard & Abbott | P&A-hard | - | hamiltoncad.org |  |
| willacy | 48489 | 13,989 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | willacycad.org |  |
| lamb | 48279 | 13,871 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | lambcad.org |  |
| scurry | 48415 | 13,849 |  | no-domain | - |  |  |
| redriver | 48387 | 13,728 | unknown | unclassified | - | redrivercad.org |  |
| clay | 48077 | 13,501 | Pritchard & Abbott | P&A-hard | - | claycad.org |  |
| culberson | 48109 | 13,327 | unknown | unclassified | - | culbersoncad.org |  |
| floyd | 48153 | 13,217 |  | no-domain | - |  |  |
| nolan | 48353 | 13,216 | Pritchard & Abbott | P&A-hard | - | nolan-cad.org |  |
| frio | 48163 | 13,213 | Pritchard & Abbott | P&A-hard | - | friocad.org |  |
| coleman | 48083 | 12,839 | unknown | unclassified | - | colemancad.org |  |
| sanaugustine | 48405 | 12,722 | Pritchard & Abbott | P&A-hard | - | sanaugustinecad.org |  |
| stephens | 48429 | 12,647 | Pritchard & Abbott | P&A-hard | - | stephenscad.com |  |
| zapata | 48505 | 12,623 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | zapatacad.com |  |
| refugio | 48391 | 12,478 | Pritchard & Abbott | P&A-hard | - | refugiocad.org |  |
| rains | 48379 | 12,301 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | rainscad.org |  |
| moore | 48341 | 12,256 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | moorecad.org |  |
| callahan | 48059 | 12,064 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | callahancad.org | publishes only tax-roll books (no improvement files) -> PIA |
| wilbarger | 48487 | 11,894 | unknown | unclassified | - | wilbargercad.org |  |
| jack | 48237 | 11,866 | unknown | unclassified | - | jackcad.org |  |
| morris | 48343 | 11,857 | unknown | unclassified | - | morriscad.org |  |
| camp | 48063 | 11,652 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | campcad.org |  |
| sansaba | 48411 | 11,591 | Pritchard & Abbott | P&A-hard | - | sansabacad.org |  |
| lipscomb | 48295 | 11,030 |  | no-domain | - |  |  |
| kinney | 48271 | 11,010 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | kinneycad.org |  |
| deafsmith | 48117 | 10,901 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | deafsmithcad.org |  |
| mcculloch | 48307 | 10,778 | Pritchard & Abbott | P&A-hard | - | mccullochcad.org |  |
| andrews | 48003 | 10,522 | PACS | PACS-loadable | baths+sqft * | andrewscad.org | https://andrewscad.org/wp-content/uploads/2024/08/2024-Certified-Appraisal-Roll.zip (deflate64 — Explorer-COM extract + repack; sparse beds) |
| lasalle | 48283 | 10,341 |  | no-domain | - |  |  |
| goliad | 48175 | 10,314 | Pritchard & Abbott | P&A-hard | - | goliadcad.org |  |
| madison | 48313 | 10,307 | Pritchard & Abbott | P&A-hard | - | madisoncad.org |  |
| edwards | 48137 | 9,948 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | edwardscad.org |  |
| zavala | 48507 | 9,744 | Pritchard & Abbott | P&A-hard | - | zavalacad.com |  |
| dawson | 48115 | 9,676 | Pritchard & Abbott | P&A-hard | - | dawsoncad.org |  |
| archer | 48009 | 9,653 | Pritchard & Abbott | P&A-hard | - | archercad.org |  |
| kimble | 48267 | 9,556 | PACS | PACS-loadable | - | kimblecad.org | https://kimblecad.org/wp-content/uploads/2025/09/2025-CERTIFIED-APPRAISAL-ROLL.zip |
| motley | 48345 | 9,374 |  | no-domain | - |  |  |
| haskell | 48207 | 9,370 | Pritchard & Abbott | P&A-hard | - | haskellcad.org |  |
| crockett | 48105 | 9,113 | Pritchard & Abbott | P&A-hard | - | crockettcad.org |  |
| terry | 48445 | 9,113 | unknown | unclassified | - | terrycad.org |  |
| mason | 48319 | 9,096 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | masoncad.org |  |
| mills | 48333 | 9,025 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | millscad.org |  |
| mitchell | 48335 | 8,743 | PACS | PACS-loadable | sqft only * | mitchellcad.org | https://mitchellcad.org/wp-content/uploads/2024/08/2024-Certified-Roll-all-types-Properties.zip (sparse beds/baths) |
| real | 48385 | 8,272 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | realcad.org |  |
| coke | 48081 | 8,271 | Pritchard & Abbott | P&A-hard | - | cokecad.org |  |
| concho | 48095 | 8,034 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | conchocad.org |  |
| upton | 48461 | 7,846 | Pritchard & Abbott | P&A-hard | - | uptoncad.org |  |
| wheeler | 48483 | 7,676 | Pritchard & Abbott | P&A-hard | - | wheelercad.org |  |
| lynn | 48305 | 7,324 | Pritchard & Abbott | P&A-hard | - | lynncad.org |  |
| yoakum | 48501 | 7,291 | PACS | PACS-loadable | baths+sqft * | yoakumcad.org | https://yoakumcad.org/wp-content/uploads/2025/09/2025-CERTIFIED-APPRAISAL-ROLL.zip (deflate64 — Explorer-COM extract + repack; no beds published) |
| martin | 48317 | 7,255 | Pritchard & Abbott | P&A-hard | - | martincad.org |  |
| winkler | 48495 | 7,234 | Pritchard & Abbott | P&A-hard | - | winklercad.org |  |
| jeffdavis | 48243 | 7,175 | Pritchard & Abbott | P&A-hard | - | jeffdaviscad.org |  |
| hardeman | 48197 | 6,958 | Pritchard & Abbott | P&A-hard | - | hardemancad.org |  |
| crane | 48103 | 6,913 | Pritchard & Abbott | P&A-hard | - | cranecad.org |  |
| somervell | 48425 | 6,823 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | somervellcad.org |  |
| fisher | 48151 | 6,817 | Pritchard & Abbott | P&A-hard | - | fishercad.org |  |
| carson | 48065 | 6,710 | Pritchard & Abbott | P&A-hard | - | carsoncad.org |  |
| crosby | 48107 | 6,670 | unknown | unclassified | - | crosbycad.org |  |
| swisher | 48437 | 6,657 | Pritchard & Abbott | P&A-hard | - | swisher-cad.org |  |
| parmer | 48369 | 6,606 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | parmercad.org |  |
| garza | 48169 | 6,583 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | garzacad.org |  |
| schleicher | 48413 | 6,559 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | schleichercad.org |  |
| ochiltree | 48357 | 6,521 | Pritchard & Abbott | P&A-hard | - | ochiltreecad.org |  |
| castro | 48069 | 6,466 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | castrocad.org |  |
| delta | 48119 | 6,461 | PACS | PACS-loadable | baths+sqft * | delta-cad.org | https://delta-cad.org/wp-content/uploads/2025/12/1733946367_2024-10-02_000533_APPRAISAL_ABSTRACT_SUBDV-2024-Certified-Tax-Roll.zip (dwelling cd is bare 'RES') |
| knox | 48275 | 6,408 | unknown | unclassified | - | knoxcad.org |  |
| baylor | 48023 | 6,349 | Pritchard & Abbott | P&A-hard | - | baylorcad.org |  |
| hall | 48191 | 6,347 | Pritchard & Abbott | P&A-hard | - | hallcad.org |  |
| dallam | 48111 | 6,271 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | dallamcad.org |  |
| bailey | 48017 | 6,044 | unknown | unclassified | - | baileycad.org |  |
| childress | 48075 | 6,030 | Pritchard & Abbott | P&A-hard | - | childresscad.org |  |
| sutton | 48435 | 5,905 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | suttoncad.com |  |
| hansford | 48195 | 5,867 | unknown | unclassified | - | hansfordcad.org |  |
| brooks | 48047 | 5,739 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | brookscad.org |  |
| cochran | 48079 | 5,735 | unknown | unclassified | - | cochrancad.org |  |
| collingsworth | 48087 | 5,735 | Pritchard & Abbott | P&A-hard | - | collingsworthcad.org |  |
| menard | 48327 | 5,708 | Pritchard & Abbott | P&A-hard | - | menardcad.org |  |
| hartley | 48205 | 5,645 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | hartleycad.org |  |
| terrell | 48443 | 5,562 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | terrellcad.org |  |
| shackelford | 48417 | 5,542 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | shackelfordcad.com |  |
| foard | 48155 | 5,393 | Pritchard & Abbott | P&A-hard | - | foardcad.org |  |
| stonewall | 48433 | 5,203 | Pritchard & Abbott | P&A-hard | - | stonewallcad.org |  |
| dickens | 48125 | 4,744 | Pritchard & Abbott | P&A-hard | - | dickenscad.org |  |
| hemphill | 48211 | 4,685 | unknown | unclassified | - | hemphillcad.org |  |
| throckmorton | 48447 | 4,664 | Pritchard & Abbott | P&A-hard | - | throckmortoncad.org |  |
| reagan | 48383 | 4,606 | Pritchard & Abbott | P&A-hard | - | reagancad.org |  |
| jimhogg | 48247 | 4,441 | Pritchard & Abbott | P&A-hard | - | jimhogg-cad.org |  |
| cottle | 48101 | 4,373 | Pritchard & Abbott | P&A-hard | - | cottlecad.org |  |
| mcmullen | 48311 | 4,188 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | mcmullencad.org |  |
| oldham | 48359 | 4,162 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | oldhamcad.org |  |
| briscoe | 48045 | 4,091 | Pritchard & Abbott | P&A-hard | - | briscoecad.org |  |
| armstrong | 48011 | 4,058 | Pritchard & Abbott | P&A-hard | - | armstrongcad.org |  |
| borden | 48033 | 3,752 | Pritchard & Abbott | P&A-hard | - | bordencad.org |  |
| irion | 48235 | 3,615 | Pritchard & Abbott | P&A-hard | - | irioncad.org |  |
| kent | 48263 | 3,598 | Pritchard & Abbott | P&A-hard | - | kentcad.org |  |
| sherman | 48421 | 3,531 | Pritchard & Abbott | P&A-hard | - | shermancad.org |  |
| glasscock | 48173 | 2,988 | Pritchard & Abbott | P&A-hard | - | glasscockcad.org |  |
| roberts | 48393 | 2,574 | Pritchard & Abbott | P&A-hard | - | robertscad.org |  |
| sterling | 48431 | 2,364 | Pritchard & Abbott | P&A-hard | - | sterlingcad.org |  |
| king | 48269 | 2,313 | Pritchard & Abbott | P&A-hard | - | kingcad.org |  |
| loving | 48301 | 1,914 | Pritchard & Abbott | P&A-hard | - | lovingcad.org |  |
| kenedy | 48261 | 538 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | kenedycad.org |  |

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
