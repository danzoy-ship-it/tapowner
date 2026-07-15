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

// Districts write room counts in several shapes on a feature string, e.g.
// Tarrant "Rooms: Bedrooms 3" (trailing digit), Ellis "Number of Bedrooms: FOUR
// BEDROOM" (spelled word) and "Plumbing: TWO 1/2 BATH" (word + "1/2" fraction).
// Some rows also carry uninterpreted digit CODES ("Number of Bedrooms: 91",
// "Plumbing: 40") that are NOT real counts -- those are rejected by `max`.
const WORD_NUMBERS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20,
};

// The room count on a feature string -- a digit ("3", "2.5"), a spelled word
// ("FOUR"), and/or a fraction ("1/2" -> 0.5), summed (so "TWO 1/2" -> 2.5).
// Returns 0 when nothing plausible is found or the value exceeds `max` (a code,
// not a count), so an unreadable/oddly-coded row leaves the field blank rather
// than recording garbage (e.g. "Number of Bedrooms: 91").
function roomCount(s: string, max: number): number {
    let str = s.toLowerCase();
    let frac = 0;
    const fm = /(\d+)\s*\/\s*(\d+)/.exec(str);
    if (fm) {
        const a = parseInt(fm[1]!, 10);
        const b = parseInt(fm[2]!, 10);
        if (b > 0 && a < b) frac = a / b;
        str = str.replace(fm[0], " "); // drop the fraction so it isn't re-read as a whole
    }
    let whole = 0;
    const dm = /\d+(?:\.\d+)?/.exec(str);
    if (dm) {
        whole = parseFloat(dm[0]);
    } else {
        for (const w of str.split(/[^a-z]+/)) {
            const n = WORD_NUMBERS[w];
            if (n !== undefined) {
                whole = n;
                break;
            }
        }
    }
    const total = whole + frac;
    return total > 0 && total <= max ? total : 0;
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
        let bathTotal = 0; // full+half baths summed: "Bathrooms 2", "TWO 1/2 BATH" -> 2.5
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
            // Room counts live in the improvement's features. Match on the keyword
            // ("bedroom"/"bath") and let roomCount read the count in whatever shape
            // the district uses (digit, spelled word, or "1/2" fraction).
            try {
                const feat = (await tpFetch(
                    `${BASE}/public/propertyaccount/improvement/${imp.pImprovementID}/features`,
                    token
                )) as { results?: Array<{ features?: string[] }> };
                for (const row of feat.results ?? []) {
                    for (const f of row.features ?? []) {
                        rawLabels.add(f);
                        const lf = f.toLowerCase();
                        // cap 20 rejects code rows ("Number of Bedrooms: 91");
                        // roomCount folds any "1/2" fraction into the bath total.
                        if (lf.includes("bedroom")) beds += roomCount(f, 20);
                        else if (lf.includes("bath")) bathTotal += roomCount(f, 20);
                    }
                }
            } catch {
                // one improvement's features failing shouldn't sink the whole fetch
            }
        }

        const bedrooms = beds > 0 ? Math.round(beds) : null;
        // +epsilon guards float drift; a >=.5 remainder (e.g. "TWO 1/2" -> 2.5) is
        // the half bath.
        const bathsFull = bathTotal > 0 ? Math.floor(bathTotal + 1e-6) : null;
        const bathsHalf = bathTotal > 0 && bathTotal % 1 >= 0.5 ? 1 : null;

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
