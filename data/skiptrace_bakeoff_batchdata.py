"""
Phase 6 bakeoff: same 100 addresses used for the Tracerfy test, run through
BatchData's real API (not sandbox -- sandbox returns mock data, confirmed by
Frederick). Read BATCHDATA_API_TOKEN from env, never hardcode.

Usage:
    BATCHDATA_API_TOKEN=... python skiptrace_bakeoff_batchdata.py
"""

import json
import os
import re
import time

import requests


def norm_key(street, zip5):
    # Source data has stray double-spaces (e.g. "318  MASON ST") from the
    # original CAD formatting; BatchData's echoed address collapses to single
    # spaces. Normalize both sides the same way before comparing.
    street_norm = re.sub(r"\s+", " ", street).strip().upper()
    return (street_norm, zip5)

API_KEY = os.environ["BATCHDATA_API_TOKEN"]
ENDPOINT = "https://api.batchdata.com/api/v1/property/skip-trace"
BATCH_SIZE = 20
COST_PER_MATCH_USD = 0.07  # confirmed via real account balance diff (see PROGRESS.md)


def main():
    with open("bakeoff_100_addresses.json") as f:
        addresses = json.load(f)

    results = []
    for batch_start in range(0, len(addresses), BATCH_SIZE):
        batch = addresses[batch_start : batch_start + BATCH_SIZE]
        payload = {
            "requests": [
                {
                    "propertyAddress": {
                        "street": row["situs_address"].split(",")[0].strip(),
                        "city": row["situs_city"],
                        "state": row["situs_state"] or "TX",
                        "zip": row["situs_zip"][:5],
                    }
                }
                for row in batch
            ],
            "options": {"includeTCPABlacklistedPhones": True},
        }

        t0 = time.time()
        resp = requests.post(
            ENDPOINT,
            headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )
        elapsed_ms = round((time.time() - t0) * 1000)
        body = resp.json()

        persons = body.get("results", {}).get("persons", [])
        batch_meta = body.get("results", {}).get("meta", {}).get("results", {})

        # Match each returned person back to its request row by address (order
        # isn't guaranteed to be preserved for no-match entries).
        by_address = {}
        for p in persons:
            addr = p.get("propertyAddress", {})
            key = norm_key(addr.get("street", ""), addr.get("zip", "")[:5])
            by_address[key] = p

        for row in batch:
            key = norm_key(row["situs_address"].split(",")[0], row["situs_zip"][:5])
            person = by_address.get(key)
            hit = person is not None and person.get("meta", {}).get("matched", False)
            phones = person.get("phoneNumbers", []) if person else []
            emails = person.get("emails", []) if person else []
            returned_name = person.get("name", {}).get("full") if person else None

            results.append(
                {
                    "id": row["id"],
                    "county": row["county_name"],
                    "expected_owner": row["owner_name"],
                    "returned_owner": returned_name,
                    "hit": hit,
                    "phone_count": len(phones),
                    "email_count": len(emails),
                }
            )

        print(
            f"batch {batch_start//BATCH_SIZE + 1}: {batch_meta} ({elapsed_ms}ms)"
        )
        time.sleep(1)

    with open("bakeoff_results_batchdata.json", "w") as f:
        json.dump(results, f, indent=1)

    total = len(results)
    hits = sum(1 for r in results if r.get("hit"))
    phone_hits = sum(1 for r in results if r.get("phone_count", 0) > 0)
    total_cost_usd = hits * COST_PER_MATCH_USD

    print("\n=== SUMMARY ===")
    print(f"Total addresses: {total}")
    print(f"Hit rate (any match): {hits}/{total} = {hits/total*100:.1f}%")
    print(f"Phone match rate: {phone_hits}/{total} = {phone_hits/total*100:.1f}%")
    print(f"Total cost: ${total_cost_usd:.2f} ({hits} matched hits @ ${COST_PER_MATCH_USD}/hit)")
    print(f"Cost per address: ${total_cost_usd/total:.4f}")
    print(f"Cost per phone-match: ${total_cost_usd/phone_hits:.4f}" if phone_hits else "N/A")


if __name__ == "__main__":
    main()
