"""
Phase 6 bakeoff: same 100 addresses, BatchData V3 endpoint (returns up to 3
persons per property for the same per-match price as V1). Read
BATCHDATA_API_TOKEN from env, never hardcode.

Usage:
    BATCHDATA_API_TOKEN=... python skiptrace_bakeoff_batchdata_v3.py
"""

import json
import os
import re
import time

import requests

API_KEY = os.environ["BATCHDATA_API_TOKEN"]
ENDPOINT = "https://api.batchdata.com/api/v3/property/skip-trace"
BATCH_SIZE = 20
COST_PER_MATCH_USD = 0.07


def norm_key(street, zip5):
    street_norm = re.sub(r"\s+", " ", street).strip().upper()
    return (street_norm, zip5)


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

        data_items = body.get("result", {}).get("data", [])
        batch_meta = body.get("result", {}).get("meta", {}).get("results", {})

        by_address = {}
        for item in data_items:
            if item is None:
                continue  # V3 preserves positional null entries for no-match rows
            addr = (item.get("property") or {}).get("address") or {}
            key = norm_key(addr.get("street", ""), addr.get("zip", "")[:5])
            by_address[key] = item

        for row in batch:
            key = norm_key(row["situs_address"].split(",")[0], row["situs_zip"][:5])
            item = by_address.get(key)
            hit = item is not None and (item.get("meta") or {}).get("matched", False)
            persons = (item.get("persons") or []) if item else []

            all_phones = [p for person in persons for p in (person.get("phones") or [])]
            all_emails = [e for person in persons for e in (person.get("emails") or [])]
            returned_names = [(person.get("name") or {}).get("full") for person in persons]

            results.append(
                {
                    "id": row["id"],
                    "county": row["county_name"],
                    "expected_owner": row["owner_name"],
                    "returned_owners": returned_names,
                    "person_count": len(persons),
                    "hit": hit,
                    "phone_count": len(all_phones),
                    "email_count": len(all_emails),
                }
            )

        print(f"batch {batch_start//BATCH_SIZE + 1}: {batch_meta} ({elapsed_ms}ms)")
        time.sleep(1)

    with open("bakeoff_results_batchdata_v3.json", "w") as f:
        json.dump(results, f, indent=1)

    total = len(results)
    hits = sum(1 for r in results if r.get("hit"))
    phone_hits = sum(1 for r in results if r.get("phone_count", 0) > 0)
    email_hits = sum(1 for r in results if r.get("email_count", 0) > 0)
    multi_person_hits = sum(1 for r in results if r.get("person_count", 0) > 1)
    total_cost_usd = hits * COST_PER_MATCH_USD

    print("\n=== SUMMARY (V3) ===")
    print(f"Total addresses: {total}")
    print(f"Hit rate (any match): {hits}/{total} = {hits/total*100:.1f}%")
    print(f"Phone match rate: {phone_hits}/{total} = {phone_hits/total*100:.1f}%")
    print(f"Email match rate: {email_hits}/{total} = {email_hits/total*100:.1f}%")
    print(f"Hits with >1 person returned: {multi_person_hits}/{hits} = {multi_person_hits/hits*100:.1f}%")
    print(f"Total cost: ${total_cost_usd:.2f} ({hits} matched hits @ ${COST_PER_MATCH_USD}/hit)")


if __name__ == "__main__":
    main()
