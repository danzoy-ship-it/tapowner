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
| travis | 48453 | 828,773 | True Prodigy | app-lane | sqft only | traviscad.org | per-property API (fill-on-blank) |
| tarrant | 48439 | 757,161 | True Prodigy | app-lane | sqft only | tad.org | live API Rooms: Bedrooms/Bathrooms |
| bexar | 48029 | 709,541 | PACS -> SARA ArcGIS | PACS-loadable | beds+baths+sqft | bcad.org | SARA BCAD_Parcels_PROD FeatureServer |
| dallas | 48113 | 694,160 | PACS/TrueAutomation | PACS-loadable | beds+baths+sqft | dallascad.org | NUM_BEDROOMS bulk export |
| elpaso | 48141 | 407,130 | PACS (EPCAD) | PACS-loadable | beds+baths+sqft | epcad.org | EPCAD improvements dump |
| collin | 48085 | 387,737 | PACS | PACS-loadable | beds+baths+sqft | collincad.org | Collin improvement export |
| fortbend | 48157 | 375,097 | PACS (FBCAD) | PACS-loadable | sqft only | fbcad.org | FBCAD data export |
| denton | 48121 | 353,631 | PACS/TrueAutomation | PACS-loadable | sqft only | dentoncad.com | DCAD certified export |
| hidalgo | 48215 | 328,322 | unknown | unclassified | sqft only | hidalgoad.org |  |
| montgomery | 48339 | 320,915 | PACS | PACS-loadable | sqft only | mcad-tx.org | MCAD certified export |
| williamson | 48491 | 282,983 | PACS (WCAD) | PACS-loadable | beds+baths+sqft | wcad.org | WCAD property data export |
| brazoria | 48039 | 275,131 | PACS (BCAD ProTax) | PACS-loadable | sqft only | brazoriacad.org | ProTax_ImprovementExport.txt |
| galveston | 48167 | 188,695 | PACS/TrueAutomation | PACS-portal(no bulk found) | baths+sqft | galvestoncad.org |  |
| cameron | 48061 | 185,062 | unknown | unclassified | beds+baths+sqft | cameroncad.com |  |
| bell | 48027 | 167,412 | PACS | PACS-loadable | beds+baths+sqft | bellcad.org | Bell certified roll ATTR |
| liberty | 48291 | 162,275 | unknown | unclassified | beds+baths+sqft | libertycad.org |  |
| nueces | 48355 | 157,198 | unknown | unclassified | beds+baths+sqft | nuecescad.org |  |
| smith | 48423 | 140,245 | PACS/TrueAutomation | PACS-portal(no bulk found) | sqft only | smithcad.org |  |
| lubbock | 48303 | 135,112 | BIS Consultants (GIS) | BIS-gis (sqft only) | sqft only | lubbockcad.org | gis.bisclient.com/lubbockcad (sqft, no beds) |
| jefferson | 48245 | 122,202 |  | no-domain | sqft only |  |  |
| hays | 48209 | 117,427 | PACS | PACS-loadable | beds+baths+sqft | hayscad.com | Hays property data export SEGMENT |
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
| angelina | 48005 | 60,693 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | angelinacad.org |  |
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
| matagorda | 48321 | 37,211 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | matagorda-cad.org |  |
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
| gillespie | 48171 | 32,351 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | gillespiecad.org |  |
| wharton | 48481 | 31,888 | unknown | unclassified | - | whartoncad.net |  |
| coryell | 48099 | 31,711 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | coryellcad.org |  |
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
| caldwell | 48055 | 26,155 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | caldwellcad.org |  |
| maverick | 48323 | 26,048 | unknown | unclassified | - | maverickcad.org |  |
| trinity | 48455 | 25,952 | unknown | unclassified | - | trinitycad.com |  |
| hopkins | 48223 | 25,149 | unknown | unclassified | - | hopkinscad.org |  |
| montague | 48337 | 24,836 | unknown | unclassified | - | montaguecad.org |  |
| erath | 48143 | 24,656 | unknown | unclassified | - | erathcad.org |  |
| freestone | 48161 | 23,979 | Pritchard & Abbott | P&A-hard | - | freestonecad.org |  |
| hudspeth | 48229 | 23,954 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | hudspethcad.org |  |
| fayette | 48149 | 23,882 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | fayettecad.org |  |
| bee | 48025 | 23,864 | PACS | PACS-loadable | baths+sqft * | beecad.org | BEE-CAD-2025-CERTIFIED-APPRAISAL-ROLL-CSV.zip (no beds published) |
| washington | 48477 | 23,475 | PACS | PACS-loadable | - | washingtoncad.org | https://washingtoncad.org/wp-content/uploads/2026/03/2025-Certified-Appraisal-Roll.zip |
| sabine | 48403 | 23,352 | unknown | unclassified | - | sabinecad.org |  |
| newton | 48351 | 23,278 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | newtoncad.org |  |
| colorado | 48089 | 22,756 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | coloradocad.org |  |
| calhoun | 48057 | 22,678 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | calhouncad.org |  |
| austin | 48015 | 22,581 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | austincad.org |  |
| limestone | 48293 | 21,727 | unknown | unclassified | - | limestonecad.com |  |
| uvalde | 48463 | 21,722 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | uvaldecad.org |  |
| eastland | 48133 | 21,448 | Pritchard & Abbott | P&A-hard | - | eastlandcad.org |  |
| shelby | 48419 | 21,378 | Pritchard & Abbott | P&A-hard | - | shelbycad.com |  |
| milam | 48331 | 20,992 | unknown | unclassified | - | milamcad.org |  |
| titus | 48449 | 20,833 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | titus-cad.org |  |
| dewitt | 48123 | 20,802 | Pritchard & Abbott | P&A-hard | - | dewittcad.org |  |
| howard | 48227 | 20,654 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | howardcad.org |  |
| gonzales | 48177 | 20,420 | Pritchard & Abbott | P&A-hard | - | gonzalescad.org |  |
| brewster | 48043 | 20,287 | unknown | unclassified | - | brewstercad.org |  |
| bosque | 48035 | 19,975 | unknown | unclassified | - | bosquecad.org |  |
| marion | 48315 | 19,841 | unknown | unclassified | - | marioncad.org |  |
| lavaca | 48285 | 19,767 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | lavacacad.com |  |
| hale | 48189 | 19,108 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | halecad.org |  |
| hutchinson | 48233 | 18,938 | Pritchard & Abbott | P&A-hard | - | hutchinsoncad.org |  |
| panola | 48365 | 18,812 | Pritchard & Abbott | P&A-hard | - | panolacad.org |  |
| falls | 48145 | 18,581 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | fallscad.net |  |
| jackson | 48239 | 18,453 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | jacksoncad.org |  |
| presidio | 48377 | 18,436 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | presidiocad.org |  |
| comanche | 48093 | 17,580 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | comanchecad.org |  |
| hockley | 48219 | 17,242 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | hockleycad.org |  |
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
| callahan | 48059 | 12,064 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | callahancad.org |  |
| wilbarger | 48487 | 11,894 | unknown | unclassified | - | wilbargercad.org |  |
| jack | 48237 | 11,866 | unknown | unclassified | - | jackcad.org |  |
| morris | 48343 | 11,857 | unknown | unclassified | - | morriscad.org |  |
| camp | 48063 | 11,652 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | campcad.org |  |
| sansaba | 48411 | 11,591 | Pritchard & Abbott | P&A-hard | - | sansabacad.org |  |
| lipscomb | 48295 | 11,030 |  | no-domain | - |  |  |
| kinney | 48271 | 11,010 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | kinneycad.org |  |
| deafsmith | 48117 | 10,901 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | deafsmithcad.org |  |
| mcculloch | 48307 | 10,778 | Pritchard & Abbott | P&A-hard | - | mccullochcad.org |  |
| andrews | 48003 | 10,522 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | andrewscad.org |  |
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
| mitchell | 48335 | 8,743 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | mitchellcad.org |  |
| real | 48385 | 8,272 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | realcad.org |  |
| coke | 48081 | 8,271 | Pritchard & Abbott | P&A-hard | - | cokecad.org |  |
| concho | 48095 | 8,034 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | conchocad.org |  |
| upton | 48461 | 7,846 | Pritchard & Abbott | P&A-hard | - | uptoncad.org |  |
| wheeler | 48483 | 7,676 | Pritchard & Abbott | P&A-hard | - | wheelercad.org |  |
| lynn | 48305 | 7,324 | Pritchard & Abbott | P&A-hard | - | lynncad.org |  |
| yoakum | 48501 | 7,291 | PACS | PACS-loadable | - | yoakumcad.org | https://yoakumcad.org/wp-content/uploads/2025/09/2025-CERTIFIED-APPRAISAL-ROLL.zip |
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
| delta | 48119 | 6,461 | PACS/TrueAutomation | PACS-portal(no bulk found) | - | delta-cad.org |  |
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
Waller, Medina, Cherokee, Matagorda, Upshur, Jasper, Hill, Starr, Cass, Fayette,
Colorado, Austin, Uvalde, Howard, Lampasas, Callahan, Comanche, Moore, Willacy,
Hale, Falls, Jackson, Presidio, Hockley, Blanco, Lamb, Zapata, Camp, Kinney,
Deaf Smith (note: advertises $75 data fee), Andrews, Edwards, Mason, Mills, Real,
Concho, Somervell, Parmer, Schleicher, Castro, Dallam, Sutton, Brooks, Hartley,
Shackelford, McMullen, Oldham, Kenedy, Calhoun — plus earlier Comal, Henderson,
Parker, Smith. (~50 counties, almost all small/rural, low parcel weight.)

**App-lane (True Prodigy, per-property API — data session should NOT harvest):**
Travis, Tarrant (live), Denton, McLennan, Ellis (beds confirmed via API by the
app session); Montgomery (baths-only, no beds in API); Johnson.
