// Court-record seller-signal loader #2: county PROBATE court filings (estate
// administrations / applications to probate a will / letters testamentary /
// muniment of title / determination of heirship) -> parcel_signals with
// signal_type='probate'. Cousin of load_pdf_foreclosures.mjs, but the JOIN is
// fundamentally different: a probate filing names the DECEDENT (and executor),
// almost never a property address. We tie the decedent to the house they owned
// via a NAME join -- decedent name -> parcels.owner_name in the SAME county --
// using the idx_parcels_owner_name_upper index (btree on upper(owner_name)).
//
// Signal meaning: the owner died and the estate is in probate => an heir now
// holds (or is about to hold) the house. For roofers: heirs of an older home
// often need a roof + renovation. For realtors: inherited property is a top
// likely-to-sell signal.
//
// Pipeline (per county / source):
//   discover - pull a BULK / LIST surface of probate filings (a court DOCKET,
//              a case-type-filtered result set, or an open-data feed). Returns
//              {caseNo, decedentRaw, filingType, filingDate 'YYYY-MM-DD', court}.
//              *** BULK/LIST ONLY -- never one HTTP call per case. ***
//   filter   - keep DECEDENT/estate case types; DROP guardianships & mental-
//              health cases (the subject is alive -> not an inheritance signal).
//   parse    - decedent case style -> {last, first, middle[]}, handling both
//              natural "FIRST MIDDLE LAST" and clerk "LAST, FIRST MIDDLE" order,
//              stripping ESTATE OF / DECEASED wrappers and JR/SR/III suffixes.
//   match    - NAME join to parcels (same county_fips): prefix "LAST FIRST" on
//              upper(owner_name) via the index, with a word-boundary guard (no
//              JOHN->JOHNSON bleed), gov/company owner exclusion, middle-name
//              narrowing, and a parcel-count CAP -- a decedent name hitting more
//              than MAX_TIE parcels is too common -> DROP (wrong owner is worse
//              than no owner). A decedent may legitimately own several parcels
//              (<= cap) -> tie each. parcels is READ-ONLY throughout.
//   upsert   - parcel_signals ON CONFLICT (source,signal_type,source_ref) bumps
//              last_seen; source_ref = caseNo (+ ':'+parcel_id when a case ties
//              multiple parcels) so re-runs are idempotent.
//
//   DATABASE_URL=... node scripts/signals/load_probate.mjs [--parse-only] [--file cases.json] [source...]
//
// --parse-only : fetch + parse + name-match, print stats/samples, NO DB writes.
// --file <json>: load cases from a local JSON array instead of discover()
//                (each: {caseNo, decedentRaw, filingType, filingDate, court}),
//                handy for a cracked source that dumps its list to JSON, and for
//                the name-join self-test.

import { readFileSync } from "node:fs";
import pkg from "pg";
const { Client } = pkg;

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_TIE = +(process.env.PROBATE_MAX_TIE || 4); // decedent -> >this many parcels = too common, skip

async function fetchText(url, opts = {}) {
    const r = await fetch(url, {
        method: opts.method || "GET",
        headers: { "User-Agent": UA, ...(opts.headers || {}) },
        body: opts.body,
        signal: AbortSignal.timeout(opts.timeout || 60000),
        redirect: "follow",
    });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return await r.text();
}

// ---------------------------------------------------------- name handling --

// Case types that mean "a person died and their estate is in probate". Drop
// everything else (guardianships, mental-health/civil-commitment, name changes,
// trust-only filings without a death) -- those are NOT inheritance signals.
const DECEDENT_TYPE =
    /(PROBAT|ESTATE|TESTAMENT|ADMINISTRAT|MUNIMENT|HEIRSHIP|DECEAS|INTESTAT|SMALL\s+ESTATE|WILL)/i;
const NON_DECEDENT_TYPE =
    /(GUARDIAN|MENTAL|MHMR|COMMIT|MINOR|NAME\s+CHANGE|TRUST\s+MODIF|CONSERVAT)/i;

function isDecedentCase(filingType) {
    const t = filingType || "";
    if (NON_DECEDENT_TYPE.test(t)) return false;
    return DECEDENT_TYPE.test(t) || t === ""; // unknown type -> keep (docket may omit it), name-join still gates
}

