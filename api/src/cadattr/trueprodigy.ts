import type { CadAttrResult } from "./provider.js";

// True Prodigy (Harris Govern CAMA) public API -- the free door to beds/baths/
// improvements for counties on this system that publish NO usable bulk file
// (Tarrant). See DATA_HUNTING_PLAYBOOK.md "Per-system recipes #1" for the full
// recipe and the two auth gotchas this file depends on:
//   (1) the token is nested at user.token, and
//   (2) data endpoints want the RAW token in Authorization -- NO "Bearer " prefix
//       ("Bearer <token>" returns HTTP 500, which once hid the entire dataset).
// Verified live 2026-07-15: Tarrant pid 16497 -> 3bd/2ba ("Rooms: Bedrooms 3"),
// Ellis pid 300915 -> 4bd/3ba ("Number of Bedrooms: FOUR BEDROOM"). Districts
// phrase room counts differently, so the parser reads digit AND word forms.

const BASE = "https://prod-container.trueprodigyapi.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const TOKEN_TTL_MS = 4 * 60 * 1000; // tokens live ~5 min; refresh a minute early.
const REQ_TIMEOUT_MS = 15_000;

// We resolve by pid only. The pid (numeric True Prodigy Property ID == TAD's
// Account_Num) is the one reliable search key: TP's geoID-search backend errors
// ("Can't connect to MySQL ... trueprodigy-scaler"), and our hyphenated geoID
// (250-3-14) isn't accepted there anyway. The caller passes this pid from
// parcels.apn, populated from the TAD PropertyData file's Account_Num column
// (crosswalked to our source_property_id via GIS_Link). Verified 2026-07-15:
// GIS_Link 250-3-14 -> Account_Num 16497 -> pid 16497 -> account 708 -> 3bd/2ba.
const SEARCH_FIELDS = ["pid"] as const;

interface CachedToken {
    token: string;
    at: number;
}

async function tpFetch(url: string, token: string | null, body?: unknown): Promise<unknown> {
    const res = await fetch(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
            "User-Agent": UA,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: token } : {}), // RAW token -- never "Bearer "
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(REQ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`True Prodigy ${res.status} ${res.statusText} for ${url}`);
    return res.json();
}

// Pull the trailing count off a feature string ("Rooms: Bedrooms 3" -> 3).
// Fractional segments ("0.4539") are returned as-is and summed by the caller.
function trailingNumber(s: string): number {
    const m = /(-?\d+(?:\.\d+)?)\s*$/.exec(s.trim());
    if (!m) return 0;
    const n = parseFloat(m[1]!);
    return Number.isFinite(n) ? n : 0;
}

// Some districts spell the count as a word ("Number of Bedrooms: FOUR BEDROOM",
// "Plumbing: THREE BATH" -- Ellis) rather than a digit (Tarrant's "Rooms:
// Bedrooms 3"). Map the number words we expect on a room feature.
const WORD_NUMBERS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20,
};

// The room count on a feature string, whether written as a digit or a word.
function roomCount(s: string): number {
    const digit = trailingNumber(s);
    if (digit > 0) return digit;
    for (const w of s.toLowerCase().split(/[^a-z]+/)) {
        const n = WORD_NUMBERS[w];
        if (n !== undefined) return n;
    }
    return 0;
}

function toIntInRange(v: unknown, lo: number, hi: number): number | null {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").trim());
    if (!Number.isFinite(n)) return null;
    const r = Math.round(n);
    return r >= lo && r <= hi ? r : null;
}

export class TrueProdigyClient {
    // One cached token per office (Tarrant, and any other TP county we add).
    private tokens = new Map<string, CachedToken>();

    private async token(office: string): Promise<string> {
        const cached = this.tokens.get(office);
        if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
        const body = (await tpFetch(`${BASE}/trueprodigy/cadpublic/auth/token`, null, {
            office,
        })) as { user?: { token?: string } };
        const token = body.user?.token;
        if (!token) throw new Error("True Prodigy: no token in auth response");
        this.tokens.set(office, { token, at: Date.now() });
        return token;
    }

