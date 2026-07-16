// Brazos Valley / SE-central + one deep-east TX county foreclosure-notice
// loader. Sibling of load_pdf_foreclosures.mjs (imports its shared
// discover->parse->match->upsert machinery; does NOT edit that file).
// Counties: Waller, Austin, Washington, Burleson, Robertson, San Augustine.
//
//   DATABASE_URL=... node scripts/signals/load_fc_brazos_valley.mjs [--parse-only] [source...]
//
// All five loadable counties below are the SAME CivicLive/CIRA family
// (co.<name>.tx.us or a rebranded "<name>county.gov"/"austincounty.com"
// domain, /page/... nav, /upload/page/<id>/... document store) -- the
// platform repeats but each page's internal structure (year/month accordion
// vs. inline anchor-text dates vs. two-column positional pairing) still
// needs its own discover().
//
// SKIP-LOGGED (not loadable, no config entry):
//   Burleson 48051: co.burleson.tx.us 302-redirects to burlesoncountytx.gov
//   (site migration); neither the new homepage nor /page/gov.county.clerk
//   links any foreclosure/trustee-sale content. The only foreclosure-adjacent
//   surface found is burleson.tx.publicsearch.us (Kofile/GovOS PublicSearch)
//   -- the parked paywalled platform explicitly out of scope for this loader
//   (verified 2026-07-16).
//   San Augustine 48405: co.san-augustine.tx.us/page/sanaugustine.foreclosures
//   IS structurally parseable (two-column CivicLive layout: left column =
//   per-notice PDF links, right column = "Date of Sale - Grantor(s)" text,
//   paired 1:1 by position once the column-2 header row is skipped -- verified
//   by OCR-checking the top link against its paired date, which matched the
//   notice's own printed execution date), but the newest entry is October 17,
//   2025 (an out-of-order "January 6, 2026" entry sits lower in the list,
//   itself already >6mo stale as of today 2026-07-16). Per the >6mo staleness
//   rule: skip. Revisit periodically -- structure is ready to go the day a
//   fresh notice is posted.

