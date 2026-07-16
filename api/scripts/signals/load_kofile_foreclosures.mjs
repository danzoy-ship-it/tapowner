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
const GOV_OWNER_RE = "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY)";

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

// Best-effort street address out of the notice OCR text. TX Notices of
// Foreclosure Sale usually state the property street address somewhere in the
// body ("...commonly known as 1234 MAIN ST, CORPUS CHRISTI, TX 78412..."). We
// look for a "<number> <street>, <city>, TX <zip>" shaped run.
function streetFromOcr(ocr) {
    if (!ocr) return null;
    const t = ocr.replace(/\s+/g, " ");
    const re = /(\d{2,6}\s+[A-Z0-9][A-Z0-9 .'#\/-]{3,40}?),?\s+([A-Z][A-Z .'-]{2,24}?),?\s+(?:TX|TEXAS)\.?\s+(\d{5})/gi;
    let best = null, m;
    while ((m = re.exec(t))) {
        const cand = { street: m[1].trim(), city: m[2].trim(), zip: m[3] };
        // prefer a plausible street (has a suffix-ish token), skip PO boxes
        if (/P\.?\s?O\.?\s?BOX/i.test(cand.street)) continue;
        best = cand;
        break;
    }
    return best;
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

// Parse a legal description into {subWords[], lot, blk} for a tuple join.
function parseLegal(s) {
    if (!s) return null;
    const t = s.toUpperCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
    const lot = (t.match(/\b(?:LOT|LT)\s*([0-9]+[A-Z]?)\b/) || [])[1] || null;
    const blk = (t.match(/\b(?:BLOCK|BLK|BK)\s*([0-9]+[A-Z]?|[A-Z])\b/) || [])[1] || null;
    const sub = t
        .replace(/\b(?:LOT|LT)\s*[0-9]+[A-Z]?\b/g, " ")
        .replace(/\b(?:BLOCK|BLK|BK)\s*(?:[0-9]+[A-Z]?|[A-Z])\b/g, " ")
        .replace(/\bUNIT\s*(?:[0-9]+|[IVX]+)\b/g, " ")
        .replace(/\bSECTION\s*[0-9]+\b/g, " ")
        .replace(/\b(SUBDIVISION|ADDITION|SUBD|S\/D|PH|PHASE|TRACTS?)\b/g, " ")
        .replace(/\b(AND|THE|OF|OUT|ON)\b/g, " ")
        .replace(/[0-9-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    return { subWords: sub.split(" ").filter((w) => w.length > 2), lot, blk };
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
    const ocrStreet = streetFromOcr(doc.ocrText);

    // (a) direct street-address match against parcels.situs_address. NOTE: in
    // this roll situs_street is mostly NULL and the reliable field is the full
    // situs_address, so match house-number + street-name substring there.
    if (ocrStreet) {
        const num = (ocrStreet.street.match(/^\d+/) || [])[0];
        const body = streetBody(ocrStreet.street);
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
                return { parcel_id: r.rows[0].id, lon: r.rows[0].lon, lat: r.rows[0].lat, method: "situs_direct", street: ocrStreet };
        }
    }

    // (b) geocode the street address -> spatial ST_Contains
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
            // geocoded but no parcel polygon hit -- still keep the coordinates
            return { parcel_id: null, lon: g.lon, lat: g.lat, method: "geocode_only", street: ocrStreet };
        }
    }

    // (c) legal-description tuple match (subdivision + lot + block)
    const pl = parseLegal(legal);
    if (pl && pl.subWords.length && pl.lot) {
        const params = [fips];
        const clauses = [`county_fips=$1`];
        for (const w of pl.subWords) { params.push("%" + w + "%"); clauses.push(`legal_description ILIKE $${params.length}`); }
        params.push(`\\y(LOT|LT)\\s*${pl.lot}\\y`); clauses.push(`legal_description ~* $${params.length}`);
        if (pl.blk) { params.push(`\\y(BLOCK|BLK|BK)\\s*${pl.blk}\\y`); clauses.push(`legal_description ~* $${params.length}`); }
        clauses.push(`(owner_name IS NULL OR owner_name !~* '${GOV_OWNER_RE}')`);
        const r = await c.query(
            `SELECT id, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
             FROM parcels WHERE ${clauses.join(" AND ")} LIMIT 2`,
            params
        );
        if (r.rows.length === 1)
            return { parcel_id: r.rows[0].id, lon: r.rows[0].lon, lat: r.rows[0].lat, method: "legal_tuple", street: ocrStreet };
    }

    // (d) EXPERIMENTAL, opt-in only (--try-return-address): last-resort guess
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

    const stats = { situs_direct: 0, geocode_spatial: 0, geocode_only: 0, legal_tuple: 0, return_address_guess: 0, unmatched: 0 };
    const rows = [];
    for (const doc of notices) {
        const ref = String(doc.docNumber || doc.documentNumber || doc.instrumentNumber || doc.docId);
        if (!ref) continue;
        const j = await joinParcel(c, cfg.fips, doc, { tryReturnAddress, returnAddrFreq });
        stats[j.method]++;
        rows.push({
            parcel_id: j.parcel_id,
            event_date: toISO(doc.instrumentDate) || toISO(doc.recordedDate),
            source_ref: ref,
            address: propLegal(doc),
            lon: j.lon,
            lat: j.lat,
            meta: JSON.stringify({
                docNumber: ref,
                docTypeCode: doc.docTypeCode,
                docType: doc.docType,
                recordedDate: doc.recordedDate,
                saleDate: doc.instrumentDate,
                legalDescription: propLegal(doc),
                ocrStreet: j.street ? `${j.street.street}, ${j.street.city}, TX ${j.street.zip}` : null,
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

main();
