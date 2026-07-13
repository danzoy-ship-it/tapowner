import type { TraceInput, TraceProvider, TraceResult } from "./provider.js";

const ENDPOINT = "https://api.batchdata.com/api/v3/property/skip-trace";

// Real shape confirmed via the Phase 6 bakeoff (data/bakeoff_report_comparison.md),
// not guessed from docs alone. V3 returns up to 3 persons per property for the
// same per-match price as V1 -- using all of them (not just the first) is what
// gave the bakeoff's 90.3% multi-owner name-overlap result.
interface BatchDataV3Person {
    propertyOwner?: boolean;
    name?: { full?: string };
    phones?: Array<{
        number: string;
        type?: string;
        carrier?: string;
        dnc?: boolean;
        tcpa?: boolean;
        rank?: number;
        reachable?: boolean;
        tested?: boolean;
    }>;
    emails?: Array<{ email: string }>;
}

interface BatchDataV3DataItem {
    persons?: BatchDataV3Person[];
    meta?: { matched?: boolean };
}

interface BatchDataV3Response {
    result?: {
        data?: Array<BatchDataV3DataItem | null>;
    };
}

export class BatchDataProvider implements TraceProvider {
    constructor(private apiKey: string) {}

    async trace(input: TraceInput): Promise<TraceResult> {
        const res = await fetch(ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                requests: [
                    {
                        propertyAddress: {
                            street: input.situsAddress,
                            city: input.situsCity,
                            state: input.situsState,
                            zip: input.situsZip,
                        },
                    },
                ],
                options: { includeTCPABlacklistedPhones: true },
            }),
        });

        if (!res.ok) {
            throw new Error(`BatchData request failed: ${res.status}`);
        }

        const body = (await res.json()) as BatchDataV3Response;
        const item = body.result?.data?.[0];

        if (!item || !item.meta?.matched) {
            return { matched: false, ownerName: null, phones: [], emails: [], matchQuality: "no_match" };
        }

        const persons = item.persons ?? [];
        const phoneSeen = new Set<string>();
        const phones = persons
            .flatMap((p) => p.phones ?? [])
            .filter((p) => {
                if (phoneSeen.has(p.number)) return false;
                phoneSeen.add(p.number);
                return true;
            })
            .map((p) => ({
                number: p.number,
                type: p.type ?? "Unknown",
                ...(p.carrier ? { carrier: p.carrier } : {}),
                dnc: p.dnc ?? false,
                tcpa: p.tcpa ?? false,
                ...(p.rank !== undefined ? { rank: p.rank } : {}),
                ...(p.reachable !== undefined ? { reachable: p.reachable } : {}),
                ...(p.tested !== undefined ? { tested: p.tested } : {}),
            }))
            // Best numbers first: vendor-verified reachable ones, then by the
            // vendor's own rank, mobile over landline as the tiebreak.
            .sort((a, b) => {
                const reachA = a.reachable === true ? 0 : 1;
                const reachB = b.reachable === true ? 0 : 1;
                if (reachA !== reachB) return reachA - reachB;
                const rankA = a.rank ?? 99;
                const rankB = b.rank ?? 99;
                if (rankA !== rankB) return rankA - rankB;
                const mobA = a.type === "Mobile" ? 0 : 1;
                const mobB = b.type === "Mobile" ? 0 : 1;
                return mobA - mobB;
            });

        const emailSeen = new Set<string>();
        const emails = persons
            .flatMap((p) => p.emails ?? [])
            .filter((e) => {
                if (emailSeen.has(e.email)) return false;
                emailSeen.add(e.email);
                return true;
            })
            .map((e) => ({ email: e.email }));

        const ownerPerson = persons.find((p) => p.propertyOwner) ?? persons[0];

        return {
            matched: true,
            ownerName: ownerPerson?.name?.full ?? null,
            phones,
            emails,
            matchQuality: ownerPerson?.propertyOwner ? "owner_matched" : "associate_matched",
        };
    }
}
