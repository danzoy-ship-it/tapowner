// Foreclosure REVISIT-QUEUE loader (2026-07-16 pass): counties flagged in
// FORECLOSURE_COVERAGE.md as unfinished but NOT blocked on a clean IP.
// Standalone sibling of load_pdf_foreclosures.mjs -- imports its shared
// fetchText/UA helpers only; does NOT edit that file's SOURCES (parser fixes
// needed for the revisit run were made directly, minimally, in that shared
// file and in load_fc_ne_southcentral.mjs -- see their own change comments).
//
// This file covers the ONE genuine "crack" from the revisit queue: Orange
// County's legacy AS400 "Real Vision Software" grid. It does NOT use the
// discover/parsePacket/directMatch PDF pipeline at all (there is no PDF and
// no address -- the grid is owner-name + sale-date only), so it has its own
// bespoke fetch -> parse-rows -> matchOwnerName -> upsert flow, reusing
// matchOwnerName (token-AND against parcels.owner_name, GOV_OWNER-guarded,
// unique-match-only) imported from load_kofile_foreclosures.mjs.
//
// Childress (48075) and the parser-gap counties (Karnes/La Salle/Brooks/
// Newton/Sabine) were investigated this same pass but yielded nothing new --
// see FORECLOSURE_COVERAGE.md for the per-county disposition; no SOURCES
// entry needed here since there's nothing loadable for them right now.
//
//   DATABASE_URL=... node scripts/signals/load_fc_revisit.mjs [--parse-only]

import pkg from "pg";
import { UA } from "./load_pdf_foreclosures.mjs";
import { matchOwnerName } from "./load_kofile_foreclosures.mjs";
const { Client } = pkg;

const ORANGE_FIPS = "48361";
const ORANGE_BASE = "http://as400.co.orange.tx.us:8081";

async function fetchOrangeGrid() {
    // Step 1: GET the search-results grid (already filtered server-side to
    // doc-type "FN" = Foreclosure Notice by the query string isys=E&i7=FN).
    // No auth, no cookies -- entire "session" state round-trips through
    // hidden form fields the page itself echoes back (classic stateless
    // AS400-over-HTTP green-screen wrapper).
    const r1 = await fetch(
        `${ORANGE_BASE}/pgms/rvimain.pgm?rqstyp=rvisubf&isys=E&i7=FN&usr=online&pass=search&deltyp=p`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) }
    );
    if (!r1.ok) throw new Error(`orange initial GET -> HTTP ${r1.status}`);
    const html1 = await r1.text();
    const hidden = {};
    for (const m of html1.matchAll(/<INPUT TYPE="hidden" name="([^"]+)"(?:\s+value="([^"]*)")?/gi))
        hidden[m[1]] = m[2] || "";
    // Step 2: re-POST the same form with pagecnt bumped to the grid's own
    // max dropdown option (36) to get most/all rows in one shot instead of
    // paginating 12 at a time (39 total records observed 2026-07-16; a
    // couple of the oldest may be left on page 2 -- acceptable, re-runs are
    // idempotent and will pick up any that roll onto page 1 as newer ones post).
    const body = new URLSearchParams({ ...hidden, RQSTYP: "RVISUBFA", pagecnt: "36" });
    const r2 = await fetch(`${ORANGE_BASE}/pgms/RVIMAIN.PGM`, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(20000),
    });
    if (!r2.ok) throw new Error(`orange grid POST -> HTTP ${r2.status}`);
    return r2.text();
}

// Row shape: a checkbox/onclick block carrying the stable internal doc code
// ("EAAABMK4"), then FILE DATE, PRIMARY PARTY, SALE DATE, DOC NUM, DOC TYPE.
const ROW_RE =
    /onclick="RTNA\('([A-Z0-9]+)\.[\d,]+;[A-Z0-9]+'\);"[\s\S]{0,300}?&nbsp;(\d{4}-\d{2}-\d{2})<\/TD><TD NOWRAP>&nbsp;([^<]+)<\/TD><TD NOWRAP>&nbsp;(\d{4}-\d{2}-\d{2})<\/TD><TD NOWRAP>&nbsp;(\d+)<\/TD><TD NOWRAP>&nbsp;([^<]+)<\/TD>/g;

