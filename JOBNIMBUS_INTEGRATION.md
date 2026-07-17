# JobNimbus Lead-Export Integration

**Status: spec + reference implementation only. Not wired into any app.** The roofer vertical
(TapRoofers / TapOwner vertical #2) doesn't have an app surface yet — see `VERTICALS_STRATEGY.md`
and `TAPROOFERS_SIGNALS.md`. This doc + the module at `api/src/integrations/jobnimbus.ts` exist so
the integration is ready to wire into a route (e.g. `POST /leads/:id/export/jobnimbus`) the day that
vertical is built, without a redesign.

No live JobNimbus account or API key was used to build or test this. Everything below is built from
the verified API facts supplied for this spec; anything not directly confirmed is flagged as an open
question to verify against a real account before shipping.

---

## 1. How a roofer connects

JobNimbus auth is a **static per-account API key**, not OAuth — each roofer generates their own key
inside their JobNimbus account (Settings → API), then pastes it into TapOwner.

Flow:
1. Roofer opens TapOwner Settings → Integrations → JobNimbus.
2. Roofer generates a key in their own JobNimbus account and pastes it into a single field in
   TapOwner.
3. TapOwner does a cheap validation call (e.g. `GET /contacts?limit=1` or equivalent) to confirm the
   key works before saving, and shows a clear "Connected" / "Invalid key" state.
4. The key is stored **encrypted at rest, scoped to that account**, and is never echoed back to the
   client in full (mask it, e.g. `••••••••jn41`) and never written to application logs, error
   trackers, or analytics events. Treat it exactly like the Stripe/Resend keys already handled
   server-side in `api/src/lib` — env-level secrets for TapOwner's own keys, but this one is a
   **per-user secret**, so it needs its own encrypted column (e.g. AES-GCM with a key from
   `JOBNIMBUS_KEY_ENCRYPTION_KEY`, analogous to how `products.config` holds shared config but scoped
   per-account instead) rather than an env var. Decrypt only inside the request that calls
   `pushLeadToJobNimbus` — never decrypt-and-log.
5. Disconnecting clears the stored key; TapOwner does not need to call JobNimbus to "revoke" it (the
   roofer can regenerate/revoke on their end).

**Never log the raw key.** If a request to JobNimbus fails, log the account id, the lead id, and the
JobNimbus error — never the `Authorization` header value.

## 2. Field mapping — TapOwner lead → JobNimbus contact

A TapOwner roofer lead carries: owner name, phone, email, situs address (number/street/city/state/
zip), lat/lng, and the signal that triggered it (e.g. `roof_damage` / "hail 5/28/24 — 1.75in",
`roof_age` / "22 yrs, insurance cliff", `code_violation` / "substandard structure", `foreclosure` /
"foreclosure notice").

| TapOwner lead field | JobNimbus contact field | Notes |
|---|---|---|
| `ownerName` | `first_name` + `last_name`, **or** `company` | See name-splitting rules below. |
| `phone` | `phone` | Passed through trimmed. (JobNimbus also supports a `phones[]` array on some accounts — see open question below.) |
| `email` | `email` | Passed through trimmed. |
| `situsNumber` + `situsStreet` | `address_line1` | Joined as `"{number} {street}"`. |
| `situsCity` | `city` | Title-cased for legibility (county rolls are ALL CAPS). |
| `situsState` | `state_text` | Upper-cased 2-letter code. |
| `situsZip` | `zip` | Passed through trimmed. |
| `lat` / `lng` | `geo: { lat, lon }` | Best-effort — see open question below. |
| n/a (constant) | `record_type_name` | Defaults `"Lead"`, overridable per-account. |
| n/a (constant) | `status_name` | Defaults `"New"`, overridable per-account. |
| `signalType` (generic bucket) + TapOwner lead id | `description` | **Never** the raw `signalLabel` — see ethics rule below. |

### Name splitting (`ownerName` → `first_name`/`last_name`/`company`)

County rolls mix individual owners ("SMITH, JOHN A") with business entities ("RIVER OAKS HOLDINGS
LLC", "ESTATE OF MARY JONES", school districts, municipalities, trusts). JobNimbus requires *at
least one* of `first_name` / `last_name` / `company`, and mis-routing a business name into
`first_name` reads badly in the roofer's CRM. The reference implementation:

1. Checks the name against a list of business-entity tokens (`LLC`, `INC`, `CORP`, `LP`, `TRUST`,
   `ESTATE OF`, `ISD`, `COUNTY OF`, `CITY OF`, etc.) — if matched, sends the whole string as
   `company`, untouched (no title-casing, so acronyms like "LLC" aren't mangled into "Llc").
2. Otherwise, splits on the county-roll `"LAST, FIRST MIDDLE"` convention if there's a comma;
   falls back to a plain `"FIRST LAST"` split (last token = last name) if there isn't.
3. Title-cases the individual name for legibility.
4. If no name is present at all, the mapping throws rather than silently sending an empty contact —
   the caller should never have gotten this far (leads should already be filtered for a placeholder
   owner name, e.g. via the existing `isPlaceholderOwner` guard in `api/src/lib/owners.ts`), but the
   integration fails loudly instead of creating a garbage contact.

### Ethics rule: the CRM note must stay generic — never the raw sensitive trigger

**This is the same "signal never surfaces in outreach" discipline already documented for
probate/foreclosure and the roofer insurance-cliff signals in `ROOFER_SIGNALS.md`.** A signal like
`foreclosure` or `code_violation` must never appear as raw, specific text anywhere a roofer could
copy-paste it straight into homeowner-facing outreach — and a CRM note field is exactly the kind of
place a rep copies from. So:

- The `description` sent to JobNimbus is built from a **fixed lookup table** mapping each internal
  `signal_type` code to a generic, outreach-safe bucket label:
  - `roof_damage` / `wind_roof_damage` / `hail` → *"Recent severe-weather area"*
  - `roof_age` / `insurance_cliff` → *"Roof-age / insurance-review flag"*
  - `code_violation` → *"Property-condition flag"*
  - `foreclosure` / `probate` → *"Ownership-status flag"*
  - `tenure` / `senior_owner` / `homestead` → *"Likely-to-sell flag"*
  - anything unrecognized → *"TapOwner lead flag"* (safe default, never a passthrough of the raw
    code)
- The raw, specific `signalLabel` (e.g. "Foreclosure notice filed 2026-06-01, trustee sale set for
  2026-08-04", or "hail 5/28/24 — 1.75in") is **never read** by the mapping function at all — not
  redacted after the fact, structurally excluded. The reference implementation has a unit test
  asserting this (`jobnimbus.test.ts`, "ethics guard" tests).
  - The one exception worth calling out: the two storm signals (`roof_damage`/`hail`) are
    *already* how roofers everywhere market ("we noticed hail damage in your area") — that specific
    number (e.g. hail size) is still withheld from the JobNimbus note in v1 for consistency/
    simplicity, but if product wants richer CRM context for storm leads specifically, that's a
    narrower, lower-risk carve-out to design later (loop in Frederick before doing it — the other
    signal families should stay generic regardless).
- `description` also includes a fixed `"Source: TapOwner Reverse Prospecting"` tag and the TapOwner
  lead id as an opaque reference (for support correlation on a failed push) — not a link, not a
  sourced explanation.

## 3. `record_type_name` / `status_name` — the account-specific-values wrinkle

These are free-text pipeline values configured per JobNimbus account (a fresh account might have
`"Lead"`/`"New"`; a roofer who's customized their pipeline might use `"Prospect"`/`"Uncontacted"` or
anything else). There's no universal correct value.

**Design — two options, ship (A) first:**

- **(A) Sane defaults + one-time override (recommended for v1).** Default to `"Lead"` / `"New"` (a
  stock JobNimbus account ships with these). Let the roofer override both, once, in the same
  TapOwner Settings screen where they paste their API key — two plain text fields, "record type" and
  "status," pre-filled with the defaults. Store the override per-account alongside the encrypted key.
  This ships without needing any extra JobNimbus API surface.
- **(B) Fetch-and-pick (nicer UX, do once (A) is proven).** If JobNimbus exposes a GET endpoint that
  returns an account's valid `record_type_name`/`status_name` options (this is common for CRMs with
  configurable pipelines, but the exact endpoint wasn't in the verified facts for this spec — confirm
  against JobNimbus's actual docs or a sandbox account), call it after the key is validated and
  render a dropdown instead of free text. This removes typo risk (a mismatched string is silently
  rejected or miscategorized rather than erroring loudly, depending on the account) but adds a
  dependency on an unverified endpoint, so it's explicitly *not* in the v1 reference implementation.

The reference `pushLeadToJobNimbus(apiKey, lead, opts)` takes `opts.recordTypeName` /
`opts.statusName` so either design plugs in without changing the module.

## 4. Dedup strategy

**Recommendation: check-before-create, keyed on phone first, address second — do not rely solely on
JobNimbus's own dedup.**

Rationale: JobNimbus dedup behavior on `POST /contacts` isn't documented in the verified facts for
this spec (some CRMs silently create a duplicate, some 409, some merge) — don't build on an
unconfirmed assumption. A cheap, TapOwner-side check is more predictable and gives a better user
message ("Already in JobNimbus" vs. a raw API error):

1. Before pushing, query JobNimbus for an existing contact matching the lead's phone (most reliable
   single field — normalize to digits-only before comparing). If verified endpoints support a
   `GET /contacts?phone=...`-style filter, use it; otherwise fall back to pulling a page of contacts
   and matching client-side (only viable at v1's per-lead / small-bulk scale, not for large
   auto-sync).
2. If no phone match, fall back to a normalized address match (`address_line1` + `zip`).
3. If a match is found, don't re-POST — surface "Already synced to JobNimbus" in TapOwner (ideally
   with the existing `jnid` so the UI can deep-link to it) rather than silently skipping.
4. TapOwner also keeps its own record of `(lead_id, jnid, synced_at)` after a successful push, so a
   second "Send to JobNimbus" click on the *same* TapOwner lead is caught locally without a JobNimbus
   round-trip at all — the phone/address check above is specifically for leads TapOwner hasn't pushed
   itself but that might already exist in the roofer's JobNimbus from another source (their own
   door-knocking, a different lead vendor, etc.).

This needs one more verified fact before it's final: **confirm JobNimbus's actual contact-search
filter support** (exact query params) against a real account or their current API docs before
building step 1 — that's the one piece of this section not backed by the verified facts supplied.

## 5. Sync model

**Recommendation: per-lead (manual "Send to JobNimbus" button) + bulk export for v1. Auto-sync is a
later phase.**

- **Per-lead (v1, primary).** A "Send to JobNimbus" action on a single lead card. Immediate feedback
  (success with a link to the JobNimbus contact, or a clear error). This is the safest place to
  start — it puts a human in the loop for the dedup edge cases above and matches how a roofer already
  triages leads one at a time.
- **Bulk export (v1, secondary).** "Send all" from a filtered lead list (e.g. a farm/list view) —
  loops `pushLeadToJobNimbus` per lead with the dedup check, and returns a per-lead result summary
  (N sent, N already-existed, N failed with reasons) rather than a single pass/fail. Needs
  rate-limit-aware pacing (see §6) since it's N calls back-to-back.
- **Auto-sync toggle (later phase, not v1).** "Every new lead matching my filters auto-pushes to
  JobNimbus." Deferred because: it needs a durable job queue (a bad JobNimbus outage shouldn't drop
  leads — they need to retry later, not just fail silently), it multiplies the dedup-correctness bar
  (concurrent auto-syncs racing the check-before-create step), and it's much higher blast radius for
  a mapping bug (one bad `signalType` → generic-label mapping entry could leak into hundreds of CRM
  notes before anyone notices, vs. one lead in the manual flow). Ship per-lead + bulk first, watch
  real usage, then design auto-sync with a queue once the mapping/dedup logic has real-world mileage.

