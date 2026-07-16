# TapOwner — Foreclosure Coverage Checklist (254 counties)

**The living ledger for the courthouse/foreclosure-signals campaign** (app-session lane; writes
`parcel_signals`, NOT `parcels`). Modeled on the Miner's `COUNTY_COVERAGE.md`. Purpose: make
"what's loaded / what's left / what we already tried" legible so no county is silently lost or
re-checked. Loaders: `api/scripts/signals/load_pdf_foreclosures.mjs` (the shared core + ~80 CivicPlus/
CivicLive/etc counties), `load_kofile_foreclosures.mjs` (Kofile WebSocket), `load_collin_/travis_/
county_foreclosures.mjs` (bespoke). System map + crack recipes: `FORECLOSURE_SOURCES.md`.

**Last updated:** 2026-07-16.

## ⚠️ Why this is NOT a "~10 systems → 254 counties" campaign (unlike the CAD/Miner side)
CAD data collapses to ~10 vendor systems because (a) the system fixes the access recipe and (b) the
data is BULK (one pull = whole county). Foreclosure data breaks both: the website platform
(CivicPlus/CivicLive/Granicus/WordPress/…) is just the CMS the clerk happens to use — it does NOT
define a uniform URL/recipe, so each county still needs its own `discover()`; and the data is SPARSE
(a few scanned PDF notices/month, often no street address). The ONE real system-crack was Kofile
(one WS protocol → ~46 counties, paywall-capped). So this campaign is closer to per-county work —
the platform knowledge accelerates discovery but doesn't eliminate it.

## STATUS: 148 / 254 counties have a foreclosure signal · 2,426 tied to parcels (as of 2026-07-16)

**Kofile RE-JOIN (2026-07-16): +254 ties, 75 → 329, WITHOUT re-fetching.** A Fable-5 crack proved
the old ~5% Kofile tie rate was a JOIN failure, not a paywall wall, for the tie-able counties. Four
untried identifier paths in the already-stored rows: (1) **address-match** — Dallas's "legalDescription"
field is actually a street address → +181 Dallas (22→203); (2) **legal-normalizer v2** (glued-digit
`LOT 7BLOCK` boundary fix, abbreviated-subdivision stopwords, plural/letter lot designators) → Nueces
29→43, San Patricio 3→11; (3) **OCR street re-parse** (skip clerk stamps, take LAST number+street run)
→ +30; (4) **grantor↔owner_name** → Wilson 0→4. Also Johnson 4→30, Midland 1→8, Denton 9→14,
Cameron 0→3, Jefferson 0→3, Smith 4→7. All 254 stamped `meta.rejoinedAt='2026-07-16'`, auditable.
**But the ceiling is REAL for a subset, now proven per-row:** hidalgo (all 300 rows NULL legal +
clerk-stamp OCR + no coords), grayson, starr, walker, grimes, brazos, and ~93% of cameron/denton
carry NO tie-able identifier in the free record → stop chasing these via the free index. **Tarrant:**
no rows currently stored (old pull expired); its free index DOES carry legalDescription, so a clean-IP
re-pull WITH the fixed matcher (loader fixes in flight) is what finally ties it. See FORECLOSURE_SOURCES.md.

**Re-scrub pass (6 region agents over the 123 no-signal counties) added +12 counties / +31 ties.**
Rescue wins: Chambers 12, Galveston 9 (WAF-to-curl but Node fetch passes), Hockley 4, Mitchell 3
(OCR-in-discover), Carson + Wheeler. Most other no-signal counties re-verified as HIGH-CONFIDENCE
genuine absence (checked the right pages/canonical hosts) or confirmed-blocked (Kofile / Tyler /
uslandrecords / CAPTCHA). **Clean-IP / infra retry candidates:** Clay + Harrison (TLS/TCP block on
this IP), Childress (site 500s ~half the time — real content), Orange (legacy AS400 grid, owner-name-
only, needs POST-emulation). **Shared-parser gap (not a source gap):** Karnes/La Salle/Brooks/Newton/
Falls have legible OCR now but Tract-/Lot-only legal descriptions with no street address (+ a Karnes
near-miss where a real address sits outside a recognized cue phrase) → a future shared-parser tweak
could rescue these. **Need-a-run:** Marion/Rains/Leon/Sabine have working loaders but 0 rows.


