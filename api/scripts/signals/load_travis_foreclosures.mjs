// Court-record seller-signal loader: TRAVIS COUNTY (Austin, fips 48453)
// Notice of Substitute Trustee Sale -> parcel_signals. Standalone sibling of
// load_pdf_foreclosures.mjs / load_county_foreclosures.mjs (do NOT edit those).
//
// ============================ THE CRACK ============================
// Travis County Clerk runs its OWN records app -- NOT Kofile/Tyler/CivicPlus:
//   AUMENTUM RECORDER - Public Access Web UI (Harris Recording Solutions),
//   version 2023.1.2, at  https://www.tccsearch.org/  (linked as "SEARCH
//   FORECLOSURE NOTICES" from countyclerk.traviscountytx.gov/departments/
//   recording/meetings/). PUBLIC, no login, no CAPTCHA -- just a one-click
//   disclaimer accept (ASP.NET WebForms __doPostBack 'ctl00$cph1$lnkAccept').
//
// The Real Estate index search (RealEstate/SearchEntry.aspx) has a document-type
// checkbox "NOTICE OF SUBSTITUTE TRUSTEE SALE" (form value dclDocType = "FORECLOSURE",
// index 72 in the current render) + an optional Date-Filed range. Submitting it
// (btnSearch) redirects to SearchResults.aspx, an Infragistics grid that renders,
// PER NOTICE, columns we need with NO OCR and NO paywall:
//   * Instrument # (e.g. 202640973) + stable global_id (OPR<n>)  -> source_ref
//   * Date Filed (e.g. 07/14/2026)
//   * Name column: "[R] <grantor>" and crucially "[E] <MM/DD/YYYY>" = the
//     substitute-trustee SALE DATE (first Tuesday)                 -> event_date
//   * Legal Description: "LT 28 BLK C AMD PLAT OF HAMILTON POINT" plus, ~60% of
//     the time, the physical address inline as "... LOC 16701 TREVIN COVE MANOR
//     TX 78653 ...".  Both are usable handles.
// A doc-type-only search returns the ~300 most-recent notices (about 5-6 weeks
// at Travis' ~230/mo); a date-filtered search scopes a window (Web date-chooser
// clientState format = "|0|01YYYY-M-D-0-0-0-0||"; field names cphNoMargin_f_
// ddcDateFiledFrom_clientState / ...To_clientState, underscore-id style, NOT ctl00$).
//
// TIE STRATEGY (Travis-specific): parcels.situs_number / situs_street are EMPTY
// for 48453 and situs_address is mostly ", TX <zip>", so the OCR loaders' direct
// situs match does not apply. BUT legal_description is populated on ~99% of the
// 828K parcels in the SAME "LOT n BLK x SUBDIV" shape as the notices -> LEGAL
// match is the workhorse (measured 13/20 = 65% on the page-1 sample, all legal).
// The ~35% legal-misses are condos / "SEE INSTRUMENT" / metes-and-bounds; several
// of those carry a LOC street address that the free Census geocoder + spatial
// join (Travis parcels have geom) lifts (-> ~80% with geocode). GOV_OWNER guard
// applied to every candidate query so a courthouse/county/ISD parcel can never
// surface as a foreclosure.
//
// ===================== HEADLESS FETCH CAVEAT ======================
// The disclaimer-accept + form render work fine over pure HTTP (Node fetch), but
// the SEARCH POST is rejected by the site's CDN/WAF for non-browser clients:
// a byte-identical body + full browser header set + valid ASP.NET_SessionId still
// redirects to /?InvalidSearch (the criteria never materialize server-side),
// while the SAME request from a real browser returns the 245-row result set.
// This matches the TLS-handshake blocking seen on other TX record CDNs
// (FORECLOSURE_SOURCES.md, Kofile note). So the fetch path here is implemented
// AND is used when it works, but the RELIABLE input is a browser-captured
// SearchResults page:  run the search once in a browser on tccsearch.org
// (accept disclaimer -> Real Estate search -> check "NOTICE OF SUBSTITUTE TRUSTEE
// SALE" -> Search), then for each result page save/copy the page HTML and feed it:
//     node scripts/signals/load_travis_foreclosures.mjs --html page1.html [page2.html ...]
// Everything downstream (parse -> legal/geocode match -> parcel_signals upsert)
// is identical to a headless run.
//
//   DATABASE_URL=... node scripts/signals/load_travis_foreclosures.mjs [--headless] [--html f...] [--parse-only]
//
// Upsert: source='travis_cc', signal_type='pre_foreclosure',
//   event_date = [E] sale date, source_ref = instrument #, idempotent on
//   (source,signal_type,source_ref) bumping last_seen. Writes ONLY parcel_signals.

