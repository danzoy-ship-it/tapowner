// RE-SCRUB pass (2026-07-16): South Plains + near-north counties that had NO
// foreclosure signal from earlier sessions -- re-attempted now that Tesseract
// OCR is installed and knowing some earlier skips were WRONG-PAGE misses (the
// dedicated-page check missed notices embedded inside the County Clerk page
// itself, e.g. Crosby/Garza). Standalone sibling of load_pdf_foreclosures.mjs
// -- imports the shared discover/extract/parse/match/upsert machinery, adds
// only this batch's SOURCES. Do NOT edit the shared file (parallel wave).
//
//   DATABASE_URL=... node scripts/signals/load_fc_rescrub_south_plains.mjs [--parse-only] [source...]
//
// Assigned counties (19): Bailey 48017, Cochran 48079, Crosby 48107,
// Floyd 48153, Foard 48155, Garza 48169, Hardeman 48197, Hockley 48219,
// Knox 48275, Lynn 48305, Potter 48375, Terry 48445, Yoakum 48501,
// Baylor 48023, Wilbarger 48487, Young 48503, Clay 48077, Jack 48237,
// Throckmorton 48447, Wichita 48485.
//
// --- RESULTS SUMMARY (2026-07-16) -------------------------------------------
// RESCUED (5 new loadable sources, all found by checking the County Clerk
// page itself rather than trusting "no dedicated foreclosure page" absence):
//   crosby_cc, yoakum_cc, hockley_cc, garza_cc, terry_cc.
// RESCUED (dates hidden inside the PDF, not the page -- OCR/text-layer read):
//   lynn_cc (2 notices, page carries only case numbers as anchor text).
// ALREADY COVERED elsewhere (not duplicated here):
//   young_cc already loaded in load_fc_cross_timbers.mjs (verified still
//   correct -- only stale April-2026 postings today, 0 in-window).
//   wilbarger_cc already skip-logged in load_fc_rolling_plains.mjs
//   (uslandrecords.com paywall) -- re-confirmed below, no new entry needed.
//
// --- SKIP-LOG (confirmed absence / known-blocked, checked the RIGHT pages) -
// bailey_cc    48017 - co.bailey.tx.us. County Clerk page: zero foreclosure
//              mentions. Public Notices CALENDAR page DOES surface a
//              "Foreclosure Sale" category (event-type="1602") in its filter
//              widget -- so the CMS supports foreclosure events in principle
//              -- but the calendar is a WebForms/JS widget with no visible
//              PDF links or static markup for any actual tagged event, and no
//              discoverable AJAX/API endpoint in the static HTML to query
//              directly. Not "confirmed absence" so much as "not scrapeable
//              in this pass" -- worth a browser-page-capture revisit (same
//              class as Travis/Collin) if this stays a priority county.
// cochran_cc   48079 - co.cochran.tx.us's County Clerk page links straight to
//              foreclosures.uslandrecords.com/FAM/TX/Cochran/Foreclosures.aspx
//              (503 today; same paywalled uslandrecords.com family as
//              Wilbarger/Hutchinson's confirmed skips). No page content, no
//              free access. Skip.
// floyd_cc     48153 - co.floyd.tx.us's County Clerk page nav DOES have a
//              "Foreclosures" menu entry (explains the earlier "wrong page"
//              flag) but it resolves to href="#" -- a dead/unwired stub, not
//              a real link. Public Notices Calendar: zero foreclosure
//              mentions. No live posting mechanism found -- genuine absence,
//              not a page-miss (the miss was in the site's own nav, not ours).
// foard_cc     48155 - foardcounty.texas.gov. Re-checked County Clerk AND
//              Public Notices Calendar directly (not just nav) -- zero
//              foreclosure/trustee mentions in either page's raw HTML.
//              Matches the earlier skip. No notices online.
// hardeman_cc  48197 - co.hardeman.tx.us. Earlier skip already found the
//              actual notice slot (one static file, sale already happened
//              3+ months ago, never refreshed) -- that's a content check, not
//              a page-miss, so it stands. Not re-litigated further this pass.
// knox_cc      48275 - knoxcountytexas.org. Re-verified nav (3 pages: County/
//              District Clerk combined, Public Notices) matches the earlier
//              skip exactly -- no additional page found. No notices online.
// potter_cc    48375 - Amarillo. Confirmed on the Kofile/GovOS PublicSearch
//              platform (potter.tx.publicsearch.us resolves, 200). Same
//              paywalled-search class as the rest of that platform. Skip
//              (matches load_kofile_foreclosures.mjs's existing revisit-queue
//              note -- rate-limited/parked there, not a free-access target).
// wichita_cc   48485 - Wichita Falls. wichitacountytx.com resolves but 403s;
//              www.co.wichita.tx.us / co.wichita.tx.us / wichitacountytx.gov
//              don't resolve at all on this network. FORECLOSURE_COVERAGE.md
//              already logs Wichita under the Tyler Eagle/tylerhost.net
//              paywalled-search impasse from an earlier session. Consistent
//              with that -- skip.
// jack_cc      48237 - www.co.jack.tx.us returns HTTP 403 (WAF) to both curl
//              and Node fetch -- matches the existing "WAF/403 to headless
//              fetch: Jack" impasse log entry exactly. Needs a headful
//              browser (like Collin/Travis), not a parser fix. Skip.
// clay_cc      48077 - www.co.clay.tx.us connection times out on this
//              machine's egress IP (was a TLS reset earlier today, now a
//              timeout -- still fails, different symptom of the same
//              network-level block). Matches the existing revisit-queue note
//              verbatim. Needs a clean-IP retry (residential/cellular), not a
//              code fix. Skip.
// throckmorton_cc 48447 - www.throckmortoncounty.org loads fine (confirmed
//              live again this pass). Earlier skip already checked County
//              Clerk, District Clerk, AND Public Notices pages with zero
//              foreclosure/trustee mentions in any -- that's a content check
//              of the right pages, not a nav-miss. Stands unchanged.
// -----------------------------------------------------------------------

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, UA } from "./load_pdf_foreclosures.mjs";

