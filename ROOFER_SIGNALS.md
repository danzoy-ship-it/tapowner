# ROOFER_SIGNALS.md — TapOwner Vertical #2 (Roofers): the canonical handoff

**This is the "come-to-Jesus" doc for V2 — the airtight WHAT + WHY a zero-memory session can fully
rebuild the roofer vertical from.** It is to V2 what `TAPOWNER_APP_BIBLE.md` is to V1: the single
ENGINEERING + STATE entry point. It was hardened on **2026-07-17** by re-deriving every claim from the
LIVE code and the LIVE DB (read-only proxy) — not from prior doc claims. Where a number came from
another session's analysis and was NOT re-checked here, it is flagged `[sourced, not re-verified]`.

> **Read order for any V2 / roofer work:** this doc first (engineering + current state) → then
> `TAPROOFERS_SIGNALS.md` (the 21-signal product CATALOG: which signals exist, their pitch, build-tier)
> → then `VERTICALS_STRATEGY.md` (the shared-engine strategy + sequencing). This doc is the truth about
> what is BUILT and what the code actually does; the other two are catalog and strategy. If they
> disagree with this doc on a *built* fact, this doc + the live code win. **Then read the actual file
> before you edit it** — same "read before you act" discipline that keeps handoffs from failing.

> **Doc roles (no drift):**
> - `ROOFER_SIGNALS.md` (this) = engineering state, API shapes, live counts, invariants, where-to-start.
> - `TAPROOFERS_SIGNALS.md` = the 21-signal catalog + insurance-family facts (for the attorney) + the
>   FSBO/#19 buy-not-build note + the roof-age data strategy. Product/planning.
> - `VERTICALS_STRATEGY.md` = why one shared engine, what's shared vs per-vertical, anti-conflict rules.
> - `JOBNIMBUS_INTEGRATION.md` = the CRM-export spec (reference impl built, not wired).

---

## 0. TL;DR for a fresh session (read this, then §3)

- **V2 is a year-round, multi-signal roofing-lead engine**, NOT a seasonal hail map. The moat is a
  PORTFOLIO of always-on signals (Frederick's core insight, 2026-07-16).
- **The V2 BACKEND is BUILT, tested, deployed-capable, and DARK by default.** A pure resolver core +
  DB resolver + two API endpoints (`/roofer/signals/at`, `/roofer/signals/within`), gated behind a
  `ROOFER_ENABLED` flag that defaults OFF so V1 users can never hit it. Unit tests + a dedicated smoke
  test are green.
- **The roofer APP (UI) is NOT built.** That is the next phase and it needs Frederick (his on-device
  UX direction drives app design). See §10.
- **Roof age is a deliberate pluggable STUB** that returns `unknown` today — one function
  (`resolveRoofAge`) is the single wiring point, waiting on a pay-per-call vendor go/no-go and the free
  `year_built` floor (EARS PIA, ~2026-07-31).
- **Pricing/tiers are null on purpose** — the founder's business call, never inferred in code.
- **INVARIANT:** additive only; never modify V1; V1 `npm run smoke` MUST be green before AND after any
  V2 change (the tripwire). See §7 and §8.

---

## 1. What V2 is + the thesis

**TapOwner vertical #2 sells roofers a reason to knock on a specific door, year-round.** Same engine as
the realtor app (V1): the shared property/owner dataset, the contact-trace cache, billing, referrals,
AI drafting, and the `products` config. The ONLY things that make it a *roofer* app are (a) a `roofer`
`products` config row, (b) its lead-trigger signals, and (c) its templates/branding. The engine is not
forked. (`VERTICALS_STRATEGY.md` is the full argument.)

**The thesis (Frederick, 2026-07-16 — bake this in):** storms are seasonal and reactive. Every roofer
competitor chases the same hail maps 3 months a year. TapOwner's edge is a **multi-signal portfolio**
that produces leads in the 9 non-storm months too — roof age / insurance-cliff, permits (solar-tell,
claim-window, fresh-reroof clustering), code violations, probate, pre-foreclosure. **Hail is the
flagship, not the whole product.**

**Shared-engine architecture.** Every vertical's lead triggers live in ONE table, `parcel_signals`,
keyed by `signal_type` and spatially/ID-joined to `parcels`. A roofer signal is just a `signal_type`
value (or a query over permits/hail_swaths) resolved through the same spatial-join machinery built for
foreclosures. V2 reads `parcels`, `parcel_signals`, `permits`, and `hail_swaths`; it writes nothing at
request time except append-only `events` analytics.

---

## 2. Architecture — the V2 code stack (all verified 2026-07-17)

V2 mirrors V1's "pure core + DB layer + thin route" shape exactly (the same split as
`lib/ownerSignals.ts` on the realtor side), so the derivation logic stays unit-testable with zero DB.