## 6. Rate limits + error handling

JobNimbus's specific rate-limit numbers weren't in the verified facts for this spec — the reference
implementation is defensive rather than tuned to a documented number:

- **Timeout:** each request aborts after 15s (`opts.timeoutMs`, configurable).
- **Retry policy:** up to 2 retries (3 attempts total, `opts.maxRetries`, configurable) with
  exponential backoff + jitter (500ms base, doubling), **only** for transient failures:
  - `429` (rate limited) — retried, honoring a `Retry-After` header if JobNimbus sends one.
  - `5xx` (server error) — retried.
  - network error / timeout — retried.
  - `401`/`403` (auth — almost certainly a bad/revoked key) — **not** retried; surfaced immediately
    so the user can fix their stored key rather than burning retries on a request that can't succeed.
  - other `4xx` (validation error, e.g. a bad `record_type_name`) — **not** retried; surfaced
    immediately with the JobNimbus status/message so the user (or TapOwner support) can see exactly
    what was rejected.
- **Bulk export pacing:** since bulk export is N sequential calls, add a small fixed delay between
  calls (e.g. 200–300ms) independent of the retry logic, so a 50-lead bulk export doesn't itself look
  like a burst to JobNimbus's rate limiter. Not yet in the reference module (it operates on one lead
  at a time by design) — this belongs in the future bulk-export route that loops over it.