**All 254 counties have now been ATTEMPTED** — each is loaded, Kofile-parked, or skip-logged with a
concrete reason. Two parallel waves (12 region agents) swept the rural tail 2026-07-16. The
remaining ~124 with no signal are overwhelmingly deep-rural "no online posting / courthouse-door only"
or stale/paywalled — genuine absence, not un-attempted. Wave-2 additions (each its own
`load_fc_<region>.mjs`): Maverick 19, Brown 12, Waller 10, Jim Hogg 4, Washington 3, Hale 3, DeWitt 3,
Franklin 3, Crane 4, Pecos, Ward, Edwards, Montague, Archer, Stephens, Eastland, Jones, Haskell,
Robertson 2, Deaf Smith, Castro, Swisher, Lamb, Moore 3, Gray, + more (see the region files).
**Tesseract OCR was installed** (winget) mid-wave → image-only notice PDFs now read; the earlier
"no-OCR" gap is closed. **Revisit queue additions:** Clay (TLS-blocked on this IP → clean-IP retry),
Mitchell (~25 real postings but needs OCR-in-discover — a small loader tweak), and re-verify any
"unparseable/no-page" skip against the RIGHT page (Robertson was wrongly skipped — had checked the
wrong page — now loaded).

### (historical STATUS line: 91 / 2,009 before wave 2)

## ✅ LOADED (91 counties; tie count in parens; source `<name>_cc` unless noted)
arcgis: Bexar 276.
Big metros / bespoke: Harris 268, Dallas 184 (+22 via dallas_kofile current-months), Collin 368
(Blazor browser-scrape, `collin_cc`), Travis 12 (own Aumentum app, sample only — full load needs
browser page-capture), Fort Bend 159, Williamson 45.
CivicPlus/CivicLive/Granicus/WordPress/easydocs/Revize/AgendaSuite PDF counties: Bell 99, Kaufman
102, Guadalupe 45, Ellis 41, Rockwall 41, Webb 29, Bastrop 23, Hunt 21, Coryell 20, Hays 18,
McLennan 14, Randall 13, Parker 13, Medina 10, Comal 9, Henderson 9, Hill 9, Ector 8, Fannin 8,
Victoria 7, Polk 5, Vanzandt 5, Wise 5, Angelina 5, Kerr 4, Johnson 4(kofile), Smith 4(kofile),
Atascosa 3, Caldwell 3, Fayette 3, Kleberg 3, Navarro 3, San Patricio 3(kofile), Tom Green 3,
Brazos 2(kofile), Bosque 2, Burnet 2, Houston 2, Lee 2(?), Milam 2, Panola 2, San Jacinto 2,
Willacy 2, Andrews 1, Bowie 1, Cass 1, Cooke 1, Erath 1, Howard 1, Jackson 1, Lamar 1, Lampasas 1,
Limestone 1, Madison 1, Midland 1(cc)/kofile, Shelby 1, Titus 1, Upshur 1, Wharton 1, Wood 1.
0-tie-but-loaded (Kofile paywall or rural legal-only — notices present, no parcel tie): Cameron,
Dawson, Duval, Goliad, Gonzales, Grayson, Grimes, Hidalgo, Hopkins, Jefferson, Liveoak, Nolan,
Palo Pinto, Runnels, Scurry, Starr, Tyler, Walker, Wilson.

## 🧱 IMPASSE LOG (attempted, not loadable from a free source — with reason + revisit trigger)
- **Tyler Eagle / tylerhost.net (paywalled search)**: Taylor, Wichita, Aransas, Brazoria (also Tyler
  cloud login). REVISIT only if we ever accept per-record cost — structurally paywalled.
