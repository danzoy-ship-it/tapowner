# TapOwner — SESSION HANDOFF (read this before touching anything)

**Written:** 2026-07-15, end of the marathon session that took the app from "hangs on launch"
to feature-complete beta with a 20-county data moat. **Purpose:** zero loss of focus, vision,
or operational knowledge between sessions.

**Read in this order:** §0 CURRENT PICKUP just below (today's reality) → `TAPOWNER_BUILD.md`
(the constitution — it wins all conflicts) → `CURRENT_STATE.md` (ground truth snapshot) →
`TAPOWNER_APP_BIBLE.md` (**the V1 "come to Jesus" doc** — the airtight what+why for the realtor
app) → the runbook below (how to operate) → `PROGRESS.md` (recent nuance). Then re-derive from the
LIVE code/DB before acting — memory drifts, code doesn't.

---

## ⭐ 0. CURRENT PICKUP — 2026-07-17 (read FIRST; §1+ below is the durable runbook)

**V1 (realtor app) = SHIP-READY and FROZEN.** Sanity-checked live 2026-07-17 (parallel read-only
audits vs the DB): 253/253 counties, 97.2% owner_name, 100% geom; the core loop (tap → owner FREE →
$0.29 trace → AI draft → mini-CRM → farm) is built and verified end-to-end. The old "~51 mis-projected
counties" caveat is OBSOLETE (0 counties out of bounds on re-check).
- **Safety kit — USE THESE:** V1 is frozen at git tag **`v1-realtor-audited-2026-07-17`** (restore
  point; diff/rollback against it). **`cd api && npm run smoke`** = a 13-check tripwire (~10s) proven
  to catch breakage — RUN IT before AND after any change to shared code (api/src, schema,
  products.config). Green = V1 core loop intact. Script: `api/scripts/smoke_v1.mjs`.
- **The V1 come-to-Jesus doc is `TAPOWNER_APP_BIBLE.md`** — read it + the code + run smoke to fully
  re-ground on V1. (Being hardened 2026-07-17.)
- **V1's ONLY remaining blockers are BUSINESS/LEGAL, not data/code** (see §6): Stripe live mode
  (LLC→EIN→bank), the legal gate (attorney ToS/privacy, TX Data Broker registration, E&O/cyber
  insurance, a signed BatchData reseller addendum). The founding-agent TestFlight can ship NOW in
  Stripe TEST mode.

**V2 (roofers) = DATA FOUNDATION ONLY — no product built.** No roofer app screen, no roofer API route,
no roofer product config exist yet. Frederick decided 2026-07-17 to build V2 in parallel with V1 (safe
now: the tag + smoke test protect V1; V2 must stay ADDITIVE — new signal_types/routes/screens behind a
roofer flag, NEVER editing V1's paths).
- **Loaded (parcel_signals + hail_swaths):** roof_damage hail_spc 3.39M / wind_spc 3.04M; MRMS hail
  swaths (136 storm dates, lean polygons — designed for a UNION-with-SPC-at-query, query path NOT
  built; note MRMS is ~1.6-2.8x SPC on average, NOT the cherry-picked 10.4x, and LOWER on ~38% of
  dates → union, don't replace); code_violation 9,161 (Austin/SA/FtWorth/Plano/Arlington); probate
  ~1,050; pre_foreclosure 2,485 (shared w/ V1). `permits` 3.9M (roof 71,782 / solar 52,381 parcels,
  6-county corridor).
- **Not built:** the roofer app; the insurance-cliff/permit-derived signal QUERIES (computable from
  year_built/permits, just unsurfaced); the SPC∪MRMS runtime hail query. Catalog+status:
  `ROOFER_SIGNALS.md` + `TAPROOFERS_SIGNALS.md`. Integration: `JOBNIMBUS_INTEGRATION.md` +
  `api/src/integrations/jobnimbus.ts` (built + unit-tested, NOT wired; AccuLynx = same REST pattern,
  partner-gated).

**IN FLIGHT / EXTERNAL (not blocked on code):**
- **EARS statewide roll** (year_built for ALL 254 counties, field AJR23): Frederick SENT the
  Comptroller PIA 2026-07-17, confirmed received, ~10-business-day delivery (~2026-07-31). Loader
  pre-built + self-verifying: `data/load_ears_roll.py` (one command when the CSV lands). This fills the
  106 year_built-blind counties FREE → the roofer insurance-cliff signals go statewide. **Regrid
  (~$15-30K) is PARKED in favor of this.**
- **Roof-age imagery (CAPE/ZestyAI):** inquiries out 2026-07-16, awaiting reply — for the ~70 rural
  counties EARS/PIA can't reach.

**LOOSE ENDS to tidy:** MRMS left `api/scripts/signals/mrms_mesh_contour.py` (12Z-of-D+1 windowing
fix) + a `ROOFER_SIGNALS.md` note UNCOMMITTED — commit them.

**Pending DECISIONS (Frederick's):** (1) the business/legal runway = V1's REAL launch gate (the actual
bottleneck, not data); (2) roof-age route = free EARS (in motion) vs paid imagery for the rural tail;
(3) Railway DB volume (30GB, ~770MB free) — MRMS chose the lean swath design to avoid needing more; a
bigger volume is optional (my rec: skip).

**NEXT (unless Frederick redirects):** build the V2 roofer product on the loaded data — start with the
roofer signals API + product config (additive, flag-gated), smoke-test V1 green before/after. When
EARS lands, run `load_ears_roll.py`. Two Frederick terms: a **"sanity check"** = a full ground-truth
audit (agents re-derive from LIVE code/DB, don't trust docs); a **"come to Jesus document"** = an
airtight what+why record a zero-memory session can rebuild from.

---

**⚡ DATA ACCESS — both sessions:** `DATA_ACCESS_CRACKS.md` is the canonical reusable
reference for HOW to pull Texas CAD data from each vendor system (True Prodigy / BIS /
SWData / Harris-eSearch / PACS / Socrata / HCAD / Orion — endpoints, auth tokens, join
keys, what each yields). Cracked by fable-5 agents 2026-07-16. The app/signals session may
reuse the owner/deed/sale endpoints for enrichment (no table overlap: Miner writes `parcels`,
app writes `parcel_signals`). Per-county verdicts: `data/texas_county_system_map.md`;
254-county scoreboard: `COUNTY_COVERAGE.md`.

---

## 1. MISSION & COVENANTS (never drift)

TapOwner: iPhone app for Texas real-estate agents. Tap a property → owner of record FREE →
$0.29 unlocks phone/email → AI-drafted outreach + mini-CRM + Farm/Reverse-Prospecting.
Tiers: Prospector $9.99 / Closer $19.99, 30-day Closer trial, card required. The api/ core is
vertical-agnostic (roofing app is vertical #2, later, same core).

**The covenants with Frederick (fred@salasers.com, non-developer, voice-dictates — expect
transcription artifacts; give layman step-by-step for anything he must do):**
1. Frederick decides money + business; Claude decides technical. State costs BEFORE incurring.
2. **No "PASSED" without on-device verification.** Server-verified ≠ done.
3. Prove root cause with data before changing code. Never ship hypothesis fixes.
4. Honesty over confidence — report failures plainly, quantify from real data, push back with
   numbers (he rewards it; see the RentCast reversal in PROGRESS 2026-07-14).
5. Update `CURRENT_STATE.md` + `PROGRESS.md` every working block (his anti-drift order).
6. Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
7. He gives standing orders ("keep working, don't wait") — work autonomously overnight, bank
   wins cleanly, never risk quality when context runs low.

---

## 2. PRODUCT STATE (as of handoff)

- **On Frederick's phone:** build **1.0.0 (13)** was the last on-device confirm.
  **Build #14 SHIPPED 2026-07-14** (EAS build `9449080b`, submission `d1f8802e` scheduled;
  Apple processes ~5–10 min after the ~15-min build) with three UX fixes from his evaluation:
  (1) **contact button knows if you already paid** — `/parcels/at` returns `already_unlocked`
  and `PropertyCard` shows green **"Contact this person — Free"** when owned vs blue **"— $0.29"**
  when new (cosmetic only; the trace route still gates charging, so a stale flag can only
  under-promise Free);
  (2) **farm collapsed to two buttons** — the standalone Unlock button is GONE (now a plain
  status line), **"Actions for these N homes" is filled blue**, and the action sheet leads with
  a red (destructive) **"🔓 Unlock remaining X · up to $Y"** row with **"N already paid — $0"**
  in the subtitle (this REPLACES #13's blue→green standalone Unlock button and the "Unlock
  contacts for all N" sheet label);
  (3) **CRM detail is a real record** — `/saved-properties/:id` now also returns house facts +
  the paid phones/emails (same join the CSV export uses), and `PipelineDetailScreen` renders a
  facts line, mailing address, and a Contact section (DNC-badged phones + emails).
  Still valid: session no-match tracking, Email/Letter toggle in `FarmDraftScreen`.
  Ship ritual: `cd mobile && npx expo-doctor` (expect 18/18) then
  `npx eas-cli build --platform ios --profile production --auto-submit --non-interactive`
  (run in background; auto-submits; Apple processes ~5-10 min).
- **Security:** `data_auth_required=true` is LIVE — /tiles, /parcels/at, /geocode require the
  session token (401 anonymous). Builds ≤8 have a dead map (fine — Frederick is past them).
  Kill switch: set flag false in products.config.
- **Pricing live in config:** trace $0.29; metered cap $25/cycle; farm export 10¢/row at
  launch, **evaluator mode ON = free 300 rows/month** (`farm_export_beta`,
  `farm_export_beta_cap_rows`); geocode 200/day/user; draft 30/day/user.
- **Web:** tapowner.com + www live (Railway `web` service, custom domains verified).
  /billing → OTP → Stripe Customer Portal works end-to-end (portal configured by Frederick).
  `WEB_BASE_URL=https://tapowner.com` on the api service. **Rebranded 2026-07-14 per
  `BRAND_AND_PRODUCT_BRIEF.md`:** brand is **navy #052158 + orange #F27F09** (NOT the app's
  blue); the REAL logo art lives at `mobile/assets/logo-{wordmark,mark}.png` → trimmed into
  `web/public/` + `web/app/icon.png` (never re-draw an SVG). `web/app/logo.tsx` renders those
  PNGs. Marketing homepage leads with a **Reverse Prospecting flagship hero** + data-moat band.
  **Admin console at `/admin`** — Frederick's referral/commission manager: enter `ADMIN_SECRET`
  (same one gating `POST /partners`), see every partner with owed/earned/clicks/conversions +
  referral **link/QR** + comp terms, create partners (pick **25%/12mo recurring vs $20 flat**),
  record payouts (`POST /admin/partners/:id/payout`), revoke (`/status`). Commission engine in
  `billing.ts` verified against §5b (subscription-only revenue, atomic first-paid, flat vs
  recurring by `comp_model`, prorated clawbacks). Partners see their own numbers at `/partner`.
  Preview locally: `.claude/launch.json` server `web-dev` (port 3000). tapowner.com uses the
  prod API, so `/admin` there hits the real `ADMIN_SECRET`.
- **Apple demo account (for App Review):** review@tapowner.com, fixed code in Railway env
  (`DEMO_EMAIL`, `DEMO_OTP_CODE` — code is 824140), user id 18,永-active no-Stripe Closer with
  999 traces. At submission: paste email+code into App Store Connect review notes.
- **Stripe:** TEST MODE (live blocked on Frederick's LLC → EIN → bank chain; every-2-day
  scheduled reminder exists: `tapowner-legal-gate-reminder`). All webhooks verified. ASC App
  ID 6790593759; bundle `com.tapowner.app`; EAS project 81171a24-abad-471d-a1da-dd2f37279448;
  eas.json submit profile carries ascAppId/appleTeamId (auto-submit works non-interactively).

---

## 3. OPERATIONS RUNBOOK (the muscle memory)

### Deploys
- **api:** from repo root: `railway up --service api --ci` (NEVER `railway redeploy` for new
  code — it restarts the OLD image). Verify: `curl .../health` → 200 and `/config` has "tiers".
- **web:** from repo root: `railway up web --path-as-root --service web --ci`.
- Always pass `--service` explicitly; the CLI's linked service silently changes.
- Config values live in `products.config` (jsonb) — flip via one-off script, no redeploy;
  /config route caches 60s, dataAuth flag caches 60s.

### Database access (from this Windows machine)
- Read the URL each time:
  `INTERNAL=$(railway variables --service api --kv | grep '^DATABASE_URL=' | cut -d= -f2-)`
  then swap host: `db.railway.internal:5432` → **`tokaido.proxy.rlwy.net:54841`**.
- Node one-offs MUST run from `api/` (pg module lives there). Python loaders take
  `DATABASE_URL` env and live in `data/`.
- **The proxy drops long/slow connections.** Long DB phases need
  `keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=10` +
  whole-phase retry (pattern in `load_prodigy_json_attributes.py`). Never leave a connection
  idle through a long parse — parse first, connect after.
- **This DB's `/dev/shm` (container shared memory) is TINY (~67 MB)** → PARALLEL vacuum / parallel
  index maintenance fails with `DiskFull` on `/dev/shm` regardless of data-volume size. Always run
  `VACUUM (PARALLEL 0)` (single-threaded); avoid parallel workers on index builds. (Found 2026-07-17.)
- E2E auth tests: mint a JWT with `JWT_SECRET` from railway vars,
  payload `{userId, email}` (user **5** has an agent profile + real sub; user **18** = demo).
- NEVER print secrets; env vars only; delete `_tmp_*.mjs` scripts after use.

### ⚠️ THE BULK-DDL RULE (from the 2026-07-15 production incident — parcels is LIVE)
A materialization pass took the app down mid-evaluation: a long UPDATE on parcels was
running while a second script instance's `ALTER TABLE parcels…` queued behind it waiting
for ACCESS EXCLUSIVE — and a *waiting* ACCESS EXCLUSIVE blocks EVERY new query on the
table (tiles, /parcels/at, farm, CRM all timed out). Frederick tests on-device at any
hour; treat parcels as production, always:
1. `SET lock_timeout='2s'` on every session BEFORE any DDL — DDL must FAIL fast, never queue.
2. DDL on parcels runs at most ONCE, checked via information_schema/pg_indexes first
   (`ADD COLUMN IF NOT EXISTS` still takes ACCESS EXCLUSIVE as a no-op), and NEVER inside
   a retry wrapper or per-invocation setup phase.
3. Bulk UPDATEs: 50–100K-id batches, one transaction each — never a minutes-long single
   transaction (starves autovacuum, bloats WAL, makes any queued DDL catastrophic).
4. Indexes on parcels: `CREATE INDEX CONCURRENTLY` (autocommit session) only.
5. One instance at a time: pre-flight `pg_stat_activity` check for competing bulk/DDL
   queries on parcels; abort if found. If you kill a client, its server-side query keeps
   running — terminate the backend too (`pg_terminate_backend`) before relaunching.

### Machine quirks (also in auto-memory)
- Frederick's own terminal: PowerShell blocks npx → he uses cmd; `npx eas-cli` not `eas`.
- Claude's Bash tool: heredocs mangle backslashes in JS regex — write files with the Write
  tool or python -c io patches instead. Git Bash `/tmp` ≠ `C:\tmp` (permission denied).
- Background Bash commands cap at 10 min — chain long county loads inside ONE background
  command with `echo ===` markers; downloads >5 min need resume loops (`curl -C -`).
- CAD websites often 403 plain curl — use `-A "Mozilla/5.0 ... Chrome/126.0"`.
- expo/eas commands must run from `mobile/` (they read app.json; running elsewhere once
  scaffolded a stray root app.json — delete it if it reappears).

### Verification rituals (what "done" means here)
1. **V1 smoke test — run before/after touching shared code (api/src, db schema,
   products.config):** `cd api && npm run smoke` (~10s, one command, prints a PASS/FAIL
   table + nonzero exit on any failure). Boots the CURRENT source tree (via `tsx`, not a
   stale deploy) against the real DB, using a dedicated fixture user
   (`v1-smoke-test@tapowner.com`, reset to a known-good state and swept of its rows every
   run — never touches Frederick's or the demo reviewer's data). Covers the whole V1 core
   loop end-to-end: health/config, a real `/auth/otp/*` round-trip (demo account), owner
   lookup, the pre-foreclosure signal, farm-area query, tiles, geocode, the $0.29 trace
   unlock (seeds its own cache row and asserts `charged_via=included`, so it never calls
   the real skip-trace vendor or Stripe's network), AI draft, and the mini-CRM
   save/list/detail/status/note flow — plus proves every one of those routes 401s when
   called anonymously (registration/route-alive check). Verified to actually catch
   breakage: temporarily disabling a route registration turned the trace/draft/CRM/401
   rows red immediately. Script: `api/scripts/smoke_v1.mjs`.
2. `npx tsc --noEmit` clean in api/ AND mobile/ (strict; exactOptionalPropertyTypes bites).
3. Deploy → curl the live endpoint with real cases (grace/401/200 triads for auth work).
4. For data loads: **dry-run join-rate first, and sample RANDOMLY across the whole file — the
   head of a file lied twice** (Fort Bend 92.7%→32%, El Paso 74.7%→5%).
5. Loads are COALESCE-fill-only → partial/wrong-key loads never corrupt, only under-fill.
6. Mobile features: no PASSED until Frederick confirms on-device (covenant #2).

---

## 3b. THE TWO-SESSION CONTRACT (ratified 2026-07-15 — Frederick's order after coordination overlap)

**Why this exists:** both sessions drifted into county-hunting and Frederick became the message
bus; verdicts crossed (per-office TP flakiness minted contradictions). This contract is the
permanent separation of duties. It survives compaction — re-read it before any cross-lane work.

**THE MINER (data session, "TAPOWNER SESSION2"):** owns everything county-data — hunts, bulk
loads, county verdicts, `data/texas_county_system_map.md` (the ONLY place verdicts change, with
evidence + date), QA/repairs, the records-request list, `data/improvement_labels_seen.md`, and
running the improvement_tags materialization pass. Sole writer of bulk DB changes; any deliberate
record-nulling is logged in PROGRESS **before** anyone reports upward. Never deploys, never
touches api/src|mobile/|web/, never mass-harvests per-property APIs.

**THE PRODUCT (app session):** owns everything product — api/src, mobile/, web/, deploys,
billing/App Store, the fill-on-blank runtime + FILL_SOURCES registry, the Reverse Prospecting
filter UI/API, and `data/improvement_crosswalk.json` (content). **Does NOT hunt counties.**

**AMENDMENT (2026-07-16, Frederick's order — split the data work so the app session isn't idle
waiting):** the two data domains are now cleanly split by SOURCE and by TABLE, so both sessions
mine in parallel with zero collision:
- **MINER → the APPRAISAL ROLL** (every county, one pass, goal = 100% of 16 markers on all 254):
  beds/baths/sqft/year/stories/lot, improvement features, exemptions (HS/OV65…), sale dates +
  **prices where present**. Writes the `parcels` table. This roll pass already delivers 3 of the
  15 seller-signals for free everywhere (tenure, 65+ exemption, homestead) — they ARE roll fields.
- **PRODUCT (app session) → the COURTHOUSE / COURT-RECORD SIGNALS:** the ~10 seller-signals that
  are NOT in the appraisal roll — pre-foreclosure (Notice of Trustee's Sale), tax-delinquency,
  evictions (JP courts), mechanic's liens, divorce + probate + partition (district/probate courts),
  and the free single-source ones (WARN layoffs = TWC, permits + code-violations = city portals).
  App session does the mining here AND the app surfacing. Writes a NEW **`parcel_signals`** table
  (app-session owns this DDL + its bulk-DDL discipline), never the `parcels` table.
- **No-collision rule:** Miner writes `parcels`; app session writes `parcel_signals`. Different
  tables → no ACCESS-EXCLUSIVE contention (the incident vector). Neither writes the other's table.
  Court-record data joins to parcels by owner-name + situs/mailing address (parcels stays read-only
  to the app session's signal loads).
- MLS-gated signals (expired/FSBO listings) stay parked on Frederick's legal/partnership decision.

**The interfaces (the only cross-lane touchpoints):**
1. **App-lane handoff (miner → product):** one line per county — FIPS | TP office | pid column |
   sample pid → expected beds/baths, verified in a healthy window (TP backends are per-office and
   flaky independently — 2-window rule before any verdict). Product wires it, deploys,
   live-verifies the sample, replies "live."
2. **Crosswalk loop (miner ↔ product):** miner logs unmapped improvement labels → product extends
   the crosswalk → miner re-runs the tag pass. Raw labels are never modified.
3. **Sessions message each other DIRECTLY** (ccd session messaging — proven). Frederick is NOT a
   relay; he gets only money/business decisions, on-device build testing, and summaries.

**Holdout policy (Frederick, 2026-07-15): NO PAID records requests.** $0-fee PIA emails are fine;
paid ones are off the table. Remaining holdout counties are PARKED until `parcel_viewed` felt-gap
events (~Jul-28 checkpoint) prove users actually hit those blanks. The $0.003/record vendor stays
DECLINED per the standing legal-risk position (unlicensed-scraping signal; on the attorney packet)
— revisit only after attorney clearance; the fill-on-blank+cache architecture is the pre-agreed
plug-in point if ever cleared.

**The signals tier:** the 15 "likely to sell" seller-signals (probate, divorce, foreclosure,
exemption tells, neighbor-sold-high, WARN layoffs…) live in **`SIGNALS_ROADMAP.md`** — Frederick's
consolidated list (2026-07-15) with per-signal source/lane/status, the hard outreach-ethics rule,
and the execution order. Read it before any signals work; keep per-signal status THERE.

**The direct-mail revenue feature:** `MAIL_STRATEGY.md` (2026-07-16) — turn Reverse Prospecting's
output into money via addressed mail (Phase 1) + the EDDM saturation route-overlay moat (Phase 2,
24.7¢/piece, no list) that undercuts competitors ~40%. HARD-GATED on Stripe going live. Product-lane.

**The deliverable both lanes serve — the 16 canonical filter tags** (spec: IMPROVEMENT_TAXONOMY.md,
machine truth: data/improvement_crosswalk.json): `pool`, `spa`, `casita` (guest house/ADU),
`shed_workshop`, `boat_dock`, `barn_stable`, `rv` (parking), `garage`, `carport`, `solar`,
`basement`, `fireplace`, `sport_court`, `waterfront` (derived; boat_dock implies it),
`corner_lot` (derived), `single_story` (derived from stories). Plus the base facts every county
load must attempt: bedrooms, baths_full, baths_half, living_area_sqft, year_built, stories,
lot_size_sqft, assessed values, sale date/price. Miner captures raw labels VERBATIM into
`parcels.improvements` on every load + materializes `parcels.improvement_tags`; product turns the
tags into the filter UI. Neither lane blocks the other beyond these interfaces.

---

## 4. COUNTY DATA MINING (the active campaign)

**Statewide as of 2026-07-14: 6,512,561 parcels with sqft · 466,792 verified pools ·
1,842,774 with beds · 29 counties enriched · $0 spent.** Scoreboard in `CURRENT_STATE.md`.

**The doctrine (Frederick's, after Guadalupe):** the roll is almost always published free
somewhere; hunt HARD before declaring a records request: CAD site pages
(/certified-appraisal-roll/, /data-downloads/, /appraisal-data-exports/, /reports/,
/public-information/, /open-records/), WordPress upload dirs (search "site wp-content uploads
roll zip"), {county}.prodigycad.com portals, ArcGIS hub DCAT feeds
(/api/feed/dcat-us/1.1.json), Socrata catalogs (api.us.socrata.com/api/catalog/v1), county
GIS REST layers (building fields count!). Verify with HEAD + zip-tail range peeks.

**Loader toolkit (`data/`):** `load_pacs_impdetail_attributes.py` (generic PACS fixed-width
roll — the workhorse; dwelling matcher = desc regex `MAIN AREA|MAIN FLOOR|FLOOR RESID|
MANUFACTURED HOUSE` + cds MA/MH, floors summed) · `load_prodigy_json_attributes.py` (True
Prodigy protaxExport JSON line-scan; --normalize-float for float-artifact ids) ·
`load_prodigy_csv_attributes.py` (nightly_appraisals CSV) · Socrata pagers (collin,
williamson) · GIS REST pager (bexar) · one-offs (dallas, harris, tarrant, hays, brazoria,
elpaso, fortbend). All are idempotent COALESCE-fills; rerunnable for refreshes.

**READY-TO-LOAD QUEUE: ✅ CLEARED 2026-07-14** — Johnson, Bell, Rockwall, Potter, Randall,
Midland, Ector, Lubbock, Smith all loaded (rolls kept in `data/downloads/rolls/`); Grayson +
Kaufman vocab fixed and loaded. **Webb**: portal publishes only a PDF roll — but the True
Prodigy API flow is CRACKED and reusable for any prodigycad county:
`POST https://prod-container.trueprodigyapi.com/trueprodigy/cadpublic/auth/token {"office":X}`
→ `resp.user.token` → RAW token (no "Bearer") as the Authorization header → list files via
`GET https://prod-container.trueprodigyapi.com/public/reportcategory/{Category}/search`
(bare-host `/public/...` paths, NOT under /trueprodigy/cadpublic) → download via
`GET .../public/filedownload/{urlencoded reportS3ID}`. **McLennan**: portal 204s on every
category. Both → records request.

**PARTIALS — Fort Bend + El Paso FIXED 2026-07-14** (both were wrong-join-key, not missing
data): Fort Bend now 310,752 sqft (live CamaSummary FeatureServer paged, join apn==PropertyNu
— `services2.arcgis.com/D4saGHECICkCeoJm/.../CamaSummary_/FeatureServer/0`); El Paso now
260,171 sqft + 19,228 pools (EPCAD ABE Properties+Improvements dumps from
`propertysearch.blob.core.windows.net/abepublicfiles/`, chain Improvements.Property_dbId →
Properties.**PropertyId (col1)** → GeoID == apn; the schema calls col0 "dbId" but the FK is
col1). Both loaders re-run idempotently. Remaining partials/legend items:
- **Travis pools**: detail-type code legend requested from TCAD (Frederick PIA); the 30GB JSON
  is re-downloadable; pools decode once the legend arrives.

**RECORDS-REQUEST-ONLY counties (hunters exhausted all six source types):** Comal (PIA already
with Frederick — comalad@co.comal.tx.us), Medina, Kendall, Atascosa, Parker
(parkercad@parkercad.org), Ellis, Hidalgo (full roll; their shapefile+DBF is a weak fallback),
**Webb** (PDF-only portal), **McLennan** (empty portal).
Template = the BCAD letter in chat/PROGRESS (swap county name; from info@tapowner.com).

**PENDING ARRIVALS (watch for):**
- **BCAD/Bexar** improvement export (Frederick's PIA sent 2026-07-14; statutory ≤10 business
  days ⇒ by ~2026-07-28): delivers **beds/baths/pool/casita for 709K Bexar parcels** — his
  home county; verify on 2807 Stokely Hl (should show ~5bd/4ba/pool per Frederick).
- **Guadalupe 2026 certified** posts free ~2026-07-22 at guadalupead.org/certified-appraisal-roll/
  (their email said so) — rerun the PACS loader for a refresh.
- **Tarrant PIA** — **no longer needed for beds/baths** (SOLVED via True Prodigy fill-on-blank
  2026-07-15, see the block below); only send it if we later want fields TP doesn't expose.
  **Travis legend** (draft handed to Frederick 2026-07-14 — check if sent).
- **Casita field**: DCAD RES_ADDL "ATTACHED QUARTERS" + BCAD equivalent → design ONE schema
  column when BCAD lands (Frederick cares about casitas).

**TRUE PRODIGY FILL-ON-BLANK — LIVE for Tarrant + Ellis; the other TP metros are NOT app-lane.**
For counties whose beds/baths live only behind TP's per-property API, the app fetches + caches them
on first view of a null-beds parcel (`api/src/cadattr/`, deployed 2026-07-15). Fire-and-forget,
COALESCE-only, 6h miss-cooldown, never re-charges the CAD. **Verified live via the deployed
endpoint:** Tarrant `250-3-14` → 3bd/2ba, Ellis `300915` → 4bd/3ba. Each county names its pid
column via `FILL_SOURCES.pidField` in `api/src/cadattr/index.ts`.
- **Tarrant (48439, office Tarrant):** pid = **`apn`** (= TAD `Account_Num`; source_property_id is a
  hyphenated geoID that TP's geoID backend won't resolve — geoID search 500s, only numeric pid works).
  Backfilled apn for 656,287 parcels (join `GIS_Link == source_property_id`). Crosswalk:
  `GIS_Link 250-3-14 → Account_Num 16497 → pid 16497 → 3bd/2ba`. **DURABILITY (data session):** the
  one-off apn backfill is now folded into `load_tarrant_attributes.py` (data session confirmed), so a
  Tarrant reload keeps it.
- **Ellis (48139, office Ellis):** pid = **`source_property_id`** (already numeric) — no backfill.
- **Parser handles 3 count shapes** (`roomCount`): digit (`Rooms: Bedrooms 3` — Tarrant), spelled
  word (`Number of Bedrooms: FOUR BEDROOM`, `Plumbing: THREE BATH` — Ellis), and fraction
  (`Plumbing: TWO 1/2 BATH` = 2.5). It **rejects code-values** — Ellis carries junk rows
  (`Number of Bedrooms: 91`, `Plumbing: 40`) that are NOT counts — via a ≤20 plausibility cap.
  Add a new TP county by dropping its `FIPS → {office, pidField}` into `FILL_SOURCES` — but **verify
  its API actually exposes beds first** (below).
- **The other 5 flagged "app-lane" counties are NOT app-session (probed live 2026-07-15):**
  **Travis** = API exposes baths only (`251`), no bedrooms (`252`); the bulk file that had 252 is
  gone → PIA. **Denton, Montgomery** = API returns empty features → their PACS bulk carries beds
  (data-session lane). **McLennan** = our parcel IDs return 204 in TP (don't resolve) → needs a bulk
  source (data-session). **Johnson** = no TP portal → PACS `.tab` bulk (data-session). Suggested
  `texas_county_system_map.md` edits: Ellis → app-lane (DONE); McLennan → needs bulk (not app-lane).

---

## 5. DECISION LOG (the WHY behind things — don't relitigate silently)

- **Big-metro beds/baths are FREE — the CADs have them; we were reading the wrong door** (2026-07-14,
  deep multi-agent crawl). Bexar/Travis/Tarrant all previously read "no beds," but the data existed:
  Bexar in a regional ArcGIS republication (SARA `BCAD_Parcels_PROD`, 99% coverage), Travis in coded
  `improvement_detail` rows (type 252/251), Tarrant in TAD's live **True Prodigy** API
  (`Rooms: Bedrooms/Bathrooms`; auth needs the **RAW token, NOT `Bearer`**). **No vendor purchase
  needed for the metros.** The reusable hunt method + per-software recipes + verified-county table
  live in **`DATA_HUNTING_PLAYBOOK.md`** — READ IT before declaring any county "no data" or paying a
  vendor. Next step is a full-Texas, system-by-system re-search + backfill (data-session campaign).

- **Farm export pricing** (Frederick): 10¢/row at launch; evaluator mode = free 300/mo.
  Launch-day open choice: hard flip vs Closer-includes-allowance. Flip = config, no build.
- **Phone-first contact flow** (Frederick): agents call first; emails secondary. ≤15 emails
  one-by-one, else CSV mail-merge. NEVER send email from our servers / never BCC blasts
  (deliverability + CAN-SPAM + Resend ToS — this is a hard line).
- **"May have a buyer" language** (Frederick): farm letters must stay honest at scale; no
  extra UI asking about real buyers.
- **Property-data API: DECLINED for now** (2026-07-14, full analysis in PROGRESS): metro gaps
  had free fixes in flight; vendors resell the same assessor data; $0.003 "Zillow-sourced"
  pricing signals unlicensed scraping = legal risk for a registering data broker; freshness
  immaterial for structural fields. **`parcel_viewed` events instrument the felt gap** —
  around 2026-07-28+, query events for has_beds/has_pool_known rates by county and revisit
  with REAL usage data (the hybrid fill-on-blank + cache-forever architecture is pre-agreed
  IF a licensed vendor is ever needed).
- **Billing link in-app** (Frederick override of build-doc no-link default; legal post-2025
  US ruling): config-driven `manage_plan_url` — set to "" to revert instantly if App Review
  objects.
- **Read-only CRM rule**: reading your own saved data = free forever; anything costing money
  or sending outward needs an active plan. Beta cap raised to 300 by Frederick ("evaluator
  mode").
- **Trace economics** (§7 discipline): included-first atomic consume; $25 metered cap;
  no-match never charged; re-view forever free; protected/placeholder owners never traced.
- **BatchData reseller status** (2026-07-14): NO signed reseller/redistribution addendum. AE
  Sean Murray emailed a stopgap — BatchData "will not sue… regarding your reselling… in
  volumes less than 40k records per month… stay in contract," standing "until otherwise
  notified that you are able to buy at 7c and resell as needed." This is a revocable "won't
  sue" forbearance on the existing internal-use self-serve contract, NOT a granted resell
  right; it is from an AE (may not bind BatchData), and they explicitly declined formal terms
  "at this stage." Do NOT treat gate item 1 as closed. Route to attorney (gate item 5); watch
  the 40k/mo ceiling as the trigger to negotiate the 7¢ wholesale-resell tier. Bears on farm
  CSV bulk export (vendor side covered ≤40k/mo; TCPA side still open). Packet for the attorney:
  `legal/attorney-review-packet.html`.
- **Contact-button "Free" + farm two-button + CRM detail** (Frederick eval, 2026-07-14, build
  #14): (a) already-paid contacts must read green "Free," not "$0.29" (confusion that you'd be
  charged again); the `already_unlocked` flag on /parcels/at is cosmetic — the trace route still
  gates charging. (b) Farm's standalone Unlock button vs Actions button showed mismatched counts
  (contacts vs homes) — collapsed to one blue Actions button; unlocking now lives inside the
  sheet as the lone red row. (c) CRM only *displayed* name+address though it always *stored* the
  paid contacts (they were in the CSV export all along) — the detail endpoint/screen now surface
  phones/emails + house facts. REJECTED "force save-to-contacts first": the CRM builds from
  server data, never from the phone's address book (a privacy promise on the site).

---

## 6. FREDERICK'S OPEN ITEMS (business side — remind, don't nag; reminder task runs 2-daily)

1. **LLC → EIN → business bank → Stripe LIVE** (blocks all real revenue).
2. **Legal gate before public launch:** attorney ToS/privacy review, TX Data Broker
   registration, E&O insurance, BatchData reseller terms (🟡 2026-07-14: only an AE "won't
   sue ≤40k records/mo" email — see Decision Log; attorney must judge if it's launch-
   sufficient or needs binding confirmation). Attorney-review packet ready:
   `legal/attorney-review-packet.html`.
3. PIAs optional to send: Medina/Kendall/Atascosa/Parker/Ellis (template ready).
4. Test build #10/#11 and keep feeding evaluation notes (his notes have driven the best
   improvements — the man finds real UX truth).

## 7. NEXT-SESSION PRIORITY ORDER (unless Frederick redirects)

1. **Confirm build #13 landed in TestFlight** and gather Frederick's next farm-flow notes
   (he's iterating fast on this screen; his UX instincts are driving it — keep shipping small).
2. **Watch for BCAD** (transforms his home county) + Guadalupe July-22 refresh + Tarrant
   PIA + Travis pool-code legend.
3. **~Jul 28+:** pull `parcel_viewed` gap stats; revisit buy-vs-build with data.
4. Backlog nice-to-haves: F-hygiene (style dedup, `charged_via='cache'` never recorded,
   is_absentee city-only caveat), casita schema design, records-request follow-ups
   (Comal/Medina/Kendall/Atascosa/Parker/Ellis/Hidalgo/Webb/McLennan).
   ✅ DONE 2026-07-14: build #12 shipped; Fort Bend + El Paso partials repaired.

*Written by Claude Fable 5 at Frederick's request: "guarantee that we can keep going with the
same type of quality." The quality bar is: verify live, quantify honestly, ship small, let
Frederick's instincts drive product and prove everything with data.*
