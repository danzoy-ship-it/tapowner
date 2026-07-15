# Texas County Coverage — the check-off log

**Goal (Frederick): mine ALL 254 Texas counties — best property-data coverage of any competitor, so the underserved rural/'country' agent gets served. This is the master checklist; work the ☐ rows to done.**

Regenerate with `python data/build_coverage_log.py` after each mining batch (refresh `coverage.json` via the per-county scan first).

## Scoreboard (253 counties)

- ☑ **Mined (has improvements/feature tags): 69** / 253
- Full attributes (improv+dims): 40  ·  Partial: 40  ·  Geometry-only (need mining): 173  ·  Missing from DB: 0
- Seller-signals — sale date: 65 counties  ·  exemptions (homestead/over-65/DV tenure): 109 counties  ·  **any seller-signal: 122 counties**

Status = FULL+SIGNALS (improv+dims+sale) · FULL · PARTIAL · GEOM-ONLY · MISSING. % = share of the county's parcels with that attribute.

| ☑ | County | FIPS | Parcels | sqft% | beds% | baths% | improv% | sale% | exempt% | Status |
|---|--------|------|--------:|------:|------:|-------:|--------:|------:|--------:|--------|
| [ ] | Hidalgo | 48215 | 328,322 | 81 | · | · | · | 93 | 47 | PARTIAL |
| [ ] | Smith | 48423 | 140,245 | 55 | · | · | · | · | · | GEOM-ONLY |
| [ ] | Lubbock | 48303 | 135,112 | 78 | · | · | · | 95 | · | PARTIAL |
| [ ] | Henderson | 48213 | 106,708 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Comal | 48091 | 103,537 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Parker | 48367 | 100,548 | · | · | · | · | 92 | · | PARTIAL |
| [ ] | Webb | 48479 | 98,291 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Ector | 48135 | 75,891 | 77 | · | · | 20 | 68 | 42 | PARTIAL |
| [ ] | Hunt | 48231 | 69,728 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Tomgreen | 48451 | 58,686 | · | · | · | · | 98 | · | PARTIAL |
| [ ] | Bowie | 48037 | 53,212 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Harrison | 48203 | 50,995 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Burnet | 48053 | 50,138 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Waller | 48473 | 48,136 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Nacogdoches | 48347 | 48,003 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Cherokee | 48073 | 46,761 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Navarro | 48349 | 46,167 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Medina | 48325 | 44,330 | · | · | · | · | 88 | · | PARTIAL |
| [ ] | Vanzandt | 48467 | 43,963 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Anderson | 48001 | 43,894 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hardin | 48199 | 41,635 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hill | 48217 | 39,355 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Llano | 48299 | 38,879 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Palopinto | 48363 | 38,698 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Starr | 48427 | 38,571 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Rusk | 48401 | 37,967 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Chambers | 48071 | 37,510 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Matagorda | 48321 | 37,211 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Jasper | 48241 | 37,136 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Atascosa | 48013 | 36,791 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Walker | 48471 | 35,582 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Cass | 48067 | 34,816 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Cooke | 48097 | 33,170 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Tyler | 48457 | 33,043 | · | · | · | · | 84 | · | PARTIAL |
| [ ] | Wharton | 48481 | 31,888 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Valverde | 48465 | 31,635 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Brown | 48049 | 31,411 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Upshur | 48459 | 30,293 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Kendall | 48259 | 29,986 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Fannin | 48147 | 29,043 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Jimwells | 48249 | 27,944 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Jones | 48253 | 27,732 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Grimes | 48185 | 27,711 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Leon | 48289 | 27,570 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Burleson | 48051 | 27,282 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Houston | 48225 | 26,611 | · | · | · | · | · | 18 | GEOM-ONLY |
| [ ] | Maverick | 48323 | 26,048 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hopkins | 48223 | 25,149 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Montague | 48337 | 24,836 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Erath | 48143 | 24,656 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Freestone | 48161 | 23,979 | · | · | · | · | · | 20 | GEOM-ONLY |
| [ ] | Hudspeth | 48229 | 23,954 | 5 | · | · | 5 | 23 | 2 | GEOM-ONLY |
| [ ] | Fayette | 48149 | 23,882 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Sabine | 48403 | 23,352 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Colorado | 48089 | 22,756 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Calhoun | 48057 | 22,678 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Austin | 48015 | 22,581 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Limestone | 48293 | 21,727 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Uvalde | 48463 | 21,722 | · | · | · | · | 94 | · | PARTIAL |
| [ ] | Eastland | 48133 | 21,448 | · | · | · | · | · | 22 | GEOM-ONLY |
| [ ] | Shelby | 48419 | 21,378 | · | · | · | · | 82 | · | PARTIAL |
| [ ] | Dewitt | 48123 | 20,802 | · | · | · | · | · | 20 | GEOM-ONLY |
| [ ] | Howard | 48227 | 20,654 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Gonzales | 48177 | 20,420 | · | · | · | · | · | 18 | GEOM-ONLY |
| [ ] | Brewster | 48043 | 20,287 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Bosque | 48035 | 19,975 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Marion | 48315 | 19,841 | · | · | · | · | · | 15 | GEOM-ONLY |
| [ ] | Hale | 48189 | 19,108 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hutchinson | 48233 | 18,938 | · | · | · | · | · | 28 | GEOM-ONLY |
| [ ] | Panola | 48365 | 18,812 | · | · | · | · | · | 24 | GEOM-ONLY |
| [ ] | Falls | 48145 | 18,581 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Jackson | 48239 | 18,453 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Presidio | 48377 | 18,436 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Robertson | 48395 | 16,935 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Liveoak | 48297 | 16,839 | · | · | · | · | · | 16 | GEOM-ONLY |
| [ ] | Lampasas | 48281 | 16,541 | · | · | · | · | 20 | · | GEOM-ONLY |
| [ ] | Franklin | 48159 | 16,540 | · | · | · | · | · | 19 | GEOM-ONLY |
| [ ] | Young | 48503 | 16,353 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Gray | 48179 | 16,251 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Lee | 48287 | 16,090 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Ward | 48475 | 15,174 | · | · | · | · | · | 15 | GEOM-ONLY |
| [ ] | Runnels | 48399 | 15,008 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Reeves | 48389 | 14,975 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Kleberg | 48273 | 14,909 | · | · | · | · | 82 | · | PARTIAL |
| [ ] | Duval | 48131 | 14,772 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Pecos | 48371 | 14,720 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Karnes | 48255 | 14,436 | · | · | · | · | · | 17 | GEOM-ONLY |
| [ ] | Blanco | 48031 | 14,269 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hamilton | 48193 | 14,253 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Willacy | 48489 | 13,989 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Lamb | 48279 | 13,871 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Redriver | 48387 | 13,728 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Clay | 48077 | 13,501 | · | · | · | · | · | 23 | GEOM-ONLY |
| [ ] | Culberson | 48109 | 13,327 | · | · | · | · | · | 3 | GEOM-ONLY |
| [ ] | Floyd | 48153 | 13,217 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Nolan | 48353 | 13,216 | · | · | · | · | · | 25 | GEOM-ONLY |
| [ ] | Frio | 48163 | 13,213 | · | · | · | · | · | 18 | GEOM-ONLY |
| [ ] | Coleman | 48083 | 12,839 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Sanaugustine | 48405 | 12,722 | · | · | · | · | · | 10 | GEOM-ONLY |
| [ ] | Stephens | 48429 | 12,647 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Zapata | 48505 | 12,623 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Refugio | 48391 | 12,478 | · | · | · | · | · | 21 | GEOM-ONLY |
| [ ] | Rains | 48379 | 12,301 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Moore | 48341 | 12,256 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Callahan | 48059 | 12,064 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Wilbarger | 48487 | 11,894 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Jack | 48237 | 11,866 | · | · | · | · | · | 18 | GEOM-ONLY |
| [ ] | Morris | 48343 | 11,857 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Camp | 48063 | 11,652 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Sansaba | 48411 | 11,591 | · | · | · | · | · | 12 | GEOM-ONLY |
| [ ] | Lipscomb | 48295 | 11,030 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Kinney | 48271 | 11,010 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Deafsmith | 48117 | 10,901 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Mcculloch | 48307 | 10,778 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Lasalle | 48283 | 10,341 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Goliad | 48175 | 10,314 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Madison | 48313 | 10,307 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Edwards | 48137 | 9,948 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Zavala | 48507 | 9,744 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Dawson | 48115 | 9,676 | · | · | · | · | · | 24 | GEOM-ONLY |
| [ ] | Archer | 48009 | 9,653 | · | · | · | · | · | 28 | GEOM-ONLY |
| [ ] | Motley | 48345 | 9,374 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Haskell | 48207 | 9,370 | · | · | · | · | · | 16 | GEOM-ONLY |
| [ ] | Crockett | 48105 | 9,113 | · | · | · | · | · | 8 | GEOM-ONLY |
| [ ] | Terry | 48445 | 9,113 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Mason | 48319 | 9,096 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Mills | 48333 | 9,025 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Real | 48385 | 8,272 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Coke | 48081 | 8,271 | · | · | · | · | · | 11 | GEOM-ONLY |
| [ ] | Concho | 48095 | 8,034 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Upton | 48461 | 7,846 | · | · | · | · | · | 16 | GEOM-ONLY |
| [ ] | Wheeler | 48483 | 7,676 | · | · | · | · | · | 15 | GEOM-ONLY |
| [ ] | Lynn | 48305 | 7,324 | · | · | · | · | · | 22 | GEOM-ONLY |
| [ ] | Martin | 48317 | 7,255 | · | · | · | · | · | 15 | GEOM-ONLY |
| [ ] | Winkler | 48495 | 7,234 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Jeffdavis | 48243 | 7,175 | · | · | · | · | · | 6 | GEOM-ONLY |
| [ ] | Hardeman | 48197 | 6,958 | · | · | · | · | · | 13 | GEOM-ONLY |
| [ ] | Crane | 48103 | 6,913 | · | · | · | · | · | 14 | GEOM-ONLY |
| [ ] | Somervell | 48425 | 6,823 | · | · | · | · | 95 | · | PARTIAL |
| [ ] | Fisher | 48151 | 6,817 | · | · | · | · | · | 15 | GEOM-ONLY |
| [ ] | Carson | 48065 | 6,710 | · | · | · | · | · | 25 | GEOM-ONLY |
| [ ] | Crosby | 48107 | 6,670 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Swisher | 48437 | 6,657 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Parmer | 48369 | 6,606 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Garza | 48169 | 6,583 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Schleicher | 48413 | 6,559 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Ochiltree | 48357 | 6,521 | · | · | · | · | · | 28 | GEOM-ONLY |
| [ ] | Castro | 48069 | 6,466 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Knox | 48275 | 6,408 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Baylor | 48023 | 6,349 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hall | 48191 | 6,347 | · | · | · | · | · | 12 | GEOM-ONLY |
| [ ] | Dallam | 48111 | 6,271 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Bailey | 48017 | 6,044 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Childress | 48075 | 6,030 | · | · | · | · | · | 22 | GEOM-ONLY |
| [ ] | Sutton | 48435 | 5,905 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Hansford | 48195 | 5,867 | · | · | · | · | · | 21 | GEOM-ONLY |
| [ ] | Brooks | 48047 | 5,739 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Cochran | 48079 | 5,735 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Collingsworth | 48087 | 5,735 | · | · | · | · | · | 11 | GEOM-ONLY |
| [ ] | Menard | 48327 | 5,708 | · | · | · | · | · | 10 | GEOM-ONLY |
| [ ] | Hartley | 48205 | 5,645 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Terrell | 48443 | 5,562 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Shackelford | 48417 | 5,542 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Foard | 48155 | 5,393 | · | · | · | · | · | 6 | GEOM-ONLY |
| [ ] | Stonewall | 48433 | 5,203 | · | · | · | · | · | 9 | GEOM-ONLY |
| [ ] | Dickens | 48125 | 4,744 | · | · | · | · | · | 10 | GEOM-ONLY |
| [ ] | Hemphill | 48211 | 4,685 | · | · | · | · | · | 17 | GEOM-ONLY |
| [ ] | Throckmorton | 48447 | 4,664 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Reagan | 48383 | 4,606 | · | · | · | · | · | 22 | GEOM-ONLY |
| [ ] | Jimhogg | 48247 | 4,441 | · | · | · | · | · | 23 | GEOM-ONLY |
| [ ] | Cottle | 48101 | 4,373 | · | · | · | · | · | 8 | GEOM-ONLY |
| [ ] | Mcmullen | 48311 | 4,188 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Oldham | 48359 | 4,162 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Briscoe | 48045 | 4,091 | · | · | · | · | · | 8 | GEOM-ONLY |
| [ ] | Armstrong | 48011 | 4,058 | · | · | · | · | · | 15 | GEOM-ONLY |
| [ ] | Borden | 48033 | 3,752 | · | · | · | · | · | 2 | GEOM-ONLY |
| [ ] | Irion | 48235 | 3,615 | · | · | · | · | · | 12 | GEOM-ONLY |
| [ ] | Kent | 48263 | 3,598 | · | · | · | · | · | 5 | GEOM-ONLY |
| [ ] | Sherman | 48421 | 3,531 | · | · | · | · | · | 16 | GEOM-ONLY |
| [ ] | Glasscock | 48173 | 2,988 | · | · | · | · | · | 6 | GEOM-ONLY |
| [ ] | Roberts | 48393 | 2,574 | · | · | · | · | · | · | GEOM-ONLY |
| [ ] | Sterling | 48431 | 2,364 | · | · | · | · | · | 13 | GEOM-ONLY |
| [ ] | King | 48269 | 2,313 | · | · | · | · | · | 1 | GEOM-ONLY |
| [ ] | Loving | 48301 | 1,914 | · | · | · | · | · | 1 | GEOM-ONLY |
| [x] | Harris | 48201 | 1,523,641 | 82 | 82 | 82 | 41 | · | · | FULL |
| [x] | Travis | 48453 | 828,773 | 41 | 12 | 37 | 41 | · | · | FULL |
| [x] | Tarrant | 48439 | 757,161 | 91 | · | · | 91 | 98 | 55 | PARTIAL |
| [x] | Bexar | 48029 | 709,541 | 87 | 83 | 83 | 88 | · | · | FULL |
| [x] | Dallas | 48113 | 694,160 | 85 | 83 | 85 | 77 | · | · | FULL |
| [x] | Elpaso | 48141 | 407,130 | 64 | 38 | 58 | 64 | · | · | FULL |
| [x] | Collin | 48085 | 387,737 | 91 | 74 | 78 | · | 97 | 67 | PARTIAL |
| [x] | Fortbend | 48157 | 375,097 | 83 | 50 | 52 | 75 | · | · | FULL |
| [x] | Denton | 48121 | 353,631 | 89 | 75 | 81 | 88 | 96 | 62 | FULL+SIGNALS |
| [x] | Montgomery | 48339 | 320,915 | 77 | · | 67 | 74 | 91 | 54 | FULL+SIGNALS |
| [x] | Williamson | 48491 | 282,983 | 82 | 24 | 78 | 87 | 82 | · | FULL+SIGNALS |
| [x] | Brazoria | 48039 | 275,131 | 62 | · | · | 62 | 78 | 40 | PARTIAL |
| [x] | Galveston | 48167 | 188,695 | 78 | 1 | 61 | 78 | 86 | 45 | FULL+SIGNALS |
| [x] | Cameron | 48061 | 185,062 | 69 | 20 | 21 | 75 | 95 | 39 | FULL+SIGNALS |
| [x] | Bell | 48027 | 167,412 | 73 | 11 | 34 | 78 | · | · | FULL |
| [x] | Liberty | 48291 | 162,275 | 24 | 3 | · | 34 | · | · | PARTIAL |
| [x] | Nueces | 48355 | 157,198 | 71 | 6 | 1 | 79 | 90 | 46 | PARTIAL |
| [x] | Jefferson | 48245 | 122,202 | 63 | · | · | 71 | · | · | PARTIAL |
| [x] | Hays | 48209 | 117,427 | 84 | 13 | · | 74 | · | · | PARTIAL |
| [x] | Mclennan | 48309 | 115,362 | 77 | · | 65 | 77 | 84 | 42 | FULL+SIGNALS |
| [x] | Johnson | 48251 | 101,847 | 68 | · | · | 72 | · | · | PARTIAL |
| [x] | Ellis | 48139 | 98,803 | 81 | · | · | 81 | 95 | 53 | PARTIAL |
| [x] | Guadalupe | 48187 | 95,571 | 72 | 37 | 43 | 78 | 93 | 48 | FULL+SIGNALS |
| [x] | Kaufman | 48257 | 94,650 | 71 | 4 | 7 | 78 | 91 | 48 | PARTIAL |
| [x] | Grayson | 48181 | 89,348 | 59 | · | 7 | 68 | · | · | PARTIAL |
| [x] | Gregg | 48183 | 77,816 | 71 | 16 | 59 | 74 | · | · | FULL |
| [x] | Midland | 48329 | 75,645 | 80 | · | · | 75 | 88 | 46 | PARTIAL |
| [x] | Brazos | 48041 | 74,666 | 85 | 51 | 52 | 86 | · | · | FULL |
| [x] | Taylor | 48441 | 70,598 | 73 | 29 | 63 | 74 | · | · | FULL |
| [x] | Randall | 48381 | 64,824 | 81 | 75 | 76 | 85 | 100 | 53 | FULL+SIGNALS |
| [x] | Bastrop | 48021 | 63,357 | 51 | · | · | 66 | 92 | 38 | PARTIAL |
| [x] | Angelina | 48005 | 60,693 | 60 | · | · | 63 | 94 | 36 | PARTIAL |
| [x] | Polk | 48373 | 60,178 | 35 | 30 | 34 | 44 | 94 | 19 | FULL+SIGNALS |
| [x] | Wichita | 48485 | 58,742 | 80 | 68 | 68 | 80 | 95 | 44 | FULL+SIGNALS |
| [x] | Potter | 48375 | 53,490 | 74 | 63 | 65 | 80 | 100 | 35 | FULL+SIGNALS |
| [x] | Rockwall | 48397 | 52,739 | 84 | 49 | 66 | 87 | 97 | 63 | FULL+SIGNALS |
| [x] | Sanpatricio | 48409 | 51,385 | 64 | · | · | 64 | 57 | 36 | PARTIAL |
| [x] | Hood | 48221 | 51,275 | 60 | · | · | 65 | 93 | 39 | PARTIAL |
| [x] | Orange | 48361 | 50,337 | 43 | · | · | 47 | · | · | PARTIAL |
| [x] | Wise | 48497 | 48,705 | 54 | · | 38 | 67 | 49 | · | FULL+SIGNALS |
| [x] | Victoria | 48469 | 45,104 | 76 | 58 | · | 76 | 86 | 42 | FULL+SIGNALS |
| [x] | Wood | 48499 | 44,576 | 54 | · | · | 54 | 87 | 32 | PARTIAL |
| [x] | Kerr | 48265 | 36,913 | 61 | 22 | 47 | 61 | 88 | · | FULL+SIGNALS |
| [x] | Sanjacinto | 48407 | 36,346 | 44 | 4 | · | 44 | 83 | 22 | PARTIAL |
| [x] | Lamar | 48277 | 36,246 | 52 | 6 | 49 | 65 | 81 | 33 | FULL+SIGNALS |
| [x] | Bandera | 48019 | 33,261 | 44 | · | · | 44 | 74 | 19 | PARTIAL |
| [x] | Gillespie | 48171 | 32,351 | 54 | 1 | · | 65 | 84 | 25 | PARTIAL |
| [x] | Coryell | 48099 | 31,711 | 68 | 7 | 65 | 77 | 86 | 44 | FULL+SIGNALS |
| [x] | Wilson | 48493 | 28,827 | 58 | 3 | 18 | 70 | 84 | 45 | FULL+SIGNALS |
| [x] | Aransas | 48007 | 26,690 | 60 | 29 | 35 | 61 | 85 | 25 | FULL+SIGNALS |
| [x] | Caldwell | 48055 | 26,155 | 59 | 34 | 34 | 75 | 88 | 33 | FULL+SIGNALS |
| [x] | Trinity | 48455 | 25,952 | 30 | 1 | 7 | 31 | 55 | 14 | PARTIAL |
| [x] | Bee | 48025 | 23,864 | 38 | · | 21 | 57 | · | · | FULL |
| [x] | Washington | 48477 | 23,475 | 65 | 36 | 38 | 74 | 17 | 41 | FULL |
| [x] | Newton | 48351 | 23,278 | 41 | 29 | 30 | 42 | 64 | 19 | FULL+SIGNALS |
| [x] | Milam | 48331 | 20,992 | 61 | 3 | 3 | 61 | 83 | 31 | PARTIAL |
| [x] | Titus | 48449 | 20,833 | 53 | 1 | 1 | 65 | 82 | 33 | PARTIAL |
| [x] | Lavaca | 48285 | 19,767 | 52 | · | 46 | 65 | 90 | 28 | FULL+SIGNALS |
| [x] | Comanche | 48093 | 17,580 | 39 | 9 | 35 | 53 | 84 | 23 | FULL+SIGNALS |
| [x] | Hockley | 48219 | 17,242 | 46 | · | 32 | 60 | 64 | 28 | FULL+SIGNALS |
| [x] | Gaines | 48165 | 16,576 | 38 | · | 34 | 58 | 89 | 24 | FULL+SIGNALS |
| [x] | Dimmit | 48127 | 15,542 | 23 | 2 | 13 | 26 | 55 | 10 | PARTIAL |
| [x] | Scurry | 48415 | 13,849 | 56 | 22 | 29 | 56 | 80 | 27 | FULL+SIGNALS |
| [x] | Andrews | 48003 | 10,522 | 55 | 3 | 50 | 69 | 81 | 37 | FULL+SIGNALS |
| [x] | Kimble | 48267 | 9,556 | 32 | · | · | 41 | 89 | 15 | PARTIAL |
| [x] | Mitchell | 48335 | 8,743 | 39 | 2 | 2 | 50 | 83 | 21 | PARTIAL |
| [x] | Yoakum | 48501 | 7,291 | 38 | · | 11 | 49 | 59 | 22 | PARTIAL |
| [x] | Delta | 48119 | 6,461 | 41 | · | 27 | 49 | 87 | 22 | FULL+SIGNALS |
| [x] | Kenedy | 48261 | 538 | 34 | 2 | 14 | 34 | 46 | 8 | PARTIAL |