import { readFileSync } from "node:fs";
import pkg from "pg";
const { Client } = pkg;

const FIPS = "48453";
const SOURCE = "travis_cc";
const BASE = "https://www.tccsearch.org/";
const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
// courthouse/gov parcels can never be a foreclosure TARGET
const GOV_OWNER =
    "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST)";

// -------------------------------------------------------------- fetch (HTTP) --
// Reverse-engineered Aumentum search. Left in place + used first; see the
// HEADLESS FETCH CAVEAT above for why --html is the reliable path today.

let cookie = "";
async function call(url, form, referer) {
    const r = await fetch(url, {
        method: form ? "POST" : "GET",
        headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            ...(cookie ? { Cookie: cookie } : {}),
            ...(form ? {
                "Content-Type": "application/x-www-form-urlencoded",
                Referer: referer || url,
                Origin: "https://www.tccsearch.org",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Dest": "document",
            } : {}),
        },
        body: form ? new URLSearchParams(form).toString() : undefined,
        signal: AbortSignal.timeout(20000),
        redirect: "manual",
    });
    for (const sc of r.headers.getSetCookie?.() || []) {
        const kv = sc.split(";")[0], nm = kv.split("=")[0] + "=";
        cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(nm)), kv].join("; ");
    }
    if (r.status >= 300 && r.status < 400) return call(new URL(r.headers.get("location"), url).href, null, url);
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return { text: await r.text(), url: r.url || url };
}
const hidden = (html) => {
    const h = {};
    for (const m of html.matchAll(/<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g))
        h[m[1]] = m[2].replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return h;
};

async function fetchResultsHeadless() {
    const P = "ctl00$cphNoMargin$";
    const { text: home } = await call(BASE);
    await call(BASE, { ...hidden(home), __EVENTTARGET: "ctl00$cph1$lnkAccept", __EVENTARGUMENT: "" }, BASE);
    const seUrl = BASE + "RealEstate/SearchEntry.aspx";
    const { text: se } = await call(seUrl);
    const h = hidden(se);
    // exact browser field mirror; doc-type-only search (most-recent ~300 notices)
    const form = {
        __EVENTTARGET: "", __EVENTARGUMENT: "",
        __VIEWSTATE: h.__VIEWSTATE, __VIEWSTATEGENERATOR: h.__VIEWSTATEGENERATOR, __EVENTVALIDATION: h.__EVENTVALIDATION,
        Header1_WebHDS_clientState: "", Header1_WebDataMenu1_clientState: "",
        [`${P}f$NameSearchMode`]: "rdoCombine",
        cphNoMargin_f_txtParty_clientState: "|0|01||", cphNoMargin_f_txtParty: "Lastname Firstname",
        [`${P}f$drbPartyType`]: "",
        cphNoMargin_f_txtGrantor_clientState: "|0|00||", cphNoMargin_f_txtGrantee_clientState: "|0|00||",
        cphNoMargin_f_ddcDateFiledFrom_clientState: "|0|01||", cphNoMargin_f_ddcDateFiledTo_clientState: "|0|01||",
        cphNoMargin_f_txtInstrumentNoFrom_clientState: "|0|01||", cphNoMargin_f_txtInstrumentNoFrom: "",
        cphNoMargin_f_txtInstrumentNoTo_clientState: "|0|01||", cphNoMargin_f_txtInstrumentNoTo: "",
        cphNoMargin_f_txtBook_clientState: "|0|01||", cphNoMargin_f_txtBook: "",
        cphNoMargin_f_txtPage_clientState: "|0|01||", cphNoMargin_f_txtPage: "",
        [`${P}f$dclDocType$72`]: "FORECLOSURE",
        cphNoMargin_f_DataTextEdit1_clientState: "|0|01||", cphNoMargin_f_DataTextEdit1: "",
        cphNoMargin_f_txtLDStreetAddress_clientState: "|0|01||", cphNoMargin_f_txtLDStreetAddress: "",
        cphNoMargin_f_txtLDLot_clientState: "|0|01||", cphNoMargin_f_txtLDLot: "",
        cphNoMargin_f_txtLDBook_clientState: "|0|01||", cphNoMargin_f_txtLDBook: "",
        cphNoMargin_f_txtLDSection_clientState: "|0|01||", cphNoMargin_f_txtLDSection: "",
        cphNoMargin_f_txtLDVolume_clientState: "|0|01||", cphNoMargin_f_txtLDVolume: "",
        cphNoMargin_f_txtLDFreeForm_clientState: "|0|01||", cphNoMargin_f_txtLDFreeForm: "",
        cphNoMargin_dlgPopup_clientState: "", dlgOptionWindow_clientState: "", RangeContextMenu_clientState: "",
        LoginForm1_txtLogonName_clientState: "|0|01||", LoginForm1_txtLogonName: "",
        LoginForm1_txtPassword_clientState: "|0|01||", LoginForm1_txtPassword: "",
        [`${P}LoginForm1$logonType`]: "rdoPubCpu",
        _ig_def_dp_cal_clientState: "",
        [`${P}_IG_CSS_LINKS_`]: h[`${P}_IG_CSS_LINKS_`] ?? "",
        [`${P}SearchButtons1$btnSearch`]: "Search",
    };
    const { text, url } = await call(seUrl, form, seUrl);
    if (/InvalidSearch|Selection Criteria/i.test(url + text) && !/records found/i.test(text)) {
        throw new Error(
            "headless search rejected (WAF/TLS block -> /?InvalidSearch). Capture SearchResults " +
            "HTML in a browser and re-run with --html <file...>. See file header."
        );
    }
    // paginate the Infragistics grid if there is more than one page
    const pages = [text];
    // (page walk omitted for the headless path since it is WAF-blocked today;
    //  --html mode supplies each captured page as a separate file.)
    return pages;
}

