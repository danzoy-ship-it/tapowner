// County foreclosure-notice loader: East TX / Piney Woods RE-SCRUB pass.
// Standalone sibling of load_pdf_foreclosures.mjs (per the parallel-loader
// pattern added 2026-07-16) -- imports the shared discover/parse/match/
// upsert machinery and defines only this batch's SOURCES. Bounded ~35min
// re-attempt of counties previously logged as "no foreclosure signal", now
// that Tesseract OCR is installed and given evidence some earlier skips were
// WRONG-PAGE misses (Robertson, checked elsewhere today).
//
// Counties assigned: Anderson 48001, Camp 48063, Cherokee 48073, Delta 48119,
// Gregg 48183, Hardin 48199, Harrison 48203, Jasper 48241, Liberty 48291,
// Marion 48315, Nacogdoches 48347, Newton 48351, Orange 48361, Rains 48379,
// Red River 48387, Rusk 48401, Sabine 48403, San Augustine 48405,
// Trinity 48455, Leon 48289, Falls 48145.
//
// RESULT SUMMARY (see bottom SKIPPED block for full per-county detail):
//   - Falls (48145): WRONG-PAGE RESCUE. Not on a "/page/Foreclosures" slug --
//     lives in an accordion on /page/County.Clerk ("Foreclosures/Notice of
//     [Substitute] Trustee Sale 2026"), anchor text carries the sale date
//     directly. LOADED below.
//   - Newton (48351): OCR RESCUE. Filenames/anchor text carry NO date at all
//     (case-number naming); this file OCRs each of the (small, ~7-doc) set
//     directly inside discover() to read "Date, Time, and Place of Sale"
//     from the body -- previously impossible, now works. LOADED below.
//   - Marion 48315, Rains 48379, Leon 48289, Sabine 48403: already have
//     working discover() elsewhere (load_fc_ne_southcentral.mjs for the
//     first two, load_pdf_foreclosures.mjs for the last two) but 0 rows
//     exist yet in parcel_signals for any of them -- NOT redefined here
//     (would duplicate a sibling's SOURCES key); flag to just RUN those
//     existing sources.
//   - Orange (48361): PARTIAL FIND, not loaded. The county DOES post real
//     foreclosure notices online -- an AS400 "Real Vision Software" grid at
//     http://as400.co.orange.tx.us:8081/pgms/rvimain.pgm?rqstyp=rvisubf&isys=E&i7=FN&usr=online&pass=search&deltyp=p
//     returns a live, unauthenticated GET table (file date / primary party /
//     sale date / doc#) with real July 2026 entries -- but the grid carries
//     owner NAME only, no street address; each row's document image opens
//     via a JS form POST (session-bound __VIEWSTATE-style postback), not a
//     plain GET, so it couldn't be pulled within this pass's budget. Flag
//     for a follow-up session with more time (POST-emulation or a browser
//     session) -- this is a real signal source, not a genuine absence.
//   - Harrison (48203): every host tried (www.co.harrison.tx.us,
//     harrisoncountytx.gov, bare co.harrison.tx.us, http and https) timed
//     out at the TCP level from this environment (curl AND node fetch AND
//     the browser tool all failed to connect) -- this reads as a network
//     path block from this sandbox, NOT a site-side absence determination.
//     Flag for re-check from a different egress path.
//   - All other counties: confirmed genuine absence or confirmed-blocked
//     platform -- see SKIPPED block.
//
//   DATABASE_URL=... node scripts/signals/load_fc_rescrub_east.mjs [--parse-only] [source...]

import { runSources, fetchText, MONTHS, inWindow, UA } from "./load_pdf_foreclosures.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const basename = (p) => decodeURIComponent(p.split("/").pop());

// --- minimal local fetch+OCR, used ONLY by newton_cc's discover() to read
// the sale date out of the document body (no date anywhere in the filename
// or anchor text on that county's page). Duplicated in miniature from
// load_pdf_foreclosures.mjs's fetchPdf/extractText rather than importing
// them, since those aren't exported and editing that shared file mid-parallel
// -campaign is off-limits. loadSource() will separately re-fetch+re-OCR the
// same packet via its own cache once discover() hands back a {year,month} --
// small, bounded duplicate cost for a 7-document county.
const CACHE = path.join(os.tmpdir(), "fc_rescrub_east_cache");
const PDFTOTEXT = existsSync("C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe")
    ? "C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe"
    : "pdftotext";
const OCR_HELPER = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "pdf_ocr_text.py");

async function fetchPdfLocal(url, name) {
    mkdirSync(CACHE, { recursive: true });
    const file = path.join(CACHE, name.replace(/[^\w.-]+/g, "_"));
    if (existsSync(file) && statSync(file).size > 5000) return file;
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000), redirect: "follow" });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000 || !buf.subarray(0, 5).toString().startsWith("%PDF")) throw new Error(`${url} -> not a PDF`);
    writeFileSync(file, buf);
    return file;
}

