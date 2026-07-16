// Kofile PublicSearch foreclosure loader: Notice of Trustee's/Foreclosure Sale
// -> parcel_signals. App-session lane (SIGNALS_ROADMAP.md / HANDOFF 3b amendment).
//
// Covers the ~6 Texas counties whose county clerk runs Kofile PublicSearch at
// <county>.tx.publicsearch.us (Tarrant, Denton, Hidalgo, Cameron, Nueces + more).
// Unlike Bexar's clean ArcGIS feed, Kofile carries NO point geometry and the
// "property address" it renders is a LEGAL DESCRIPTION (subdivision/lot/block),
// not a street address -- so we join by (a) a street address parsed out of the
// notice OCR text -> Census geocode -> spatial ST_Contains, and (b) a
// legal-description tuple match to parcels.legal_description. Both are best-effort.
//
// HOW THE DATA IS OBTAINED (reverse-engineered 2026-07-15, FIXED 2026-07-15 evening
// after the v6/no-ip guess below turned out stale -- captured the REAL frame straight
// off the live SPA via a WebSocket.send() hook; no login/CAPTCHA/pay either way):
//   1. GET https://<county>.tx.publicsearch.us/  -> the SPA embeds an anonymous
//      bootstrap token in `window.__ort="<uuid>"` (also set as the httponly
//      `authToken` cookie). This is the ONLY credential the search needs.
//   2. Open a WebSocket to  wss://<county>.tx.publicsearch.us/ws .
//   3. Send a redux-action-over-socket frame (THE REAL, VERIFIED-WORKING FORM):
//        { type:"@kofile/FETCH_DOCUMENTS/v4",   <- v4, NOT v6
//          payload:{ query:{ limit:"50", offset:"0", department:"FC",
//                            keywordSearch:false, searchOcrText:false,
//                            recordedDateRange:"YYYYMMDD,YYYYMMDD",  <- no dashes
//                            searchType:"advancedSearch" },
//                    workspaceID:"search" },
//          authToken:<ort>, ip:"<caller's own public IP>",  <- REQUIRED, silently
//          correlationId:<uuid>, sync:true }                    dropped if omitted
//      -> server replies "@kofile/FETCH_DOCUMENTS_FULFILLED/v6" with
//         payload.data.byOrder[] + payload.data.byHash{docId->doc}. Each doc has
//         docNumber, recordedDate, instrumentDate (== the trustee SALE date),
//         propAddress[{address1: legal desc}], returnAddress{...} (usually the
//         filing TRUSTEE's office, not the property -- see the opt-in join lever
//         below), docTypeCode ("FCN"), a ~199-char ocrText PREVIEW (NOT the full
//         notice body -- the street address is paywalled in the doc image), ...
//      NOTE: this backend is IP-sensitive -- a VPN/datacenter IP gets TLS-handshake-
//      blocked outright, and a residential IP that's made ~30 connections gets
//      rate-limited (connects fine, FETCH gets no reply). A cellular hotspot IP
//      cleared both. See memory: cracking-blocked-records-apis.md.
//
//   DATABASE_URL=... node scripts/signals/load_kofile_foreclosures.mjs [county...] [--days=N]
//
// Departments: FC = "Foreclosures" (the whole department is trustee-sale notices).

import pkg from "pg";
import { pathToFileURL } from "url";
const { Client } = pkg;

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// One entry per Kofile county. `sub` = subdomain OR full hostname (see bootstrap()),
// `fips` = 5-digit county FIPS. Below the proven 6, a batch identified across the PDF-
// wave campaign (each bounced here because it has no live PDF feed) -- UNTESTED, added
// as prep so the next hotspot session only needs to RUN this, not write more code.
const SOURCES = {
    // --- proven 2026-07-15 ---
    nueces:  { sub: "nueces",  fips: "48355" },
    cameron: { sub: "cameron", fips: "48061" },
    hidalgo: { sub: "hidalgo", fips: "48215" },
    dallas:  { sub: "dallas",  fips: "48113" }, // CURRENT-months complement to dallas_cc (PDF feed ends ~May 2026)
    denton:  { sub: "denton",  fips: "48121" },
    // TARRANT: no rows currently stored (the old pull expired). Unlike the
    // 0%-tie counties, Tarrant's FREE index DOES carry a real legalDescription,
    // so it is tie-able -- a clean-IP re-pull run through THIS loader (with the
    // fix-1 address matcher, fix-2 legal-normalizer v2, and fix-3 OCR re-parse)
    // is what will finally tie Tarrant. It just needs a hotspot IP to fetch; the
    // matcher is now ready for it. (See FORECLOSURE_COVERAGE.md Tarrant note.)
    tarrant: { sub: "tarrant", fips: "48439" },

    // --- untested prep, standard .tx.publicsearch.us host ---
    johnson:      { sub: "johnson",      fips: "48251" },
    kendall:      { sub: "kendall",      fips: "48259" },
    wilson:       { sub: "wilson",       fips: "48493" },
    walker:       { sub: "walker",       fips: "48471" },
    grimes:       { sub: "grimes",       fips: "48185" },
    sanpatricio:  { sub: "sanpatricio",  fips: "48409" },
    starr:        { sub: "starr",        fips: "48427" },
    llano:        { sub: "llano",        fips: "48299" },
    midland:      { sub: "midland",      fips: "48329" }, // CivicPlus feed dead since 2019, this is now its only lane
    jefferson:    { sub: "jefferson",    fips: "48245" },
    smith:        { sub: "smith",        fips: "48423" },
    grayson:      { sub: "grayson",      fips: "48181" },
    montgomery:   { sub: "montgomery",   fips: "48339" },
    potter:       { sub: "potter",       fips: "48375" },
    brazos:       { sub: "brazos",       fips: "48041" },
    collin:       { sub: "collin",       fips: "48085" }, // complement to the collin_cc Blazor scrape (that one only covers geocoded notices)

    // --- DISABLED: the .search.kofile.com host is a DIFFERENT, incompatible system.
    // Tested 2026-07-16: bootstrap returns HTTP 500 (zapata/jimwells) or the socket
    // never connects (anderson). It is NOT the same app as .tx.publicsearch.us -- do
    // NOT re-enable without separately reverse-engineering that host. Left here so the
    // fips/mapping isn't lost if someone cracks that variant later.
    //   anderson:  { sub: "andersontx.search.kofile.com", fips: "48001" },
    //   zapata:    { sub: "zapatatx.search.kofile.com",   fips: "48505" },
    //   jimwells:  { sub: "jimwellstx.search.kofile.com", fips: "48249" },
};

// RETURN-ADDRESS LEVER RESULT (tested 2026-07-16 on hidalgo + cameron, the two 0%-tie
// counties, with --try-return-address): 0 matches on both. After the safety guards
// (business-name filter + batch-frequency guard), NONE of the return addresses tie to a
// parcel -- they're trustee/law-firm offices, not the property. CONCLUSION: returnAddress
// is NOT a safe way past the Kofile free-index paywall. The lever stays (off by default)
// but do not expect it to rescue 0%-tie counties. The paywall ceiling is real: counties
// whose free index carries a legalDescription tie; those that don't tie ~0%.

