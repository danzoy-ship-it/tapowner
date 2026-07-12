"""
Statewide loader: runs load_county.py for every county in counties_2025.json.

NOT run automatically -- statewide StratMap data is likely 10-20GB in Postgres,
which will exceed a Railway trial's free credit. Get the Hobby plan ($5/mo+usage)
approved before running this against production (see PROGRESS.md cost note).

Usage:
    python load_all_counties.py --database-url "postgresql://..." [--start-after 48201]
"""

import argparse
import json
import subprocess
import sys
import time


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--database-url", required=True)
    ap.add_argument("--year", default="2025")
    ap.add_argument("--start-after", default=None, help="Skip counties up to and including this FIPS (resume support)")
    args = ap.parse_args()

    with open("counties_2025.json") as f:
        counties = json.load(f)

    skipping = args.start_after is not None
    for c in counties:
        if skipping:
            if c["fips"] == args.start_after:
                skipping = False
            continue

        print(f"\n=== {c['name']} ({c['fips']}) ===", flush=True)
        t0 = time.time()
        result = subprocess.run(
            [
                sys.executable, "load_county.py",
                "--fips", c["fips"],
                "--name", c["name"],
                "--database-url", args.database_url,
                "--year", args.year,
            ]
        )
        if result.returncode != 0:
            print(f"FAILED: {c['name']} ({c['fips']}) -- rerun with --start-after to resume before this county")
            sys.exit(1)
        print(f"  done in {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