// ------------------------------------------------------------------- parse --
// Works on either the headless SearchResults HTML or a browser-saved page.
// One record per notice: instrument #, filed date, [E] sale date, legal + LOC.

const decode = (s) => s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function parseResults(html) {
    const recs = new Map();
    // each notice row starts with an Instrument detail link:
    //   ?global_id=OPR<n>&type=dtl"> <instrument#></a>
    // ASP.NET viewstate can hold >4000 chars between rows, so SLICE between
    // successive link positions rather than a lazy lookahead (which under-segments).
    const linkRe = /global_id=(OPR\d+)[^"]*?&(?:amp;)?type=dtl"[^>]*>\s*(\d{6,})\s*<\/a>/g;
    const marks = [];
    let m;
    while ((m = linkRe.exec(html))) marks.push({ end: linkRe.lastIndex, next: m.index, gid: m[1], inst: m[2] });
    for (let k = 0; k < marks.length; k++) {
        const globalId = marks[k].gid, inst = marks[k].inst;
        const body = html.slice(marks[k].end, k + 1 < marks.length ? marks[k + 1].next : marks[k].end + 4000);
        const d = decode(body);
        if (!/SUBSTITUTE TRUSTEE SALE|FORECLOSURE/i.test(d)) continue;
        // sale date = the "[E] MM/DD/YYYY" grantee entry (first-Tuesday sale date)
        const saleM = d.match(/\[E\]\s*(\d{2})\/(\d{2})\/(\d{4})/);
        const filedM = d.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        // legal cell: the "LT../UNIT../SEE INSTRUMENT/<n> AC .." run up to Status.
        // require whitespace after the lead token so link text ("lts.aspx") never matches.
        const legalM = d.match(/((?:PT OF )?(?:LTS?|UNIT|SEC|SEE)\s.*?|[0-9.]+\s*AC(?:RES)?\s.*?)(?:Temp|Perm|$)/i);
        const legalRaw = (legalM ? legalM[1] : "").replace(/\s*(Temp|Perm)\s*$/i, "").trim();
        const sale = saleM ? `${saleM[3]}-${saleM[1]}-${saleM[2]}` : (filedM ? saleDateFromFiled(filedM) : null);
        // LOC address can appear even on "SEE INSTRUMENT" rows -> parse it from
        // the whole decoded row, not just the legal run.
        if (!recs.has(inst)) recs.set(inst, { inst, globalId, sale, legalRaw, ...parseLegalAndLoc(legalRaw || " ", d) });
    }
    return [...recs.values()];
}

// TX sales run the first Tuesday of the month; the notice's [E] carries the
// exact date, but if it is missing derive from filed-month + 1 (fallback only).
function saleDateFromFiled(m) {
    let y = +m[3], mo = +m[1] + 1; if (mo > 12) { mo = 1; y++; }
    const d = new Date(Date.UTC(y, mo - 1, 1));
    let day = 1 + ((2 - d.getUTCDay() + 7) % 7);
    if ((mo === 1 && day === 1) || (mo === 7 && day === 4)) day += 1;
    return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// split legal into {lot,blk,subdiv} (+ optional LOC address). locSource lets the
// LOC scan see the whole row so "SEE INSTRUMENT LOC <addr>" rows still geocode.
function parseLegalAndLoc(raw, locSource = raw) {
    const out = {};
    const loc = locSource.match(/\bLOC\s+(\d{1,7})\s+([A-Z0-9 .'-]+?)\s+([A-Z]{2,}(?:\s[A-Z]+)*)\s+TX\s+(\d{5})/i);
    if (loc) out.loc = { num: loc[1], street: loc[2].trim().replace(/\s+\d+$/, ""), city: loc[3].trim(), zip: loc[4] };
    const lg = raw.replace(/\bLOC\s+.*$/i, "").match(/^(?:PT OF )?LTS?\s+(\d{1,4})\s+(?:BLK\s+([A-Z0-9]{1,3})\s+)?(?:SEC\s+\d+\s+)?(.+)$/i);
    if (lg) {
        let subdiv = lg[3].replace(/^(AMD PLAT OF|AMENDED PLAT OF|PLAT OF|OF)\s+/i, "")
            .replace(/\b(PDV|PHS|SEC|AMD|SECS)\b.*$/i, "").trim().toUpperCase();
        out.legal = { lot: lg[1], blk: lg[2] || null, subdiv };
    }
    return out;
}

// ------------------------------------------------------------------- match --

async function legalMatch(c, recs) {
    for (const r of recs) {
        if (!r.legal) continue;
        const { lot, blk, subdiv } = r.legal;
        const anchor = subdiv.split(/\s+/).filter((w) => w.length >= 4).slice(0, 2).join("%");
        if (!anchor) continue;
        const params = [`%${anchor}%`, `\\m(?:LOT|LT)S?\\s*0*${lot}\\M`, GOV_OWNER];
        let blkClause = "";
        if (blk) { params.push(`\\m(?:BLOCK|BLK)\\s*0*${blk}\\M`); blkClause = "AND legal_description ~* $4"; }
        let rows;
        try {
            ({ rows } = await c.query(
                `SELECT id, legal_description, ST_X(ST_PointOnSurface(geom)) lon, ST_Y(ST_PointOnSurface(geom)) lat
                 FROM parcels WHERE county_fips=$5 AND owner_name !~* $3
                   AND legal_description ILIKE $1 AND legal_description ~* $2 ${blkClause}
                 ORDER BY id LIMIT 4`,
                [...params, FIPS]
            ));
        } catch { continue; }
        if (rows.length && (rows.length === 1 || subdivPick(rows, subdiv))) {
            const best = rows.length === 1 ? rows[0] : subdivPick(rows, subdiv);
            r.parcel_id = best.id; r.lon = best.lon; r.lat = best.lat; r.match = "legal"; r.matched = best.legal_description;
        }
    }
}
// pick the row whose subdivision text best matches (phase disambiguation)
function subdivPick(rows, subdiv) {
    const score = (r) => {
        const db = (r.legal_description || "").toUpperCase();
        return subdiv.split(/\s+/).filter((w) => db.includes(w)).length;
    };
    rows.sort((a, b) => score(b) - score(a));
    return score(rows[0]) > (rows[1] ? score(rows[1]) : -1) ? rows[0] : rows[0]; // tie -> first (same subdiv)
}

// Census batch geocoder (free) for LOC-address records legal-match missed.
async function geocodeMatch(c, recs) {
    const todo = recs.filter((r) => !r.parcel_id && r.loc && r.loc.num && (r.loc.city || r.loc.zip));
    if (!todo.length) return;
    const clean = (s) => (s || "").replace(/["'.]/g, "").trim();
    const csv = todo.map((r, i) => `${i},"${r.loc.num} ${clean(r.loc.street)}","${clean(r.loc.city)}",TX,${r.loc.zip}`).join("\n");
    const fd = new FormData();
    fd.append("benchmark", "Public_AR_Current");
    fd.append("addressFile", new Blob([csv], { type: "text/csv" }), "b.csv");
    let body;
    try {
        const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", { method: "POST", body: fd, headers: { "User-Agent": UA }, signal: AbortSignal.timeout(180000) });
        if (!r.ok) throw new Error(`census HTTP ${r.status}`);
        body = await r.text();
    } catch (e) { console.error(`  geocoder failed (${e.message})`); return; }
    const pts = [];
    for (const line of body.split("\n")) {
        const m = line.match(/^"?(\d+)"?,".*?","Match","(?:Exact|Non_Exact)","(.*?)","(-?[\d.]+),(-?[\d.]+)"/);
        if (m) pts.push({ i: +m[1], lon: +m[3], lat: +m[4] });
    }
    if (!pts.length) return;
    const { rows } = await c.query(
        `SELECT g.i, p.id, ST_X(ST_PointOnSurface(p.geom)) plon, ST_Y(ST_PointOnSurface(p.geom)) plat
         FROM unnest($2::int[],$3::float8[],$4::float8[]) g(i,lon,lat)
         CROSS JOIN LATERAL (
            SELECT id, geom FROM parcels
            WHERE county_fips=$1 AND owner_name !~* $5
              AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(g.lon,g.lat),4326), 0.0004)
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(g.lon,g.lat),4326) LIMIT 1
         ) p`,
        [FIPS, pts.map((p) => p.i), pts.map((p) => p.lon), pts.map((p) => p.lat), GOV_OWNER]
    );
    const byI = new Map(rows.map((r) => [r.i, r]));
    for (const p of pts) {
        const hit = byI.get(p.i);
        if (hit) { const r = todo[p.i]; r.parcel_id = hit.id; r.lon = hit.plon; r.lat = hit.plat; r.match = "geocode"; }
    }
}

// ------------------------------------------------------------------ upsert --

async function upsert(c, recs) {
    if (!recs.length) return 0;
    const col = { ref: [], ad: [], pid: [], lo: [], la: [], dt: [], mt: [] };
    for (const r of recs) {
        col.ref.push(r.inst);
        col.ad.push(r.loc ? `${r.loc.num} ${r.loc.street}, ${r.loc.city}, TX ${r.loc.zip}` : r.legalRaw.slice(0, 120));
        col.pid.push(r.parcel_id || null);
        col.lo.push(r.lon ?? null); col.la.push(r.lat ?? null);
        col.dt.push(r.sale);
        col.mt.push(JSON.stringify({ global_id: r.globalId, legal: r.legalRaw, match: r.match || null }));
    }
    await c.query("BEGIN");
    await c.query(`CREATE TEMP TABLE tc(ref text,ad text,pid bigint,lo float8,la float8,dt date,mt jsonb) ON COMMIT DROP`);
    await c.query(
        `INSERT INTO tc SELECT * FROM unnest($1::text[],$2::text[],$3::bigint[],$4::float8[],$5::float8[],$6::date[],$7::text[]::jsonb[])`,
        [col.ref, col.ad, col.pid, col.lo, col.la, col.dt, col.mt]
    );
    const { rows } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT tc.pid, $1, 'pre_foreclosure', 'mortgage', tc.dt, $2, tc.ref, tc.ad, tc.lo, tc.la, tc.mt FROM tc
         ON CONFLICT (source,signal_type,source_ref) DO UPDATE SET last_seen=current_date,
           parcel_id=COALESCE(EXCLUDED.parcel_id, parcel_signals.parcel_id),
           lon=COALESCE(EXCLUDED.lon, parcel_signals.lon), lat=COALESCE(EXCLUDED.lat, parcel_signals.lat),
           event_date=EXCLUDED.event_date, address=EXCLUDED.address, meta=EXCLUDED.meta
         RETURNING (xmax=0) inserted`,
        [FIPS, SOURCE]
    );
    await c.query("COMMIT");
    return rows.filter((r) => r.inserted).length;
}

// -------------------------------------------------------------------- main --

async function main() {
    const args = process.argv.slice(2);
    const parseOnly = args.includes("--parse-only");
    const htmlFiles = args.filter((a) => a.endsWith(".html") || a.endsWith(".htm"));
    let htmls = [];
    if (htmlFiles.length) htmls = htmlFiles.map((f) => readFileSync(f, "utf8"));
    else htmls = await fetchResultsHeadless();

    const recs = htmls.flatMap(parseResults);
    // dedupe across pages by instrument #
    const byInst = new Map(recs.map((r) => [r.inst, r]));
    const all = [...byInst.values()];
    console.log(`parsed ${all.length} trustee-sale notices (${all.filter((r) => r.legal).length} legal, ${all.filter((r) => r.loc).length} w/ LOC address)`);
    if (parseOnly) { for (const r of all.slice(0, 15)) console.log(`  ${r.inst} sale=${r.sale} :: ${r.legalRaw.slice(0, 70)}`); return; }

    const c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 180000, keepAlive: true });
    await c.connect();
    await legalMatch(c, all);
    await geocodeMatch(c, all);
    const tied = all.filter((r) => r.parcel_id).length;
    const inserted = await upsert(c, all);
    await c.end();
    console.log(`tied ${tied}/${all.length} = ${Math.round((tied / all.length) * 100)}% ` +
        `(${all.filter((r) => r.match === "legal").length} legal, ${all.filter((r) => r.match === "geocode").length} geocode) ` +
        `-> upserted ${all.length} (${inserted} new) into parcel_signals [${SOURCE}]`);
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
