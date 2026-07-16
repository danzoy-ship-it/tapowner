// Court-record seller-signal loader: Concho Valley / Central-West Texas
// foreclosure notices -> parcel_signals. Standalone sibling of
// load_pdf_foreclosures.mjs (imports its shared discover/parse/match/upsert
// machinery; does NOT edit that file -- see its header for the full pipeline
// docs). Add-a-county = one SOURCES entry below.
//
//   DATABASE_URL=... node scripts/signals/load_fc_concho.mjs [--parse-only] [source...]
//
// Counties assigned (13): Coleman 48083, Brown 48049, Comanche 48093,
// Mills 48333, San Saba 48411, McCulloch 48307, Mason 48319, Menard 48327,
// Kimble 48267, Sutton 48435, Schleicher 48413, Irion 48235, Sterling 48431.
// FIPS verified against the standard alphabetical TX county code table.
//
// SKIPPED (verified 2026-07-16, not loaded here -- see report):
//   Coleman (48083): co.coleman.tx.us/page/coleman.NoticesofForeclosureandTrusteeSales
//     is a static info page only ("bulletin board inside the front door of the
//     Courthouse... office cannot give this information over the telephone") --
//     no PDFs, no notice list, nothing posted online. Skip.
//   Mason (48319): the Foreclosure filter on co.mason.tx.us/page/mason.Public.Notices
//     is a JS calendar-widget event-type filter (event-type=1643), not a static
//     list or feed reachable without executing the calendar's AJAX. No index
//     page found. Skip.
//   Sutton (48435): newtools.cira.state.tx.us/page/sutton.Foreclosures loads
//     (200, title "Sutton County, TX - Foreclosures") but the content area is
//     empty boilerplate -- zero PDF links, zero notice text. No notices online.
//   Schleicher (48413): schleichercounty.gov/page/ForeclosureNotice (and every
//     case variant) 403s with an IIS "Server Error ... This type of page is not
//     served because it has been explicitly forbidden" -- a server-side block,
//     not a missing-data issue; not routable around in scope. Skip.
//   Irion (48235): co.irion.tx.us has migrated to a new CivicPlus-style template
//     (numeric /NNN/Slug URLs); the old CivicLive foreclosure slug
//     (irion.ForeclosureandTrusteeSaleNotices) 404s, and no County-Clerk or
//     Foreclosure link is reachable from the new homepage nav within the time
//     budget (a one-off historical PDF exists at /upload/page/0462/ but no
//     working index page was found). Skip.
//   Sterling (48431): sterlingcotx.gov/page/ForeclosureNotice IS live and
//     working (same CivicLive shape as Menard/San Saba), but the newest posting
//     is August 5, 2025 -- >6mo stale as of 2026-07-16. Skip per staleness rule.
import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, UA } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // Brown County clerk (CivicLive, browncountytx.gov -- Brownwood, the
    // largest county in this batch): /page/brown.ForeclosureNotices lists
    // one per-notice PDF per <a>, several notices sharing one dated <p>.
    // Anchor text carries "Month D, YYYY[-| on ]Name" (year always follows
    // the day with only whitespace/&nbsp; between -- capture stops at the
    // digits so &nbsp; never matters). Sales: south Broadway porch outside
    // the courthouse.
    brown_cc: {
        fips: "48049",
        venue: /COURT\s*HOUSE|S(?:OUTH)?\.?\s*BROADWAY/i,
        discover: async () => {
            const base = "https://www.browncountytx.gov";
            const html = await fetchText(base + "/page/brown.ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0823\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `brown_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Comanche County clerk (CivicPlus DocumentCenter, comanchecountytx.gov):
    // /210/Foreclosure-Notices lists per-notice PDFs at /DocumentCenter/View/
    // <id>/<slug>. Slug date format is INCONSISTENT -- both "2026-February-3-
    // Notice-of-Trustee-Sale-..." (year-month-day) and "April-7-2026-
    // Foreclosure-Sale-..." (month-day-year) appear, so try the year-first
    // pattern before falling back to month-first.
    comanche_cc: {
        fips: "48093",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.comanchecountytx.gov";
            const html = await fetchText(base + "/210/Foreclosure-Notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/(\d+)\/([^"]+))"/gi)) {
                const slug = m[3];
                let year, mon;
                let mm = slug.match(/^(\d{4})-([A-Za-z]+)-(\d{1,2})/);
                if (mm) {
                    year = +mm[1];
                    mon = MONTHS.indexOf(mm[2].slice(0, 3).toUpperCase()) + 1;
                } else {
                    mm = slug.match(/([A-Za-z]+)-(\d{1,2})-(\d{4})/);
                    if (mm) {
                        mon = MONTHS.indexOf(mm[1].slice(0, 3).toUpperCase()) + 1;
                        year = +mm[3];
                    }
                }
                if (!mon || !year || !inWindow(year, mon) || seen.has(m[2])) continue;
                seen.add(m[2]);
                out.push({ url: base + m[1], year, month: mon, name: `comanche_${year}-${String(mon).padStart(2, "0")}_${m[2]}.pdf` });
            }
            return out;
        },
    },
    // Mills County clerk (CivicLive, millscountytx.gov): the foreclosure list
    // is embedded directly in the County Clerk page (/page/mills.County.Clerk)
    // under a "Current Year"/year-header accordion, NOT a separate page.
    // Anchor text: "Month D, YYYY - Notice of .../Name".
    mills_cc: {
        fips: "48333",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.millscountytx.gov";
            const html = await fetchText(base + "/page/mills.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0077\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `mills_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // San Saba County clerk (CivicLive, co.san-saba.tx.us): a "Foreclosure
    // Notices" accordion embedded in /page/sansaba.county.clerk. Anchor text
    // is bare "M/D/YYYY Name" (no comma). Low volume (2 notices seen live).
    sansaba_cc: {
        fips: "48411",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.san-saba.tx.us";
            const html = await fetchText(base + "/page/sansaba.county.clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/6018\/[^"]+\.pdf)"[^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `sansaba_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // McCulloch County clerk (CivicLive, co.mcculloch.tx.us): /page/
    // mcculloch.NoticeofForeclosureSales lists per-notice PDFs inside a "2026"
    // accordion; anchor text is unusually rich -- "Month D, YYYY [@ H:MM AM/PM]
    // -<street address>, Volume/Book/Page ..." (a property address is often
    // right there in the link text). Sale venue: south porch of the McCulloch
    // County Courthouse, 199 Courthouse Square, Brady.
    mcculloch_cc: {
        fips: "48307",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.mcculloch.tx.us";
            const html = await fetchText(base + "/page/mcculloch.NoticeofForeclosureSales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0665\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `mcculloch_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Menard County clerk (CivicLive, co.menard.tx.us): /page/
    // menard.foreclosures. Anchor text is bare "M/DD/YYYY" (no name/dash).
    menard_cc: {
        fips: "48327",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.menard.tx.us";
            const html = await fetchText(base + "/page/menard.foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0219\/[^"]+\.pdf)"[^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `menard_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Kimble County clerk (CivicLive, co.kimble.tx.us -- the search-indexed
    // /page/kimble.foreclosurenotice 301-redirects here): /page/
    // foreclosurenotice. Date sits just OUTSIDE the anchor text ("<a>NOTICE OF
    // ...SALE</a> - MONTH D, YYYY") in most rows but INSIDE it in a few
    // ("<a>...SALE NOVEMBER 4, 2025</a>") -- sweep a window after href open
    // rather than anchoring to the tag boundary. Sale venue: Kimble County
    // Courthouse, 501 Main St, Junction.
    kimble_cc: {
        fips: "48267",
        venue: /COURT\s*HOUSE|\b501\s+MAIN\s+ST/i,
        discover: async () => {
            const base = "https://www.co.kimble.tx.us";
            const html = await fetchText(base + "/page/foreclosurenotice");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0101\/[^"]+\.pdf)"[^>]*>[\s\S]{0,100}?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `kimble_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
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
