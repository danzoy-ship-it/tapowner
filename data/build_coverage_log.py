"""Generate COUNTY_COVERAGE.md — the master check-off log for full Texas
coverage. Reads coverage.json (per-county DB counts, refreshed by the coverage
scan) + counties_2025.json (canonical 254-county name/fips list). Re-run any
time to refresh the checklist as counties get mined.

Usage: python build_coverage_log.py  (writes ../COUNTY_COVERAGE.md)
"""
import json
import os

HERE = os.path.dirname(__file__)
SCRATCH = ("C:/Users/danzo/AppData/Local/Temp/claude/"
           "C--Users-danzo-Tapowner/0f8b8247-afc5-410e-b454-4c95cb59a3f7/scratchpad/coverage.json")

cov = {r["county_fips"]: r for r in json.load(open(SCRATCH))}
counties = json.load(open(os.path.join(HERE, "counties_2025.json")))

# All 254 Texas counties by FIPS (the canonical list is 253; add any missing).
# Loving County (48301) is the StratMap gap — least-populous US county.
by_fips = {c["fips"]: c["name"] for c in counties}
if "48301" not in by_fips:
    by_fips["48301"] = "loving"


def pct(n, d):
    return (100.0 * n / d) if d else 0.0


rows = []
for fips, name in by_fips.items():
    c = cov.get(fips)
    tot = int(c["tot"]) if c else 0
    if not c or tot == 0:
        rows.append((name, fips, 0, {}, "MISSING", False))
        continue
    m = {k: int(c.get(k, 0)) for k in ("sqft", "beds", "baths", "improv", "sale",
                                       "exempt", "yr", "eyr", "anyyear")}
    p = {k: pct(v, tot) for k, v in m.items()}
    # status rollup
    has_improv = p["improv"] >= 25
    has_dims = p["sqft"] >= 25 and (p["baths"] >= 15 or p["beds"] >= 15)
    has_signals = p["sale"] >= 25
    if has_improv and has_dims and has_signals:
        status = "FULL+SIGNALS"
    elif has_improv and has_dims:
        status = "FULL"
    elif has_improv or has_dims or has_signals:
        status = "PARTIAL"
    else:
        status = "GEOM-ONLY"
    # "mined" = has marker-grade physical detail. That's EITHER improvement
    # segment tags (improvements array) OR bed/bath counts — a county loaded from
    # structured columns (e.g. Collin's MDB: beds/baths/pool, no improvements
    # text array) is fully mined for the 16 markers even with improv%==0. sqft
    # alone (StratMap dimensions, no features) does NOT count as mined.
    has_counts = p["beds"] >= 15 or p["baths"] >= 15
    mined = has_improv or has_counts
    rows.append((name, fips, tot, m, status, mined))

# order: unmined biggest-first (the work queue), then mined biggest-first
rows.sort(key=lambda r: (r[5], -r[2]))

n_full = sum(1 for r in rows if r[4].startswith("FULL"))
n_partial = sum(1 for r in rows if r[4] == "PARTIAL")
n_geom = sum(1 for r in rows if r[4] == "GEOM-ONLY")
n_missing = sum(1 for r in rows if r[4] == "MISSING")
n_mined = sum(1 for r in rows if r[5])
n_signals = sum(1 for r in rows if r[3] and r[3].get("sale", 0) > 0)
n_exempt = sum(1 for r in rows if r[3] and r[3].get("exempt", 0) > 0)
n_any_signal = sum(1 for r in rows if r[3] and (r[3].get("sale", 0) > 0 or r[3].get("exempt", 0) > 0))
# Year signal (roof-age): year_built OR effective_year_built present. The roofer
# insurance-cliff signals can't run without it, so a zero-year county is roof-age-blind.
n_year = sum(1 for r in rows if r[3] and r[3].get("yr", 0) > 0)
n_effyr = sum(1 for r in rows if r[3] and r[3].get("eyr", 0) > 0)
n_anyyear = sum(1 for r in rows if r[3] and r[3].get("anyyear", 0) > 0)
n_zeroyear = sum(1 for r in rows if r[2] > 0 and not (r[3] and r[3].get("anyyear", 0) > 0))
parc_zeroyear = sum(r[2] for r in rows if r[2] > 0 and not (r[3] and r[3].get("anyyear", 0) > 0))

