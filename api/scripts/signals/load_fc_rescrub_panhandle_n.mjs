// Panhandle-North RE-SCRUB (21 counties): Armstrong, Briscoe, Carson,
// Childress, Collingsworth, Cottle, Dallam, Dickens, Hall, Hansford, Hartley,
// Hemphill, Hutchinson, King, Lipscomb, Motley, Ochiltree, Oldham, Roberts,
// Sherman, Wheeler. Bounded re-attempt pass (2026-07-16) on counties that
// currently carry ZERO foreclosure signal in the DB, now that Tesseract OCR
// is available and knowing some earlier misses were WRONG-PAGE, not genuine
// absence. Standalone loader (parallel-safe pattern) -- imports only the
// shared discover/extract/parse/match/upsert machinery from
// load_pdf_foreclosures.mjs; does not edit that file or any sibling loader.
//
// A sibling loader (load_fc_panhandle_north.mjs, same day) already covers a
// DIFFERENT 13-county Panhandle grouping that overlaps 11 of these 21
// (Carson/Dallam/Hansford/Hartley/Hemphill/Hutchinson/Lipscomb/Ochiltree/
// Roberts/Sherman/Wheeler -- it also covers Gray and Moore, which are NOT in
// this county list). Its already-verified discover() logic and skip-log
// reasoning were re-checked (not blindly trusted -- Dallam and Hemphill were
// spot-refetched live 2026-07-16 and matched exactly) and ported in here
// rather than re-researched from scratch, per the task's "don't re-fight
// already-solved blocks" guardrail. Skip-log entries are marked
// "(ported, re-verified)" where independently re-confirmed today.
//
//   DATABASE_URL=... node scripts/signals/load_fc_rescrub_panhandle_n.mjs [--parse-only] [source...]
//
// Run with FC_BACK=4: these are low-volume rural feeds (one posting every
// 1-3 months); the shared inWindow() default (current month .. +2) misses
// real, recently-past sales almost every run. FC_BACK=4 catches genuinely
// recent activity (Cottle's May 2026 sale, Motley's March 2026 sale) while
// still respecting the ~6-month "gone quiet" staleness bar already
// established by the sibling loader for Hemphill (Jan 2026, ~6.3mo stale ->
// stays excluded even at FC_BACK=4, consistent with its skip determination).
//
// --- SKIP-LOG (researched/re-verified 2026-07-16) --------------------------
// armstrong_cc 48011 - CivicLive (co.armstrong.tx.us/page/armstrong.County.Clerk).
//              Real "Foreclosures" accordion with a real posting history, but
//              the newest entry is "Substitiute Trustees Sale 11 21 2024.pdf"
//              (Nov 21, 2024) -- ~20 months stale. Feed reads as dead, not
//              wrong-page: checked the correct County Clerk page directly.
// briscoe_cc   48045 - CivicLive (co.briscoe.tx.us). Checked both
//              briscoe.County.Clerk (combined District/County Clerk page,
//              zero foreclosure/trustee text) and briscoe.PublicNotices
//              (Commissioners Court agendas only). No notices online.
// childress_cc 48075 - REAL SIGNAL SOURCE CONFIRMED, not genuine absence --
//              flag for a dedicated future retry, don't re-skip as "nothing
//              posted." www.childresstx.us (Rails app; the search-indexed
//              "childresscountytexas.us" is a DEAD DOMAIN now squatted by a
//              third-party legal-marketing "probate cost calculator" site --
//              classic parked-lookalike trap, correctly avoided). The real
//              site's /pages/county-clerk embeds a "NOTICE OF TRUSTEE SALE.jpg"
//              (image, not PDF -- posted via Rails rich-text, no OCR path for
//              inline images in this pipeline) and /pages/archive-of-public-
//              announcements lists "Notice of Trustee Sale" + "Notice of
//              Trustee Appointment" PDFs via signed ActiveStorage blob URLs
//              with NO visible date in the link text (sits next to a
//              "March 3rd 2020 Election" archive item, so likely old, but
//              unconfirmed). Blocker: www.childresstx.us 500s on ~50-60% of
//              requests (page HTML), and the ActiveStorage blob-download
//              route specifically failed 5/5 attempts even when the
//              surrounding page loaded fine -- infra problem on the county's
//              end, not a discovery problem. Needs a retry-with-backoff
//              discover() and a same-page date lookup once the blob route is
//              confirmed reachable; not written today given the 0% download
//              success rate observed.
// collingsworth_cc 48087 - CivicLive (co.collingsworth.tx.us/page/
//              collingsworth.County.Clerk). Page explicitly states
//              "Foreclosures-None at this time as of 06/09/2021" -- genuine
//              confirmed absence (the county's own page says so), no PDFs
//              present at all.
// dickens_cc   48125 - CivicLive (co.dickens.tx.us). Checked both
//              dickens.County.Clerk (zero foreclosure/trustee text) and
//              dickens.PublicNotices (near-empty, one unrelated Roll-Off
//              Site Info PDF). No notices online.
// hall_cc      48191 - CivicLive (co.hall.tx.us). The nav literally has a
//              "Foreclosure Notices" submenu item, but it points at
//              hall.Public.Notices, whose actual content is Commissioners
//              Court meeting notices / tax-increase hearings / salary
//              notices only -- no trustee-sale postings ever, despite the
//              menu label. Checked combined District/County Clerk page too
//              (zero hits). No notices online.
// king_cc      48269 - CivicLive (co.king.tx.us). Least-populous county in
//              Texas (~280 people). Checked king.County.Clerk and
//              king.Public.Notices.Calendar -- zero "foreclos", "trustee", or
//              even "sale" mentions in either page. No notices online.
// oldham_cc    48359 - WRONG-HOST RESCUE, then genuine staleness: the bare
//              co.oldham.tx.us host 302-redirects EVERY /page/ path (incl.
//              reserved slugs like /page/sitemap) back to its own homepage --
//              even with a session cookie from visiting "/" first. The
//              www.co.oldham.tx.us host (same site, www required) serves the
//              real pages correctly and DOES have a populated Foreclosure
//              Notices page (/page/ForeclosureNotices) with a real posting
//              history back to 2018. But the newest entry is "Notice of
//              Substitute Trustee's Sale - February 02, 2025" -- ~17.5
//              months stale. Feed is real but has gone quiet; not loadable
//              even after finding the right host.
// dallam_cc    48111 (ported, re-verified) - dallam.org (old static HTML
//              site, framesetish /county/clerk.shtml). Re-fetched live
//              2026-07-16: County Clerk page only lists "Foreclosure
//              Notices" as one of the document TYPES the office files
//              (prose paragraph alongside Hospital Liens, Cattle Brands,
//              etc); the page's actual "NOTICES:" link section has exactly
//              one dated posting, "08/04/2026 Tax Sale" (delinquent tax,
//              not a mortgage trustee sale). No foreclosure notices online.
// hansford_cc  48195 (ported) - CivicLive (co.hansford.tx.us/page/
//              hansford.County.Clerk), /upload/page/4378/docs/ has exactly 2
//              foreclosure PDFs, both from 2020 (June 2020, Nov 2020) plus
//              one mislabeled county-minutes doc. Feed dead 6 years -- stale.
// hartley_cc   48205 (ported) - CivicLive (co.hartley.tx.us). Checked both
//              hartley.County.Clerk and hartley.PublicNotices pages: zero
//              PDF links, zero foreclosure/trustee text. No notices online.
// hemphill_cc  48211 (ported, re-verified) - CivicLive (co.hemphill.tx.us/
//              page/hemphill.Notice%20of%20Sales). Re-fetched live
//              2026-07-16, identical state to the sibling's same-day check:
//              real, actively-maintained posting history, but the newest
//              foreclosure/trustee entry is still "Notice of Foreclosure
//              Sale - January 6, 2026" (~6.3 months stale); the only newer
//              2026 posting is a Feb 3 2026 SHERIFF/TAX sale (different
//              signal type). Feed reads as gone quiet -- skip on staleness,
//              stays excluded even at this run's FC_BACK=4.
// hutchinson_cc 48233 (ported) - CivicLive hutchinson.Foreclosures page
//              exists but contains NO postings itself -- it's a single
//              outbound link to i2i.uslandrecords.com (US Land Records
//              subscription real-property search portal). Paywalled/login
//              third-party system, same family as the Kofile/Tyler skip class.
// -----------------------------------------------------------------------