const SUFFIX = new Set(["JR", "SR", "II", "III", "IV", "V", "DECEASED", "DECD", "DEC'D"]);

// decedent case style -> {last, first, middle[]} in a form comparable to the
// TX-roll "LAST FIRST MIDDLE" owner_name ordering. Returns null if unusable.
function parseDecedent(raw) {
    if (!raw) return null;
    let s = " " + raw.toUpperCase() + " ";
    // strip the estate/court wrapper + deceased marker (the comma before
    // DECEASED is consumed here so it can't be mistaken for a "LAST, FIRST")
    s = s
        .replace(/\bIN\s+RE:?\b/g, " ")
        .replace(/\bIN\s+THE\b/g, " ")
        .replace(/\b(THE\s+)?ESTATE\s+OF\b/g, " ")
        .replace(/\bGUARDIANSHIP\s+OF\b/g, " ")
        .replace(/\bAPPLICATION\s+(TO|FOR)\b.*$/g, " ")
        .replace(/,?\s*DECEASED\b/g, " ")
        .replace(/,?\s*DEC'?D\b/g, " ")
        .replace(/,?\s*AN?\s+(DECEASED|INCAPACITATED)\s+(PERSON|MINOR|INDIVIDUAL)\b.*$/g, " ")
        .replace(/\bAKA\b.*$/g, " ");           // drop "also known as" tails
    // keep only letters + name punctuation (drops the "OF:" colon, digits, etc.)
    s = s.replace(/[^A-Z ,'&\-]/g, " ");
    // couples ("JOHN & JANE SMITH"): keep the first party only
    s = s.split("&")[0];
    // collapse whitespace, normalize commas, trim any dangling comma/space
    s = s.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").replace(/^[\s,]+|[\s,]+$/g, "").trim();
    if (!s) return null;
    const parts = s.split(",");
    const hasComma = parts.length >= 2 && parts[0].trim() && parts[1].trim();
    let toks;
    if (hasComma) {
        const [lastPart, restPart = ""] = s.split(",");
        const rest = restPart.trim().split(/\s+/).filter(Boolean);
        const lastToks = lastPart.trim().split(/\s+/).filter((t) => !SUFFIX.has(t));
        toks = { last: lastToks.join(" "), rest };
    } else {
        const all = s.split(/\s+/).filter((t) => !SUFFIX.has(t));
        if (all.length < 2) return null;
        toks = { last: all[all.length - 1], rest: all.slice(0, -1) };
    }
    const rest = toks.rest.filter((t) => !SUFFIX.has(t));
    if (!toks.last || !rest.length) return null;
    const first = rest[0];
    const middle = rest.slice(1).filter((t) => t.length >= 1);
    if (!/^[A-Z][A-Z'\-]+$/.test(toks.last) || first.length < 2) return null; // need a real last + >=2ch first
    return { last: toks.last, first, middle, raw };
}

const GOV_OWNER =
    "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST|CORRECTIONAL|DETENTION|COUNTY FEE|HOSPITAL DIST|FIRE DIST|JUVENILE)";
// owners that are clearly organizations, not a deceased human
const COMPANY_OWNER =
    "(LLC|L L C| INC$| INC | INCORPORATED|CORP|LTD| LP$| LP | L P | LLP|COMPANY| CO$|PARTNERS|PARTNERSHIP|PROPERT|INVESTMENT|HOLDINGS|CHURCH|MINISTR|ASSN|ASSOCIATION|FOUNDATION|BANK| N A$|MORTGAGE|HOMEOWNERS|HOA| FUND|CAPITAL|VENTURES|ENTERPRISE|REALTY|GROUP|DEVELOP|BUILDERS|RENTAL)";

const govRe = new RegExp(GOV_OWNER, "i");
const companyRe = new RegExp(COMPANY_OWNER, "i");

// BATCHED name join. The btree on upper(owner_name) is default-ops in a non-C
// collation, so it can't serve LIKE 'prefix%' -- a per-decedent prefix scan
// seq-scans the whole county each time (Harris = 1.5M rows -> timeout). Instead
// we do ONE pass per source: normalize every county owner to "LAST FIRST" (its
// first two tokens, commas->spaces) and keep only rows whose key is one of the
// decedents' "LAST FIRST" keys. Exact first-two-token equality also gives the
// word boundary for free (JOHN can't match JOHNSON: different 2nd token). ~2.5s
// on Harris. Then middle-name narrowing + the too-common CAP run in JS.
async function matchAll(c, fips, decs) {
    const keyOf = (d) => `${d.last} ${d.first}`;
    const keys = [...new Set(decs.map(keyOf))];
    const { rows } = await c.query(
        `WITH nz AS (
           SELECT id, owner_name, situs_address,
                  ST_X(ST_PointOnSurface(geom)) lon, ST_Y(ST_PointOnSurface(geom)) lat,
                  btrim(regexp_replace(replace(upper(owner_name),',',' '),'\\s+',' ','g')) no
           FROM parcels WHERE county_fips=$1
         )
         SELECT id, owner_name, situs_address, lon, lat,
                split_part(no,' ',1)||' '||split_part(no,' ',2) AS key
         FROM nz
         WHERE (split_part(no,' ',1)||' '||split_part(no,' ',2)) = ANY($2::text[])`,
        [fips, keys]
    );
    // bucket by key, dropping gov/company owners (name join can't distinguish a
    // dead person from a same-named company/agency -> exclude them outright)
    const bucket = new Map();
    for (const r of rows) {
        const o = r.owner_name || "";
        if (govRe.test(o) || companyRe.test(o)) continue;
        if (!bucket.has(r.key)) bucket.set(r.key, []);
        bucket.get(r.key).push(r);
    }
    for (const d of decs) {
        let cands = bucket.get(keyOf(d)) || [];
        if (!cands.length) { d.matchReason = "no_owner"; continue; }
        let conf = "name";
        // middle-name narrowing: prefer candidates carrying a middle token as a
        // whole word (or a lone initial) -> disambiguates common last+first pairs
        if (d.middle.length) {
            const mid = cands.filter((r) => {
                const o = ` ${(r.owner_name || "").toUpperCase()} `;
                return d.middle.some((m) => o.includes(` ${m} `) || (m.length === 1 && o.includes(` ${m}`)));
            });
            if (mid.length) { cands = mid; conf = "name_mid"; }
        }
        const byId = new Map();
        for (const r of cands) if (!byId.has(r.id)) byId.set(r.id, r);
        const uniq = [...byId.values()];
        // AMBIGUITY GUARD (bare last+first, no middle match): if the candidates
        // are clearly DIFFERENT people -- different first-middle tokens, e.g. a
        // decedent "MICHAEL HORNER" hitting both "HORNER MICHAEL KEVIN" and
        // "HORNER MICHAEL A" -- we can't tell which is the decedent, so DROP all
        // (never flag a living namesake). One identity across several parcels =
        // the same owner's multiple properties -> tie each (allowed).
        if (conf === "name") {
            const identity = (o) => {
                const t = (o || "").toUpperCase().split("&")[0].replace(/,/g, " ")
                    .replace(/\s+/g, " ").trim().split(" ").filter((x) => !SUFFIX.has(x));
                return t[2] || ""; // token after LAST FIRST = first middle token ("" if none)
            };
            const ids = new Set(uniq.map((r) => identity(r.owner_name)));
            if (ids.size > 1) { d.matchReason = `ambiguous_person(${ids.size})`; continue; }
        }
        // CAP: a name hitting too many parcels is too common -> DROP (wrong owner
        // is worse than no owner). Middle-narrowed sets are trusted at the cap too.
        if (uniq.length > MAX_TIE) { d.matchReason = `too_common(${uniq.length})`; continue; }
        d.matches = uniq.map((r) => ({ ...r, conf }));
        d.matchReason = "ok";
    }
}

// ------------------------------------------------------------------ upsert --

async function upsert(c, source, fips, cases) {
    // one row per (case -> matched parcel)
    const cols = { pid: [], sub: [], dt: [], ref: [], ad: [], lo: [], la: [], mt: [] };
    for (const k of cases) {
        for (const m of k.matches) {
            const ref = k.matches.length > 1 ? `${k.caseNo}:${m.id}` : `${k.caseNo}`;
            cols.pid.push(m.id);
            cols.sub.push(k.subtype || null);
            cols.dt.push(k.filingDate);
            cols.ref.push(ref);
            cols.ad.push(m.situs_address || null);
            cols.lo.push(m.lon ?? null);
            cols.la.push(m.lat ?? null);
            cols.mt.push(JSON.stringify({
                decedent: k.dec.raw,
                caseNumber: k.caseNo,
                filingType: k.filingType || null,
                court: k.court || null,
                match: m.conf,
                owner: m.owner_name,
            }));
        }
    }
    if (!cols.pid.length) return 0;
    await c.query("BEGIN");
    await c.query(
        `CREATE TEMP TABLE pb(parcel_id bigint, subtype text, event_date date, source_ref text, address text, lon float8, lat float8, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO pb SELECT * FROM unnest($1::bigint[],$2::text[],$3::date[],$4::text[],$5::text[],$6::float8[],$7::float8[],$8::text[]::jsonb[])`,
        [cols.pid, cols.sub, cols.dt, cols.ref, cols.ad, cols.lo, cols.la, cols.mt]
    );
    const { rows } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT pb.parcel_id, $2, 'probate', pb.subtype, pb.event_date, $1, pb.source_ref, pb.address, pb.lon, pb.lat, pb.meta
         FROM pb
         ON CONFLICT (source,signal_type,source_ref)
           DO UPDATE SET last_seen=current_date,
                         parcel_id=COALESCE(EXCLUDED.parcel_id, parcel_signals.parcel_id),
                         event_date=EXCLUDED.event_date,
                         address=EXCLUDED.address, meta=EXCLUDED.meta
         RETURNING (xmax = 0) AS inserted`,
        [source, fips]
    );
    await c.query("COMMIT");
    return rows.filter((r) => r.inserted).length;
}

// -------------------------------------------------------------------- core --

// subtype: coarse bucket of the filing type for downstream filtering
function subtypeOf(t) {
    const s = (t || "").toUpperCase();
    if (/MUNIMENT/.test(s)) return "muniment";
    if (/HEIRSHIP/.test(s)) return "heirship";
    if (/SMALL\s+ESTATE/.test(s)) return "small_estate";
    if (/ADMINISTRAT|INTESTAT/.test(s)) return "administration";
    if (/PROBAT|TESTAMENT|WILL/.test(s)) return "will";
    return "estate";
}

async function loadSource(c, name, cfg, parseOnly) {
    let cases;
    try {
        cases = await cfg.discover();
    } catch (e) {
        console.error(`${name}: discovery FAILED (${e.message})`);
        return;
    }
    if (!cases.length) {
        console.log(`${name}: discovery found no cases -- source layout may have changed`);
        return;
    }
    const kept = cases.filter((k) => isDecedentCase(k.filingType));
    const dropped = cases.length - kept.length;
    console.log(`${name}: ${cases.length} filings pulled, ${kept.length} decedent-type (${dropped} guardianship/other dropped)`);

    let badName = 0;
    const decs = [];
    for (const k of kept) {
        const dec = parseDecedent(k.decedentRaw);
        if (!dec) { badName++; continue; }
        k.dec = dec;
        k.subtype = subtypeOf(k.filingType);
        dec._case = k;
        decs.push(dec);
    }
    if (!c) { // parse-only without a DB: just report parse health
        console.log(`  parsed ${decs.length}/${kept.length} decedent names (${badName} unparseable); no DB -> no name-join`);
        for (const d of decs.slice(0, 10)) console.log(`    "${d.raw}" -> last=${d.last} first=${d.first} mid=[${d.middle}]`);
        return;
    }
    await matchAll(c, cfg.fips, decs);
    let matched = 0, tooCommon = 0, noOwner = 0, ties = 0;
    const out = [];
    for (const d of decs) {
        if (d.matches?.length) {
            const k = d._case;
            k.matches = d.matches;
            matched++;
            if (d.matches.length > 1) ties += d.matches.length;
            out.push(k);
        } else if ((d.matchReason || "").startsWith("too_common")) tooCommon++;
        else noOwner++;
    }
    console.log(
        `  name-join: ${matched}/${kept.length} decedents tied to a parcel ` +
        `(${out.reduce((n, k) => n + k.matches.length, 0)} parcel rows; ${ties} multi-parcel ties) | ` +
        `${tooCommon} dropped too-common | ${noOwner} no owner match | ${badName} unparseable name`
    );
    for (const k of out.slice(0, 10)) {
        const m = k.matches[0];
        console.log(`    ${k.dec.raw}  ->  ${m.owner_name} @ ${m.situs_address} [${m.conf}] case=${k.caseNo}`);
    }
    if (parseOnly || !c) return;
    const inserted = await upsert(c, name, cfg.fips, out);
    console.log(`  upserted ${out.reduce((n, k) => n + k.matches.length, 0)} rows (${inserted} new)`);
}

// ----------------------------------------------------------------- sources --
// Each source: { fips, discover() -> [{caseNo, decedentRaw, filingType, filingDate 'YYYY-MM-DD', court}] }.
// BULK/LIST access ONLY. Filled from the metro recon (see report). A --file
// source is always available for cracked feeds that dump their list to JSON.

// WIRED BULK PROBATE SURFACES (recon + live wiring 2026-07-16). Both return a
// LIST (date-filtered result set) with decedent style + case number + filing
// date + case type -- NO login/CAPTCHA. discover() functions above are live;
// `--file <cases.json> --fips NNNNN --source X` still works for cracked feeds.
//
//  harris_probate  48201  https://www.cclerk.hctx.net/applications/websearch/CourtSearch.aspx?CaseType=Probate
//      ASP.NET WebForms. Real fields: File-Date txtFrom/txtTo + ddlCourt(All|1-5)
//      + DropDownListStatus + btnSearchCase. GridView cols: Case, Court, File
//      Date, Status, Type Desc, Subtype, Style ("IN THE ESTATE OF: NAME,
//      DECEASED"). WRINKLE SOLVED: the "currently unavailable" gate clears when
//      you (a) carry the session cookie from the search-page GET and (b) POST the
//      FULL form field set (aspxFields) -- a minimal field POST is what triggers
//      it, not a missing disclaimer step. Flow: GET form -> POST -> 302
//      CourtSearch_R.aspx?ID=... -> GET results. Rows sort ASC + cap 200/page ->
//      date-chunked. Footer advertises a Data Sales/FTP bulk feed (datasales@cco.hctx.net).
//  bexar_probate   48029  Tyler Odyssey Justice Portal, anonymous, no CAPTCHA.
//      Flow SOLVED: GET /Portal/Home/Dashboard/26 (session cookie) -> POST
//      /Portal/Hearing/SearchHearings/HearingSearch with SearchCriteria.* (Court
//      =County Clerk, HearingType=County Clerk Civil Hearings, SearchByType=
//      Courtroom, SelectedCourtRoom=Probate courtroom id, DateFrom/DateTo,
//      Search=Submit) -> that stores criteria in session & 302s to /Portal/
//      (expected) -> POST /Portal/Hearing/HearingResults/Read (Kendo:
//      sort=&page=1&pageSize=200&group=&filter=) -> JSON Data[]. No
//      __RequestVerificationToken is required. Probate COURTROOM ids (distinct
//      from the judicial-officer ids): 30044/30045/86182 = Probate Court 1/2/3.
//      Rows: CaseNumber, Style ("NAME, DECEASED"), FileDate (/Date(ms)/),
//      CaseTypeId.Description. Searched by HEARING date -> ACTIVE cases; ~200 cap
//      -> date-chunked; de-duped by case across courtrooms.
//
// BLOCKED (skip-logged 2026-07-16, records-request candidates):
//  tarrant 48439 - portal-txtarrant .../PublicAccess/Search.aspx?ID=200 now 302s
//      to /PublicAccess/Login.aspx (auth wall); no /Portal/ (Odyssey) deployment
//      (404). Anonymous bulk search is gone; account creation is off-limits.
//  collin  48085 - identical to Tarrant: PublicAccess Search.aspx -> Login.aspx,
//      no /Portal/ (404). Auth-walled.
//  dallas 48113 - Smart Search needs a name/case#; Search Hearings returns 0
//      for anonymous users; probate docket .php pages mis-map to the civil docket.
//  travis 48453 - Odyssey deployment exposes NO date-range/hearing bulk query
//      (Bexar's /Dashboard/26 redirects to home here); only per-case name lookups.
// ---- live discover() scrapers (bulk/list surfaces; wired 2026-07-16) --------
// Cookie-aware session fetch: each portal gates its result set behind a session
// cookie set on the FIRST GET -- that IS the "priming" step the recon flagged;
// a plain per-request fetch drops it and the search comes back empty/blocked.
// redirect:"manual" so a search POST's 302 can be read (Harris) or ignored
// (Bexar). Lookback defaults to 60d (PROBATE_LOOKBACK_DAYS overrides).
const LOOKBACK_DAYS = +(process.env.PROBATE_LOOKBACK_DAYS || 60);

function session() {
    const jar = new Map();
    const put = (r) => { for (const c of (r.headers.getSetCookie?.() || [])) { const kv = c.split(";")[0], i = kv.indexOf("="); if (i > 0) jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); } };
    return async (url, opts = {}) => {
        const headers = { "User-Agent": UA, ...(opts.headers || {}) };
        if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
        const r = await fetch(url, { method: opts.method || "GET", headers, body: opts.body, redirect: "manual", signal: AbortSignal.timeout(opts.timeout || 20000) });
        put(r);
        return r;
    };
}
const mdy = (d) => { const p = (n) => String(n).padStart(2, "0"); return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`; };
const formBody = (f) => Object.entries(f).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v ?? "")).join("&");
// pull every posted field out of an ASP.NET WebForms page (hidden + the selected
// value of each <select>). Posting the FULL field set is what unblocks Harris's
// "This Search is currently unavailable" -- a minimal field set is rejected.
function aspxFields(html) {
    const f = {};
    for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
        const tag = m[0], name = (tag.match(/name="([^"]+)"/i) || [])[1]; if (!name) continue;
        const type = ((tag.match(/type="([^"]+)"/i) || [])[1] || "text").toLowerCase();
        if (type === "submit" || type === "button" || type === "image") continue;
        if ((type === "radio" || type === "checkbox") && !/checked/i.test(tag)) continue;
        f[name] = (tag.match(/value="([^"]*)"/i) || [, ""])[1];
    }
    for (const s of html.matchAll(/<select[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi)) {
        const sel = (s[2].match(/<option[^>]*selected[^>]*value="([^"]*)"/i) || s[2].match(/<option[^>]*value="([^"]*)"[^>]*selected/i) || [])[1];
        f[s[1]] = sel != null ? sel : ((s[2].match(/<option[^>]*value="([^"]*)"/i) || [])[1] || "");
    }
    return f;
}
// adaptive date-chunker: run pull(from,to)->rows over windowDays-sized windows;
// if a window returns >=cap rows the server truncated it -> recursively split so
// nothing is silently dropped. Per-window errors are logged and skipped (partial
// success beats aborting the whole metro).
async function chunkByDate(startMs, endMs, windowDays, cap, pull, label) {
    const out = [];
    const split = async (a, b, depth) => {
        let rows;
        try { rows = await pull(new Date(a), new Date(b)); }
        catch (e) { console.error(`  ${label} ${mdy(new Date(a))}..${mdy(new Date(b))} FAILED: ${e.message}`); return; }
        if (rows.length >= cap && b - a > 864e5 && depth < 7) {
            const mid = a + Math.floor((b - a) / 2 / 864e5) * 864e5;
            await split(a, mid, depth + 1);
            await split(mid + 864e5, b, depth + 1);
        } else out.push(...rows);
    };
    for (let ws = startMs; ws <= endMs; ws += windowDays * 864e5)
        await split(ws, Math.min(ws + (windowDays - 1) * 864e5, endMs), 0);
    return out;
}

// Harris County Clerk CourtSearch (48201, ASP.NET WebForms). GET the probate
// search page (sets ASP.NET_SessionId), POST the File-Date range carrying the
// FULL form field set -> 302 to CourtSearch_R.aspx?ID=... -> GET that -> parse
// the GridView. Rows sort ASC by file date and hard-cap at 200/page, so a wide
// window silently truncates -> date-chunk (chunkByDate splits on the cap).
async function harrisDiscover(lookbackDays = LOOKBACK_DAYS, windowDays = 3) {
    const BASE = "https://www.cclerk.hctx.net/applications/websearch";
    const FORM = BASE + "/CourtSearch.aspx?CaseType=Probate";
    const req = session();
    const pull = async (from, to) => {
        const f = aspxFields(await (await req(FORM)).text());
        f["ctl00$ContentPlaceHolder1$txtFileNo"] = "";
        f["ctl00$ContentPlaceHolder1$txtFrom"] = mdy(from);
        f["ctl00$ContentPlaceHolder1$txtTo"] = mdy(to);
        f["ctl00$ContentPlaceHolder1$ddlCourt"] = "All";
        f["ctl00$ContentPlaceHolder1$DropDownListStatus"] = "-All";
        f["ctl00$ContentPlaceHolder1$btnSearchCase"] = "Search";
        const p = await req(FORM, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: FORM, Origin: "https://www.cclerk.hctx.net" }, body: formBody(f) });
        const loc = p.headers.get("location"); const pbody = await p.text();
        if (!loc) throw new Error(/currently unavailable/i.test(pbody) ? "search unavailable" : `no redirect (HTTP ${p.status})`);
        const html = await (await req(new URL(loc, BASE + "/").href)).text();
        if (/currently unavailable/i.test(html)) throw new Error("search unavailable");
        const rows = [];
        for (const t of html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)) {
            // cols: Events, Case, Court, File Date, Status, Type Desc, Subtype, Style, ...
            const c = [...t[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => x[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim());
            if (c.length < 8 || !c[1] || !c[7]) continue;              // skip header/pager (no case# / style)
            const [mm, dd, yy] = (c[3] || "").split("/");
            rows.push({ caseNo: c[1], court: c[2] || null, filingDate: yy ? `${yy}-${mm}-${dd}` : "", filingType: c[5] || "", decedentRaw: c[7] });
        }
        return rows;
    };
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const rows = await chunkByDate(end.getTime() - lookbackDays * 864e5, end.getTime(), windowDays, 200, pull, "harris");
    const seen = new Set(), out = [];                                  // adjacent windows can't overlap, but de-dup defensively
    for (const r of rows) { const k = r.caseNo + "|" + r.decedentRaw; if (!seen.has(k)) { seen.add(k); out.push(r); } }
    return out;
}

// Bexar County Justice Portal (48029, Tyler Odyssey). GET Dashboard/26 (session
// cookie), POST the hearing-search criteria per Probate courtroom + hearing-date
// window (this stores the criteria server-side; the 302 back to /Portal/ is
// expected, NOT a failure), then POST the Kendo results endpoint -> JSON Data[].
// Anonymous, no CAPTCHA. Caps ~200/query -> date-chunk. Search is by HEARING
// date, so this surfaces ACTIVE probate cases; FileDate (true filing date) is
// kept as event_date and we de-dup by case number across the 3 courtrooms.
async function bexarDiscover(lookbackDays = LOOKBACK_DAYS, windowDays = 10) {
    const HOST = "https://portal-txbexar.tylertech.cloud";
    const DASH = HOST + "/Portal/Home/Dashboard/26";
    const COURTROOMS = { "30044": "Probate Court 1", "30045": "Probate Court 2", "86182": "Probate Court 3" };
    const req = session();
    let primed = false;
    const epoch = (s) => { const m = /\/Date\((\d+)\)\//.exec(s || ""); return m ? new Date(+m[1]).toISOString().slice(0, 10) : ""; };
    const pullCourt = (courtId) => async (from, to) => {
        if (!primed) { await (await req(DASH)).text(); primed = true; }
        const crit = {
            PortletName: "HearingSearch", "Settings.CaptchaEnabled": "False", "Settings.DefaultLocation": "All Locations",
            "SearchCriteria.SelectedCourt": "County Clerk", "SearchCriteria.SelectedHearingType": "County Clerk Civil Hearings",
            "SearchCriteria.SearchByType": "Courtroom", "SearchCriteria.Soundex": "false",
            "SearchCriteria.SearchValue": "", "SearchCriteria.LastNameValue": "", "SearchCriteria.FirstNameValue": "", "SearchCriteria.MiddleNameValue": "",
            "SearchCriteria.SelectedJudicialOfficer": "", "SearchCriteria.SelectedCourtRoom": courtId,
            "SearchCriteria.DateFrom": mdy(from), "SearchCriteria.DateTo": mdy(to), Search: "Submit",
        };
        const s = await req(HOST + "/Portal/Hearing/SearchHearings/HearingSearch", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Referer: DASH, Origin: HOST }, body: formBody(crit) });
        await s.text();
        const r = await req(HOST + "/Portal/Hearing/HearingResults/Read", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Referer: DASH, Origin: HOST, Accept: "application/json,*/*" }, body: "sort=&page=1&pageSize=200&group=&filter=" });
        const j = JSON.parse(await r.text());
        return (j.Data || []).map((x) => ({ caseNo: x.CaseNumber, court: x.CourtRoom || COURTROOMS[courtId], filingDate: epoch(x.FileDate), filingType: x.CaseTypeId?.Description || "", decedentRaw: x.Style || x.SortStyleOrDefendant || "" }));
    };
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const byCase = new Map();
    for (const courtId of Object.keys(COURTROOMS)) {
        const rows = await chunkByDate(end.getTime() - lookbackDays * 864e5, end.getTime(), windowDays, 200, pullCourt(courtId), "bexar/" + COURTROOMS[courtId]);
        for (const r of rows) if (r.caseNo && !byCase.has(r.caseNo)) byCase.set(r.caseNo, r);
    }
    return [...byCase.values()];
}

const SOURCES = {
    harris_probate: { fips: "48201", discover: () => harrisDiscover() },
    bexar_probate: { fips: "48029", discover: () => bexarDiscover() },
};

// --file <path>: treat a local JSON array of cases as one source. `--fips NNNNN`
// (or a "fips" field on each row) sets the county. Lets a cracked bulk feed be
// piped in as JSON without hardcoding its scraper here, and drives the self-test.
function fileSource(path, fipsArg) {
    return {
        fips: fipsArg,
        discover: async () => {
            const arr = JSON.parse(readFileSync(path, "utf8"));
            return arr.map((r) => ({
                caseNo: String(r.caseNo ?? r.case_no ?? r.cause ?? r.id),
                decedentRaw: r.decedentRaw ?? r.decedent ?? r.style ?? r.name,
                filingType: r.filingType ?? r.type ?? r.case_type ?? "",
                filingDate: (r.filingDate ?? r.date ?? r.filed ?? "").slice(0, 10),
                court: r.court ?? null,
            }));
        },
    };
}

async function main() {
    const args = process.argv.slice(2);
    const parseOnly = args.includes("--parse-only");
    const fileArg = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
    const fipsArg = args.includes("--fips") ? args[args.indexOf("--fips") + 1] : null;
    const srcArg = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;
    const flagVals = new Set(["--file", "--fips", "--source"]);
    const want = args.filter((a, i) => !a.startsWith("--") && !flagVals.has(args[i - 1]));

    const sources = {};
    if (fileArg) sources[srcArg || `file:${fileArg.split(/[\\/]/).pop()}`] = fileSource(fileArg, fipsArg);
    for (const n of want.length ? want : Object.keys(SOURCES)) if (SOURCES[n]) sources[n] = SOURCES[n];
    if (!Object.keys(sources).length) throw new Error("no sources selected (use --file cases.json --fips NNNNN, or add a SOURCES entry)");

    let c = null;
    if (!parseOnly && !process.env.DATABASE_URL) throw new Error("DATABASE_URL required (or use --parse-only)");
    if (process.env.DATABASE_URL) {
        c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 180000, keepAlive: true });
        await c.connect();
    }
    for (const [n, cfg] of Object.entries(sources)) {
        if (!cfg.fips) { console.error(`${n}: no fips set (pass --fips NNNNN)`); continue; }
        try {
            await loadSource(c, n, cfg, parseOnly);
        } catch (e) {
            console.error(`${n} FAILED:`, e.message);
        }
    }
    if (c) await c.end();
}

main();