out = []
out.append("# Texas County Coverage — the check-off log\n")
out.append("**Goal (Frederick): mine ALL 254 Texas counties — best property-data "
           "coverage of any competitor, so the underserved rural/'country' agent "
           "gets served. This is the master checklist; work the ☐ rows to done.**\n")
out.append("Regenerate with `python data/build_coverage_log.py` after each mining "
           "batch (refresh `coverage.json` via the per-county scan first).\n")
out.append(f"## Scoreboard ({len(rows)} counties)\n")
out.append(f"- ☑ **Mined (has improvements/feature tags): {n_mined}** / {len(rows)}")
out.append(f"- Full attributes (improv+dims): {n_full}  ·  Partial: {n_partial}  "
           f"·  Geometry-only (need mining): {n_geom}  ·  Missing from DB: {n_missing}")
out.append(f"- Seller-signals — sale date: {n_signals} counties  ·  "
           f"exemptions (homestead/over-65/DV tenure): {n_exempt} counties  ·  "
           f"**any seller-signal: {n_any_signal} counties**")
out.append(f"- **Roof-age signal — year_built: {n_year} counties · effective_year_built: {n_effyr} · "
           f"any-year: {n_anyyear} counties.** ⚠️ **{n_zeroyear} counties ({parc_zeroyear:,} parcels) "
           f"have ZERO year signal** → roof-age-blind (can't run the insurance-cliff signal until filled "
           f"free-recoverable, records-request, or imagery).\n")
out.append("Status = FULL+SIGNALS (improv+dims+sale) · FULL · PARTIAL · GEOM-ONLY · MISSING. "
           "% = share of the county's parcels with that attribute. `yr%` = year_built, "
           "`eyr%` = effective_year_built (roof-age proxy); a blank on BOTH = roof-age-blind.\n")
out.append("| ☑ | County | FIPS | Parcels | sqft% | beds% | baths% | yr% | eyr% | improv% | sale% | exempt% | Status |")
out.append("|---|--------|------|--------:|------:|------:|-------:|----:|-----:|--------:|------:|--------:|--------|")
for name, fips, tot, m, status, mined in rows:
    box = "x" if mined else " "
    if tot == 0:
        out.append(f"| [{box}] | {name.title()} | {fips} | 0 | – | – | – | – | – | – | – | – | {status} |")
        continue
    def pc(k):
        v = pct(m.get(k, 0), tot)
        return f"{v:.0f}" if v >= 0.5 else "·"
    out.append(f"| [{box}] | {name.title()} | {fips} | {tot:,} | {pc('sqft')} | {pc('beds')} | "
               f"{pc('baths')} | {pc('yr')} | {pc('eyr')} | {pc('improv')} | {pc('sale')} | "
               f"{pc('exempt')} | {status} |")

# ---- Known bulk-data gaps / blockers (the "log what we can't get yet" list,
# per the 100%-coverage mandate). Update as attempts are exhausted; details +
# investigation trails live in texas_county_system_map.md.
out.append("\n## Known bulk-data gaps / blockers (exhausted attempts → circle back later)\n")
out.append("Goal is 100% of NEEDED data on 100% of counties. Where an attribute isn't in any "
           "free bulk source after exhausting attempts, it's logged here with the path to close it.\n")
out.append("**DECISION (Frederick, 2026-07-16):** do NOT mass-harvest per-property APIs "
           "(unethical/ToS/data-broker risk + ~9 days/county). App-lane / SPA / search-portal "
           "counties are logged as **PROBLEMATIC** and deferred to a later aggressive pass "
           "(fable-5 ultracode mode) + $0 electronic open-records requests. Take ALL easy bulk "
           "wins first. Every blocker stays tracked here so nothing is lost.\n")