    private async findAccountId(token: string, propId: string): Promise<number | null> {
        // propId is the numeric TP pid (TAD Account_Num). Strip any stray float
        // artifact ("16497.0") defensively, and try the bare form first.
        const raw = propId.trim();
        const stripped = raw.replace(/\.0+$/, "");
        const candidates = stripped === raw ? [raw] : [stripped, raw];
        for (const text of candidates) {
            for (const field of SEARCH_FIELDS) {
                const url =
                    `${BASE}/public/property/search?page=1&pageSize=1` +
                    `&searchField=${field}&searchText=${encodeURIComponent(text)}`;
                try {
                    const body = (await tpFetch(url, token, {})) as {
                        results?: Array<{ pAccountID?: number | null }>;
                    };
                    const acct = body.results?.[0]?.pAccountID;
                    if (acct !== undefined && acct !== null) return acct;
                } catch {
                    // try the next field / candidate
                }
            }
        }
        return null;
    }

    /** Beds/baths/sqft/year + raw improvement labels for one parcel, or null if
     *  the property can't be resolved / has no improvement record. */
    async fetchAttrs(office: string, propId: string): Promise<CadAttrResult | null> {
        const token = await this.token(office);
        const accountId = await this.findAccountId(token, propId);
        if (accountId === null) return null;

        const impResp = (await tpFetch(
            `${BASE}/public/propertyaccount/${accountId}/improvement`,
            token
        )) as {
            results?: Array<{
                pImprovementID?: number;
                imprvDescription?: string;
                livingArea?: string | number;
                details?: Array<{
                    imprvDetailType?: string;
                    detailTypeDescription?: string;
                    actualYearBuilt?: string | number;
                }>;
            }>;
        };
        const improvements = impResp.results ?? [];

        let beds = 0;
        let bathWhole = 0; // full baths: "Bathrooms 2", "THREE BATH" (may be fractional)
        let bathHalf = 0; // explicit "half bath" features, if a district lists them
        let sqft: number | null = null;
        let year: number | null = null;
        const rawLabels = new Set<string>();

        for (const imp of improvements) {
            if (imp.imprvDescription) rawLabels.add(imp.imprvDescription);
            if (sqft === null) sqft = toIntInRange(imp.livingArea, 1, 2_000_000);
            for (const d of imp.details ?? []) {
                const label = d.detailTypeDescription ?? d.imprvDetailType;
                if (label) rawLabels.add(label);
                if (year === null) year = toIntInRange(d.actualYearBuilt, 1800, 2100);
            }

            if (imp.pImprovementID === undefined) continue;
            // Room counts live in the improvement's features. Districts phrase them
            // differently -- "Rooms: Bedrooms 3" (Tarrant, digit) vs "Number of
            // Bedrooms: FOUR BEDROOM" / "Plumbing: THREE BATH" (Ellis, word) -- so
            // match on the keyword and read the count as a digit OR a number word.
            try {
                const feat = (await tpFetch(
                    `${BASE}/public/propertyaccount/improvement/${imp.pImprovementID}/features`,
                    token
                )) as { results?: Array<{ features?: string[] }> };
                for (const row of feat.results ?? []) {
                    for (const f of row.features ?? []) {
                        rawLabels.add(f);
                        const lf = f.toLowerCase();
                        if (lf.includes("bedroom")) {
                            beds += roomCount(f);
                        } else if (lf.includes("bath")) {
                            if (lf.includes("half")) bathHalf += roomCount(f) || 1;
                            else bathWhole += roomCount(f);
                        }
                    }
                }
            } catch {
                // one improvement's features failing shouldn't sink the whole fetch
            }
        }

        const bedrooms = beds > 0 ? Math.round(beds) : null;
        // +epsilon guards float drift (fractional segments summing to e.g. 1.9999).
        const bathsFull = bathWhole > 0 ? Math.floor(bathWhole + 1e-6) : null;
        // Half baths: explicit "half bath" features win; otherwise a .5+ remainder
        // on the whole count (e.g. "Bathrooms 2.5") implies one half bath.
        const fractionalHalf = bathWhole > 0 && bathWhole % 1 >= 0.5 ? 1 : 0;
        const bathsHalf =
            bathHalf > 0 ? Math.round(bathHalf) : fractionalHalf > 0 ? fractionalHalf : null;

        return {
            bedrooms,
            bathsFull,
            bathsHalf,
            livingAreaSqft: sqft,
            yearBuilt: year,
            improvements: [...rawLabels],
        };
    }
}