function extractTextLocal(pdfFile) {
    const cacheFile = pdfFile + ".txt";
    if (existsSync(cacheFile)) return readFileSync(cacheFile, "utf8");
    let text = "";
    try {
        text = execFileSync(PDFTOTEXT, ["-layout", pdfFile, "-"], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
    } catch { /* fall through to OCR */ }
    if (text.replace(/\s/g, "").length < 150) {
        const r = spawnSync("python", [OCR_HELPER, pdfFile], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8", timeout: 300000 });
        if (r.status !== 0) throw new Error(`OCR failed: ${(r.stderr || "").slice(0, 300)}`);
        text = r.stdout;
    }
    writeFileSync(cacheFile, text);
    return text;
}

const SOURCES = {
    // Falls County clerk (CivicLive, co.falls.tx.us): NOT on a dedicated
    // /page/Foreclosures slug (403s) -- the notices sit inside an accordion
    // on /page/County.Clerk itself ("Foreclosures/Notice of [Substitute]
    // Trustee Sale 2026" heading), same family as Madison/Hill. Anchor TEXT
    // carries the sale date directly ("August 4, 2026", "May 5,2026 #1" --
    // tolerate the missing space before the year). WRONG-PAGE RESCUE: a
    // discover() targeting only "/page/Foreclosures" would 403 and miss this
    // entirely.
    falls_cc: {
        fips: "48145",
        // sale venue: south side steps, Falls County Courthouse, 125 Bridge
        // St, Marlin (printed on the notices) -- pin the house number too,
        // since the sweep can capture just the bare "125 BRIDGE ST.,
        // MARLIN, TX 76661" caption line without "COURTHOUSE" nearby it.
        venue: /COURT\s*HOUSE|\b125\s+BRIDGE\s+ST/i,
        discover: async () => {
            const base = "https://www.co.falls.tx.us";
            const html = await fetchText(base + "/page/County.Clerk");
            const idx = html.indexOf("Foreclosures/Notice of [Substitute] Trustee Sale");
            if (idx < 0) return [];
            // this year's accordion panel only -- avoid also matching the
            // 2025 (stale) panel that follows it on the same page
            const seg = html.slice(idx, idx + 12000);
            const out = [], seen = new Set();
            for (const m of seg.matchAll(/href="([^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const href = m[1];
                if (seen.has(href)) continue;
                seen.add(href);
                out.push({
                    url: base + encodeURI(href),
                    year,
                    month: mon,
                    name: `falls_${year}-${String(mon).padStart(2, "0")}_${basename(href).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Newton County clerk (CivicLive, co.newton.tx.us): /page/newton.county.clerk
    // lists per-notice PDFs (/upload/page/3507/docs/Foreclosures/<case#> <name>.pdf)
    // in a static side-menu widget -- filename and anchor text carry a filing
    // CASE NUMBER, never a date (confirmed again this pass). Small county
    // (~7 docs total) -- OCR RESCUE: discover() fetches+OCRs each doc itself
    // (Tesseract wasn't installed when this was first checked) and reads the
    // sale date out of "1. Date, Time, and Place of Sale. Date: ... MM/DD/YYYY"
    // in the body. Property descriptions are rural metes-and-bounds (no
    // street address on the parcel itself); the notices also carry a posting-
    // location stamp ("520 Hwy 87 S, Newton, TX 75966") that is NOT the
    // subject property -- added to the venue regex so the shared boilerplate
    // filter drops it instead of mismatching it to a real parcel.
    newton_cc: {
        fips: "48351",
        venue: /COURT\s*HOUSE|520\s+HWY\s*87\s*S/i,
        discover: async () => {
            const base = "https://www.co.newton.tx.us";
            const html = await fetchText(base + "/page/newton.county.clerk");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/3507\/docs\/Foreclosures\/[^"]+\.pdf)"/gi)) {
                const href = m[1];
                let file, text;
                try {
                    file = await fetchPdfLocal(base + encodeURI(href), `newton_${basename(href)}`);
                    text = extractTextLocal(file);
                } catch (e) {
                    console.error(`  newton ${basename(href)}: fetch/OCR failed (${e.message})`);
                    continue;
                }
                const dm =
                    text.match(/Date,?\s*Time,?\s*and\s*Place\s*of\s*Sale[\s\S]{0,120}?(\d{1,2})\/(\d{1,2})\/(20\d{2})/i) ||
                    text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
                if (!dm) {
                    console.error(`  newton ${basename(href)}: no date found in OCR text`);
                    continue;
                }
                const mon = +dm[1], year = +dm[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(href),
                    year,
                    month: mon,
                    name: `newton_${year}-${String(mon).padStart(2, "0")}_${basename(href).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },

    // ------------------------------------------------------- SKIPPED ------
    // Anderson (48001), Nacogdoches (48347), Rusk (48401): all three now sit
    // behind .search.kofile.com (andersontx / nacogdochestx / rusktx) --
    // confirmed this pass to still be the DIFFERENT, INCOMPATIBLE Kofile
    // flavor documented as DISABLED in load_kofile_foreclosures.mjs (not the
    // .tx.publicsearch.us system that loader knows how to drive; the anon-
    // token/WebSocket handshake never connects). Known-blocked, confirm+skip
    // per campaign rule.
    // Cherokee (48073): homepage (legacy static co.cherokee.tx.us/ips/cms
    // site, NOT CivicLive) -> County Clerk page links "Cherokee County
    // Foreclosure Listings" straight to i2i.uslandrecords.com/TX/Cherokee/D/
    // Default.aspx -- the uslandrecords.com platform is on the known-blocked
    // list. Confirmed + skip.
    // Delta (48119): reconfirmed this pass -- deltacountytx.com bare-domain
    // connection refused/times out, www.deltacountytx.com returns 403
    // (Cloudflare managed challenge, same as the earlier finding today).
    // Skip.
    // Gregg (48183): co.gregg.tx.us redirects to a rebuilt texas.gov
    // templated site (greggcounty.texas.gov). Checked the homepage, the
    // /news-events/events?category=foreclosure filter (the category param is
    // silently ignored -- it returns generic Commissioners' Court meetings
    // and holidays, not foreclosure notices), /departments/county-clerk, and
    // /public-notices: no foreclosure/trustee-sale content anywhere. No
    // foreclosure notice system found online for this platform. Skip
    // (right pages checked, not just a guess).
    // Harrison (48203): NOT confirmed either way -- see PARTIAL FIND note at
    // top; every connection attempt (curl, node fetch, browser) timed out
    // from this environment. Re-check from a different network path.
    // Hardin (48199): hardincountytx.gov -- both /page/Foreclosures AND
    // /page/PublicNotices (checked both this pass, not just the first) load
    // fine (200) but their content blocks are genuinely empty of foreclosure
    // PDFs right now (only a "2026 Hardin County Holidays.pdf" on either
    // page). Right pages confirmed; no current postings. Skip.
    // Jasper (48241): co.jasper.tx.us/page/jasper.Foreclosures is a CivicLive
    // CALENDAR widget (client-rendered); its iCal feed is stale (every event
    // dated 2018, reconfirmed). No current notice system online. Skip.
    // Liberty (48291): co.liberty.tx.us/page/liberty.Foreclosures -- per-
    // notice PDFs exist but the newest accordion heading is still "AUGUST
    // 2023" (reconfirmed), ~3 years stale. Per the staleness rule, skip.
    // Camp (48063): /page/camp.NOTICEOFFORECLOSURESALEFILEDWITHCOUNTYCLERK
    // is a Telerik RadLightBox/ASP.NET WebForms doc viewer -- raw HTML is
    // __VIEWSTATE junk, no static PDF hrefs, content is client-rendered.
    // Skip.
    // Red River (48387): reconfirmed -- no dedicated foreclosure/trustee page
    // in the county nav (Home, County Clerk, Public Notices checked); Public
    // Notices links one unrelated employment PDF. Skip.
    // Sabine (48403), Leon (48289): already have working discover() entries
    // in load_pdf_foreclosures.mjs (sabine_cc, leon_cc) -- NOT redefined
    // here. 0 rows currently in parcel_signals for either fips; run those
    // existing sources directly rather than duplicating them in this file.
    // Marion (48315), Rains (48379): same story, already defined in
    // load_fc_ne_southcentral.mjs (marion_cc, rains_cc). Not redefined here.
    // San Augustine (48405): RIGHT PAGE CONFIRMED --
    // co.san-augustine.tx.us/page/sanaugustine.Foreclosures lists real
    // per-notice image-only PDFs under /upload/page/10677/<year>/ (filenames
    // carry NO date, year-folder only) -- OCR pipeline verified WORKING on
    // this county's actual notices (a sample decoded cleanly: "NOTICE OF
    // SUBSTITUTE TRUSTEE'S SALE ... DECEMBER 2, 2025 ... SAN AUGUSTINE
    // COUNTY COURTHOUSE, 100 W. COLUMBIA"). But every PDF's HTTP
    // Last-Modified header is 2025 or earlier (newest: Dec 1, 2025, ~7.5
    // months stale vs. today); no 2026 folder exists yet
    // (/upload/page/10677/2026/ -> 404). Confirmed genuine absence for the
    // current window, not a platform or OCR problem -- re-check when the
    // clerk posts 2026 notices.
    // Trinity (48455): reconfirmed -- every clerk/foreclosure-style /page/
    // slug (trinity.County.Clerk, County.Clerk, trinity.CountyClerk,
    // trinity.Foreclosures) 403s; the one 200 is trinity.PublicNotices,
    // which carries only tax-rate/budget-hearing notices, no foreclosure
    // content. No foreclosure/trustee-sale page found online. Skip.
    // Orange (48361): see PARTIAL FIND note at top -- NOT a genuine absence,
    // just not loadable within this pass's budget.
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const chosen = want.length ? Object.fromEntries(want.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(chosen, { parseOnly });
