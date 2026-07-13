"""
Phase 6 bakeoff: run 100 real Texas residential addresses (pulled from our
own loaded parcels) through Tracerfy's sync skip-trace endpoint, measure
match rate and real cost. Read TRACERFY_API_KEY from env, never hardcode.

Usage:
    TRACERFY_API_KEY=... python skiptrace_bakeoff_tracerfy.py
"""

import json
import os
import time

import requests

API_KEY = os.environ["TRACERFY_API_KEY"]
ENDPOINT = "https://tracerfy.com/v1/api/trace/lookup/"


def split_owner_name(owner_name):
    # CAD convention observed: "LASTNAME FIRST MIDDLE" (e.g. "DANZOY FREDERICK & MELISSA A")
    parts = owner_name.replace("&", " ").split()
    if not parts:
        return None, None
    last = parts[0]
    first = parts[1] if len(parts) > 1 else None
    return first, last


def main():
    with open("bakeoff_100_addresses.json") as f:
        addresses = json.load(f)

    results = []
    for i, row in enumerate(addresses):
        first, last = split_owner_name(row["owner_name"])
        payload = {
            "address": row["situs_address"].split(",")[0].strip(),
            "city": row["situs_city"],
            "state": row["situs_state"] or "TX",
            "zip": row["situs_zip"][:5],
        }
        if first:
            payload["first_name"] = first
        if last:
            payload["last_name"] = last

        t0 = time.time()
        try:
            resp = requests.post(
                ENDPOINT,
                headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
                json=payload,
                timeout=15,
            )
            elapsed_ms = round((time.time() - t0) * 1000)
            body = resp.json()
        except Exception as e:
            results.append({"id": row["id"], "county": row["county_name"], "error": str(e)})
            print(f"[{i+1}/100] {row['county_name']} ERROR: {e}")
            time.sleep(1)
            continue

        hit = body.get("hit", False)
        persons = body.get("persons", [])
        phones = persons[0].get("phones", []) if persons else []
        emails = persons[0].get("emails", []) if persons else []
        returned_name = persons[0].get("full_name") if persons else None

        result = {
            "id": row["id"],
            "county": row["county_name"],
            "expected_owner": row["owner_name"],
            "returned_owner": returned_name,
            "hit": hit,
            "phone_count": len(phones),
            "email_count": len(emails),
            "credits_deducted": body.get("credits_deducted", 0),
            "elapsed_ms": elapsed_ms,
            "http_status": resp.status_code,
        }
        results.append(result)
        print(
            f"[{i+1}/100] {row['county_name']:8s} hit={hit} phones={len(phones)} "
            f"emails={len(emails)} credits={result['credits_deducted']} ({elapsed_ms}ms)"
        )

        time.sleep(1)  # conservative rate limiting

    with open("bakeoff_results_tracerfy.json", "w") as f:
        json.dump(results, f, indent=1)

    total = len(results)
    hits = sum(1 for r in results if r.get("hit"))
    phone_hits = sum(1 for r in results if r.get("phone_count", 0) > 0)
    total_credits = sum(r.get("credits_deducted", 0) for r in results)
    total_cost_usd = total_credits * 0.02

    print("\n=== SUMMARY ===")
    print(f"Total addresses: {total}")
    print(f"Hit rate (any match): {hits}/{total} = {hits/total*100:.1f}%")
    print(f"Phone match rate: {phone_hits}/{total} = {phone_hits/total*100:.1f}%")
    print(f"Total credits used: {total_credits} (${total_cost_usd:.2f})")
    print(f"Cost per address: ${total_cost_usd/total:.4f}")
    print(f"Cost per phone-match: ${total_cost_usd/phone_hits:.4f}" if phone_hits else "N/A")


if __name__ == "__main__":
    main()