- **documents-on-demand / Box-only portals**: Hood. REVISIT: different-vendor crack.
- **CivicPlus React DocumentCenter (antiforgery wall)**: Parker (worked via pinned URL), Somervell
  (tiny — deferred). REVISIT: crack the React ajax/antiforgery flow once → applies to both.
- **WAF/403 to headless fetch**: Jack, Trinity. REVISIT: headful browser (like Collin/Travis).
- **Stale (feed exists but last post >6mo old)**: Liberty (2023), Jasper (2018), Matagorda (2021-24),
  Refugio (2018), San Patricio-CivicLive (2023), Hardin (empty this cycle). REVISIT: re-check monthly.
- **No sale dates / unparseable structure**: Newton (case numbers only), Robertson (mixed feed),
  Goliad/Duval/Livermore-style rural metes-and-bounds (loaded but 0-tie).
- **No online posting found (courthouse-door only)**: Cherokee, Harrison, McMullen. REVISIT: NEVER-
  conclude-absence — re-probe real domain/Wayback/sibling hosts before treating as permanent.

## 🅿️ REVISIT / PARKED QUEUE
- **Kofile stragglers** (rate-limited or timed out mid-run 2026-07-16): Collin-kofile, Llano, Potter,
  Montgomery (only 2 notices — verify). Re-run from a rested IP. `--try-return-address` proven a
  dead-end (0 matches) — do not re-test.
- **Kofile `.search.kofile.com` host** (Anderson/Zapata/Jim Wells): DIFFERENT incompatible system
  (HTTP 500). REVISIT only if that host is separately reverse-engineered.
- **Travis full load**: only a 20-notice sample loaded; the full ~245 needs browser page-capture of
  its Aumentum results grid (WAF-blocked to headless). REVISIT with the browser.
- **Collin non-geocoded**: 302 of 670 notices lack coordinates → need address geocoding to load.

## ⏳ IN FLIGHT (2026-07-16 parallel wave — 6 Sonnet agents, own region files)
Panhandle-North, South-Plains, Permian, Trans-Pecos/Border (incl. El Paso), Concho-Valley,
NE+South-Central. ~80 deep-rural counties — expect a high "no online posting" rate (honest).

## ⬜ NOT YET ATTEMPTED (the remainder after the in-flight wave)
Roughly the deep-rural tail + a few mid counties not yet reached (~80 after this wave). A second
parallel wave covers most of the rest.

### ✗ ArcGIS foreclosure-LAYER sweep — DONE 2026-07-16, came back EMPTY (Bexar is an outlier)
The "highest-value un-attempted lever" (a Bexar-style bulk foreclosure FeatureServer) was swept
across the ~30 most GIS-mature / populous counties (Montgomery, Denton, Cameron, Hidalgo, Nueces,
El Paso, Brazoria, Galveston, Jefferson, Lubbock, McLennan, Smith, Grayson, Comal, Guadalupe,
Johnson, Ellis, Kaufman, Hays, Wichita, Taylor, Tom Green, Potter, Randall, Midland, Ector, Bell,
Brazos, Hunt, Rockwall). Method was rigorous (full ArcGIS-org enumeration up to 347 services each,
field-level parcel-layer inspection, 4 cross-state false positives caught & ruled out: Midland MI,
El Paso CO, Potter PA, Florence SC). **Verdict: NO county has a Bexar-style foreclosure/tax-sale
layer** — all publish foreclosure notices only as PDF postings / RealAuction / PBFCM law-firm lists,
and their parcel layers carry geometry+ID only (no CAUSE_NO/SALE_DATE/MIN_BID/STRUCK_OFF field).
Bexar's `ForeclosuresProd` does not generalize; do not re-chase this lever. **One unverified
follow-up:** El Paso CAD's own server `https://gis.epcad.org/arcgis/rest/services?f=json` was
Cloudflare-blocked (522/403) on this IP — genuinely unverified, not cleared; retry from a clean IP.
