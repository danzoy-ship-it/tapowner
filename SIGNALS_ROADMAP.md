# TapOwner Seller-Signals Roadmap

**The 15 "likely to sell" signals, consolidated by Frederick (2026-07-15) from his parallel
research chat.** This is the product tier that attacks SmartZip's $299–$1,000/mo pitch and
PropStream's distress filters with public-record data. Both sessions execute against THIS doc;
per-signal status lives here. Lanes per the two-session contract (HANDOFF §3b): data
acquisition/pipelines = Miner; storage schema changes = Miner (bulk-DDL rules); surfacing
(filters/badges/alerts/AI-draft guards) = Product.

---

## ⚖️ THE OUTREACH RULE (hard invariant — glued to every signal, esp. Families 1–2)

**The trigger can be a public record; the outreach must NEVER reveal the sensitive part.**
"I help homeowners in your neighborhood" — never "I saw your divorce filing." When signals
ship, the AI-draft prompts get a hard guard: signal names/types must never appear in or shape
generated outreach copy beyond generic neighborhood-interest framing. This discipline is what
keeps a signals feature from becoming a reputational (and possibly legal) problem. Also in
`TAPOWNER_APP_BIBLE.md` §8.

---

## The 15, by family

### Family 1 — Distress (strongest intent; outreach rule applies hardest)
| # | Signal | Source | Cost tier |
|---|---|---|---|
| 1 | Pre-foreclosure / Notice of Trustee's Sale | County clerk filings (21+ days pre-auction) | County-by-county grind |
| 2 | Property tax delinquency | County tax rolls | County-by-county grind |
| 3 | Code enforcement violations | City open-data portals | Free, different source |
| 4 | Eviction filings | JP court records | County-by-county grind |
| 5 | Mechanic's liens | County clerk filings | County-by-county grind |

### Family 2 — Life transition (early, high-value, ethically sensitive)
| # | Signal | Source | Cost tier |
|---|---|---|---|
| 6 | Divorce filings | District court records | County-by-county grind |
| 7 | Probate filings (probate-not-obituary framing) | County/probate court records | County-by-county grind |
| 8 | Partition suits (co-owners forcing sale) | District court records | County-by-county grind |
| 9 | Homestead exemption DROPPED (moved out → vacant/rental) | Appraisal rolls **(needs capture + time-series — see status)** | Near-free |
| 10 | Over-65 exemption FILED (downsizing horizon) | Appraisal rolls **(same)** | Near-free |

### Family 3 — Market ripple (cheapest, zero sensitivity)
| # | Signal | Source | Cost tier |
|---|---|---|---|
| 11 | Expired / withdrawn listings | **MLS-licensed data — see legal flag** | ⚠️ Not free/public |
| 12 | FSBO listings | Portal monitoring — **see legal flag** | ⚠️ Scrape-risk |
| 13 | "Neighbor sold high" ripple | Last-sale data **(capture already queued with Miner)** | Near-free |
| 14 | Renovation permits read in reverse | City permit portals | Free, different source |

### Family 4 — Economic shock (area-level, unique)
| # | Signal | Source | Cost tier |
|---|---|---|---|
| 15 | WARN Act layoff notices | Texas Workforce Commission (public) | Free, single source |

**Honorable mentions (parked):** moving-sale posts (FB/Craigslist — scrape-risk), USPS vacancy
flags (vendor), lis pendens, deed-transfer-into-LLC (plant now, harvest in 2 years — rides the
deed-capture pipeline).

---

## Honest dependency map (what "already in your data" really means — verified, not assumed)

- **#9/#10 exemptions:** in the roll FILES the Miner already downloads, but NOT yet in the DB
  (no exemptions column). And the signal is a CHANGE (dropped/filed), which needs
  **snapshots over time** — we can only diff loads we've captured. **Start capturing NOW** so
  the first diffs exist at the next quarterly refresh. Current-state proxy available today:
  non-homestead + absentee (`is_absentee` exists statewide).
- **#13 neighbor-sold-high (and the tenure filter):** `last_sale_date/price` columns are EMPTY
  statewide (verified 2026-07-15) — capture from roll files already queued with the Miner.
  This signal + "owned 15+ years" both unblock the moment that lands.
- **#11/#12 expired + FSBO — LEGAL FLAG:** expired/withdrawn listings are **MLS data**, not
  public records; FSBO portal monitoring = scraping someone's platform. Same posture as the
  $0.003 vendor: attorney-gated (or an MLS/IDX partnership — a Frederick business decision).
  Do NOT scrape-build these.