| Layer | File | Role |
|---|---|---|
| **Pure resolver core** | `api/src/lib/rooferSignals.ts` | Given raw rows already fetched, composes the roofer signal bundle for one parcel. **No DB access** — fully unit-tested. Owns the roof-age pluggable slot. |
| **DB resolver** | `api/src/lib/rooferResolver.ts` | Fetches the raw rows (parcel_signals, permits, hail_swaths) and feeds the pure core. Three entry points: by id, by lat/lon, by area. Index-disciplined (never full-scans 14M parcels). |
| **Product config** | `api/src/lib/rooferConfig.ts` | FLAGGED, DISABLED placeholder. `enabled` off by default; `pricing`/`tiers` null; `hail_swath_min_in` default 1.0. 60s cache. |
| **Routes** | `api/src/routes/roofer.ts` | `GET /roofer/signals/at`, `POST /roofer/signals/within`. Both 404 unless enabled; both `requireAuth`. No billing/entitlement here on purpose. |
| **Registration** | `api/src/index.ts` (line ~62) | `await app.register(rooferRoutes);` registered LAST, additive, with a comment noting it's dark by default. |
| **Smoke** | `api/scripts/smoke_roofer.mjs` | `npm run smoke:roofer`. Proves dark-by-default + the full engine against the real DB. |
| **CRM export (NOT wired)** | `api/src/integrations/jobnimbus.ts` | Reference impl for pushing a lead to JobNimbus. Built ahead of the app; no route, no key storage. |
| **Unit tests** | `api/src/lib/rooferSignals.test.ts`, `api/src/integrations/jobnimbus.test.ts` | Run via `npm test` in `api/`. |

**Data model touchpoints (live schema, key columns):**
- **`parcels`** (14,336,257 rows) — owned by the Miner. V2 reads: `id, county_fips, situs_address,
  owner_name, roof_material, year_built, effective_year_built, geom, is_protected`. `year_built` /
  `effective_year_built` are carried for the FUTURE roof-age slot; **the resolver does NOT derive age
  from them yet** (see §4).
- **`parcel_signals`** — owned by the app lane. Columns used: `parcel_id` (nullable), `county_fips`,
  `signal_type`, `subtype`, `source`, `event_date`, `meta` (jsonb; V2 reads
  `meta->>'hail_size_in'`, `meta->>'wind_speed_kt'`, `meta->>'status'`). Gov-owner guard is applied at
  WRITE time by the loaders, not read time (§8).
- **`permits`** — owned by the Miner. V2 reads `parcel_id, permit_category, issued_date` (aggregated
  `max(issued_date)` per category, filtered to `roof`/`solar`).
- **`hail_swaths`** — MRMS radar hail polygons: `event_date, min_hail_in, source, geom` (MultiPolygon
  4326), GIST-indexed (`ix_hail_swaths_geom`). Small table (~4.5 MB), disk-lean by design.

---

## 3. What's BUILT (verified) — signals, sources, live counts, API shapes