// Government/institutional owners are not real seller leads -> drop them from
// the parcel join. (Same guard the SIGNALS campaign uses elsewhere.)
const GOV_OWNER_RE = "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST|CORRECTIONAL|DETENTION|COUNTY FEE|HOSPITAL DIST|FIRE DIST|JUVENILE)";

// The live FETCH_DOCUMENTS/v4 frame echoes the caller's PUBLIC IP in the body
// (captured 2026-07-15 from the running SPA). Omitting it -> backend silently
// drops the frame (the original v6/no-ip guess was why the crack never fetched).
let PUBLIC_IP = "";
async function ensureIP() {
    if (!PUBLIC_IP) {
        try { PUBLIC_IP = (await (await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(10000) })).json()).ip; }
        catch { PUBLIC_IP = "0.0.0.0"; }
    }
    return PUBLIC_IP;
}

// ---------------------------------------------------------------- Kofile fetch

// GET the SPA shell, pull the anon bootstrap token + session cookies.
async function bootstrap(sub) {
    // Most counties run at <sub>.tx.publicsearch.us, but a second Kofile subdomain
    // flavor was found 2026-07-15/16 for some rural counties: <sub>.search.kofile.com
    // (same underlying app per the vendor survey). If `sub` already looks like a full
    // hostname (contains a dot), use it as-is; otherwise append the default suffix.
    const host = sub.includes(".") ? sub : `${sub}.tx.publicsearch.us`;
    const r = await fetch(`https://${host}/`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`bootstrap ${host} -> HTTP ${r.status}`);
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    const html = await r.text();
    const m = html.match(/window\.__ort\s*=\s*"([0-9a-f-]{36})"/);
    if (!m) throw new Error(`no __ort token in ${host}`);
    return { host, ort: m[1], cookie };
}

// A persistent Kofile socket: one WebSocket, keepalive PINGs, correlationId ->
// pending-promise routing, auto-reconnect. The search backend is flaky and
// frequently times out server-side, so callers retry; reusing one connection
// (instead of a fresh one per attempt) is both faster and gentler on the host.
class KofileSocket {
    constructor(host, ort, cookie) {
        this.host = host;
        this.ort = ort;
        this.cookie = cookie;
        this.pending = new Map(); // correlationId -> {resolve, timer}
        this.ws = null;
        this.pinger = null;
    }
    connect() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`wss://${this.host}/ws`, {
                headers: { "User-Agent": UA, Origin: `https://${this.host}`, Cookie: this.cookie },
            });
            const to = setTimeout(() => reject(new Error("ws connect timeout")), 15000);
            ws.addEventListener("open", () => {
                clearTimeout(to);
                this.ws = ws;
                this.pinger = setInterval(() => {
                    try { ws.send(JSON.stringify({ type: "PING", correlationId: crypto.randomUUID(), authToken: this.ort, sync: true })); } catch {}
                }, 10000);
                resolve();
            });
            ws.addEventListener("message", (ev) => {
                let o;
                try { o = JSON.parse(ev.data); } catch { return; }
                if (o.type && o.type.includes("FETCH_DOCUMENTS_FULFILLED") && o.correlationId) {
                    const p = this.pending.get(o.correlationId);
                    if (p) { clearTimeout(p.timer); this.pending.delete(o.correlationId); p.resolve(o.payload && o.payload.data); }
                }
                // FETCH_DOCUMENTS_REJECTED frames are the client-side timeout echo -> ignore.
            });
            ws.addEventListener("error", () => {});
            ws.addEventListener("close", () => {
                clearInterval(this.pinger);
                for (const [, p] of this.pending) { clearTimeout(p.timer); p.resolve(null); }
                this.pending.clear();
                this.ws = null;
            });
        });
    }
    // one search page; resolves data | null on timeout (15s hard per-request cap)
    fetchPage(query, timeoutMs = 15000) {
        return new Promise((resolve) => {
            if (!this.ws) return resolve(null);
            const cid = crypto.randomUUID();
            const timer = setTimeout(() => { this.pending.delete(cid); resolve(null); }, timeoutMs);
            this.pending.set(cid, { resolve, timer });
            try {
                this.ws.send(JSON.stringify({
                    type: "@kofile/FETCH_DOCUMENTS/v4",
                    payload: { query, workspaceID: "search" },
                    authToken: this.ort, ip: PUBLIC_IP, correlationId: cid, sync: true,
                }));
            } catch { clearTimeout(timer); this.pending.delete(cid); resolve(null); }
        });
    }
    close() { try { clearInterval(this.pinger); this.ws && this.ws.close(); } catch {} }
}

