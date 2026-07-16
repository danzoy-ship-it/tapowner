// Rolling Plains / far-north small tier (6 counties): Baylor, Wilbarger,
// Hardeman, Foard, Knox, Haskell. Standalone per-region loader (2026-07-16
// parallel pattern) -- imports the shared discover/extract/parse/match/upsert
// machinery from load_pdf_foreclosures.mjs and defines only county-specific
// discover()s. FIPS verified against the canonical TX county code list
// (alphabetical, +2 per county) before writing this file -- all 6 given
// codes checked out (Baylor 023, Wilbarger 487, Hardeman 197, Foard 155,
// Knox 275, Haskell 207).
//
//   DATABASE_URL=... node scripts/signals/load_fc_rolling_plains.mjs [--parse-only] [source...]
//
// --- SKIP-LOG (researched 2026-07-16, not fought) ---------------------------
// baylor_cc    48023 - CivicLive (co.baylor.tx.us/page/baylor.County.Clerk).
//              ONE static file slot (/upload/page/9593/2025/notice_of_
//              substitute_trustee_sale-1.pdf), no date anywhere in the URL
//              or anchor text -- downloaded + rendered it to check: filed
//              2/11/2025, Sale Date 3/4/2025 (405 N Foley St, Seymour).
//              That's ~16 months stale as of 2026-07-16 and the slot hasn't
//              been refreshed since. Feed reads as dead -- skip on staleness.
// wilbarger_cc 48487 - co.wilbarger.tx.us/page/wilbarger.county.clerk's ONLY
//              "Foreclosure Notices" link points at i2j.uslandrecords.com
//              (US Land Records), verified login/subscription-gated (page
//              serves Login/Password/Register/Subscribe prompts, no anonymous
//              listing). Same paywalled third-party class as Hutchinson's
//              i2i.uslandrecords.com skip (panhandle_north loader). Skip.
// hardeman_cc  48197 - CivicLive (co.hardeman.tx.us/page/hardeman.public.
//              notices). ONE static file slot (/upload/page/11301/NOTICE OF
//              SUBSTITUTE TRUSTEE SALE.pdf), no date anywhere in the URL or
//              anchor text -- downloaded + rendered it: filed 2/11/2026,
//              Sale Date 4/7/2026 (Lot 7 Blk 106, Chillicothe). That sale
//              already happened over 3 months before this run and the slot
//              hasn't been refreshed since -- dead posting, skip on staleness.
// foard_cc     48155 - CivicLive (foardcounty.texas.gov). Checked the County
//              Clerk page AND Public.Notices.Calendar AND the full site
//              sitemap (25 page slugs, no "Foreclosures"/"Trustee" page
//              anywhere in nav) -- zero foreclosure/trustee/substitute
//              mentions site-wide. No notices online.
// knox_cc      48275 - CivicLive (knoxcountytexas.org). Single combined
//              County & District Clerk page + a separate Public Notices page
//              checked -- zero foreclosure/trustee/substitute mentions on
//              either, and the site's full 23-link nav bar has no dedicated
//              Foreclosures page. No notices online.
// -----------------------------------------------------------------------

import { runSources, fetchText, inWindow } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // Haskell County clerk (CivicLive, haskellcountytx.gov): the
    // haskell.county.clerk page's upload dir (/upload/page/7696/) is a shared
    // bucket for every clerk posting (birth/death/brand/marriage forms,
    // ballot-by-mail apps, ...) with a handful of current trustee-sale PDFs
    // mixed in. Filenames are inconsistent ("TRUSTEE SALE 7.7.26 EMERICK.pdf",
    // "7.7.26 TRUSTEE SALE.pdf", or even bare "JOHNSON 5.5.26.pdf" with no
    // "TRUSTEE" token at all) but ALWAYS embed the sale date as bare
    // "M.D.YY" -- no other doc in the bucket carries that shape (verified:
    // forms/holiday/ballot filenames have zero digit.digit.digit runs), so
    // filtering on the date pattern alone is sufficient and doesn't require
    // a "trustee" keyword match. Image-only scans, NO text layer -> OCR
    // (winocr available on this box, no tesseract needed). Verified one
    // notice's venue text ("THE BULLETIN BOARD AREA AT THE SOUTH ENTRANCE OF
    // THE COURTHOUSE") carries no street number -> no venue regex needed
    // (same as Wheeler/panhandle_north).
    haskell_cc: {
        fips: "48207",
        discover: async () => {
            const base = "https://www.haskellcountytx.gov";
            const html = await fetchText(base + "/page/haskell.county.clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/7696\/([^"]*\.pdf))"/gi)) {
                const dm = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(decodeURIComponent(m[2]));
                if (!dm) continue; // not a dated sale filing -- a clerk form/handout
                const mon = +dm[1];
                let year = +dm[3];
                if (year < 100) year += 2000;
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const name = `haskell_${year}-${String(mon).padStart(2, "0")}_${path_basename(m[1])}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: new URL(encodeURI(m[1]), base + "/").href, year, month: mon, name });
            }
            return out;
        },
    },
};

function path_basename(p) {
    return decodeURIComponent(p.split("/").pop()).replace(/[^\w.-]+/g, "_");
}

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const chosen = want.length ? Object.fromEntries(want.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(chosen, { parseOnly });
