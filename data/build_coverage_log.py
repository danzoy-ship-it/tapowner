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
    m = {k: int(c[k]) for k in ("sqft", "beds", "baths", "improv", "sale", "exempt")}
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
    # "mined" = has the core product data (improvements/feature tags). Rural
    # counties with no free improvement source get checked off separately once
    # confirmed exhausted (tracked in texas_county_system_map.md verdicts).
    mined = has_improv
    rows.append((name, fips, tot, m, status, mined))

# order: unmined biggest-first (the work queue), then mined biggest-first
rows.sort(key=lambda r: (r[5], -r[2]))

n_full = sum(1 for r in rows if r[4].startswith("FULL"))
n_partial = sum(1 for r in rows if r[4] == "PARTIAL")
n_geom = sum(1 for r in rows if r[4] == "GEOM-ONLY")
n_missing = sum(1 for r in rows if r[4] == "MISSING")
n_mined = sum(1 for r in rows if r[5])
n_signals = sum(1 for r in rows if r[3] and r[3].get("sale", 0) > 0)

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
out.append(f"- Seller-signals (sale date) loaded: {n_signals} counties\n")
out.append("Status = FULL+SIGNALS (improv+dims+sale) · FULL · PARTIAL · GEOM-ONLY · MISSING. "
           "% = share of the county's parcels with that attribute.\n")
out.append("| ☑ | County | FIPS | Parcels | sqft% | beds% | baths% | improv% | sale% | exempt% | Status |")
out.append("|---|--------|------|--------:|------:|------:|-------:|--------:|------:|--------:|--------|")
for name, fips, tot, m, status, mined in rows:
    box = "x" if mined else " "
    if tot == 0:
        out.append(f"| [{box}] | {name.title()} | {fips} | 0 | – | – | – | – | – | – | {status} |")
        continue
    def pc(k):
        v = pct(m.get(k, 0), tot)
        return f"{v:.0f}" if v >= 0.5 else "·"
    out.append(f"| [{box}] | {name.title()} | {fips} | {tot:,} | {pc('sqft')} | {pc('beds')} | "
               f"{pc('baths')} | {pc('improv')} | {pc('sale')} | {pc('exempt')} | {status} |")

path = os.path.join(HERE, "..", "COUNTY_COVERAGE.md")
open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")
print(f"wrote {os.path.abspath(path)}")
print(f"mined {n_mined}/{len(rows)} | full {n_full} | partial {n_partial} | "
      f"geom-only {n_geom} | missing {n_missing} | signals {n_signals}")