function parseOrangeRows(html) {
    const today = new Date().toISOString().slice(0, 10);
    const out = [];
    for (const m of html.matchAll(ROW_RE)) {
        const [, docCode, fileDate, party, saleDate, docNum, docType] = m;
        if (!/FORECLOSURE\s+NOTICE/i.test(docType)) continue; // skip other doc types on the same grid
        if (saleDate < today) continue; // RULE: future/current-dated only
        out.push({ docCode, fileDate, party: party.trim(), saleDate, docNum, docType: docType.trim() });
    }
    // dedupe by docCode (stable per-document identifier)
    const seen = new Set();
    return out.filter((r) => (seen.has(r.docCode) ? false : (seen.add(r.docCode), true)));
}

async function loadOrange(c, parseOnly) {
    let html;
    try {
        html = await fetchOrangeGrid();
    } catch (e) {
        console.error(`orange_cc FAILED: ${e.message}`);
        return;
    }
    const rows = parseOrangeRows(html);
    console.log(`orange_cc: ${rows.length} in-window FORECLOSURE NOTICE row(s) from the AS400 grid`);
    for (const r of rows.slice(0, 8)) console.log(`  ${r.saleDate}  ${r.party}  (filed ${r.fileDate}, doc ${r.docNum})`);
    if (parseOnly || !rows.length) return;

    let tied = 0;
    const cols = { ref: [], addr: [], pid: [], lon: [], lat: [], ev: [], meta: [] };
    for (const r of rows) {
        let match = null;
        try {
            match = await matchOwnerName(c, ORANGE_FIPS, r.party);
        } catch (e) {
            console.error(`  orange ${r.party}: owner-match query failed (${e.message})`);
        }
        if (match) tied++;
        cols.ref.push(r.docCode);
        cols.addr.push(r.party);
        cols.pid.push(match ? match.parcel_id : null);
        cols.lon.push(match ? match.lon ?? null : null);
        cols.lat.push(match ? match.lat ?? null : null);
        cols.ev.push(r.saleDate);
        cols.meta.push(JSON.stringify({ fileDate: r.fileDate, docNum: r.docNum, docType: r.docType, match: match ? "owner_name" : null }));
    }
    await c.query("BEGIN");
    await c.query(
        `CREATE TEMP TABLE fc_orange(source_ref text, address text, parcel_id bigint, lon float8, lat float8, event_date date, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO fc_orange SELECT * FROM unnest($1::text[],$2::text[],$3::bigint[],$4::float8[],$5::float8[],$6::date[],$7::text[]::jsonb[])`,
        [cols.ref, cols.addr, cols.pid, cols.lon, cols.lat, cols.ev, cols.meta]
    );
    const { rows: up } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT fo.parcel_id, $1, 'pre_foreclosure', 'mortgage', fo.event_date, 'orange_cc', fo.source_ref, fo.address, fo.lon, fo.lat, fo.meta
         FROM fc_orange fo
         ON CONFLICT (source,signal_type,source_ref)
           DO UPDATE SET last_seen=current_date,
                         parcel_id=COALESCE(EXCLUDED.parcel_id, parcel_signals.parcel_id),
                         lon=COALESCE(EXCLUDED.lon, parcel_signals.lon),
                         lat=COALESCE(EXCLUDED.lat, parcel_signals.lat),
                         address=EXCLUDED.address, meta=EXCLUDED.meta
         RETURNING (xmax = 0) AS inserted`,
        [ORANGE_FIPS]
    );
    await c.query("COMMIT");
    const inserted = up.filter((x) => x.inserted).length;
    console.log(`  orange_cc: matched ${tied}/${rows.length} by owner_name -> upserted ${rows.length} rows (${inserted} new)`);
}

const parseOnly = process.argv.includes("--parse-only");
let c = null;
if (!parseOnly) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required (or use --parse-only)");
    c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
}
await loadOrange(c, parseOnly);
if (c) await c.end();