- **Court-record families (#1,2,4,5,6,7,8):** genuinely free public records, but a NEW
  county-by-county mining campaign (clerk/court portals ≠ CAD portals). Same playbook DNA,
  new door catalog. Phase it; don't start mid-Wave-3B.
- **#3/#14 city portals + #15 WARN:** free, well-defined, small. WARN is one statewide source.

## 🔔 DAILY FILING ALERTS — the add-on subscription (Frederick, 2026-07-16)

The killer recurring-revenue play: turn signals from a static filter into a **proactive daily
alert feed**. "The moment a home in your farm hits pre-foreclosure / enters probate, you're
alerted first." This is what SmartZip/Offrs charge $300–1,000/mo for; we do it on free public
data as an add-on on top of $19.99.

**Architecture (app-session lane; Stripe-gated for the paid tier):**
1. **Scheduled refresh per source** (cron): re-pull each public feed on its natural cadence —
   court records (probate/divorce/evictions) flow DAILY; foreclosures batch MONTHLY (TX trustee
   sales = 1st Tuesday, notices post ~21 days prior). Poll daily; new ones cluster accordingly.
2. **Diff for NEW filings:** each `parcel_signals` row carries `first_seen`; a refresh inserts only
   filings not seen before (and expires ones that dropped off the source, e.g. a cured foreclosure).
3. **Alert match:** for each new filing, find agents whose saved farm/area contains it → notify
   (push + in-app feed). Reuses the polygon/geo logic farm already has.
4. **Subscription:** a "Signals / Alerts" add-on entitlement (config-gated like the tiers).
   Recurring revenue, priced as an add-on. Post-Stripe.

**The join is SPATIAL, not address-string:** foreclosure feeds (e.g. Bexar ArcGIS) carry point
geometry — drop the point into parcel polygons (ST_Contains) rather than fight `ST`/`STREET`
typos. Verified 2026-07-16: naive address match on Bexar foreclosures got only 7% (their data has
`SAN ANTOINO` typos, suffix variance, + out-of-county rows like Boerne=Kendall) — the geometry
join is the right path.

**Statewide reality:** TX law requires every county clerk to post Notices of Trustee's Sale
online → foreclosure is legally public in all 254 counties. Bexar source CRACKED + live:
`maps.bexar.org/arcgis/rest/services/CC/ForeclosuresProd/MapServer` (layer 0 Mortgage 275, layer
1 Tax 10; fields ADDRESS/DOC_NUMBER/YEAR/MONTH/TYPE/CITY/ZIP + geometry; monthly refresh).

## Storage sketch (app-session owns `parcel_signals` DDL, per bulk-DDL rules)

`parcel_signals(parcel_id, signal_type, event_date, source, meta jsonb, created_at)` + GIN/btree
as needed; area-level signals (#15) keyed by geography, not parcel. Product surfaces them as
Reverse Prospecting filters/badges + (later) farm alerts. AI-draft guard ships in the same
build as the first surfaced signal.

## STATUS (2026-07-16, app session overnight)

- ✅ **SHIPPED — tenure filter + senior-owner (#10 current-state):** the data session captured
  1.49M `last_sale_date` + 571K `exemptions` (HS 564K / OV65 216K). App now derives `tenure_years`,
  `senior_owner`, `homestead` (`api/src/lib/ownerSignals.ts`); Reverse Prospecting has "Owned
  10/15/20+ yrs" + "Owner 65+" filter chips; card + farm rows show them; CSV gains the columns;
  1900-placeholder dates rejected (100yr cap). Coverage grows by county (Galveston/Nueces/Cameron/
  Guadalupe/Randall have both today). Draft letters deliberately EXCLUDE these per the ethics rule.
- ⏳ **BLOCKED — #13 neighbor-sold-high:** needs sale PRICE; 0 captured (only date). Data session is
  capturing price where present on future passes; unblocks when price coverage exists.
- ⏳ **#9 homestead-DROPPED:** needs a second exemptions snapshot to diff — starts working after the
  next quarterly recapture. Current-state "owner-occupied (HS)" already surfaces.

## Execution order (Frederick's value-per-effort × our dependency reality)

1. **Now (rides existing pipelines):** ✅ tenure filter + senior-owner DONE; last-sale/exemption
   capture ongoing (data session); #13 waits on price; owner-portfolio index shipped.
2. **Next small wins:** #15 WARN (one source), #3/#14 city portals for the metros.
3. **The campaign:** court-record counties (#1,5,6,7,8 then #2,4), clerk-portal playbook style.
4. **Frederick decisions pending:** #11/#12 route (attorney vs MLS partnership vs skip).

*Keep this doc current: per-signal status changes get edited here, decisions logged in
HANDOFF's decision log.*