import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // Waller County clerk (CivicLive, co.waller.tx.us): /page/CC.ForeclosureNotice
    // is a "cycle" year-tab widget (all years 2015-2026 rendered statically in
    // one page, hidden/shown client-side) -- each year tab holds col-header
    // month sections ("January".."December"), each listing per-notice PDFs
    // named by case number (/upload/page/0137/<NN-NNN>.pdf or .../docs/
    // Foreclosure/<year>/<NN-NNN>.pdf). Verified via OCR sample (26-092.pdf,
    // bucketed under the 2026/September section): "Date of Sale: 09/01/2026"
    // -- confirms the month bucket IS the sale month (buckets already reach 2
    // months out, e.g. a September entry seen while today is mid-July), not a
    // filed/posted date. Image-only scans (no text layer) -> tesseract OCR
    // (installed this run: winget UB-Mannheim.TesseractOCR, was missing).
    waller_cc: {
        fips: "48473",
        // sale venue: "the foyer at the south entrance to the Waller County
        // Courthouse"; the sweep pass also independently catches the
        // courthouse's OWN street address (836 Austin Street, Hempstead) from
        // elsewhere in some packets -> number-pinned drop (Austin St has real
        // private addresses at other numbers, so pin, don't blanket-drop).
        venue: /COURT\s*HOUSE|\b836\s+AUSTIN\b/i,
        discover: async () => {
            const base = "https://www.co.waller.tx.us";
            const html = await fetchText(base + "/page/CC.ForeclosureNotice");
            const re = /aria-describedby="cycle-headers">(\d{4})<\/span>|col-header'><span>([A-Za-z]+)<\/span>|href='(\/upload\/page\/0137\/[^']+\.pdf)'/g;
            const out = [], seen = new Set();
            let year = null, month = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) { year = +m[1]; continue; }
                if (m[2]) { month = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1; continue; }
                if (!m[3] || !year || !month || !inWindow(year, month)) continue;
                const url = base + encodeURI(decodeURIComponent(m[3]));
                if (seen.has(url)) continue;
                seen.add(url);
                out.push({
                    url,
                    year,
                    month,
                    name: `waller_${year}-${String(month).padStart(2, "0")}_${path.basename(m[3]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Austin County clerk (CivicLive, austincounty.com -- rebranded off
    // co.austin.tx.us): /page/austin.foreclosure.notices lists ONE packet PDF
    // per sale month at /upload/page/0100/[docs/Foreclosures/<year>/]<label>.pdf,
    // where <label> carries the sale date in a dozen inconsistent hand-typed
    // forms ("August042026", "July 7 2026", "June022026", "AUG 6" [no year,
    // use the year-folder], "FC12052023", "08052025" [8-digit glued, no
    // month word]). The newest packet (this cycle: "August042026.pdf") sits
    // OUTSIDE any year folder -- not yet filed into the 2026/ archive.
    // Verified via text-layer sample (August042026.pdf, has embedded text):
    // "DATE OF SALE: Tuesday, August 4, 2026" -- confirms filename = sale
    // date, and "steps of the Austin County Courthouse" for venue.
    austin_cc: {
        fips: "48015",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.austincounty.com";
            const html = await fetchText(base + "/page/austin.foreclosure.notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0100\/(?:docs\/Foreclosures\/(\d{4})\/)?([^"\/]+\.pdf))"/gi)) {
                const fname = decodeURIComponent(m[3]);
                if (/designation/i.test(fname)) continue;
                const folderYear = m[2] ? +m[2] : null;
                let d = null;
                let mm = fname.match(/^(?:Foreclosure|FC)?\s*([A-Za-z]+)\.?\s*0?(\d{1,2})\s*(\d{4})?\.pdf$/i);
                if (mm) {
                    const mon = MONTHS.indexOf(mm[1].slice(0, 3).toUpperCase()) + 1;
                    if (mon) d = { year: mm[3] ? +mm[3] : folderYear, month: mon };
                }
                if (!d) {
                    mm = fname.match(/^(?:Foreclosure|FC)?(\d{2})(\d{2})(\d{4})\.pdf$/i);
                    if (mm) d = { year: +mm[3], month: +mm[1] };
                }
                if (!d || !d.year || !d.month || d.month > 12 || !inWindow(d.year, d.month)) continue;
                const url = base + encodeURI(decodeURIComponent(m[1]));
                const name = `austin_${d.year}-${String(d.month).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: d.year, month: d.month, name });
            }
            return out;
        },
    },
    // Washington County clerk (CivicLive, co.washington.tx.us): NO dedicated
    // foreclosures archive page -- the /page/washington.county.clerk landing
    // page just inline-links the CURRENT month's consolidated packet inside a
    // "Self-Help Resources" accordion widget, anchor text "Foreclosures Sales
    // for <Month> <Year>" (e.g. "...for July 2026"; the file gets replaced/
    // re-linked each cycle, confirmed via a stale Google-cached "April 2026"
    // URL that 404s now). Verified via text-layer sample (July 2026 packet,
    // ~10 notices): "Place of Sale: Washington County Courthouse, 100 East
    // Main Street, Brenham, Texas 77833".
    washington_cc: {
        fips: "48477",
        // sale venue: Washington County Courthouse, 100 East Main Street,
        // Brenham (number-pinned: Main St has real private addresses too)
        venue: /COURT\s*HOUSE|\b100\s+E(?:AST)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.co.washington.tx.us";
            const html = await fetchText(base + "/page/washington.county.clerk");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/0877\/docs\/[^"]*\.pdf)"[^>]*>\s*Foreclosures?\s+Sales?\s+for\s+([A-Za-z]+)\s+(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[3];
                if (!mon || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(decodeURIComponent(m[1])),
                    year,
                    month: mon,
                    name: `washington_${year}-${String(mon).padStart(2, "0")}.pdf`,
                });
            }
            return out;
        },
    },
    // Robertson County clerk (CivicLive/CIRA, co.robertson.tx.us): the
    // "Public.Notice.Archive" page (flagged in FORECLOSURE_COVERAGE.md as a
    // "mixed feed") is NOT the right page -- /page/robertson.County.Clerk
    // itself embeds a clean per-year "Foreclosures <YYYY>" accordion with
    // per-notice PDFs where the anchor TEXT carries the sale date directly
    // ("July 7, 2026", "August 4,2026" [no space variant], sometimes with a
    // trailing "- Grantor" suffix) -- no positional pairing or bucket-tracking
    // needed. Hrefs are a mix of relative (co.robertson.tx.us) and absolute
    // (newtools.cira.state.tx.us) paths under /upload/page/5874/. Verified via
    // text-layer sample (july72026.pdf): "Date of Sale of Property (First
    // Tuesday of the Month): Tuesday, July 7, 2026" + "Robertson County
    // Courthouse, 103 E. Morgan Street, Franklin" -- confirms both the date
    // mapping and venue. NB: this reverses the prior "unparseable" verdict on
    // the wrong (Archive) page -- the Clerk page was never actually checked.
    robertson_cc: {
        fips: "48395",
        // sale venue: Robertson County Courthouse, 103 E. Morgan Street,
        // Franklin (number-pinned defensively, though no sweep hits observed
        // yet -- Morgan St has real private addresses too)
        venue: /COURT\s*HOUSE|\b103\s+E(?:AST)?\.?\s*MORGAN\b/i,
        discover: async () => {
            const base = "https://www.co.robertson.tx.us";
            const html = await fetchText(base + "/page/robertson.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a href="((?:https?:\/\/[a-z0-9.]*cira\.state\.tx\.us)?\/upload\/page\/5874\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[4];
                if (!mon || !inWindow(year, mon)) continue;
                const raw = m[1];
                const url = /^https?:/i.test(raw) ? encodeURI(decodeURIComponent(raw)) : base + encodeURI(decodeURIComponent(raw));
                const fname = path.basename(decodeURIComponent(raw));
                const name = `robertson_${year}-${String(mon).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
};

await runSources(SOURCES, { parseOnly: process.argv.includes("--parse-only") });
