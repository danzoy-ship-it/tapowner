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

// CONFIRMED BULK PROBATE SURFACES (metro recon 2026-07-16). All return a LIST
// (case-type/date-filtered result set) with decedent style + case number +
// filing date + case type -- NO login/CAPTCHA. Each still needs a discover()
// scraper; the wrinkle noted is the only thing between it and a live pull, and
// the proven ingestion today is `--file <cases.json> --fips NNNNN --source X`.
//
//  harris_probate  48201  https://www.cclerk.hctx.net/applications/websearch/CourtSearch.aspx?CaseType=Probate
//      ASP.NET WebForms, File Date From/To (txtFrom/txtTo) + ddlCourt(1-5),
//      btnSearch -> GridView, ~245 rows/week, style "IN THE ESTATE OF: NAME,
//      DECEASED". WRINKLE: raw GET->POST returns "This Search is currently
//      unavailable" -- the search needs in-session priming the browser does
//      (a disclaimer/settings step) before the results bind. Browser-driven
//      extraction works (recon proved it); unattended scraper = TODO.
//      Footer also advertises a Data Sales / FTP bulk feed (datasales@cco.hctx.net).
//  bexar_probate   48029  POST https://portal-txbexar.tylertech.cloud/Portal/Hearing/HearingResults/Read
//      Tyler Odyssey "Search Hearings" JSON. Body: Location=County Clerk,
//      HearingType=County Clerk Civil Hearings, SearchType=Courtroom,
//      Courtroom=Probate Court 1|2|3, DateFrom/DateTo. Rows carry CaseNumber,
//      Style (decedent), FileDate (epoch ms), CaseTypeId.Description. WRINKLE:
//      needs a session + __RequestVerificationToken from a prior settings POST.
//  tarrant_probate 48439  https://portal-txtarrant.tylertech.cloud/PublicAccess/Search.aspx?ID=200
//      Tyler Odyssey Public Access WebForms, SearchBy=DateFiled(6) +
//      DateFiledOnAfter/OnBefore, location=All Probate Courts. Style "In the
//      Estate of NAME, Deceased". Caps at 200 rows/query -> chunk ~2wk windows.
//  collin_probate  48085  https://portal-txcollin.tylertech.cloud/PublicAccess/Search.aspx?ID=200
//      Same Odyssey Public Access pattern as Tarrant (PB1- estate / GA1- guardianship).
//
// BLOCKED (skip-logged, records-request candidates):
//  dallas 48113 - Smart Search needs a name/case#; Search Hearings returns 0
//      for anonymous users; probate docket .php pages mis-map to the civil docket.
//  travis 48453 - Odyssey deployment exposes NO date-range/hearing bulk query
//      (Bexar's /Dashboard/26 redirects to home here); only per-case name lookups.
const SOURCES = {
    // discover() scrapers go here (see recipes above). Until wired, use --file.
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