- **Surfacing failures to the user:** `pushLeadToJobNimbus` never throws — it returns a typed
  `JobNimbusPushResult`, either `{ ok: true, jnid, contact }` or `{ ok: false, error: { kind,
  message, status?, retryable } }`. A route handler maps `error.kind` to a user-facing message
  directly (no string parsing needed):
  - `invalid_lead` → "This lead is missing a name — can't send to JobNimbus." (shouldn't reach the
    user in practice if upstream filtering is correct, but it's a clean message if it does)
  - `auth` → "Your JobNimbus connection needs to be reconnected — check your API key in Settings."
  - `rate_limited` / `server_error` / `network_error` / `timeout` → "JobNimbus didn't respond — we
    retried automatically. Try again in a minute." (all exhausted their retries already)
  - `client_error` → "JobNimbus rejected this lead: {message}" (surfaces the specific reason —
    likely a bad `record_type_name`/`status_name` override, which points the user back to Settings)

## 7. AccuLynx (generalization note)

AccuLynx uses the same REST + static Bearer-token pattern, so this module's shape (typed lead input →
pure `mapLeadTo*Contact` function → a thin `push*ToAccuLynx` network wrapper with the same retry/
timeout/typed-error design) generalizes directly to a second `api/src/integrations/acculynx.ts` when
needed. The blocker isn't technical — **AccuLynx is partner-gated** (their API requires an approved
partner/integration relationship, not a self-serve per-account key like JobNimbus), so that's a
business-development item (an application/agreement with AccuLynx), not an engineering one. Don't
start building it until that gate is cleared.