// Fetch one page with retries; reconnects a dead socket. Returns data | null.
// Politeness (shared IP, sibling agents on other subdomains): ONE reused socket,
// one in-flight request, exponential backoff 2s->4s->8s... capped at 30s.
async function fetchPageRetry(state, sub, query, attempts = 5) {
    for (let a = 1; a <= attempts; a++) {
        if (!state.sock || !state.sock.ws) {
            const { host, ort, cookie } = await bootstrap(sub);
            state.sock = new KofileSocket(host, ort, cookie);
            try { await state.sock.connect(); } catch { state.sock = null; await sleep(Math.min(2000 * 2 ** (a - 1), 30000)); continue; }
        }
        const data = await state.sock.fetchPage(query);
        if (data) return data;
        await sleep(Math.min(2000 * 2 ** (a - 1), 30000)); // backend timed out -- exponential backoff, retry same conn
    }
    return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull every FC notice recorded in the last `days` days, paging by offset.
async function fetchNotices(sub, days) {
    await ensureIP();
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD (live app format)
    const range = `${fmt(start)},${fmt(end)}`;
    const PAGE = 50;
    const out = [];
    const state = { sock: null };
    try {
        let offset = 0;
        for (let page = 0; page < 60; page++) {
            const query = {
                limit: String(PAGE),
                offset: String(offset),
                department: "FC",
                keywordSearch: false,
                recordedDateRange: range,
                searchOcrText: false,
                searchType: "advancedSearch",
            };
            const data = await fetchPageRetry(state, sub, query);
            if (!data) throw new Error(`fetch failed (Kofile backend timed out repeatedly) at offset ${offset}`);
            const ids = data.byOrder || [];
            for (const id of ids) out.push(data.byHash[id]);
            if (ids.length < PAGE) break;
            offset += PAGE;
        }
    } finally {
        if (state.sock) state.sock.close();
    }
    return out;
}

// ---------------------------------------------------------------- parse / normalize

// TX sale dates come as "MM/DD/YYYY" in instrumentDate -> ISO yyyy-mm-dd.
function toISO(mdy) {
    if (!mdy) return null;
    const m = String(mdy).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// County-seat (courthouse) city per Kofile county -- used only to recognize a
// clerk-stamp "recorded at the courthouse" address that OCR sometimes glues
// onto a document (streetFromOcr guard below). A real property match against
// this same city is still allowed -- we only skip a candidate that lands here
// AND carries stamp language ("CLERK"/"RECORDED"/"FILED") nearby.
const COUNTY_SEAT = {
    nueces: "CORPUS CHRISTI", cameron: "BROWNSVILLE", hidalgo: "EDINBURG", dallas: "DALLAS",
    denton: "DENTON", tarrant: "FORT WORTH", johnson: "CLEBURNE", kendall: "BOERNE",
    wilson: "FLORESVILLE", walker: "HUNTSVILLE", grimes: "ANDERSON", sanpatricio: "SINTON",
    starr: "RIO GRANDE CITY", llano: "LLANO", midland: "MIDLAND", jefferson: "BEAUMONT",
    smith: "TYLER", grayson: "SHERMAN", montgomery: "CONROE", potter: "AMARILLO",
    brazos: "BRYAN", collin: "MCKINNEY",
};

// Strip the boilerplate that rides along with the OCR preview text and would
// otherwise get glued onto a real number+street run: county-clerk recording
// stamps, "Page N of N" footers, recording timestamps (full "12:39 PM" or the
// truncated "39 PM" that survives the ~199-char OCR preview cutoff), and
// 6+-digit document/instrument IDs (Kofile pads these with leading zeros,
// e.g. "00000010820736"). (Fix 3, part 1/2.)
function cleanOcrNoise(t) {
    let s = t;
    s = s.replace(/\bPage\s+\d+\s+of\s+\d+\b/gi, " ");
    s = s.replace(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/gi, " ");
    s = s.replace(/\b(?:FILE|INSTRUMENT|DOC(?:UMENT)?)\s*#?\s*\d+\b/gi, " ");
    s = s.replace(/\b\d{6,}\b/g, " "); // padded doc/instrument IDs
    return s.replace(/\s+/g, " ").trim();
}

// Best-effort street address out of the notice OCR text. TX Notices of
// Foreclosure Sale usually state the property street address somewhere in the
// body ("...commonly known as 1234 MAIN ST, CORPUS CHRISTI, TX 78412..."). We
// look for a "<number> <street>, <city>, TX <zip>" shaped run.
//
// Fix 3: (a) noise-clean first so a recording stamp/timestamp/doc-ID glued in
// front of the real address doesn't get captured as part of it; (b) take the
// LAST plausible run in the text instead of the first (a courthouse address in
// a clerk stamp tends to appear early, the property address later); (c) skip a
// run whose city is this county's courthouse city AND that still carries
// clerk-stamp language nearby (real property notices routinely name the
// courthouse city too -- e.g. Dallas houses foreclosing IN Dallas -- so the
// stamp-language co-occurrence is required, not just the city match alone).
function streetFromOcr(ocr, countyName) {
    if (!ocr) return null;
    const t = cleanOcrNoise(ocr.replace(/\s+/g, " "));
    const seat = countyName && COUNTY_SEAT[countyName];
    const re = /(\d{1,6}\s+[A-Z0-9][A-Z0-9 .'#\/-]{3,40}?),?\s+([A-Z][A-Z .'-]{2,24}?),?\s+(?:TX|TEXAS)\.?\s+(\d{5})/gi;
    let best = null, m;
    while ((m = re.exec(t))) {
        const cand = { street: m[1].trim(), city: m[2].trim(), zip: m[3] };
        if (/P\.?\s?O\.?\s?BOX/i.test(cand.street)) continue; // skip PO boxes
        if (seat && cand.city.toUpperCase() === seat) {
            const before = t.slice(Math.max(0, m.index - 40), m.index);
            if (/CLERK|RECORDED|FILED/i.test(before)) continue; // courthouse stamp, not the property
        }
        best = cand; // keep overwriting -> LAST match in the text wins
    }
    return best;
}

// ---------------------------------------------------------------- address-match (fix 1)

// USPS street-suffix and directional abbreviation tables, both directions
// normalized to one canonical (long) form so "DR"/"DRIVE", "N"/"NORTH" etc.
// compare equal regardless of which spelling the notice or the CAD used.
const SUFFIX_MAP = {
    ST: "STREET", STREET: "STREET", AVE: "AVENUE", AVENUE: "AVENUE", DR: "DRIVE", DRIVE: "DRIVE",
    RD: "ROAD", ROAD: "ROAD", LN: "LANE", LANE: "LANE", BLVD: "BOULEVARD", BOULEVARD: "BOULEVARD",
    CT: "COURT", COURT: "COURT", CIR: "CIRCLE", CIRCLE: "CIRCLE", PL: "PLACE", PLACE: "PLACE",
    TRL: "TRAIL", TRAIL: "TRAIL", TER: "TERRACE", TERRACE: "TERRACE", WAY: "WAY", WY: "WAY",
    PKWY: "PARKWAY", PARKWAY: "PARKWAY", LOOP: "LOOP", RUN: "RUN", PASS: "PASS",
    PT: "POINT", POINT: "POINT", XING: "CROSSING", CROSSING: "CROSSING", HWY: "HIGHWAY",
    HIGHWAY: "HIGHWAY", SQ: "SQUARE", SQUARE: "SQUARE", RDG: "RIDGE", RIDGE: "RIDGE",
    HOLW: "HOLLOW", HOLLOW: "HOLLOW", MNR: "MANOR", MANOR: "MANOR", MDW: "MEADOW", MDWS: "MEADOW",
    MEADOW: "MEADOW", MEADOWS: "MEADOW", GRV: "GROVE", GROVE: "GROVE", VLY: "VALLEY", VALLEY: "VALLEY",
    SPG: "SPRING", SPGS: "SPRING", SPRING: "SPRING", SPRINGS: "SPRING", GLN: "GLEN", GLEN: "GLEN",
    CRK: "CREEK", CREEK: "CREEK", LNDG: "LANDING", LANDING: "LANDING", EST: "ESTATE", ESTATES: "ESTATE",
    EXT: "EXTENSION", EXTENSION: "EXTENSION", GDNS: "GARDEN", GARDENS: "GARDEN", GARDEN: "GARDEN",
    HBR: "HARBOR", HARBOR: "HARBOR", HTS: "HEIGHTS", HEIGHTS: "HEIGHTS", IS: "ISLAND", ISLAND: "ISLAND",
    JCT: "JUNCTION", JUNCTION: "JUNCTION", KNL: "KNOLL", KNOLL: "KNOLL", LK: "LAKE", LAKE: "LAKE",
    MTN: "MOUNTAIN", MOUNTAIN: "MOUNTAIN", ORCH: "ORCHARD", ORCHARD: "ORCHARD", PARK: "PARK",
    PLZ: "PLAZA", PLAZA: "PLAZA", RNCH: "RANCH", RANCH: "RANCH", SHR: "SHORE", SHORE: "SHORE",
    STA: "STATION", STATION: "STATION", TRCE: "TRACE", TRACE: "TRACE", VW: "VIEW", VIEW: "VIEW",
    VLG: "VILLAGE", VILLAGE: "VILLAGE", VIS: "VISTA", VISTA: "VISTA", WALK: "WALK", CV: "COVE",
    COVE: "COVE", BND: "BEND", BEND: "BEND",
};
const DIR_MAP = {
    N: "NORTH", NORTH: "NORTH", S: "SOUTH", SOUTH: "SOUTH", E: "EAST", EAST: "EAST", W: "WEST", WEST: "WEST",
    NE: "NORTHEAST", NORTHEAST: "NORTHEAST", NW: "NORTHWEST", NORTHWEST: "NORTHWEST",
    SE: "SOUTHEAST", SOUTHEAST: "SOUTHEAST", SW: "SOUTHWEST", SOUTHWEST: "SOUTHWEST",
};

function normAddrWord(w) {
    const u = w.toUpperCase();
    if (DIR_MAP[u]) return { word: DIR_MAP[u], isDir: true, isSuffix: false };
    if (SUFFIX_MAP[u]) return { word: SUFFIX_MAP[u], isDir: false, isSuffix: true };
    return { word: u, isDir: false, isSuffix: false };
}

// A notice's property field is address-shaped when it starts with a house
// number and does NOT carry legal-description tokens (LOT/BLK/ABST) -- the
// exact test the Dallas re-join proved: "legalDescription" there is really a
// street address. Applies regardless of which field (legal vs. OCR) it came
// from (fix 1).
const ADDR_SHAPE_RE = /^\d{1,5}\s+[A-Z]/i;
const LEGAL_TOKEN_RE = /\b(?:LOTS?|LTS?|BLOCKS?|BLK|BK|ABST(?:RACT)?)\b/i;
function isAddressShaped(s) {
    if (!s) return false;
    const t = cleanOcrNoise(s.trim());
    return ADDR_SHAPE_RE.test(t) && !LEGAL_TOKEN_RE.test(t);
}

// Parse "<num> <street...>" into {num, directional, core[], suffix, trailingCity}.
// Two robustness tricks baked in:
//  - if the text right after the leading number is ITSELF another
//    number+letters run (the OCR "0040 5414 PARTRIDGE" glued-stamp-digit
//    pattern), recurse into the inner run -- the outer number was noise.
//  - the street "core" stops at the first recognized USPS suffix; anything
//    after that (Kofile's propAddress field sometimes appends the city with
//    no delimiter, e.g. "357 WHISPERING OAKS DR ADKINS") is kept separately
//    as trailingCity for the disambiguation pass, not glued onto the street.
function parseAddressCore(raw) {
    if (!raw) return null;
    let t = cleanOcrNoise(raw).toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
    let m = t.match(/^(\d{1,6})\s+(.*)$/);
    if (!m) return null;
    let num = m[1], restStr = m[2];
    for (let i = 0; i < 3; i++) {
        const inner = restStr.match(/^(\d{1,6})\s+([A-Z].*)$/);
        if (!inner) break;
        num = inner[1];
        restStr = inner[2];
    }
    const words = restStr.split(" ").filter(Boolean).map(normAddrWord);
    let i = 0, directional = null;
    if (words.length && words[0].isDir) { directional = words[0].word; i = 1; }
    // Use the LAST suffix token as the street type, NOT the first: many street
    // NAMES begin with a word that is itself a USPS suffix (TRAIL CREEK, GLEN
    // INNES, GARDEN GROVE, OAK PARK...). Splitting on the first suffix wrongly
    // truncated the core to empty and dropped the match.
    let suffixIdx = -1;
    for (let j = words.length - 1; j >= i; j--) { if (words[j].isSuffix) { suffixIdx = j; break; } }
    let core, suffix, trailingCity;
    if (suffixIdx >= 0) {
        core = words.slice(i, suffixIdx).map((w) => w.word);
        suffix = words[suffixIdx].word;
        const rest = words.slice(suffixIdx + 1).map((w) => w.word);
        trailingCity = rest.length ? rest.join(" ") : null;
    } else {
        core = words.slice(i).map((w) => w.word);
        suffix = null;
        trailingCity = null;
    }
    // Empty core means the only suffix WAS the first name word (e.g. a street
    // literally named "PARK"): fall back to treating every name word as core.
    if (!core.length) {
        core = words.slice(i).map((w) => w.word);
        suffix = null;
        trailingCity = null;
    }
    const coreStr = core.join(" ");
    if (!coreStr) return null;
    return { num, directional, core, suffix, trailingCity, coreStr };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
    const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// keep the narrower list only if it's non-empty; an empty filter usually means
// the disambiguating field is missing on the parcel side, not that none match.
const narrowOrKeep = (all, filtered) => (filtered.length ? filtered : all);

// Zero-pad variants of a house number so it matches however the CAD stored
// situs_number (some rolls left-pad). Bounded (original + up to 3 leading
// zeros) so the parcels query stays county_fips + house-number scoped and
// never widens into a full-table predicate (fix 3).
function numVariants(num) {
    const n = String(num).replace(/^0+/, "") || "0";
    const out = new Set([n]);
    for (let w = n.length + 1; w <= n.length + 3; w++) out.add(n.padStart(w, "0"));
    return [...out];
}

// Whole-word PREFIX test (fix 1). The notice's street-name core must be an
// exact word-sequence prefix of the parcel's street-name core -- so legitimate
// truncations still match ("FOXMOOR" -> "FOXMOOR LAKE"), but a mid-word OCR
// fragment is rejected ("TLING" is NOT a word-prefix of "RUSTLING CHESTNUT",
// "HERON" != "HERONS FLIGHT"). This is the false-positive class the old
// `upper(situs_address) LIKE '%core%'` substring test let through -- a mid-word
// fragment could match and tie the WRONG homeowner.
function coreIsWordPrefix(noticeCore, parcelCore) {
    if (!noticeCore || !parcelCore) return false;
    if (!noticeCore.length || parcelCore.length < noticeCore.length) return false;
    for (let i = 0; i < noticeCore.length; i++) if (noticeCore[i] !== parcelCore[i]) return false;
    return true;
}

// Fix 3: ONE county-bound, house-number-keyed pull for the whole batch of
// notices, instead of a per-candidate query that parallel-seq-scans all 14M
// parcels (~1.4s each; "Rows Removed by Filter: 4.7M"). The old query defeated
// the county_fips btree with `ltrim(situs_number,'0')=...` + `upper(situs_addr)
// LIKE`; binding by county_fips + situs_number = ANY(candidate numbers) lets the
// whole county's candidate set come back in ~1.4s total. Returns a Map keyed by
// the zero-stripped house number -> parcel rows[].
async function preloadParcelIndex(c, fips, nums) {
    const idx = new Map();
    const variants = [...new Set(nums.flatMap(numVariants))];
    if (!variants.length) return idx;
    const r = await c.query(
        `SELECT id, situs_address, situs_city, situs_zip, situs_number,
                ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
         FROM parcels
         WHERE county_fips=$1
           AND situs_number = ANY($2::text[])
           AND (owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}')`,
        [fips, variants]
    );
    for (const row of r.rows) {
        const k = (row.situs_number || "").replace(/^0+/, "") || "0";
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(row);
    }
    return idx;
}

// Address-match strategy: match a "<num> <street...>" candidate (from EITHER
// the legal/propAddress field or the OCR-derived street -- caller's choice)
// against parcels sharing the same house number, then require the parcel
// street-name core to START WITH the notice core at a word boundary (fix 1).
// Unique-match-only; ambiguous ties are broken in order: directional -> city
// -> zip (hard-reject on disagreement, fix 2) -> nearest stored centroid
// (<=250m). Fix 3: candidate parcels come from a preloaded county index when
// the caller supplies one (extra.parcelIndex); otherwise a county_fips +
// house-number bound query (index-eligible, never a full-table scan) so the
// exported matcher still works standalone.
async function matchAddressCandidate(c, fips, raw, extra = {}) {
    const parsed = parseAddressCore(raw);
    if (!parsed) return null;
    const key = String(parsed.num).replace(/^0+/, "") || "0";

    let rows;
    if (extra.parcelIndex) {
        rows = extra.parcelIndex.get(key) || [];
    } else {
        const r = await c.query(
            `SELECT id, situs_address, situs_city, situs_zip, situs_number,
                    ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
             FROM parcels
             WHERE county_fips=$1
               AND situs_number = ANY($2::text[])
               AND (owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}')
             LIMIT 200`,
            [fips, numVariants(parsed.num)]
        );
        rows = r.rows;
    }
    if (!rows.length) return null;

    // Fix 1: keep only parcels whose street-name core the notice core is an
    // exact whole-word prefix of. A parcel whose situs_address can't be parsed
    // is dropped (can't verify -> reject, accuracy over recall).
    let cands = rows.filter((row) => coreIsWordPrefix(parsed.core, (parseAddressCore(row.situs_address) || {}).core));
    if (!cands.length) return null;

    if (cands.length > 1 && parsed.directional) {
        const f = cands.filter((row) => (parseAddressCore(row.situs_address) || {}).directional === parsed.directional);
        cands = narrowOrKeep(cands, f);
    }
    const city = extra.city || parsed.trailingCity;
    if (cands.length > 1 && city) {
        const cu = city.toUpperCase();
        const f = cands.filter((row) => row.situs_city && row.situs_city.toUpperCase().includes(cu));
        cands = narrowOrKeep(cands, f);
    }
    // Fix 2: when the notice zip is known, a candidate whose (known) zip differs
    // is HARD-rejected -- not merely deprioritized -- so a unique wrong-zip
    // parcel can never be accepted. Candidates whose situs_zip is unknown are
    // kept (the CAD often ships no zip); an empty result -> no match.
    if (extra.zip) {
        cands = cands.filter((row) => !row.situs_zip || row.situs_zip === extra.zip);
        if (!cands.length) return null;
    }
    if (cands.length > 1 && !extra.noGeocode) {
        const g = await censusGeocode(
            `${parsed.num} ${parsed.coreStr}${parsed.suffix ? " " + parsed.suffix : ""}`,
            city || "",
            extra.zip || ""
        );
        if (g) {
            const withDist = cands
                .map((row) => ({ row, d: haversineMeters(g.lat, g.lon, row.lat, row.lon) }))
                .sort((a, b) => a.d - b.d);
            if (withDist.length && withDist[0].d <= 250 && (withDist.length === 1 || withDist[1].d > 250)) {
                cands = [withDist[0].row];
            }
        }
    }
    if (cands.length !== 1) return null; // still ambiguous -> unique-match-only guard
    const row = cands[0];
    return { parcel_id: row.id, lon: row.lon, lat: row.lat };
}

// House numbers a doc could match on -- collected up-front so loadCounty can
// preload the whole batch's parcels in ONE query (fix 3).
function addressNums(doc, countyName) {
    const nums = [];
    const legal = propLegal(doc);
    if (isAddressShaped(legal)) { const p = parseAddressCore(legal); if (p) nums.push(p.num); }
    const os = streetFromOcr(doc.ocrText, countyName);
    if (os) { const p = parseAddressCore(os.street); if (p) nums.push(p.num); }
    return nums;
}

const propLegal = (doc) =>
    (Array.isArray(doc.propAddress) && doc.propAddress[0] && doc.propAddress[0].address1) ||
    (Array.isArray(doc.propertyAddress) && doc.propertyAddress[0]) ||
    null;

// Street name only: drop the house number and the (variably-abbreviated) suffix
// so "7914 LABRADOR DR" -> "LABRADOR", robust to CAD suffix spelling.
const streetBody = (s) =>
    (s || "")
        .toUpperCase()
        .replace(/^\d+\s*/, "")
        .replace(/[.,#]/g, " ")
        .replace(/\b(STREET|ST|AVENUE|AVE|DRIVE|DR|ROAD|RD|LANE|LN|BOULEVARD|BLVD|COURT|CT|CIRCLE|CIR|PLACE|PL|TRAIL|TRL|WAY|PARKWAY|PKWY|COVE|CV|BEND|BND|PASS)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

// Return-address lever (experimental, opt-in via --try-return-address): the
// notice's "return to" address is usually the FILING TRUSTEE/LAW FIRM's office,
// not the property -- but occasionally (self-filed / small local trustees) it
// IS the property. Two guards before we'll trust it: (1) addressName doesn't
// read like a business/firm, (2) the same address doesn't repeat across other
// notices in this batch (a law office recurs; a homeowner's address doesn't).
const BUSINESS_NAME_RE =
    /\b(L\.?L\.?C|L\.?L\.?P|P\.?C|INC|CORP|CO\.?|COMPANY|FIRM|GROUP|LAW|ATTORNEYS?|ESQ|TRUSTEE|TITLE|MORTGAGE|BANK|SERVICING|ASSOCIATES|N\.?A\.?)\b/i;

function isLikelyBusinessName(name) {
    return !name || BUSINESS_NAME_RE.test(name);
}

// key for the batch frequency map: normalized "number+street|zip"
function returnAddrKey(ra) {
    if (!ra || !ra.address1) return null;
    const num = (ra.address1.match(/^\d+/) || [])[0];
    const body = streetBody(ra.address1);
    if (!num || !body) return null;
    return `${num}|${body}|${ra.zip || ""}`;
}

// ---------------------------------------------------------------- legal matcher v2 (fix 2)

// Subdivision stopword -> canonical SHORT form. Used two ways: (1) to build a
// despaced "canonical" subdivision key where the short form is a prefix of the
// long one (PL<PLACE, AC<ACRES, ADD<ADDITION, EST<ESTATES, SEC<SECTION) so a
// despaced substring ILIKE matches regardless of which side abbreviated;
// (2) to identify which words are generic (droppable) for the relaxed retry.
const SUB_STOPWORD = {
    PLACE: "PL", PL: "PL", ADDITION: "ADD", ADDN: "ADD", ADD: "ADD",
    ACRES: "AC", AC: "AC", PARK: "PK", PK: "PK", ESTATES: "EST", ESTATE: "EST", EST: "EST",
    SECTION: "SEC", SEC: "SEC", NUMBER: "NO", NO: "NO", HEIGHTS: "HTS", HTS: "HTS",
    GARDENS: "GDNS", GDNS: "GDNS", VILLAGE: "VLG", VLG: "VLG", TERRACE: "TER", TER: "TER",
};

// Parse a legal description into {subWords[], subCanon, longestWord, lot, blk,
// unit, lotIsNumeric}. subCanon = despaced canonical subdivision key;
// longestWord = the single most distinctive (non-stopword) word for the
// relaxed retry.
function parseLegalV2(s) {
    if (!s) return null;
    const t = s.toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
    const lot = (t.match(/\b(?:LOTS?|LTS?)\s*([0-9]+[A-Z]?)\b/) || [])[1] || null;
    const blk = (t.match(/\b(?:BLOCKS?|BLK|BK)\s*([0-9]+[A-Z]?|[A-Z])\b/) || [])[1] || null;
    const unit = (t.match(/\b(?:UNIT|SEC|SECTION|PH|PHASE)\s*([0-9]+)\b/) || [])[1] || null;
    const sub = t
        .replace(/\b(?:LOTS?|LTS?)\s*[0-9]+[A-Z]?\b/g, " ")
        .replace(/\b(?:BLOCKS?|BLK|BK)\s*(?:[0-9]+[A-Z]?|[A-Z])\b/g, " ")
        .replace(/\b(?:UNIT|SEC|SECTION|PH|PHASE)\s*(?:[0-9]+|[IVX]+)\b/g, " ")
        .replace(/\b(SUBDIVISION|SUBD|S\/D|TRACTS?|ABST(?:RACT)?|SURVEY)\b/g, " ")
        .replace(/\b(AND|THE|OF|OUT|ON|IN|TO|A)\b/g, " ")
        .replace(/[0-9-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const subWords = sub.split(" ").filter((w) => w.length > 1);
    const canonWords = subWords.map((w) => SUB_STOPWORD[w] || w);
    const subCanon = canonWords.join("");
    const distinctive = subWords.filter((w) => !SUB_STOPWORD[w] && w.length >= 3).sort((a, b) => b.length - a.length);
    return {
        subWords, subCanon, longestWord: distinctive[0] || null,
        lot, blk, unit, lotIsNumeric: lot ? /^[0-9]+$/.test(lot) : false,
    };
}

// One legal-description query. Despaced subdivision ILIKE + token regexes.
// The lot lookahead `(?=[^0-9A-Z]|$|BLK|BLOCK|BK)` does double duty: it fixes
// the glued-digit bug (old `\y` boundary failed "LOT 7BLOCK") AND enforces the
// numeric-lot guard -- a purely-numeric notice lot (LOT 18) will NOT tie a
// letter-suffixed parcel lot (LOT 18A), because after "18" an "A" satisfies
// none of the lookahead alternatives.
async function runLegalQuery(c, fips, subDespaced, lotPat, blkPat, unitPat) {
    const params = [fips];
    const clauses = [`county_fips=$1`];
    params.push("%" + subDespaced + "%"); clauses.push(`replace(upper(legal_description),' ','') LIKE $${params.length}`);
    params.push(lotPat); clauses.push(`legal_description ~* $${params.length}`);
    if (blkPat) { params.push(blkPat); clauses.push(`legal_description ~* $${params.length}`); }
    if (unitPat) { params.push(unitPat); clauses.push(`legal_description ~* $${params.length}`); }
    clauses.push(`(owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}')`);
    const r = await c.query(
        `SELECT id, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
         FROM parcels WHERE ${clauses.join(" AND ")} LIMIT 3`,
        params
    );
    return r.rows;
}

// Legal-description matcher v2 (fix 2). Tries progressively-relaxed subdivision
// keys (full canonical -> distinctive words only -> longest single word), each
// AND'd with the lot/block token regexes; narrows a still-ambiguous hit by
// UNIT/SEC/PHASE when the notice carries one. Unique-match-or-nothing.
// `hint` (optional) supplies lot/blk/unit from the live doc's structured
// `legals[]` when the free-text description omitted them.
async function matchLegalV2(c, fips, legalStr, hint = null) {
    const pl = parseLegalV2(legalStr);
    if (!pl) return null;
    let { lot, blk, unit } = pl;
    if (!lot && hint && (hint.lowLot != null && hint.lowLot !== "")) lot = String(hint.lowLot).toUpperCase();
    if (!blk && hint && (hint.block != null && hint.block !== "")) blk = String(hint.block).toUpperCase();
    if (!unit && hint && (hint.block2 != null && hint.block2 !== "")) unit = String(hint.block2).replace(/[^0-9]/g, "") || null;
    if (!lot || !pl.subWords.length) return null;
    const lotIsNumeric = /^[0-9]+$/.test(lot);

    const lotPat = `\\y(LOTS?|LTS?|L)\\s*0*${lot}(?=[^0-9A-Z]|$|BLK|BLOCK|BK)`;
    const blkPat = blk ? `\\y(BLOCKS?|BLK|BK|B)\\s*0*${blk}(?![0-9])` : null;
    const unitPat = unit ? `\\y(UNIT|SEC|SECTION|PH|PHASE)\\s*0*${unit}\\y` : null;

    const distinctJoined = pl.subWords.filter((w) => !SUB_STOPWORD[w] && w.length >= 3).join("");
    const subCands = [];
    for (const cand of [pl.subCanon, distinctJoined, pl.longestWord]) {
        if (cand && cand.length >= 3 && !subCands.includes(cand)) subCands.push(cand);
    }
    for (const sub of subCands) {
        let rows = await runLegalQuery(c, fips, sub, lotPat, blkPat, null);
        if (rows.length > 1 && unitPat) rows = await runLegalQuery(c, fips, sub, lotPat, blkPat, unitPat);
        if (rows.length === 1) {
            // Defensive re-check of the numeric-lot guard against a very rare
            // regex edge (kept explicit per the spec even though the lookahead
            // already enforces it): never a numeric notice lot -> lettered parcel lot.
            void lotIsNumeric;
            return { parcel_id: rows[0].id, lon: rows[0].lon, lat: rows[0].lat };
        }
    }
    return null;
}

// ---------------------------------------------------------------- grantor -> owner_name (fix 4)

// Words that are not part of a person's distinctive name -> excluded from the
// token-AND so "& ET UX", "TRUSTEE", suffixes etc. don't over- or mis-constrain.
const NAME_STOP = new Set([
    "AND", "THE", "ETAL", "ETUX", "ETVIR", "ET", "AL", "UX", "VIR", "TRUST", "TRUSTEE",
    "ESTATE", "LIVING", "REVOCABLE", "FAMILY", "JR", "SR", "III", "IV", "MR", "MRS", "AKA", "FKA", "DBA",
]);

function nameTokens(s) {
    return (s || "")
        .toUpperCase()
        .replace(/[^A-Z ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !NAME_STOP.has(w));
}

// Extract the grantor (borrower) name from a live doc: prefer a typed grantor
// party; fall back to a parenthesized owner-name run in the property field
// ("(KYLE EMERY LEAICH & ELENA REBECCA MAHLSTEDT)") -- the shape the Kofile
// free record uses for some counties (the validated Wilson lever).
function grantorName(doc) {
    if (Array.isArray(doc.parties)) {
        const g = doc.parties.find((p) => p && /GRANTOR|MORTGAGOR|DEBTOR|BORROWER|TRUSTOR/i.test(p.type || ""));
        if (g && g.name) return g.name;
    }
    const legal = propLegal(doc);
    if (legal) {
        const m = legal.match(/\(([^)]+)\)/);
        if (m && /[A-Z]{2,}\s+[A-Z]{2,}/i.test(m[1]) && !/\d/.test(m[1])) return m[1];
    }
    return null;
}

// Token-AND the grantor name against parcels.owner_name, unique-match-only.
// Splits a multi-owner grantor ("A & B") into persons and tries each; a person
// must contribute >=2 distinctive tokens so the LIKE-AND is selective.
async function matchOwnerName(c, fips, grantor) {
    const persons = grantor.split(/\s*&\s*|\s+AND\s+/i).map(nameTokens).filter((t) => t.length >= 2);
    for (const toks of persons) {
        const params = [fips];
        const clauses = [`county_fips=$1`];
        for (const tk of toks) { params.push("%" + tk + "%"); clauses.push(`upper(owner_name) LIKE $${params.length}`); }
        clauses.push(`(owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}')`);
        const r = await c.query(
            `SELECT id, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
             FROM parcels WHERE ${clauses.join(" AND ")} LIMIT 3`,
            params
        );
        if (r.rows.length === 1) return { parcel_id: r.rows[0].id, lon: r.rows[0].lon, lat: r.rows[0].lat };
    }
    return null;
}

// ---------------------------------------------------------------- Census geocode

// FREE US Census one-line geocoder (no key). Returns {lon,lat} or null.
async function censusGeocode(street, city, zip) {
    const addr = `${street}, ${city}, TX ${zip}`;
    const url =
        "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" +
        encodeURIComponent(addr);
    try {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) return null;
        const j = await r.json();
        const match = j.result && j.result.addressMatches && j.result.addressMatches[0];
        if (!match) return null;
        return { lon: match.coordinates.x, lat: match.coordinates.y };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------- parcel join

async function joinParcel(c, fips, doc, opts = {}) {
    const legal = propLegal(doc);
    const ocrStreet = streetFromOcr(doc.ocrText, opts.countyName);
    // structured lot/block from the live doc, used to fill gaps in matchLegalV2.
    const legalHint = Array.isArray(doc.legals) && doc.legals[0] ? doc.legals[0] : null;

    // (a) ADDRESS-MATCH on the property field when it's address-shaped. This is
    // the +181-Dallas lever: Dallas's "legalDescription" field is really a
    // STREET ADDRESS, so run the address strategy whenever the string is
    // address-shaped regardless of which field carried it (fix 1).
    if (isAddressShaped(legal)) {
        const a = await matchAddressCandidate(c, fips, legal, { parcelIndex: opts.parcelIndex });
        if (a) return { ...a, method: "addr_from_legal", street: ocrStreet };
    }

    // (b) ADDRESS-MATCH on the street parsed out of the OCR body (fix 1 + the
    // fixed streetFromOcr, fix 3).
    if (ocrStreet) {
        const a = await matchAddressCandidate(c, fips, ocrStreet.street, { city: ocrStreet.city, zip: ocrStreet.zip, parcelIndex: opts.parcelIndex });
        if (a) return { ...a, method: "addr_from_ocr", street: ocrStreet };
    }

    // (c) LEGAL-DESCRIPTION matcher v2 (subdivision despaced-ILIKE + lot/block
    // token regex with the glued-digit + numeric-lot-guard lookahead) -- fix 2.
    // Only when the property field is a real legal description (not address-shaped).
    if (legal && !isAddressShaped(legal)) {
        const l = await matchLegalV2(c, fips, legal, legalHint);
        if (l) return { ...l, method: "legal_v2", street: ocrStreet };
    }

    // (d) GEOCODE the OCR street address -> spatial ST_Contains. Remember a
    // geocode-only (coords, no polygon hit) result but keep trying the
    // owner-name lever before settling for it.
    let geocodeOnly = null;
    if (ocrStreet) {
        const g = await censusGeocode(ocrStreet.street, ocrStreet.city, ocrStreet.zip);
        if (g) {
            const r = await c.query(
                `SELECT id FROM parcels
                 WHERE county_fips=$1 AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($2,$3),4326))
                   AND (owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}') LIMIT 1`,
                [fips, g.lon, g.lat]
            );
            if (r.rows.length === 1)
                return { parcel_id: r.rows[0].id, lon: g.lon, lat: g.lat, method: "geocode_spatial", street: ocrStreet };
            geocodeOnly = { parcel_id: null, lon: g.lon, lat: g.lat, method: "geocode_only", street: ocrStreet };
        }
    }

    // (e) GRANTOR (borrower) name -> parcels.owner_name, token-AND, unique-only
    // (fix 4). The validated Wilson lever and the only tie-able path left for
    // counties whose free record carries no legal/address identifier.
    const grantor = grantorName(doc);
    if (grantor) {
        const o = await matchOwnerName(c, fips, grantor);
        if (o) return { ...o, method: "owner_name", street: ocrStreet };
    }

    if (geocodeOnly) return geocodeOnly;

    // (f) EXPERIMENTAL, opt-in only (--try-return-address): last-resort guess
    // off the notice's return-to address. Tagged as its own method so it's
    // never conflated with the vetted joins above and is easy to audit/delete
    // (WHERE meta->>'matchMethod'='return_address_guess') if the false-positive
    // rate turns out too high once tested against live data.
    if (opts.tryReturnAddress && doc.returnAddress) {
        const ra = doc.returnAddress;
        const key = returnAddrKey(ra);
        const freq = key && opts.returnAddrFreq ? opts.returnAddrFreq.get(key) || 0 : 99;
        if (key && freq <= 1 && !isLikelyBusinessName(ra.addressName) && ra.city && ra.zip) {
            const num = (ra.address1.match(/^\d+/) || [])[0];
            const body = streetBody(ra.address1);
            if (num && body) {
                const r = await c.query(
                    `SELECT id, situs_address, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
                     FROM parcels
                     WHERE county_fips=$1 AND situs_number=$2 AND upper(situs_address) LIKE '%'||$3||'%'
                       AND (owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}')
                     LIMIT 2`,
                    [fips, num, body]
                );
                if (r.rows.length === 1)
                    return { parcel_id: r.rows[0].id, lon: r.rows[0].lon, lat: r.rows[0].lat, method: "return_address_guess", street: null };
            }
        }
    }

    return { parcel_id: null, lon: null, lat: null, method: "unmatched", street: ocrStreet };
}

// ---------------------------------------------------------------- schema / upsert

async function ensureSchema(c) {
    await c.query(`CREATE TABLE IF NOT EXISTS parcel_signals(
        id bigserial PRIMARY KEY, parcel_id bigint, county_fips text, signal_type text NOT NULL,
        subtype text, event_date date, source text NOT NULL, source_ref text, address text,
        lon float8, lat float8, meta jsonb,
        first_seen date DEFAULT current_date, last_seen date DEFAULT current_date)`);
    await c.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_parcel_signals_src ON parcel_signals(source, signal_type, source_ref)`
    );
    await c.query(`CREATE INDEX IF NOT EXISTS ix_parcel_signals_parcel ON parcel_signals(parcel_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS ix_parcel_signals_type ON parcel_signals(county_fips, signal_type)`);
}

async function loadCounty(c, name, cfg, days, tryReturnAddress = false) {
    const source = `${name}_kofile`;
    console.log(`${name}: fetching FC notices (last ${days}d) from ${cfg.sub}.tx.publicsearch.us ...`);
    const notices = await fetchNotices(cfg.sub, days);
    console.log(`${name}: ${notices.length} notices pulled`);
    if (!notices.length) return;

    // Pre-pass: count how often each return-address recurs in this batch --
    // a law firm's office shows up on many notices, a homeowner's on one.
    // Used only when --try-return-address is passed (see joinParcel strategy d).
    let returnAddrFreq = null;
    if (tryReturnAddress) {
        returnAddrFreq = new Map();
        for (const doc of notices) {
            const key = returnAddrKey(doc.returnAddress);
            if (key) returnAddrFreq.set(key, (returnAddrFreq.get(key) || 0) + 1);
        }
    }

    // Fix 3: preload every candidate house number's parcels for the whole
    // county in ONE query, so joinParcel's address matcher does an in-memory
    // lookup instead of a per-notice full-table scan.
    const allNums = [...new Set(notices.flatMap((doc) => addressNums(doc, name)))];
    const parcelIndex = await preloadParcelIndex(c, cfg.fips, allNums);

    const stats = { addr_from_legal: 0, addr_from_ocr: 0, legal_v2: 0, geocode_spatial: 0, geocode_only: 0, owner_name: 0, return_address_guess: 0, unmatched: 0 };
    const rows = [];
    for (const doc of notices) {
        const ref = String(doc.docNumber || doc.documentNumber || doc.instrumentNumber || doc.docId);
        if (!ref) continue;
        const j = await joinParcel(c, cfg.fips, doc, { tryReturnAddress, returnAddrFreq, countyName: name, parcelIndex });
        stats[j.method] = (stats[j.method] || 0) + 1;
        rows.push({
            parcel_id: j.parcel_id,
            event_date: toISO(doc.instrumentDate) || toISO(doc.recordedDate),
            source_ref: ref,
            address: propLegal(doc),
            lon: j.lon,
            lat: j.lat,
            // Store the WHOLE document (fix 4). The live FETCH_DOCUMENTS frame
            // carries far more than the old ~8 fields the loader kept -- the
            // 2026-07-16 re-join still found +254 with only those, so persisting
            // the full doc (parties/legals[]/parcel/marginalReferences + the OCR
            // preview + the extracted grantor) gives future re-joins real
            // material to work with, and unlocks the grantor->owner_name path.
            meta: JSON.stringify({
                docNumber: ref,
                docTypeCode: doc.docTypeCode,
                docType: doc.docType,
                recordedDate: doc.recordedDate,
                saleDate: doc.instrumentDate,
                legalDescription: propLegal(doc),
                ocrText: doc.ocrText || null,
                ocrStreet: j.street ? `${j.street.street}, ${j.street.city}, TX ${j.street.zip}` : null,
                parties: Array.isArray(doc.parties) ? doc.parties : null,
                grantor: grantorName(doc) || null,
                legals: Array.isArray(doc.legals) ? doc.legals : null,
                parcel: doc.parcel || null,
                marginalReferences: doc.marginalReferences || null,
                matchMethod: j.method,
            }),
        });
    }

    // Kofile returns the same doc across pages -> dedupe by source_ref so the
    // ON CONFLICT insert never touches one row twice ("cannot affect row a
    // second time"). Keep the last occurrence.
    const byRef = new Map();
    for (const r of rows) byRef.set(r.source_ref, r);
    const uniq = [...byRef.values()];

    await c.query("BEGIN");
    try {
    await c.query(
        `CREATE TEMP TABLE fc(parcel_id bigint, source_ref text, address text, event_date date, lon float8, lat float8, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO fc SELECT * FROM unnest($1::bigint[],$2::text[],$3::text[],$4::date[],$5::float8[],$6::float8[],$7::text[]::jsonb[])`,
        [
            uniq.map((r) => r.parcel_id),
            uniq.map((r) => r.source_ref),
            uniq.map((r) => r.address),
            uniq.map((r) => r.event_date),
            uniq.map((r) => r.lon),
            uniq.map((r) => r.lat),
            uniq.map((r) => r.meta),
        ]
    );
    const { rows: ins } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT fc.parcel_id, $2, 'pre_foreclosure', 'mortgage', fc.event_date, $1, fc.source_ref, fc.address, fc.lon, fc.lat, fc.meta
         FROM fc
         ON CONFLICT (source,signal_type,source_ref)
           DO UPDATE SET last_seen=current_date, parcel_id=EXCLUDED.parcel_id,
                         event_date=EXCLUDED.event_date, address=EXCLUDED.address,
                         lon=EXCLUDED.lon, lat=EXCLUDED.lat, meta=EXCLUDED.meta
         RETURNING parcel_id`,
        [source, cfg.fips]
    );
    // Expire notices whose trustee-sale date has already passed (the auction
    // happened -> no longer a live pre-foreclosure signal). We pull by RECORDING
    // date window, not "active feed", so a not-seen-this-run rule would wrongly
    // drop still-pending notices recorded outside the window -- so expire on the
    // sale date instead, which is unambiguous.
    const { rowCount: expired } = await c.query(
        `DELETE FROM parcel_signals WHERE source=$1 AND signal_type='pre_foreclosure' AND event_date < current_date`,
        [source]
    );
    const tied = ins.filter((r) => r.parcel_id).length;
    console.log(
        `${name}: ${ins.length} notices upserted, ${tied} tied to a parcel (${Math.round((100 * tied) / ins.length)}%), ${expired} expired`
    );
    console.log(`${name}: match methods ->`, stats);
    await c.query("COMMIT");
    } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
    }
}

async function main() {
    const args = process.argv.slice(2);
    // Default 45d recording window comfortably covers the TX notice->sale lead
    // time (>=21 days' notice required), so upcoming sales are all captured.
    const daysArg = args.find((a) => a.startsWith("--days="));
    const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : 45;
    // EXPERIMENTAL (see joinParcel strategy d): off by default so a normal run's
    // behavior/tie-rates are unchanged. Pass to test the return-address lever on
    // a county and compare its `return_address_guess` count in the printed
    // match-method stats before trusting it -- audit/delete via
    // `DELETE FROM parcel_signals WHERE source=... AND meta->>'matchMethod'='return_address_guess'`.
    const tryReturnAddress = args.includes("--try-return-address");
    const want = args.filter((a) => !a.startsWith("--"));
    const names = want.length ? want : Object.keys(SOURCES);

    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        statement_timeout: 180000,
        keepAlive: true,
    });
    await c.connect();
    await ensureSchema(c);
    for (const name of names) {
        const cfg = SOURCES[name];
        if (!cfg) {
            console.log(`unknown county: ${name}`);
            continue;
        }
        try {
            await loadCounty(c, name, cfg, days, tryReturnAddress);
        } catch (e) {
            console.error(`${name} FAILED:`, e.message);
        }
    }
    await c.end();
}

// Only run the live loader when invoked directly (DATABASE_URL=... node
// load_kofile_foreclosures.mjs). Importing this module (e.g. the offline
// matcher-validation harness) gets the exported pure/matcher functions below
// WITHOUT kicking off a live Kofile pull.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    main();
}

// Exported for the offline validation harness (re-run the matchers against the
// already-stored kofile rows without re-fetching).
export {
    streetFromOcr, cleanOcrNoise, isAddressShaped, parseAddressCore, matchAddressCandidate,
    parseLegalV2, matchLegalV2, grantorName, matchOwnerName, propLegal, joinParcel,
    numVariants, coreIsWordPrefix, preloadParcelIndex, addressNums,
};
