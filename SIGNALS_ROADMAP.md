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

## Storage sketch (Miner owns DDL, per bulk-DDL rules)

`parcel_signals(parcel_id, signal_type, event_date, source, meta jsonb, created_at)` + GIN/btree
as needed; area-level signals (#15) keyed by geography, not parcel. Product surfaces them as
Reverse Prospecting filters/badges + (later) farm alerts. AI-draft guard ships in the same
build as the first surfaced signal.

## Execution order (Frederick's value-per-effort × our dependency reality)

1. **Now (rides existing pipelines):** last-sale capture → tenure filter + #13; exemptions
   capture columns (#9/#10 seed); owner-portfolio index (already queued).
2. **Next small wins:** #15 WARN (one source), #3/#14 city portals for the metros.
3. **The campaign:** court-record counties (#1,5,6,7,8 then #2,4), clerk-portal playbook style.
4. **Frederick decisions pending:** #11/#12 route (attorney vs MLS partnership vs skip).

*Keep this doc current: per-signal status changes get edited here, decisions logged in
HANDOFF's decision log.*