### 3.1 The two API endpoints (exact shapes, from `routes/roofer.ts` + `rooferResolver.ts`)

Both routes require a V1 session (`requireAuth`, reuses V1 auth — no new auth). Both return HTTP 404
`{"error":"Not found"}` when the roofer product is disabled (the default). No pricing/entitlement gate.

**`GET /roofer/signals/at?lat=<>&lng=<>`  OR  `?parcel_id=<>`**
Resolves ONE parcel (by point-in-polygon, smallest-area-first tie-break identical to V1 `/parcels/at`,
or by id) and returns its full signal bundle:

```jsonc
{
  "parcel": {
    "id": 12345, "county_fips": "48029", "situs_address": "…", "owner_name": "…",
    "roof_material": "composition" | null,
    "year_built": 2004 | null, "effective_year_built": null,   // carried, NOT used for age yet
    "lat": 29.4, "lon": -98.5
  },
  "signals": {
    "hail":  { "hit": true, "max_hail_in": 1.75, "last_event_date": "2024-05-28",
               "event_count": 2, "sources": ["spc","mrms_swath"], "repeat_hit": true },
    "wind":  { "hit": false, "max_wind_kt": null, "last_event_date": null, "event_count": 0 },
    "roof_age": { "age_years": null, "base_year": null, "source": "unknown",
                  "confidence": null, "acv_cliff": null, "non_renewal_risk": null },  // §4
    "permits": {
      "last_roof_permit_date": "2019-03-01" | null,
      "last_solar_permit_date": null,
      "solar_recent": false,                                   // #14: solar permit ≤24mo
      "claim_window": { "open": true, "hail_event_date": "2024-05-28", "months_since": 13 }  // #4
    },
    "roof_material": { "value": "composition", "market": "reroof" },  // reroof | long_life | null
    "distress": {
      "code_violation":  [ { "signal_type":"code_violation","subtype":"…","source":"austin_code",
                             "event_date":"…","status":"O" } ],
      "pre_foreclosure": [ … ],   // recency-gated: only notices with event_date >= today
      "probate":         [ … ]
    },
    "signal_types": ["hail","hail_repeat","claim_window","reroof_material","code_violation"]
  }
}
```

`signal_types` is the flat badge/filter vocabulary. The full set the composer can emit:
`hail`, `hail_repeat`, `wind`, `claim_window`, `solar_intent`, `roof_permit`, `reroof_material`,
`code_violation`, `pre_foreclosure`, `probate`.

**`POST /roofer/signals/within`** — body `{ "polygon": [[lng,lat],…], "signal_types"?: string[] }`.
Returns every parcel inside the drawn polygon with its bundle, optionally filtered to leads firing at
least one requested `signal_type`:

```jsonc
{ "count": 137, "capped": false, "leads": [ { "parcel": {…}, "signals": {…} }, … ] }
```

Area caps mirror V1 farm mode so a roofer query can never scan a county: **≤500 parcels, ≤25 km²,
3–50 polygon vertices.** The area query also enforces `is_protected = false AND owner_name IS NOT NULL`
(protected-record + placeholder-owner guards, same as V1). Events `roofer_signals_at` /
`roofer_within` are logged (append-only analytics).

### 3.2 Each signal — data SOURCE, derivation, and LIVE count (DB proxy, 2026-07-17)

**`parcel_signals` totals: 6,448,477 rows** across 4 signal types. Everything below is live-verified.