import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

function pathBasename(p) {
    return decodeURIComponent(p.split("/").pop()).replace(/[^\w.-]+/g, "_");
}

// Generic CivicLive (co.<name>.tx.us / <name>county.texas.gov, /page/... nav,
// /upload/page/<id>/... PDFs) anchor-text date sweep -- local copy of the
// pattern used by the sibling Panhandle loader (that helper isn't exported,
// so it's duplicated here rather than imported). Anchor text carries the
// sale date in one of a few observed shapes; falls back to href when the
// text carries no date.
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
    // Cottle County clerk (CivicLive, co.cottle.tx.us): /page/cottle.County.Clerk
    // has a "Foreclosures" accordion with one dated entry per year back to
    // 2022 (<p><strong>YYYY</strong><br /><a href=...>Month D, YYYY at TIME</a>);
    // 2022-2023 PDFs are hosted on the CivicLive origin newtools.cira.state.tx.us
    // instead of the county host. Good embedded text layer expected (recent
    // scans on this platform usually carry one).
    cottle_cc: {
        fips: "48101",
        discover: async () => {
            const base = "https://www.co.cottle.tx.us";
            const html = await fetchText(base + "/page/cottle.County.Clerk");
            const out = [], seen = new Set();
            const re = /<a[^>]*href="([^"]*\.pdf)"[^>]*>(.*?)<\/a>/gis;
            let m;
            while ((m = re.exec(html))) {
                const href = m[1];
                const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                const dm = /([A-Za-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})\b/.exec(text);
                if (!dm) continue;
                const mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                const year = +dm[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const url = new URL(encodeURI(href), base + "/").href;
                const name = `cottle_${year}-${String(mon).padStart(2, "0")}_${pathBasename(href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
    // Motley County clerk (CivicLive, co.motley.tx.us): /page/motley.Foreclosures
    // has a deep year-by-year archive back to 2019 -- a mix of clean
    // "<Month> <D>(st/nd/rd/th)?, <YYYY>" anchor text and messy two-column
    // month tables from older years (skipped gracefully when no day+year
    // parses). TAX SALE / Sheriff's Sale entries are a DIFFERENT signal type
    // and are explicitly excluded by text filter.
    motley_cc: {
        fips: "48345",
        discover: async () => {
            const base = "https://www.co.motley.tx.us";
            const html = await fetchText(base + "/page/motley.Foreclosures");
            const out = [], seen = new Set();
            const re = /<a[^>]*href="([^"]*\.pdf)"[^>]*>(.*?)<\/a>/gis;
            let m;
            while ((m = re.exec(html))) {
                const href = m[1];
                const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                if (/tax sale|sheriff/i.test(text) || /sheriff/i.test(href)) continue;
                const dm = /([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\.?,?\s*(\d{4})\b/.exec(text);
                if (!dm) continue;
                const mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                const year = +dm[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const url = new URL(encodeURI(href), base + "/").href;
                const name = `motley_${year}-${String(mon).padStart(2, "0")}_${pathBasename(href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
    // Carson County clerk (CivicLive, co.carson.tx.us): /upload/page/1414/
    // has a deep archive back to 2022 (ported from the sibling Panhandle-
    // North loader's already-verified logic). Two anchor-text conventions
    // coexist: direct sale-month packets "NOTICE OF TRUSTEE SALE <MONTH>
    // <YYYY>" (no day), and per-notice postings "TRUSTEE SALE NOTICE FILED
    // <Month> <D>, <YYYY>" where the date is the FILING/posting date, not
    // the sale date -> run those through saleMonthAfter (Prop. Code
    // 51.002(b)).
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
                const name = `carson_${year}-${String(mon).padStart(2, "0")}_${pathBasename(href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
    // Sherman County clerk (CivicLive -- migrated off co.sherman.tx.us, which
    // now 301s to shermancountytx.gov): /page/Foreclosure.Notices lists
    // per-notice PDFs under /upload/page/0093/...; anchor TEXT (not filename)
    // carries the reliable sale date. Ported from the sibling loader.
    sherman_cc: {
        fips: "48421",
        discover: async () => {
            const base = "https://www.shermancountytx.gov";
            const html = await fetchText(base + "/page/Foreclosure.Notices");
            const hits = civicLiveDateSweep(html, { hrefFilter: (h) => /\/upload\/page\/0093\//i.test(h) });
            const out = [], seen = new Set();
            for (const h of hits) {
                const url = new URL(/%[0-9A-Fa-f]{2}/.test(h.href) ? h.href : encodeURI(h.href), base + "/").href;
                const name = `sherman_${h.year}-${String(h.month).padStart(2, "0")}_${pathBasename(h.href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: h.year, month: h.month, name });
            }
            return out;
        },
    },
    // Ochiltree County clerk (CivicLive, co.ochiltree.tx.us): the
    // ochiltree.County.Clerk page's upload dir (/upload/page/7506/) is a
    // shared bucket for every clerk posting with ONE current trustee-sale
    // PDF mixed in -- filter on the "Notice of Trustee" / "Foreclosure"
    // phrase instead of a subfolder. Ported from the sibling loader.
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
                const name = `ochiltree_${year}-${String(mon).padStart(2, "0")}_${pathBasename(href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year, month: mon, name });
            }
            return out;
        },
    },
    // Lipscomb County clerk (CivicLive, co.lipscomb.tx.us): single static
    // file at /upload/page/4346/Trustee Sale/..., gets overwritten in place
    // when a new notice posts -- date has to come from the filename.
    // Ported from the sibling loader.
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
                    name: `lipscomb_${year}-${String(mon).padStart(2, "0")}_${pathBasename(m[1])}`,
                });
            }
            return out;
        },
    },
    // Roberts County clerk (CivicLive, co.roberts.tx.us): "Public Notices and
    // News" page, single static file /upload/page/9841/Forclosure Sale.pdf
    // (county's own filename typo) that gets overwritten per posting; anchor
    // text carries the date. Ported from the sibling loader.
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
    // Wheeler County clerk (CivicLive, wheelercounty.texas.gov):
    // /page/County.Clerk-Forclosures (typo in the URL itself) lists 6+ years
    // of per-notice PDFs under /upload/page/0099/...; anchor text "Notice of
    // Trustee Sale - <Month> <D>, <YYYY> (n)". Ported from the sibling loader.
    wheeler_cc: {
        fips: "48483",
        discover: async () => {
            const base = "https://www.wheelercounty.texas.gov";
            const html = await fetchText(base + "/page/County.Clerk-Forclosures");
            const hits = civicLiveDateSweep(html, { hrefFilter: (h) => /\/upload\/page\/0099\//i.test(h) });
            const out = [], seen = new Set();
            for (const h of hits) {
                const url = new URL(/%[0-9A-Fa-f]{2}/.test(h.href) ? h.href : encodeURI(h.href), base + "/").href;
                const name = `wheeler_${h.year}-${String(h.month).padStart(2, "0")}_${pathBasename(h.href)}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: h.year, month: h.month, name });
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
