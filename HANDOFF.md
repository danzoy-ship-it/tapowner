# TapOwner — SESSION HANDOFF (read this before touching anything)

**Written:** 2026-07-15, end of the marathon session that took the app from "hangs on launch"
to feature-complete beta with a 20-county data moat. **Purpose:** zero loss of focus, vision,
or operational knowledge between sessions.

**Read in this order:** `TAPOWNER_BUILD.md` (the constitution — it wins all conflicts) →
`CURRENT_STATE.md` (ground truth snapshot) → this file (how to operate) → `PROGRESS.md`
(skim the newest entries for recent nuance).

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

- **On Frederick's phone:** build **1.0.0 (11)** (farm actions redesign) — shipped AND
  confirmed on-device 2026-07-14; his same-morning evaluation produced the v2 below.
- **Committed but NOT YET SHIPPED (= build #12 queue):** farm flow **v2** (Frederick's
  2026-07-14 note — partial counts like "phones for 9" read as "only 9 of 13 reachable"):
  while any home is locked the action sheet leads with `🔓 Unlock contacts for all N · up to
  $X` (+ free CSV export only); once fully worked, actions say "all 13"; session-scoped
  no-match tracking ("no verified contact — you were not charged") so unlock-all can't loop;
  "Draft letter only" removed — `FarmDraftScreen` has an Email/Letter outreach toggle beside
  template+tone. No server changes needed.
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
  `WEB_BASE_URL=https://tapowner.com` on the api service.
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
- E2E auth tests: mint a JWT with `JWT_SECRET` from railway vars,
  payload `{userId, email}` (user **5** has an agent profile + real sub; user **18** = demo).
- NEVER print secrets; env vars only; delete `_tmp_*.mjs` scripts after use.

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
1. `npx tsc --noEmit` clean in api/ AND mobile/ (strict; exactOptionalPropertyTypes bites).
2. Deploy → curl the live endpoint with real cases (grace/401/200 triads for auth work).
3. For data loads: **dry-run join-rate first, and sample RANDOMLY across the whole file — the
   head of a file lied twice** (Fort Bend 92.7%→32%, El Paso 74.7%→5%).
4. Loads are COALESCE-fill-only → partial/wrong-key loads never corrupt, only under-fill.
5. Mobile features: no PASSED until Frederick confirms on-device (covenant #2).

---

## 4. COUNTY DATA MINING (the active campaign)

**Statewide as of 2026-07-14: 6,048,991 parcels with sqft · 448,512 verified pools ·
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

**PARTIALS TO FIX:**
- **Fort Bend** (48157): 93,774/291K — FBCAD CamaSummary `UID` overlaps only ⅓ of StratMap
  Prop_IDs. Try XReference/PropertyNu ↔ parcels.apn, or hunt a PACS export on their site.
- **El Paso** (48141): 26,978/548K — EPCAD dump pids ≠ StratMap ids mostly. Their
  REAL_ESTATE.zip (documented tilde export, layout 8.0.34 on epcad.org/OpenGovernment) should
  carry geo_id for a better key.
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
- **Tarrant PIA + Travis legend** (drafts handed to Frederick 2026-07-14 — check if sent).
- **Casita field**: DCAD RES_ADDL "ATTACHED QUARTERS" + BCAD equivalent → design ONE schema
  column when BCAD lands (Frederick cares about casitas).

---

## 5. DECISION LOG (the WHY behind things — don't relitigate silently)

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

---

## 6. FREDERICK'S OPEN ITEMS (business side — remind, don't nag; reminder task runs 2-daily)

1. **LLC → EIN → business bank → Stripe LIVE** (blocks all real revenue).
2. **Legal gate before public launch:** attorney ToS/privacy review, TX Data Broker
   registration, E&O insurance, BatchData reseller addendum.
3. PIAs optional to send: Medina/Kendall/Atascosa/Parker/Ellis (template ready).
4. Test build #10/#11 and keep feeding evaluation notes (his notes have driven the best
   improvements — the man finds real UX truth).

## 7. NEXT-SESSION PRIORITY ORDER (unless Frederick redirects)

1. **Ship build #12** when Frederick blesses it (farm flow v2 — unlock-all-first sheet,
   Email/Letter toggle in FarmDraftScreen; committed 2026-07-14, no server changes).
2. **Fort Bend/El Paso key remaps** (the two big partials: 291K and 548K parcel counties).
3. **Watch for BCAD** (transforms his home county) + Guadalupe July-22 refresh + Tarrant
   PIA + Travis pool-code legend.
4. **~Jul 28+:** pull `parcel_viewed` gap stats; revisit buy-vs-build with data.
5. Backlog nice-to-haves: F-hygiene (style dedup, `charged_via='cache'` never recorded,
   is_absentee city-only caveat), casita schema design, records-request follow-ups
   (Comal/Medina/Kendall/Atascosa/Parker/Ellis/Hidalgo/Webb/McLennan).

*Written by Claude Fable 5 at Frederick's request: "guarantee that we can keep going with the
same type of quality." The quality bar is: verify live, quantify honestly, ship small, let
Frederick's instincts drive product and prove everything with data.*