| Signal | `signal_type` / source | Derivation (in `rooferSignals.ts`) | LIVE count (2026-07-17) |
|---|---|---|---|
| **Hail (#1, flagship)** | `roof_damage`/`hail_spc` (point-buffer) **UNION** `hail_swaths` (MRMS radar) | `deriveHail`: a parcel is hit if EITHER source fires; max size + most-recent date + distinct-date count fall out of the union. | SPC rows **3,394,527**; MRMS swaths **557 rows / 148 dates** (2024-05-28→2026-07-12), production band ≥1.0in = **146 date-swaths** |
| **Repeat-hit (#3)** | derived from the hail union | `repeat_hit = (distinct hail dates ≥ 2)` → `hail_repeat` badge | (query-time; ≥2 distinct storm dates on a parcel) |
| **Wind (#2)** | `roof_damage`/`wind_spc` (subtype `wind`) | `deriveWind`: max gust kt + most-recent date. | **3,038,919** rows |
| **Permit — last roof-permit date** | `permits` where `permit_category='roof'` | `max(issued_date)` → surfaced (NOT turned into an age) | roof permits **111,426** (106,002 tied) |
| **Permit — solar-tell (#14)** | `permits` where `permit_category='solar'` | `solar_recent = latest solar permit ≤ 24 months` → `solar_intent` | solar permits **69,181** (65,671 tied) |
| **Permit — claim-window (#4)** ⭐ | hail union × roof permits | `claim_window.open` = a hail event **6–20 months** old with **NO** roof permit filed since it → `claim_window` | query-time (per-parcel) |
| **roof_material enrichment** | `parcels.roof_material` | `classifyRoofMaterial`: composition/wood/asphalt/shingle/built-up → `reroof`; metal/tile/slate/clay/concrete → `long_life` (deprioritise). `reroof` → `reroof_material` badge | roof_material present on **860,228** parcels (6.0%) |
| **code_violation (#21)** | `parcel_signals`/`code_violation` | surfaced as-is to the ROOFER (distress bucket) | **9,161** across **5 cities**: Austin 5,441 · San Antonio 2,259 · Fort Worth 1,172 · Plano 261 · Arlington 28 |
| **pre_foreclosure** | `parcel_signals`/`pre_foreclosure` | surfaced, **recency-gated**: only notices with `event_date >= today` (V1 invariant) | **4,820** across **151 county sources** |
| **probate** | `parcel_signals`/`probate` | surfaced (distress bucket) | **1,050** across 4 sources: Harris 623 · Bexar 425 · Collin 1 · Tarrant 1 |

**Why hail is a UNION, not a replace (important — do not "simplify" it):** MRMS radar swaths cover more
area than SPC's sparse buffered point reports on a big storm day, BUT MRMS ties **fewer** parcels than
SPC on ~38% of sampled dates at ≥1.0in `[sourced from the 2026-07-16 MRMS sampling, not re-derived
here]`. A straight replace would LOSE coverage on those days. So the resolver keeps `hail_spc` (all
3.39M rows intact) AND intersects `hail_swaths`, and unions the two at query time. This is the design
the earlier feasibility log recommended — **it is now BUILT** (in `rooferResolver.ts` +
`deriveHail`), not deferred.

**How hail vs wind are stored (a gotcha):** both live under `signal_type='roof_damage'`. Wind is
`source='wind_spc'` (subtype `wind`); hail is `source='hail_spc'` (subtype NULL). `bucketRows()` in
`rooferResolver.ts` splits them. MRMS hail is separate — it lives in `hail_swaths`, not
`parcel_signals`.

### 3.3 Config — dark by default, pricing null

`rooferConfig.ts`: `enabled = (process.env.ROOFER_ENABLED === "true") || products.config.roofer.enabled
=== true`. Both default off → the routes 404 → **V1 is untouched**. `pricing` and `tiers` are hard
`null` placeholders (the founder sets them in `products.config.roofer`; never inferred in code).
`hail_swath_min_in` defaults to **1.0** (the production band), tunable via config with no redeploy.

### 3.4 JobNimbus CRM export — BUILT, unit-tested, NOT wired

`api/src/integrations/jobnimbus.ts` + `JOBNIMBUS_INTEGRATION.md` (full spec). `mapLeadToContact()`
(pure) maps a TapOwner lead → a JobNimbus `/contacts` payload; `pushLeadToJobNimbus()` POSTs it with
Bearer auth, 15s timeout, 2 retries (429/5xx/network/timeout only), and typed errors (never throws).
**18 unit tests, all with a stubbed `fetchImpl` — zero real HTTP calls.** It is **NOT wired**: no
route registers it, no per-account key storage exists, and there is no live JobNimbus account/key. The
day the roofer app is built, wire it behind e.g. `POST /leads/:id/export/jobnimbus` per the spec.
**Ethics guard baked in:** it reads the `signalType` CODE to pick a generic bucket label (e.g.
`code_violation` → "Property-condition flag") and **structurally never reads** the raw `signalLabel`
— a unit test asserts this. Same "signal never surfaces in outreach" rule as §8.

### 3.5 Tests + smoke (the proof it works)

- **`npm test`** (in `api/`) runs `rooferSignals.test.ts` (hail union, repeat-hit, claim-window, solar
  recency, roof_material classification, distress recency-gate, roof-age-stays-unknown invariant, full
  compose) + `jobnimbus.test.ts` (mapping + ethics guard + retry/timeout, all mocked).
- **`npm run smoke:roofer`** boots the current `src` via `tsx` on scratch ports (3097 off / 3098 on)
  against the real Postgres proxy, with vendor/mail env stripped. It proves: (1) **dark by default** —
  flag off → `/roofer/*` 404s AND V1 `/parcels/at` still 200s (additive + inert); (2) **enabled** —
  anonymous 401, a known hail parcel resolves (`hail.hit=true`, size+date), `roof_age.source==="unknown"`
  is asserted (the vendor-pending invariant), a code-violation parcel surfaces its distress signal, and
  `/roofer/signals/within` returns leads + honors the `signal_types` filter.

---

## 4. The roof-age PLUGGABLE STUB — the single wiring point

Roof age is the one signal the code deliberately leaves unresolved. `resolveRoofAge()` in
`rooferSignals.ts` **returns `UNKNOWN_ROOF_AGE` today** (verified live: the smoke test asserts
`roof_age.source === "unknown"`). Everything downstream already consumes the typed `RoofAge` shape, so
when a source is chosen it drops into this ONE function with zero rework elsewhere.

**The locked type (do not change the shape, only fill the function):**
```ts
type RoofAgeSource = "permit" | "vendor_api" | "year_built_proxy" | "unknown";
interface RoofAge {
  age_years: number | null; base_year: number | null;
  source: RoofAgeSource; confidence: "high"|"medium"|"low"|null;
  acv_cliff: boolean | null;         // ≥15yr — null (not false) while unknown, so the UI can tell
  non_renewal_risk: boolean | null;  // ≥20yr — "we don't know" apart from "no cliff"
}
```

**Tier precedence when wired (best → floor), from the function's own comment:**
1. **permit history** → latest roof-permit issued year, `confidence:"high"`.
2. **vendor_api** → imagery/satellite roof-age lookup (pay-per-call), `confidence:"high"`.
3. **year_built_proxy** → `COALESCE(effective_year_built, year_built)`, `confidence:"low"`, UI label
   "estimated — original roof assumed".
Then `acv_cliff = age >= 15; non_renewal_risk = age >= 20`. **A reroof-permit date ALWAYS overrides
`year_built`** (carriers get sued for that exact error).

> **Correction vs the old catalog:** `TAPROOFERS_SIGNALS.md` describes a 4-tier scheme with
> `imagery_api` and a `user_confirmed` tier. The **actually built** enum is
> `permit | vendor_api | year_built_proxy | unknown` — note `vendor_api` (not `imagery_api`) and that
> `user_confirmed` is **not** in the shipped type (it's a future moat idea in the catalog, not yet a
> code tier). Wire to the built enum; extend it deliberately if/when user-confirmation ships.

**Why unknown, not year_built, today:** roof-age sourcing is pending Frederick's pay-per-call vendor
go/no-go. The code does NOT silently fall back to `year_built` because a wrong "original roof assumed"
age shown as fact is exactly the error to avoid. `effective_year_built` is being backfilled (live: 9.5%
coverage, 1,356,404 parcels) and `year_built` is at 62.3% (8,931,944), but **neither is wired into age
until the decision lands.**

---

## 5. What's DEFERRED / BLOCKED (honest state)

- **Roof age (the pluggable stub).** Blocked on Frederick's **pay-per-call satellite/AI roof-age vendor
  go/no-go** (CAPE Analytics / ZestyAI inquiries out 2026-07-16, awaiting reply — for the ~70 rural
  counties EARS/PIA can't reach). Free floor = `year_built`, which goes statewide when **EARS lands**
  (see below). Decision rule (from `TAPROOFERS_SIGNALS.md`): if any vendor lands < ~$2/lookup with
  redistribution-compatible terms → tier-2 ships in a roofer Pro tier; else ship tiers permit+proxy and
  revisit at scale.
- **The roofer APP (UI).** **NOT built.** Needs Frederick's on-device UX direction (his instincts drive
  app design — §10). This doc + the API are the foundation only.
- **Pricing / tiers / GTM.** The founder's call — null in code until he sets `products.config.roofer`.
- **EARS year_built statewide roll.** Frederick SENT the Comptroller PIA **2026-07-17**, confirmed
  received, ~10 business days (~**2026-07-31**). Field **AJR23**. Loader pre-built + self-verifying:
  `data/load_ears_roll.py` (one command when the CSV lands). This fills the **106 year_built-blind
  counties** `[county count sourced from the Miner's prior analysis, not re-derived here]` FREE → the
  insurance-cliff signals (#5 ACV cliff / #6 non-renewal) go from ~147 counties to statewide. Regrid
  (~$15–30K) is PARKED in favor of this.
- **roof_material CEILING — EARS does NOT carry roof_material.** This is the key limit: `roof_material`
  is capped at the ~20 free-roll counties (**860,228 parcels live**, 6.0%) until per-county CAMA PIAs
  fold a roof-cover line into them. EARS lifts `year_built`, not roof material. So the reroof-vs-
  long-life filter stays metro-weighted for now.
- **FSBO / expired-listing (#19).** A VENDOR BUY, not a build (REDX/Vulcan7/Landvoice-class daily
  feed, integrated `TraceProvider`-style — signed terms + API + address match). One vendor deal feeds
  BOTH roofer and realtor verticals. Not started.
- **Builder-grade inference (#11).** Not scoped (needs plat/builder-name data).

---

## 6. INVARIANTS / rules (bake these in — do NOT quietly break)

1. **Additive only.** V2 must not modify any V1 app source or behavior. The routes are registered last
   and are inert while disabled.
2. **V1 `npm run smoke` MUST be green before AND after any V2 change — the tripwire.** Run it in `api/`
   (it boots the current src against the real DB proxy). If it's red, stop. Also keep `npm run
   smoke:roofer` green.
3. **Dark by default.** `ROOFER_ENABLED` / `products.config.roofer.enabled` default OFF. Never flip
   them on in a way that reaches V1 users without Frederick's say-so.
4. **The ETHICS rule (non-negotiable).** The raw sensitive trigger (probate, pre-foreclosure, code
   violation, insurance cliff) **NEVER surfaces to the homeowner** — outreach stays generic/educational
   ("many Texas carriers now depreciate older roofs"), never the specific trigger. This is enforced
   structurally: the resolver reads signal TYPE codes, not raw labels, and the JobNimbus mapper reads
   `signalType` (code) → generic bucket, never `signalLabel` (raw). Insurance copy is additionally
   gated on attorney review vs Tex. Ins. Code §27.02 (deductible), §542A (claim-notice window), and
   cosmetic-exclusion realities — never hardcode carrier-specific claims or depreciation %s in app copy.
5. **The two-lane split (no cross-writes).** The **Miner** (data session) writes `parcels` + `permits`.
   The **app session** writes `parcel_signals`. Neither writes the other's table — this prevents the
   ACCESS-EXCLUSIVE lock contention that caused live incidents. A new signal goes in `parcel_signals`,
   never as a new `parcels` column.
6. **Gov-owner guard is WRITE-time.** Loaders filter government-owned parcels before inserting to
   `parcel_signals`; the read path trusts every row. Any new loader MUST apply the shared
   `GOV_OWNER` regex or a courthouse/ISD will render as a lead.
7. **Disk discipline.** Railway DB volume is now **50 GB with ~20.8 GB free** `[volume-level figure
   from ops/founder; pg_database_size shows 25 GB logical — the mount's free space is not visible from
   SQL, so not independently re-derived here]`. The DB's **`/dev/shm` is tiny (~67 MB)** (HANDOFF.md,
   found 2026-07-17) → any VACUUM / index maintenance MUST be single-threaded **`VACUUM (PARALLEL 0)`**;
   parallel workers fail with `DiskFull` on `/dev/shm` regardless of volume size. Bulk UPDATEs in
   50–100K batches; `CREATE INDEX CONCURRENTLY` only.

---

## 7. V1 relationship — FROZEN and protected

V1 (the realtor app) is the earning product and is **frozen relative to V2 work**:
- Canonical doc: **`TAPOWNER_APP_BIBLE.md`** (V1's deep brain — every screen, the API surface, the data
  model, invariants, ship rituals).
- Audit tag: **`v1-realtor-audited-2026-07-17`** (verified present in git).
- Tripwire: **`npm run smoke`** (= `scripts/smoke_v1.mjs`) must be green before and after any change.
- **V2 must NOT modify V1 code** and MUST keep V1 smoke green. The whole V2 backend was built additive
  precisely so this holds — the smoke test's Phase 1 exists to prove it (V1 `/parcels/at` still 200s
  with the roofer routes loaded-but-dark).

---

## 8. Coordination — the Miner is a separate persistent session

The **data Miner** is a SEPARATE long-running session:
- Name: **"TAPOWNER SESSION2"**; sessionId **`local_5e86abaa-a194-40fc-9c06-dd46016f3a1e`**.
- It **owns `parcels` and `permits`** (all county-data hunts, bulk loads, county verdicts in
  `data/texas_county_system_map.md`). The app/V2 lane owns `parcel_signals`.
- **Current status: holding for triggers** — EARS (~2026-07-31), the roof-age vendor reply, and the
  roof_material per-county CAMA PIAs.
- **How to coordinate:** cross-session message + the shared docs (this file, `HANDOFF.md`,
  `texas_county_system_map.md`). If V2 needs a data change in the Miner's lane, message SESSION2
  directly with a measured task — do NOT route it through Frederick, and do NOT write `parcels`/
  `permits` yourself.

---

## 9. Competitive context + integration facts

**Three shareable artifacts were produced in the V2-build session** (signal portfolio, roof-type map
concept, competitive landscape) for Frederick to use in positioning/GTM. `[These are session-level
Claude artifacts (shareable web pages), not committed to the repo — this doc-writing session could not
locate stored URLs in the repo. A fresh session should ask Frederick for the links or pull them from
the originating V2-build session before relying on them.]`

**Integration facts (verified in code + `JOBNIMBUS_INTEGRATION.md`):**
- **JobNimbus = open REST + static per-account Bearer key** (Settings → API). Self-serve, easy. The
  module is BUILT and unit-tested (§3.4), ready to wire.
- **AccuLynx = same REST + Bearer shape, but PARTNER-GATED** (their API needs an approved partner
  relationship, not a self-serve key). So a second `integrations/acculynx.ts` is a business-development
  item (an agreement), not an engineering one — don't start until that gate clears.

---

## 10. WHERE TO START NEXT

The backend is done and dark. **The next phase is the roofer APP UI, and it needs Frederick** — his
on-device UX direction drives app design (same as V1). Concrete first steps, per
`VERTICALS_STRATEGY.md`'s "how to build vertical #2" sequencing:

1. **Gate check first:** confirm V1 is live/earning enough that starting #2 is right (the build doc is
   explicit: don't start #2 until #1 is live and earning; the real bottleneck is V1's business/legal
   launch runway, not V2 data).
2. **Get Frederick's UX direction** for the roofer app surface (map + draw-area + lead list + the
   signal badges/filters the API already emits: hail, claim_window, solar_intent, code_violation, …).
   His instincts drive this — do not design it blind.
3. **Add the `roofer` row to `products`** (tiers, pricing, templates) — no schema change. Frederick
   sets pricing/tiers; the code already reads them from `products.config.roofer`.
4. **Build the roofer app** (own branding/App Store listing) pointing at the SAME API, reusing V1's
   shared components; flip `ROOFER_ENABLED` on for that app's builds only.
5. **Wire JobNimbus** (`POST /leads/:id/export/jobnimbus` + per-account encrypted key storage) once the
   app has a lead list to export from.
6. **When EARS lands (~2026-07-31):** run `data/load_ears_roll.py` (Miner's lane) → `year_built`
   statewide → then decide the roof-age tier-3 wiring in `resolveRoofAge()` (the free proxy floor)
   alongside the vendor go/no-go.

---

## 11. Verification log — what I checked (2026-07-17)

Everything in §2–§4 was re-derived from the live code (`rooferSignals.ts`, `rooferResolver.ts`,
`rooferConfig.ts`, `routes/roofer.ts`, `index.ts`, `smoke_roofer.mjs`, `jobnimbus.ts`, both `*.test.ts`,
`api/package.json`) and the live DB via the read-only proxy. Counts are as of 2026-07-17.

**Corrections made vs the prior ROOFER_SIGNALS.md / catalog:**
- **code_violation is 5 cities / 9,161 parcels** (was documented 3 cities / 8,872) — Plano (261) and
  Arlington (28) were added since.
- **permits grew to 4,308,597 total / 3,559,041 tied** (was ~3.6M); roof 111,426, solar 69,181 (these
  are all-time totals — the old "4,251 solar / 2,697 reroof" figures were 24mo/6mo *windowed queries*, a
  different metric, not a contradiction).
- **The disk crisis is resolved.** The old doc's "~770 MB free / per-parcel MRMS BLOCKED on disk"
  (30 GB volume) is stale: volume is now 50 GB (~20.8 GB free), DB 25 GB logical. The lean **swath +
  union-at-query** design is now BUILT (`rooferResolver.ts` intersects `hail_swaths` and unions with
  `hail_spc`), not "deferred to Frederick." `HANDOFF.md` still carries an older "30GB/770MB" line in its
  pending-decisions section that should be refreshed.
- **The built `RoofAgeSource` enum is `permit | vendor_api | year_built_proxy | unknown`** — corrected
  from the catalog's `imagery_api` + `user_confirmed` description (§4).
- Confirmed the wind signal is live (`wind_spc` 3,038,919 rows) and read by the resolver — the old
  "wind backfill FAILED / do not re-materialize" note was already known-wrong and is not carried here.

**NOT independently re-verified (flagged inline above):** the "106 year_built-blind counties" and
"MRMS < SPC on ~38% of dates / ~1.6x blended" figures (sourced from prior Miner/feasibility analyses);
the 50 GB volume free-space (volume-level, not visible from `pg_database_size`); the `/dev/shm ~67 MB`
(from HANDOFF.md); and the 3 shareable artifact URLs (session artifacts, not in the repo).