## Known bulk-data gaps / blockers (exhausted attempts → circle back later)

Goal is 100% of NEEDED data on 100% of counties. Where an attribute isn't in any free bulk source after exhausting attempts, it's logged here with the path to close it.

**DECISION (Frederick, 2026-07-16):** do NOT mass-harvest per-property APIs (unethical/ToS/data-broker risk + ~9 days/county). App-lane / SPA / search-portal counties are logged as **PROBLEMATIC** and deferred to a later aggressive pass (fable-5 ultracode mode) + $0 electronic open-records requests. Take ALL easy bulk wins first. Every blocker stays tracked here so nothing is lost.

| County | Missing | Status of attempts | Path to 100% |
|--------|---------|--------------------|--------------|
| Tarrant (48439) | beds/baths counts | EXHAUSTED bulk: main-roll IMPROVEMENT_DETAIL_ATTR flags bedroom/bathroom attrs but stores NO count; PropertyData_R Num_Bedrooms column present but ZEROED; ResidentialCompAttributeData has no bed column. | Counts exist only in TAD True Prodigy per-property API (app-lane, already used by fill-on-blank). Bulk harvest is contract-barred — needs Frederick's decision to allow a rate-limited API pull, or a records request. |
| Collin (48085) | improvements (feature tags) | data.texas.gov feed is property-SUMMARY only (imprvclasscd/pool flag; no garage/shed segments). | Check collincad.org own data product for a segment/addl-improvement export (like Dallas RES_ADDL). |
| Gregg (48183) | sale/exemptions | GCAD_Export.zip prop_id space != DB source_property_id (roll/geometry key mismatch). | Re-pull a Gregg roll whose geo_id matches, or add a geo_id crosswalk (like Tarrant). |
| Hidalgo (48215) | improvement SEGMENTS / beds / pool-garage tags | PARTIAL: HCADShapefiles.zip data.mdb loaded (year built + main-area sqft + deed date + exemptions, ~324K parcels). True Prodigy killed the bulk roll; mdb has no segments/beds/pool. | $0 PIA to cs@hidalgoad.org for the True Prodigy 'Public Appraisal Export (Legacy 8.0.30)' — cite MCAD's public posting as precedent. |
| Hunt/Comal/Henderson/Webb/Harrison | improvements/beds/baths | EXHAUSTED free bulk (wave-3): TP/BIS orgs expose value-only FeatureServers; Hunt's full data is SharePoint login-gated; no PACS export posted. | $0 open-records request to each district for the PACS appraisal export (imp_detail/attr/info). |
| Lubbock (48303) | improvement segments/beds/baths | EXHAUSTED free bulk: Orion vendor, all 8 gis.lubbockcad.org services are annotation/parcel only (no segment table); site is PDF-only; the free monthly Property Data Export (Rec4 Improvement + Rec5 ImpSegment incl. Bedrooms) was discontinued ~2015 and is now sold via Orion. | $0 open-records/25.195 request naming LCAD's own 'Property Data Export (record types 1-6)'. |
| Smith (48423) | improvements/beds/baths/signals | EXHAUSTED free bulk: GSA Corp vendor, smithcad.org static/PDF-only, mapsite 500s, ArcGIS Hub has no CAMA. | $0 open-records request for the GSA 'Certified Data Roll' export (same product Johnson CAD posts free). |

**203 geometry-only counties** still need a full mining pass (mostly rural — the underserved market that is the whole point). Work them biggest-first from the ☐ rows above; each is a roll hunt (wp-json probe, PACS roll, CAD data product, or Socrata).

