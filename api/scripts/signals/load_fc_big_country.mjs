// Court-record seller-signal loader: Texas "Big Country" (west-central) county
// foreclosure notices -> parcel_signals. Standalone sibling of
// load_pdf_foreclosures.mjs; imports its shared discover/fetch/join/upsert
// machinery instead of editing it (parallel-safe with sibling region loaders).
//
//   DATABASE_URL=... node scripts/signals/load_fc_big_country.mjs [--parse-only] [source...]
//
// Counties assigned + FIPS verification (against data/counties_2025.json /
// COUNTY_COVERAGE.md, the repo's canonical county-FIPS table):
//   Jones      48253  OK
//   Fisher     48151  OK
//   Stonewall  48433  OK
//   Kent       48269  WRONG in the assignment -- 48269 is KING County. Kent
//              County's real FIPS is 48263 (confirmed in both
//              data/counties_2025.json and COUNTY_COVERAGE.md). Used 48263
//              below; flag this correction in the handoff.
//   Mitchell   48335  OK
//   Dickens    48125  OK
//
// Per-county findings:
//   Jones (48253)     LOADABLE. CivicLive site (co.jones.tx.us), real
//     "Foreclosure Notices" page under /page/jones.ForeclosureNotices, one
//     PDF per notice under /upload/page/1298/<year folder>/<name>.pdf. Image-
//     only scans (verified: pdftotext returns empty on a sample), text comes
//     via the shared loadSource()'s OCR fallback (winocr is installed on this
//     box -- verified pdf_ocr_text.py extracts clean text, e.g. a sample
//     "2026 July - Wells.pdf" OCR'd to "Date of Sale: 7/7/2026" and a Jones
//     County Courthouse venue line). Filenames are "<YYYY> <Month> - <Name>"
//     most of the time, occasionally "<Month> <Day> - <Name>" with no year
//     (year then comes from the containing folder, e.g. "2026 Foreclosures").
//   Mitchell (48335)  SKIP -- real, well-organized live postings exist
//     (co.mitchell.tx.us/page/county.Clerk -> /upload/page/0075/docs/
//     "Foreclosure Notices"/<year>/<case#> Notice ... Sale.pdf, e.g.
//     "26-0015 Notice TTEE Sale.pdf"), confirmed image-only scans with a
//     legible "Date, Time, and Place of Sale ... 6/2/2026" + "Commonly known
//     as: 717 COUNTY ROAD 309" body via OCR. BUT unlike every other county in
//     the shared loader, the sale date is NOT encoded in the filename/URL at
//     all (only a year folder + case sequence number) -- discover() would
//     have to OCR every candidate PDF just to learn its month, which breaks
//     the shared architecture's cheap-discover/heavy-parse-only-on-match
//     design and isn't done by any of the other 76 sources. Flagging for a
//     proper fix (e.g. a shared "date-from-content" discover helper) rather
//     than a one-off OCR hack here under a 35-min budget.
//   Fisher (48151)    SKIP -- no dedicated foreclosure page. The only
//     Foreclosure-adjacent hits are on the general "fisher.PostedNotices"
//     board (mixed in with groundwater-district agendas, injection-well
//     applications, probate, estray notices): exactly 2 foreclosure-looking
//     filenames across the whole 2019-2026 archive ("TRUSTEE SALE 3-5-24.pdf"
//     -- stale, >2yr old; "FORECLOSER GIBBINS.pdf" -- undated, 2025). Not a
//     systematic live posting; skip-log as stale/no-reliable-posting.
//   Stonewall (48433) SKIP -- one static "noticeoftrusteesalestonewall.pdf"
//     from 2020 under the District/County Clerk "Fees & Forms" accordion
//     (co.stonewallcounty.org/page/stonewall.County.Clerk); reads as a form
//     template, not a live monthly posting. No other foreclosure content
//     found anywhere on the site. Skip-log: no online posting.
//   Kent (48263)      SKIP -- co.kent.tx.us has no foreclosure page at all;
//     checked kent.CountyClerk and kent.PublicNotices (the latter holds only
//     tax-abatement hearing notices). Skip-log: no online posting.
//   Dickens (48125)   SKIP -- co.dickens.tx.us has no real-estate foreclosure
//     page; checked dickens.County.Clerk, dickens.PublicNotices, and
//     dickens.Foreclosures (that page is PERSONAL PROPERTY TAX foreclosure,
//     a different process, and its only PDF is unrelated "Roll-Off Site
//     Info"). Skip-log: no online posting.

import { runSources, fetchText, MONTHS, inWindow } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // Jones County clerk (CivicLive, co.jones.tx.us): /page/jones.
    // ForeclosureNotices lists individual per-notice scanned PDFs (not
    // monthly packets) under /upload/page/1298/<year folder>/<name>.pdf.
    // Image-only scans, no text layer -> OCR (winocr on this box).
    jones_cc: {
        fips: "48253",
        // sale venue: Jones County Courthouse, 100 Courthouse Square, Anson
        venue: /COURT\s*HOUSE|COURTHOUSE\s+SQUARE/i,
        discover: async () => {
            const base = "https://www.co.jones.tx.us";
            const html = await fetchText(base + "/page/jones.ForeclosureNotices");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/1298\/([^"]+?)\.pdf)"/gi)) {
                const url = m[1], label = m[2]; // e.g. "2025 Foreclosure/2026 January - Baker"
                const fname = label.split("/").pop();
                let year, mon;
                let mm = fname.match(/^(\d{4})\s+([A-Za-z]+)\s*-/); // "2026 January - Baker"
                if (mm) {
                    year = +mm[1];
                    mon = MONTHS.indexOf(mm[2].slice(0, 3).toUpperCase()) + 1;
                } else {
                    mm = fname.match(/^([A-Za-z]+)\s+\d{1,2}\s*-/); // "June 2 - Kikwai" (no year)
                    if (mm) {
                        mon = MONTHS.indexOf(mm[1].slice(0, 3).toUpperCase()) + 1;
                        const fy = label.match(/(\d{4})/); // fall back to the folder year
                        year = fy ? +fy[1] : null;
                    }
                }
                if (!mon || !year || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(url),
                    year,
                    month: mon,
                    name: `jones_${year}-${String(mon).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}.pdf`,
                });
            }
            return out;
        },
    },
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const chosen = want.length ? Object.fromEntries(want.filter((k) => SOURCES[k]).map((k) => [k, SOURCES[k]])) : SOURCES;
await runSources(chosen, { parseOnly });