out.append("| County | Missing | Status of attempts | Path to 100% |")
out.append("|--------|---------|--------------------|--------------|")
GAPS = [
    ("Tarrant (48439)", "beds/baths counts (segments ARE loaded: 692K)",
     "CONFIRMED UNAVAILABLE in bulk (2026-07-15): full TP extract at tad.org/content/data-download IS free "
     "and loaded (692K improvements/tags), but ALL 4.7M _ATTR rows carry 'Bedrooms'/'Bathrooms' as flag-only "
     "labels with no number, AND PropertyData_R Num_Bedrooms/Num_Bathrooms are 100% blank. TAD policy withholds counts.",
     "No bulk path exists — counts live only in the per-property TP API (off-limits). Effectively closed unless TAD changes policy."),
    ("Collin (48085)", "improvements (feature tags)",
     "data.texas.gov feed is property-SUMMARY only (imprvclasscd/pool flag; no garage/shed segments).",
     "Check collincad.org own data product for a segment/addl-improvement export (like Dallas RES_ADDL)."),
    ("Gregg (48183)", "sale/exemptions",
     "GCAD_Export.zip prop_id space != DB source_property_id (roll/geometry key mismatch).",
     "Re-pull a Gregg roll whose geo_id matches, or add a geo_id crosswalk (like Tarrant)."),
    ("Hidalgo (48215)", "improvement SEGMENTS / beds / pool-garage tags",
     "PARTIAL: HCADShapefiles.zip data.mdb loaded (year built + main-area sqft + deed date + exemptions, "
     "~324K parcels). True Prodigy killed the bulk roll; mdb has no segments/beds/pool.",
     "$0 PIA to cs@hidalgoad.org for the True Prodigy 'Public Appraisal Export (Legacy 8.0.30)' — cite MCAD's public posting as precedent."),
    ("Hunt/Comal/Henderson/Webb/Harrison/Anderson", "improvements/beds/baths",
     "EXHAUSTED free bulk (waves 3+5): TP/BIS orgs expose value-only FeatureServers; Hunt SharePoint-gated; "
     "Anderson TP bulk-export API auth-gated (401); no PACS export posted.",
     "$0 open-records request to each district for the PACS appraisal export (imp_detail/attr/info)."),
    ("Lubbock (48303)", "improvement segments/beds/baths",
     "EXHAUSTED free bulk: Orion vendor, all 8 gis.lubbockcad.org services are annotation/parcel only "
     "(no segment table); site is PDF-only; the free monthly Property Data Export (Rec4 Improvement + "
     "Rec5 ImpSegment incl. Bedrooms) was discontinued ~2015 and is now sold via Orion.",
     "$0 open-records/25.195 request naming LCAD's own 'Property Data Export (record types 1-6)'."),
    ("Smith (48423)", "improvements/beds/baths/signals",
     "EXHAUSTED free bulk: GSA Corp vendor, smithcad.org static/PDF-only, mapsite 500s, ArcGIS Hub has no CAMA.",
     "$0 open-records request for the GSA 'Certified Data Roll' export (same product Johnson CAD posts free)."),
]
for county, missing, status, path_ in GAPS:
    out.append(f"| {county} | {missing} | {status} | {path_} |")
out.append("\n**203 geometry-only counties** still need a full mining pass (mostly rural — the underserved "
           "market that is the whole point). Work them biggest-first from the ☐ rows above; each is a "
           "roll hunt (wp-json probe, PACS roll, CAD data product, or Socrata).\n")

path = os.path.join(HERE, "..", "COUNTY_COVERAGE.md")
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"wrote {os.path.abspath(path)}")
print(f"mined {n_mined}/{len(rows)} | full {n_full} | partial {n_partial} | "
      f"geom-only {n_geom} | missing {n_missing} | sale-signal {n_signals} | "
      f"exempt-signal {n_exempt} | any-signal {n_any_signal}")
