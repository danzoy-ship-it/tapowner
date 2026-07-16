"""Normalize a raw permit (type description + work class + permit class +
description text) into ONE stable category. Shared by every permit loader so the
`permits.permit_category` column means the same thing across all jurisdictions.

Roofer-priority categories: 'roof' (re-roof/roof replacement) and 'solar'.
Everything else is kept for the other verticals (remodel/addition→remodelers,
pool→pool cos, hvac, new_build, etc.).

Classification is keyword-first on the combined text, MOST-SPECIFIC-FIRST so that
e.g. a solar job filed as an electrical permit is tagged 'solar', not 'electrical'.
"""
import re

# (category, compiled regex) — order matters: first match wins.
_RULES = [
    ("solar",      re.compile(r"\bsolar\b|photovolta|\bpv\b|\bp\.?v\.? system|rooftop solar", re.I)),
    ("roof",       re.compile(r"re-?\s?roof|roof\s*replac|roof\s*recover|re-?cover|shingle|roofing|\btear-?off\b|\bnew roof\b|\broof\b", re.I)),
    ("pool",       re.compile(r"\bpool\b|\bspa\b|hot tub|swimming", re.I)),
    ("addition",   re.compile(r"\baddition\b|\badd-?on\b|room add|\badu\b|accessory dwelling|second (?:story|floor)", re.I)),
    # window/gutter/fence come BEFORE remodel so storm-adjacent-repair (signal #17)
    # can tell these non-roof repairs apart from a re-roof.
    ("window",     re.compile(r"\bwindow(?:s)?\b|glazing|fenestration|storefront glass", re.I)),
    ("gutter",     re.compile(r"\bgutter(?:s)?\b|downspout|\bfascia\b|\bsoffit\b", re.I)),
    ("fence",      re.compile(r"\bfence\b|retaining wall", re.I)),
    ("remodel",    re.compile(r"remodel|renovat|\balter(?:ation)?\b|interior finish|tenant (?:finish|improvement)|\brepair\b|rehab|restor", re.I)),
    ("new_build",  re.compile(r"new construction|new (?:single|residential|commercial|building|structure|sfr|home|dwelling|res\b)|\bnew\b.*(?:home|house|residence|building)", re.I)),
    ("hvac",       re.compile(r"\bhvac\b|mechanical|air ?condition|\ba/?c\b|furnace|heat ?pump|rooftop unit|\brtu\b|change ?out|\bmini ?split\b|condenser", re.I)),
    ("electrical", re.compile(r"electric|\bev\b charg|panel upgrade|service upgrade|generator|meter", re.I)),
    ("plumbing",   re.compile(r"plumb|water heater|sewer|\bgas\b line|re-?pipe|backflow|irrigation.*plumb", re.I)),
    ("demolition", re.compile(r"\bdemo(?:lition|lish)?\b|tear ?down|raze", re.I)),
    ("irrigation", re.compile(r"irrigation|sprinkler", re.I)),
    ("sign",       re.compile(r"\bsign\b|billboard|banner", re.I)),
]


def categorize(*parts):
    """Pass any of: permit_type_desc, work_class, permit_class, description.
    Returns a normalized category string ('other' if nothing matches)."""
    text = " ".join(str(p) for p in parts if p)
    if not text.strip():
        return "other"
    for cat, rx in _RULES:
        if rx.search(text):
            return cat
    return "other"


ROOFER_PRIORITY = {"solar", "roof"}


if __name__ == "__main__":
    # quick self-check
    tests = [
        ("Electrical Permit", "Auxiliary Power", "", "Install 7.4kW rooftop solar PV system", "solar"),
        ("Building Permit", "Repair", "", "Re-roof: remove and replace shingles", "roof"),
        ("Building Permit", "Addition", "", "Add 400sf bedroom", "addition"),
        ("Mechanical Permit", "Change Out", "", "Replace HVAC condenser", "hvac"),
        ("Building Permit", "New", "", "New single family residence", "new_build"),
        ("Plumbing Permit", "None", "", "Replace water heater", "plumbing"),
        ("Building Permit", "Repair", "", "Install standing-seam METAL roof", "roof"),
        ("Building Permit", "Repair", "", "Replace 12 windows", "window"),
        ("Building Permit", "Repair", "", "Gutter and downspout replacement", "gutter"),
        ("Building Permit", "Repair", "", "New privacy fence", "fence"),
    ]
    for a, b, c, d, want in tests:
        got = categorize(a, b, c, d)
        print(f"{'OK ' if got == want else 'FAIL'} {got:10} <- {d!r}")
