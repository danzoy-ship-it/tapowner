// Court-record seller-signal loader: Texas Hill Country core + deep-south
// remainder foreclosure notices -> parcel_signals. Standalone sibling of
// load_pdf_foreclosures.mjs (imports its shared discover/parse/match/upsert
// machinery; does NOT edit that file -- see its header for the full pipeline
// docs). Add-a-county = one SOURCES entry below.
//
//   DATABASE_URL=... node scripts/signals/load_fc_hill_south.mjs [--parse-only] [source...]
//
// Counties assigned (5): Blanco 48031, Gillespie 48171, Kenedy 48261,
// Jim Hogg 48247, Mason 48319. FIPS cross-checked against the alphabetical TX
// county code sequence already anchored in load_pdf_foreclosures.mjs/
// load_fc_concho.mjs (Kaufman=257, Kimble=267, McCulloch=307, Mason=319 all
// verified there -- Kenedy=261 and Jim Hogg=247 fall exactly on that +2-per-
// county cadence, and Gillespie=171/Blanco=031 do too).
//
// SKIPPED (verified 2026-07-16, not loaded here -- see report):
//   Kenedy (48261): co.kenedy.tx.us/page/kenedy.County.Clerk carries zero
//     foreclosure content (only permits + commissioners'-court minutes); the
//     county's Public Notices page (.../page/kenedy.PublicNoticeCalendar) is a
//     bare ezTask/CivicLive JS calendar widget (Telerik lightbox scaffolding,
//     category filter incl. "Public Notice") with NO static list/PDF links
//     reachable without executing its AJAX. No dedicated foreclosure page
//     found via search or site nav. Pop. ~350 -- plausibly near-zero mortgage
//     foreclosure volume regardless. Skip.
//   Mason (48319): RE-VERIFIED (was already flagged skip in load_fc_concho.mjs
//     2026-07-16 -- same conclusion reached independently here). The Foreclosure
//     filter on co.mason.tx.us/page/mason.Public.Notices is a JS calendar-widget
//     event-type filter (event-type=1643), not a static list/feed. The County
//     Clerk page (.../page/mason.County.Clerk) has exactly ONE static
//     foreclosure link outside that widget -- "/upload/page/0274/Notice of
//     Forclosure Sale.pdf", anchor text "5/21/26 Notice of Foreclosure Sale" --
//     a single overwritable one-off, not an accumulating dated list (no month-
//     bucketing pattern to template a discover() against), and its one sale
//     date is already well outside the current posting window anyway. Skip.
import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, UA } from "./load_pdf_foreclosures.mjs";