const base = (u) => path.basename(decodeURIComponent(u)).replace(/[^\w.-]+/g, "_");

// generic "href + nearby anchor text, extract Month D, YYYY" scan, tolerant of
// ordinal suffixes / trailing junk after the year (used by crosby/hockley/terry)
function scanMonthDateLinks(html, hrefPrefix) {
    const re = new RegExp(`href="(${hrefPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^"]+\\.pdf)"[^>]*>\\s*([A-Za-z]+)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`, "gi");
    const out = [], seen = new Set();
    for (const m of html.matchAll(re)) {
        const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
        const year = +m[4];
        if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
        seen.add(m[1]);
        out.push({ url: m[1], year, month: mon, name: m[1] });
    }
    return out;
}

const SOURCES = {
    // Crosby County clerk (CivicLive, co.crosby.tx.us): notices sit INSIDE the
    // County Clerk page itself (/page/crosby.County.Clerk) as a "Foreclosures
    // <year>" accordion widget, /upload/page/8068/... -- NOT on a dedicated
    // foreclosures page (the earlier skip only checked for a standalone page
    // and missed this). Anchor text carries "<Month> <D>, <YYYY>" (sometimes
    // with a trailing disambiguator digit for same-day multiple notices, e.g.
    // "May 6, 2026 3" -- tolerated, extra text after the year is ignored).
    crosby_cc: {
        fips: "48107",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const b = "https://www.co.crosby.tx.us";
            const html = await fetchText(b + "/page/crosby.County.Clerk");
            return scanMonthDateLinks(html, "/upload/page/8068/").map((e) => ({
                ...e,
                url: b + encodeURI(e.url),
                name: `crosby_${e.year}-${String(e.month).padStart(2, "0")}_${base(e.name)}`,
            }));
        },
    },
    // Yoakum County clerk (CivicLive, co.yoakum.tx.us): notices sit on the
    // /page/Public.Notices page (aliased "Foreclosure Notices" in the clerk
    // nav) under /upload/page/0084/...; anchor text carries the sale date
    // numerically INSIDE the notice-type description ("Notice of Substitute
    // Trustee's Sale 07-07-2026").
    yoakum_cc: {
        fips: "48501",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const b = "https://www.co.yoakum.tx.us";
            const html = await fetchText(b + "/page/Public.Notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0084\/[^"]+\.pdf)"[^>]*>[^<]*?(\d{1,2})-(\d{1,2})-(\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({ url: b + encodeURI(m[1]), year, month: mon, name: `yoakum_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
            }
            return out;
        },
    },
    // Hockley County clerk (CivicLive, co.hockley.tx.us): the correct URL is
    // www.co.hockley.tx.us/page/Foreclosures (title "Foreclosure Notices |
    // Hockley County, Texas") -- the bare co.hockley.tx.us host 302s away from
    // it, which likely caused the earlier miss. High volume, /upload/page/0096/
    // ..., anchor text "<Month> <D>, <YYYY>" (a couple of malformed entries
    // split the year across tags -- tolerated loss, not fatal).
    hockley_cc: {
        fips: "48219",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const b = "https://www.co.hockley.tx.us";
            const html = await fetchText(b + "/page/Foreclosures");
            return scanMonthDateLinks(html, "/upload/page/0096/").map((e) => ({
                ...e,
                url: b + encodeURI(e.url),
                name: `hockley_${e.year}-${String(e.month).padStart(2, "0")}_${base(e.name)}`,
            }));
        },
    },
    // Garza County clerk (CivicLive/ezTask, garzacounty.gov -- co.garza.tx.us
    // has a broken cert and redirects here): /page/clerk.foreclosures, linked
    // from the County Clerk page's own dropdown menu (not top-level nav,
    // likely why earlier passes missed it). PDF links use the "page/open"
    // viewer path (same CivicLive pattern as Guadalupe -- that URL IS the
    // packet). Anchor text mixes "MONTH D,YYYY" (dash-separated, no space
    // before year) and numeric "M-D-YYYY" (double/triple-dash separated) --
    // two-pass scan over the captured link-text blob handles both.
    garza_cc: {
        fips: "48169",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const b = "https://www.garzacounty.gov";
            const html = await fetchText(b + "/page/clerk.foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/page\/open\/\d+\/\d+\/[^"]+\.pdf)"[^>]*>([^<]{0,120})/gi)) {
                if (seen.has(m[1])) continue;
                const text = m[2];
                let mon, year;
                let dm = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
                if (dm) {
                    mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                    year = +dm[3];
                } else {
                    dm = /(\d{1,2})-(\d{1,2})-(\d{4})/.exec(text);
                    if (dm) {
                        mon = +dm[1];
                        year = +dm[3];
                    }
                }
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                seen.add(m[1]);
                out.push({ url: b + m[1], year, month: mon, name: `garza_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
            }
            return out;
        },
    },
    // Terry County clerk (CivicLive, co.terry.tx.us): /page/
    // terry.NoticeofForeclosureSales is a deep year-by-year accordion archive
    // back to 2017, /upload/page/4599/...; anchor text carries "<Month> <D>,
    // <YYYY>" (also all-caps "APRIL 7, 2026-MILLICAN" style with a trailing
    // party name). As of this run the most recent posted notice is May 5,
    // 2026 (outside today's window) -- 0 in-window today, but the source is
    // real and will pick up June/July/Aug postings once the clerk files them.
    terry_cc: {
        fips: "48445",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const b = "https://www.co.terry.tx.us";
            const html = await fetchText(b + "/page/terry.NoticeofForeclosureSales");
            return scanMonthDateLinks(html, "/upload/page/4599/").map((e) => ({
                ...e,
                url: b + encodeURI(e.url),
                name: `terry_${e.year}-${String(e.month).padStart(2, "0")}_${base(e.name)}`,
            }));
        },
    },
    // Lynn County clerk (CivicLive, co.lynn.tx.us): /page/lynn.Foreclosures
    // lists exactly 2 current notices whose anchor text AND filename carry
    // only a case number ("2026-0850") -- NO date anywhere on the page
    // itself, unlike every other county in this batch. Both PDFs carry a good
    // text layer (pdftotext, no OCR needed), so discover() downloads each and
    // extracts the sale date directly from the document body: "Date of Sale:
    // <Month> <D>, <YYYY>" when present, else the first bare "<Month>
    // <D>,<YYYY>" occurrence (the un-labeled notice puts the sale date as a
    // standalone line right under the title, before the unrelated deed date).
    lynn_cc: {
        fips: "48305",
        discover: async () => {
            const b = "https://www.co.lynn.tx.us";
            const html = await fetchText(b + "/page/lynn.Foreclosures");
            const out = [], seen = new Set();
            const tmp = mkdtempSync(path.join(os.tmpdir(), "lynn-fc-"));
            try {
                for (const m of html.matchAll(/href="(\/upload\/page\/5420\/[^"]+\.pdf)"/gi)) {
                    if (seen.has(m[1])) continue;
                    seen.add(m[1]);
                    const url = b + encodeURI(m[1]);
                    let text;
                    try {
                        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        const buf = Buffer.from(await r.arrayBuffer());
                        const file = path.join(tmp, base(m[1]));
                        writeFileSync(file, buf);
                        text = execFileSync("pdftotext", ["-layout", file, "-"], { maxBuffer: 16 * 1024 * 1024, encoding: "utf8" });
                    } catch (e) {
                        console.error(`  lynn ${m[1]}: date-extract failed (${e.message})`);
                        continue;
                    }
                    let dm = /Date\s+of\s+Sale:?\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/i.exec(text);
                    if (!dm) dm = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text.slice(0, 600));
                    if (!dm) continue;
                    const mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                    const year = +dm[3];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({ url, year, month: mon, name: `lynn_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
                }
            } finally {
                rmSync(tmp, { recursive: true, force: true });
            }
            return out;
        },
    },
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const chosen = want.length ? Object.fromEntries(want.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(chosen, { parseOnly });