## 8. Open questions to verify against a real account before shipping

1. Exact shape of the `geo` field on a `/contacts` payload (`{lat, lon}` vs. `{latitude, longitude}`
   vs. only supported on `/jobs`). The reference implementation sends `{ lat, lon }` and is
   toggleable (`opts.includeGeo`) in case it needs to be dropped.
2. Whether `phone` should be a single scalar field or a `phones[]` array on this account type (the
   verified facts mention "phone/phones" without disambiguating). Reference implementation sends the
   scalar `phone`.
3. Exact contact-search/filter query params for the dedup check in §4 (e.g. `GET /contacts?phone=`).
4. Whether unrecognized/extra JSON fields in the POST body are silently ignored or cause a 4xx —
   affects how defensively `geo` and future optional fields should be sent.
5. JobNimbus's actual published rate limits (requests/min), to tune the bulk-export pacing in §6
   with a real number instead of a conservative guess.

---

## Reference implementation

`api/src/integrations/jobnimbus.ts` — self-contained TypeScript module, no live API calls, no
hardcoded key. Exports:

- `interface JobNimbusLead` — typed input shape (owner/contact/address/geo/signal fields).
- `mapLeadToContact(lead, opts?)` — pure function, `JobNimbusLead` → `JobNimbusContactPayload`. Unit
  tested in isolation (name-splitting, business-entity routing, geo, record_type/status defaulting
  and override, and the ethics-guard behavior above).
- `pushLeadToJobNimbus(apiKey, lead, opts?)` — maps + POSTs to `/contacts` with the
  Authorization/timeout/retry/typed-error handling described in §6. Never throws; returns a
  `JobNimbusPushResult`. Accepts an injectable `fetchImpl` for testing (defaults to the global
  `fetch`).

Unit tests: `api/src/integrations/jobnimbus.test.ts` (`npm test` in `api/`, or
`npx tsx --test src/integrations/jobnimbus.test.ts`). 18 tests, all network-path tests use a stubbed
`fetchImpl` — none make a real HTTP call.
