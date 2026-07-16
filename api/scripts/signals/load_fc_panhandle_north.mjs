// Panhandle-north tier (13 counties): Dallam, Sherman, Hansford, Ochiltree,
// Lipscomb, Hartley, Moore, Hutchinson, Hemphill, Gray, Carson, Wheeler,
// Roberts. Standalone per-region loader (2026-07-16 parallel pattern) --
// imports the shared discover/extract/parse/match/upsert machinery from
// load_pdf_foreclosures.mjs and defines only county-specific discover()s.
// FIPS verified against the canonical TX county code list (alphabetical,
// +2 per county) before writing this file -- all 13 given codes checked out.
//
//   DATABASE_URL=... node scripts/signals/load_fc_panhandle_north.mjs [--parse-only] [source...]
//
// --- SKIP-LOG (researched 2026-07-16, not fought) ---------------------------
// dallam_cc    48111 - dallam.org (old static HTML site). County Clerk page
//              only mentions "Foreclosure Notices" as one of the document
//              TYPES the office files (prose list alongside Hospital Liens,
//              Cattle Brands, etc) -- no listing/posting mechanism at all.
//              No notices online.
// hansford_cc  48195 - CivicLive (co.hansford.tx.us/page/hansford.County.Clerk),
//              /upload/page/4378/docs/ has exactly 2 foreclosure PDFs, both
//              from 2020 (June 2020, Nov 2020) plus one mislabeled county-
//              minutes doc. Feed dead 6 years -- stale, skip.
// hartley_cc   48205 - CivicLive (co.hartley.tx.us). Checked both
//              hartley.County.Clerk and hartley.PublicNotices pages: zero
//              PDF links, zero foreclosure/trustee text. No notices online.
// hutchinson_cc 48233 - CivicLive hutchinson.Foreclosures page exists but
//              contains NO postings itself -- it's a single outbound link to
//              i2i.uslandrecords.com (US Land Records subscription real-
//              property search portal). Paywalled/login third-party system,
//              same family as the Kofile/Tyler skip class.
// hemphill_cc  48211 - CivicLive (co.hemphill.tx.us/page/hemphill.Notice%20of%20Sales)
//              DOES post real notices, but the newest foreclosure/trustee
//              notice on the page is "Notice of Foreclosure Sale - January 6,
//              2026" (~6.3 months stale as of 2026-07-16; the only newer
//              posting is a Feb 2026 SHERIFF/TAX sale, a different signal
//              type this loader doesn't target). Feed reads as gone quiet --
//              skip on staleness.
// -----------------------------------------------------------------------

import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

