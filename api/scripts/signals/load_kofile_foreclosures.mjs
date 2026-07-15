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
// HOW THE DATA IS OBTAINED (reverse-engineered 2026-07-15, no login/CAPTCHA/pay):
//   1. GET https://<county>.tx.publicsearch.us/  -> the SPA embeds an anonymous
//      bootstrap token in `window.__ort="<uuid>"` (also set as the httponly
//      `authToken` cookie). This is the ONLY credential the search needs.
//   2. Open a WebSocket to  wss://<county>.tx.publicsearch.us/ws .
//   3. Send a redux-action-over-socket frame:
//        { type:"@kofile/FETCH_DOCUMENTS/v6",
//          payload:{ query:{ department:"FC", searchType:"advancedSearch",
//                            recordedDateRange:"<start>,<end>",
//                            limit:"50", offset:"0" },
//                    workspaceID:"<random>" },
//          authToken:<ort>, correlationId:<uuid>, sync:true }
//      -> server replies "@kofile/FETCH_DOCUMENTS_FULFILLED/vN" with
//         payload.data.byOrder[] + payload.data.byHash{docId->doc}. Each doc has
//         docNumber, recordedDate, instrumentDate (== the trustee SALE date),
//         propAddress[{address1: legal desc}], docTypeCode ("FCN"), ocrText, ...
//      NOTE: the Kofile search backend is intermittently slow and frequently
//      times out server-side (its own web app shows "The request timed out") --
//      so every request is retried with fresh connections.
//
//   DATABASE_URL=... node scripts/signals/load_kofile_foreclosures.mjs [county...] [--days=N]
//
// Departments: FC = "Foreclosures" (the whole department is trustee-sale notices).

import pkg from "pg";
const { Client } = pkg;

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// One entry per Kofile county. `sub` = subdomain, `fips` = 5-digit county FIPS.
const SOURCES = {
    nueces:  { sub: "nueces",  fips: "48355" },
    cameron: { sub: "cameron", fips: "48061" },
    hidalgo: { sub: "hidalgo", fips: "48215" },
    denton:  { sub: "denton",  fips: "48121" },
    tarrant: { sub: "tarrant", fips: "48439" },
};

// ---------------------------------------------------------------- Kofile fetch

// GET the SPA shell, pull the anon bootstrap token + session cookies.
async function bootstrap(sub) {
    const host = `${sub}.tx.publicsearch.us`;
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
    // one search page; resolves data | null on timeout
    fetchPage(query, timeoutMs = 25000) {
        return new Promise((resolve) => {
            if (!this.ws) return resolve(null);
            const cid = crypto.randomUUID();
            const timer = setTimeout(() => { this.pending.delete(cid); resolve(null); }, timeoutMs);
            this.pending.set(cid, { resolve, timer });
            try {
                this.ws.send(JSON.stringify({
                    type: "@kofile/FETCH_DOCUMENTS/v6",
                    payload: { query, workspaceID: "p" + Math.random().toString(36).slice(2, 12) },
                    authToken: this.ort, correlationId: cid, sync: true,
                }));
            } catch { clearTimeout(timer); this.pending.delete(cid); resolve(null); }
        });
    }
    close() { try { clearInterval(this.pinger); this.ws && this.ws.close(); } catch {} }
}

// Fetch one page with retries; reconnects a dead socket. Returns data | null.
async function fetchPageRetry(state, sub, query, attempts = 6) {
    for (let a = 1; a <= attempts; a++) {
        if (!state.sock || !state.sock.ws) {
            const { host, ort, cookie } = await bootstrap(sub);
            state.sock = new KofileSocket(host, ort, cookie);
            try { await state.sock.connect(); } catch { state.sock = null; await sleep(2000); continue; }
        }
        const data = await state.sock.fetchPage(query);
        if (data) return data;
        await sleep(2000); // backend timed out this try -- pause, then retry same conn
    }
    return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull every FC notice recorded in the last `days` days, paging by offset.
async function fetchNotices(sub, days) {
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const range = `${start.toISOString().slice(0, 10)},${end.toISOString().slice(0, 10)}`;
    const PAGE = 50;
    const out = [];
    const state = { sock: null };
    try {
        let offset = 0;
        for (let page = 0; page < 60; page++) {
            const query = {
                department: "FC",
                searchType: "advancedSearch",
                recordedDateRange: range,
                limit: String(PAGE),
                offset: String(offset),
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

async function joinParcel(c, fips, doc) {
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
                 WHERE county_fips=$1 AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($2,$3),4326)) LIMIT 1`,
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
        const r = await c.query(
            `SELECT id, ST_X(ST_Centroid(geom)) lon, ST_Y(ST_Centroid(geom)) lat
             FROM parcels WHERE ${clauses.join(" AND ")} LIMIT 2`,
            params
        );
        if (r.rows.length === 1)
            return { parcel_id: r.rows[0].id, lon: r.rows[0].lon, lat: r.rows[0].lat, method: "legal_tuple", street: ocrStreet };
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

async function loadCounty(c, name, cfg, days) {
    const source = `${name}_kofile`;
    console.log(`${name}: fetching FC notices (last ${days}d) from ${cfg.sub}.tx.publicsearch.us ...`);
    const notices = await fetchNotices(cfg.sub, days);
    console.log(`${name}: ${notices.length} notices pulled`);
    if (!notices.length) return;

    const stats = { situs_direct: 0, geocode_spatial: 0, geocode_only: 0, legal_tuple: 0, unmatched: 0 };
    const rows = [];
    for (const doc of notices) {
        const ref = String(doc.docNumber || doc.documentNumber || doc.instrumentNumber || doc.docId);
        if (!ref) continue;
        const j = await joinParcel(c, cfg.fips, doc);
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

    await c.query("BEGIN");
    await c.query(
        `CREATE TEMP TABLE fc(parcel_id bigint, source_ref text, address text, event_date date, lon float8, lat float8, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO fc SELECT * FROM unnest($1::bigint[],$2::text[],$3::text[],$4::date[],$5::float8[],$6::float8[],$7::text[]::jsonb[])`,
        [
            rows.map((r) => r.parcel_id),
            rows.map((r) => r.source_ref),
            rows.map((r) => r.address),
            rows.map((r) => r.event_date),
            rows.map((r) => r.lon),
            rows.map((r) => r.lat),
            rows.map((r) => r.meta),
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
    await c.query("COMMIT");

    const tied = ins.filter((r) => r.parcel_id).length;
    console.log(
        `${name}: ${ins.length} notices upserted, ${tied} tied to a parcel (${Math.round((100 * tied) / ins.length)}%), ${expired} expired`
    );
    console.log(`${name}: match methods ->`, stats);
}

async function main() {
    const args = process.argv.slice(2);
    // Default 45d recording window comfortably covers the TX notice->sale lead
    // time (>=21 days' notice required), so upcoming sales are all captured.
    const daysArg = args.find((a) => a.startsWith("--days="));
    const days = daysArg ? parseInt(daysArg.split("=")[1], 10) : 45;
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
            await loadCounty(c, name, cfg, days);
        } catch (e) {
            console.error(`${name} FAILED:`, e.message);
        }
    }
    await c.end();
}

main();
