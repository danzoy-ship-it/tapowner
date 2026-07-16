# TapOwner — Foreclosure Coverage Checklist (254 counties)

**The living ledger for the courthouse/foreclosure-signals campaign** (app-session lane; writes
`parcel_signals`, NOT `parcels`). Modeled on the Miner's `COUNTY_COVERAGE.md`. Purpose: make
"what's loaded / what's left / what we already tried" legible so no county is silently lost or
re-checked. Loaders: `api/scripts/signals/load_pdf_foreclosures.mjs` (the shared core + ~80 CivicPlus/
CivicLive/etc counties), `load_kofile_foreclosures.mjs` (Kofile WebSocket), `load_collin_/travis_/
county_foreclosures.mjs` (bespoke). System map + crack recipes: `FORECLOSURE_SOURCES.md`.

**Last updated:** 2026-07-16 (revisit-queue pass, see bottom section).

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

## REVISIT-QUEUE PASS (2026-07-16, second session) — new loader `load_fc_revisit.mjs`

Worked the non-clean-IP-blocked revisit tail. Net new: **+1 Leon tie, +9 Orange ties (15 rows),
-1 Karnes false-positive tie removed** (data-quality fix, see below). Two minimal, additive fixes
landed in the shared parser (noted inline in the code with today's date) after root-causing real
bugs, not just re-running: `load_pdf_foreclosures.mjs`'s `splitCity`/`directMatch` gained a rural
route-number alias tier ("COUNTY ROAD 461" == "CR 461" == the parcel's stored "CR 461" — neither
the last-token SUFFIX rule nor `normStreetAll` caught this because the road-TYPE word isn't the
last token, the route NUMBER is); `load_fc_ne_southcentral.mjs`'s `rains_cc` now reads the sale
month/year from anchor TEXT instead of requiring it in the filename (the live July packet is
linked under a generic reused filename with no date in it at all).

- **Marion (48315):** re-ran marion_cc (already had a working loader, 0 rows stored). 3 packets;
  the in-window one parses to a single LEGAL-ONLY notice ("Tract 2, a 17.56 acre tract... John
  Caldwell Survey") — pure metes-and-bounds, no lot/block, no street address. Genuine absence of
  a tie-able identifier; loaded (1 row, 0 tied), not a bug.
- **Rains (48379): FIXED, real bug.** Discovery was returning 0 packets because the current (July
  2026) posting is linked under a generic reused filename ("forclosure sales.pdf") with the
  month/year carried only in the anchor TEXT ("JULY 2026") — the old regex required the date to be
  IN the filename (true for Jan-Jun, false for the live one). Fixed `rains_cc`'s discover() in
  `load_fc_ne_southcentral.mjs` to read the anchor text. Now finds 1 real notice: "370 N Locust
  Street, Point, TX 75472" (sale 2026-07-07). Did NOT tie: the likely real parcel (370 Locust St,
  owner Lloyd June) omits the notice's leading directional "N" — a near-miss, not force-tied
  per the unique-match-only rule. Loaded (1 row, 0 tied).
- **Leon (48289): FIXED + TIED, real bug.** Discovery worked (2 packets); the Yeager notice's
  caption address ("7028 County Road 461, Normangee, TX 77871") failed to tie even though the
  EXACT parcel exists (owner "YEAGER CODY MATTHEW & CRYSTAL MARIE", situs "7028 CR 461,
  Normangee, TX 77871") — root cause: (1) a document barcode glued into the OCR line between the
  route number and the city broke `splitCity`'s suffix-cut, and (2) even after that, "COUNTY ROAD
  461" and "CR 461" don't normalize to the same string anywhere in the matcher (the road-TYPE word
  isn't the last token, so the SUFFIX/`normStreetAll` machinery never touches it). Fixed both in
  `load_pdf_foreclosures.mjs` (additive-only: a new equality tier tried only when every existing
  tier misses, so it can't change any prior match). Leon now ties 1/1 [direct]. This class of fix
  likely helps other rural CR/FM/PR-addressed counties going forward, not just Leon.
- **Sabine (48403):** re-ran sabine_cc (working loader, 0 rows). 4 packets, all HOA/POA
  assessment-lien notices (Pendleton Harbor Subdivision) with non-standard alphanumeric lot IDs
  ("Lot R-431", "Unit 4, Lots R431, 432") — not a Lot+Block plat format the legal parser
  recognizes, and no street address anywhere. Genuine format gap; loaded packets, 0 notices.
- **Orange (48361): CRACKED, new source, +9 ties.** The legacy AS400 "Real Vision Software" grid
  (`http://as400.co.orange.tx.us:8081/pgms/rvimain.pgm?...`) needs NO POST-emulation of the
  per-doc PDF viewer at all — the grid itself already carries everything needed (owner/primary
  party name + sale date), so the "needs session-bound POST to view the image" blocker from the
  earlier pass turned out to be irrelevant. One plain (cookie-less) GET + one plain form POST
  (bumping `pagecnt` to the dropdown's max, 36) returns 36 of 39 live rows with zero auth. Wrote
  `load_fc_revisit.mjs` (bespoke fetch -> parse-rows -> `matchOwnerName` -> upsert; the shared
  PDF/address pipeline doesn't apply since there's no PDF and no address, only owner name). 15
  rows land in the future/current window (`event_date >= today`); 9/15 tied uniquely by owner name
  against `parcels.owner_name` (GOV_OWNER-guarded), e.g. "JACKSON, BYRON KEITH & SHIROND[A]" ->
  31 Knotty Pine, Orange TX; "CAFFEY, ROBERT" -> 102 Robin Ave, Bridge City TX. Re-runnable
  monthly; source_ref is the AS400's own stable per-document code (e.g. "EAAABMK4"), so re-runs are
  idempotent.
- **Childress (48075): retried, still genuine absence (revised).** The site's ActiveStorage blob
  route — reported as 0% reachable in the prior pass — actually worked on the FIRST attempt this
  time (the www.childresstx.us Rails app 500s intermittently, ~33-50% of page loads, but that's
  independent of blob-download success). Downloaded and OCR'd the top-listed "Notice of Trustee
  Sale" PDF: it is dated **August 2020** ("TS No TX06000013-20-1S"), sitting at the top of a
  reverse-chronological-looking archive next to a 2020 election notice — a stale artifact, not a
  live current posting. Revises the prior "REAL SIGNAL SOURCE CONFIRMED" note: the infra blocker is
  gone, but there is still no CURRENT notice to load. Genuine absence for this window, not a fetch
  bug; re-check if/when the county posts something newer.
- **Karnes (48255): DATA-QUALITY FIX, -1 false tie.** Re-diagnosed the existing tied row: the
  caption fallback had matched "2470 S US 181, Karnes City, TX 78118" — which is the COUNTY
  CLERK'S OWN recording-office address, stamped as a running header on every page of the notice PDF
  — via the Census geocode-fallback path to an unrelated highway parcel (owner "RED EWALD LLC",
  situs "0 US-181"). The actual foreclosed property in that notice is a rural 10.58-acre metes-and-
  bounds tract (H.R. Ammons Survey) with no street address at all; the true owner per the deed of
  trust is unrelated to Red Ewald LLC. **Deleted the false-positive `parcel_signals` row**
  (id 6715158). The county's other 2 in-window notices remain genuinely untied: one has a spelled-
  out/OCR-garbled lot number ("LOTS AND SIX BLOCK 136" — likely "LOTS FIVE AND SIX", no digit lot
  the parser can extract), the other is the same rural Tract-only description (no lot/block).
  Net: karnes_cc now 3 rows / 0 tied (was 3/1, the 1 was wrong).
- **La Salle (48283):** re-ran lasalle_cc (working loader). 1 in-window packet; a genuine
  parser-format gap — a compound multi-lot description ("east 20 feet of Lot Four... AND ALL OF
  LOTS FIVE (5) AND SIX (6)... BLOCK NUMBER THIRTEEN (13)") where the lot numbers are spelled out
  in words with digits only in trailing parens, several words before "BLOCK" — doesn't fit the
  shared `LEGAL_RE`'s single "LOT N, BLOCK M" template. Not fixed (too narrow/risky a regex change
  for one multi-lot phrasing); logged as a genuine parser gap, light pass only per instructions.
- **Brooks (48047) / Newton (48351) / Falls (48145):** re-ran all three. Brooks: 3 in-window
  legal-only notices, all pure metes-and-bounds tracts (Loma Blanca Grant, La Rucia Grant survey
  tracts) — confirmed genuine absence, no lot/block anywhere. Newton: 2 in-window packets, both
  pure metes-and-bounds (Martin Parmer Survey) — confirmed genuine absence. Falls: still 1/1 tied
  (1410 Lorene Ln, Marlin TX) — already correct, no change needed.
- **Clay (48077) / Harrison (48203):** re-verified with a fresh fetch each — both still fail at
  the TLS/TCP level from this IP (`fetch failed` before any HTTP response). Consistent with every
  prior finding. Left for a clean-IP session per the standing note; not chased further.

**New foreclosure grand total (2026-07-16, end of this pass): 4,820 rows / 2,485 tied to parcels
across 150 counties** (was 148 counties / 2,426 tied at the top of this file, though most of that
delta reflects work done between this file's last edit and this session's start, not just this
pass — this pass's own net contribution is +1 Leon, +9 Orange, -1 Karnes cleanup).