// Generic CivicLive (co.<name>.tx.us / <name>county.texas.gov, /page/... nav,
// /upload/page/<id>/... PDFs) anchor-text date sweep, shared by five counties
// below. Anchor text carries the sale date in one of a few observed shapes:
//   "<Month> <D>, <YYYY>[-<borrower name>]"   (Moore)
//   "Notice of Trustee Sale - <Month> <D>, <YYYY> (n)"  (Wheeler)
//   "<label>.pdf" with the date baked into the FILENAME (Sherman: link text
//     is literally the filename; Lipscomb/Roberts: single static filename,
//     date lives in the surrounding label text instead)
// so the sweep tries anchor text first, then falls back to the href path.
function civicLiveDateSweep(html, { hrefFilter } = {}) {
    const out = [];
    const re = /<a[^>]*href="([^"]*\.pdf)"[^>]*>(.*?)<\/a>/gis;
    const dateRe = /\b([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/;
    let m;
    while ((m = re.exec(html))) {
        const href = m[1];
        if (hrefFilter && !hrefFilter(href)) continue;
        const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();
        const hay = text || href;
        const dm = dateRe.exec(hay) || dateRe.exec(href);
        if (!dm) continue;
        const mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
        const year = +dm[3];
        if (!mon || mon > 12 || !inWindow(year, mon)) continue;
        out.push({ href, year, month: mon, text });
    }
    return out;
}

const SOURCES = {
    // Sherman County clerk (CivicLive -- migrated off co.sherman.tx.us,
    // which now 301s to shermancountytx.gov): /page/Foreclosure.Notices
    // lists per-notice PDFs under /upload/page/0093/...; anchor TEXT (not
    // filename) carries the reliable sale date, e.g. one file is physically
    // named "...June 15 2026.pdf" but its link text reads "Trustee Sale July
    // 7 2026.pdf" (July 7 2026 is the correct first-Tuesday -- trust the text).
    sherman_cc: {
        fips: "48421",
        discover: async () => {
            const base = "https://www.shermancountytx.gov";
            const html = await fetchText(base + "/page/Foreclosure.Notices");
            const hits = civicLiveDateSweep(html, { hrefFilter: (h) => /\/upload\/page\/0093\//i.test(h) });
            const out = [], seen = new Set();
            for (const h of hits) {
                const url = new URL(encodeURI(h.href), base + "/").href;
                const name = `sherman_${h.year}-${String(h.month).padStart(2, "0")}_${path_basename(h.href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: h.year, month: h.month, name });
            }
            return out;
        },
    },
    // Moore County clerk (CivicLive, co.moore.tx.us): /page/moore.TrusteeSale
    // lists per-notice PDFs under /upload/page/4522/...; anchor text is
    // "<Month> <D>, <YYYY>-<borrower name>".
    moore_cc: {
        fips: "48341",
        discover: async () => {
            const base = "https://www.co.moore.tx.us";
            const html = await fetchText(base + "/page/moore.TrusteeSale");
            const hits = civicLiveDateSweep(html, { hrefFilter: (h) => /\/upload\/page\/4522\//i.test(h) });
            const out = [], seen = new Set();
            for (const h of hits) {
                const url = new URL(encodeURI(h.href), base + "/").href;
                const name = `moore_${h.year}-${String(h.month).padStart(2, "0")}_${path_basename(h.href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: h.year, month: h.month, name });
            }
            return out;
        },
    },
    // Wheeler County clerk (CivicLive, wheelercounty.texas.gov):
    // /page/County.Clerk-Forclosures (typo in the URL itself) lists 6+ years
    // of per-notice PDFs under /upload/page/0099/...; anchor text "Notice of
    // Trustee Sale - <Month> <D>, <YYYY> (n)". Verified: the July 7 2026
    // notice has a clean text layer, "Commonly known as: 207 S Choctaw St,
    // Shamrock..." -- no numbered venue address in the notice (just
    // "Courthouse of Wheeler, Texas"), so no venue regex needed.
    wheeler_cc: {
        fips: "48483",
        discover: async () => {
            const base = "https://www.wheelercounty.texas.gov";
            const html = await fetchText(base + "/page/County.Clerk-Forclosures");
            const hits = civicLiveDateSweep(html, { hrefFilter: (h) => /\/upload\/page\/0099\//i.test(h) });
            const out = [], seen = new Set();
            for (const h of hits) {
                const url = new URL(encodeURI(h.href), base + "/").href;
                const name = `wheeler_${h.year}-${String(h.month).padStart(2, "0")}_${path_basename(h.href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: h.year, month: h.month, name });
            }
            return out;
        },
    },
    // Ochiltree County clerk (CivicLive, co.ochiltree.tx.us): the
    // ochiltree.County.Clerk page's upload dir (/upload/page/7506/) is a
    // shared bucket for every clerk posting (bankruptcy notices, oil & gas,
    // fee schedules, ...) with ONE current trustee-sale PDF mixed in --
    // anchor text "Notice of Trustee's Sale - <legal desc> (<Month> D, YYYY)".
    // Filename/anchor pattern is not stable enough to hardcode a subfolder,
    // so filter on the "Notice of Trustee" / "Foreclosure" phrase instead.
    ochiltree_cc: {
        fips: "48357",
        discover: async () => {
            const base = "https://www.co.ochiltree.tx.us";
            const html = await fetchText(base + "/page/ochiltree.County.Clerk");
            const out = [], seen = new Set();
            const re = /<a[^>]*href="([^"]*\.pdf)"[^>]*>(.*?)<\/a>/gis;
            let m;
            while ((m = re.exec(html))) {
                const href = m[1];
                const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                if (!/notice of trustee|foreclosure sale|substitute trustee/i.test(text)) continue;
                const dm = /\(([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\)/.exec(text) || /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/.exec(text);
                if (!dm) continue;
                const mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                const year = +dm[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const url = new URL(encodeURI(href), base + "/").href;
                const name = `ochiltree_${year}-${String(mon).padStart(2, "0")}_${path_basename(href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
    // Lipscomb County clerk (CivicLive, co.lipscomb.tx.us): single static
    // file at /upload/page/4346/Trustee Sale/Trustee Sale Posting for
    // <M.D.YY>.pdf, gets overwritten in place when a new notice posts (same
    // one-file-slot pattern as Roberts below) -- anchor text is the generic
    // "Notice of Trustee's Sale", so the date has to come from the filename.
    lipscomb_cc: {
        fips: "48295",
        discover: async () => {
            const base = "https://www.co.lipscomb.tx.us";
            const html = await fetchText(base + "/page/lipscomb.County.Clerk");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/4346\/Trustee Sale\/[^"]*?(\d{1,2})\.(\d{1,2})\.(\d{2})\.pdf)"/gi)) {
                const mon = +m[2], year = 2000 + +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: new URL(encodeURI(m[1]), base + "/").href,
                    year,
                    month: mon,
                    name: `lipscomb_${year}-${String(mon).padStart(2, "0")}_${path_basename(m[1])}`,
                });
            }
            return out;
        },
    },
    // Carson County clerk (CivicLive, co.carson.tx.us): /upload/page/1414/
    // has a deep archive back to 2022. Two anchor-text conventions coexist:
    // direct sale-month packets "NOTICE OF TRUSTEE SALE <MONTH> <YYYY>" (no
    // day), and per-notice postings "TRUSTEE SALE NOTICE FILED <Month> <D>,
    // <YYYY>" where the date is the FILING/posting date, not the sale date
    // -> run those through saleMonthAfter (Prop. Code 51.002(b), like
    // Navarro/Milam). As of 2026-07-16 the newest posting is "MAY 2026"
    // (~2.5mo old, well inside the 6-month staleness bar -- feed is active,
    // just nothing in-window on THIS run; expected 0 ties today).
    carson_cc: {
        fips: "48065",
        discover: async () => {
            const base = "https://www.co.carson.tx.us";
            const html = await fetchText(base + "/page/carson.county.clerk");
            const out = [], seen = new Set();
            const re = /<a[^>]*href="([^"]*\.pdf)"[^>]*>(.*?)<\/a>/gis;
            let m;
            while ((m = re.exec(html))) {
                const href = m[1];
                if (!/\/upload\/page\/1414\//i.test(href)) continue;
                const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                if (!/trustee sale|foreclosure/i.test(text)) continue;
                let year, mon;
                let dm = /(?:NOTICE OF )?TRUSTEE SALE\s+([A-Za-z]+)\s+(\d{4})\b/i.exec(text);
                if (dm && !/\d{1,2},/.test(text)) {
                    mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                    year = +dm[2];
                } else {
                    dm = /FILED\s+(?:ON\s+)?([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})/i.exec(text);
                    if (!dm) continue;
                    const fm = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                    if (!fm) continue;
                    const s = saleMonthAfter(+dm[3], fm, +dm[2]);
                    year = s.year;
                    mon = s.month;
                }
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const url = new URL(encodeURI(href), base + "/").href;
                const name = `carson_${year}-${String(mon).padStart(2, "0")}_${path_basename(href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
    // Roberts County clerk (CivicLive, co.roberts.tx.us): "Public Notices
    // and News" page, single static file /upload/page/9841/Forclosure
    // Sale.pdf (county's own filename typo) that gets overwritten per
    // posting; anchor text carries the date: "Forclosure Sale <Month> <D>,
    // <YYYY>".
    roberts_cc: {
        fips: "48393",
        discover: async () => {
            const base = "https://www.co.roberts.tx.us";
            const html = await fetchText(base + "/page/roberts.Public%20Notices%20and%20News");
            const out = [];
            for (const m of html.matchAll(/<a[^>]*href="([^"]*Forclosure Sale\.pdf)"[^>]*>Forclosure Sale\s+([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: new URL(encodeURI(m[1]), base + "/").href,
                    year,
                    month: mon,
                    name: `roberts_${year}-${String(mon).padStart(2, "0")}_ForclosureSale.pdf`,
                });
            }
            return out;
        },
    },
    // Gray County clerk (Wix site, graycountyclerk.org -- NOT the CivicLive
    // co.gray.tx.us main county site): /notice-of-trustees-sale lists a
    // handful of dated PDFs under /_files/ugd/<hash>.pdf; Wix hashes the
    // filename so the date has to come from the rich-text anchor label,
    // shape "<TITLE> <M>.<D>.<YYYY>" (e.g. "...SALE 6.4.2026",
    // "NOTICE OF NON-JUDICIAL FORECLOSURE SALE 7.12.2026"). One heading
    // link on the page has no date in its label -- skipped by the regex.
    gray_cc: {
        fips: "48179",
        discover: async () => {
            const base = "https://www.graycountyclerk.org";
            const html = await fetchText(base + "/notice-of-trustees-sale");
            const out = [], seen = new Set();
            const re = /<a[^>]*href="(https:\/\/www\.graycountyclerk\.org\/_files\/ugd\/[^"]+\.pdf)"[^>]*>(.*?)<\/a>/gis;
            let m;
            while ((m = re.exec(html))) {
                const href = m[1];
                const text = m[2].replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").trim();
                const dm = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(text);
                if (!dm) continue;
                const mon = +dm[1], year = +dm[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                if (seen.has(href)) continue;
                seen.add(href);
                out.push({ url: href, year, month: mon, name: `gray_${year}-${String(mon).padStart(2, "0")}_${path_basename(href)}` });
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