// Sale Date shows up in two shapes across these sources: "Sale Date March 3,
// 2026" / "SALE DATE JAN. 6, 2026" (month name) and "Sale Date 02/03/2026" /
// "Sale Date 08/05/25" (numeric, 2- or 4-digit year). Try both.
function parseSaleDate(text) {
    let m = text.match(/Sale\s*Date:?\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i);
    if (m) {
        const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
        if (mon) return { year: +m[3], month: mon };
    }
    m = text.match(/Sale\s*Date:?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
    if (m) {
        let year = +m[3];
        if (year < 100) year += 2000;
        const mon = +m[1];
        if (mon >= 1 && mon <= 12) return { year, month: mon };
    }
    return null;
}

const SOURCES = {
    // Blanco County clerk (CivicLive, blancocountytexas.gov -- the legacy
    // co.blanco.tx.us host 302s here): /page/County.Clerk embeds a large
    // "Foreclosure" list directly (not a separate page), one <a> per notice
    // under /upload/page/0070/; filenames are chaotic ("FC 130001.pdf",
    // "27 fabco0001.pdf") but the anchor TEXT is unusually rich and carries
    // the actual "Sale Date <date>" -- no saleMonthAfter estimate needed.
    // Image-only scans, NO text layer -> tesseract OCR. Many notices are
    // recurring re-postings of the same handful of rural tracts/subdivision
    // lots (Rockin J Ranch, Pearce Development/Texas Fabco) with NO street
    // address, legal-description-only -> resolved by the shared legalMatch
    // pass, not directMatch.
    blanco_cc: {
        fips: "48031",
        // sale venue: "south entrance of the Blanco County Courthouse" -- no
        // street number given in the notice text, so a bare courthouse guard
        // is enough (nothing to number-pin against).
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.blancocountytexas.gov";
            const html = await fetchText(base + "/page/County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/0070\/[^"]+\.pdf)"[^>]*>([\s\S]{0,260}?)<\/a>/gi)) {
                const anchor = m[2].replace(/&nbsp;/gi, " ").replace(/<[^>]+>/g, " ");
                const sd = parseSaleDate(anchor);
                if (!sd || !inWindow(sd.year, sd.month) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: sd.year,
                    month: sd.month,
                    name: `blanco_${sd.year}-${String(sd.month).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Gillespie County clerk (CivicPlus, gillespiecounty.gov -- the legacy
    // gillespiecounty.org host 301s here): /1389/Foreclosures-and-Trustee-Sales
    // is a plain HB-584 compliance page, "Notices at this time:" followed by a
    // handful of <li> rows, one per notice, anchor text "Foreclosure Posting
    // Posted <date> Sale Date <date> (PDF)" linking bare /DocumentCenter/
    // View/<id> (CivicPlus 302s that to the full slug URL; fetchPdf follows
    // redirects fine). Image-only scan -> OCR. Low volume, low posting
    // cadence -- as of 2026-07-16 only 3 notices ever listed, all with Sale
    // Dates (May/June 2026) already behind "today"; this run finds 0
    // in-window packets, but the page/pattern is live and will pick up new
    // postings on a future run.
    gillespie_cc: {
        fips: "48171",
        // sale venue: Gillespie County Courthouse, 101 West Main Street,
        // Fredericksburg (number-pinned; West Main St has real properties too)
        venue: /COURT\s*HOUSE|\b101\s+W(?:EST)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.gillespiecounty.gov";
            const html = await fetchText(base + "/1389/Foreclosures-and-Trustee-Sales");
            const out = [];
            for (const m of html.matchAll(
                /href="(\/DocumentCenter\/View\/(\d+))"[^>]*>\s*Foreclosure\s+Posting\s+Posted\s+[A-Za-z]+\s+\d{1,2}\s+\d{4}\s+Sale\s+Date\s+([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/gi
            )) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[5];
                if (!mon || !inWindow(year, mon)) continue;
                out.push({
                    url: base + m[1],
                    year,
                    month: mon,
                    name: `gillespie_${year}-${String(mon).padStart(2, "0")}_DC${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Jim Hogg County clerk (CivicLive, co.jim-hogg.tx.us -- separate from the
    // county's OTHER foreclosure surface, jimhogg.tx.publicsearch.us [Kofile
    // PublicSearch -- parked platform, out of scope here]): /page/
    // jim-hogg.Foreclosures embeds one <a> per notice under /upload/page/9535/
    // (a handful of older rows link the CivicLive origin newtools.cira.state.tx.us
    // directly -- same path serves from either host), anchor text "<Month> D,
    // YYYY[- ]<Name>" (the sale date, not a posting date). Image-only scan ->
    // OCR. Most active of this batch's counties: postings run monthly back to
    // 2020, several currently in-window (Jul/Aug 2026).
    jimhogg_cc: {
        fips: "48247",
        // sale venue: Jim Hogg County Courthouse, 102 E. Tilley, Hebbronville
        // (number-pinned; E Tilley has real properties too)
        venue: /COURT\s*HOUSE|\b102\s+E(?:AST)?\.?\s*TILLEY\b/i,
        discover: async () => {
            const base = "https://www.co.jim-hogg.tx.us";
            const html = await fetchText(base + "/page/jim-hogg.Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(
                /href="((?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/9535\/[^"]+\.pdf))"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi
            )) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[5];
                if (!mon || !inWindow(year, mon) || seen.has(m[2])) continue;
                seen.add(m[2]);
                const url = m[1].startsWith("http") ? m[1] : base + encodeURI(m[2]);
                out.push({
                    url,
                    year,
                    month: mon,
                    name: `jimhogg_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[2]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const sources = want.length ? Object.fromEntries(want.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(sources, { parseOnly });
