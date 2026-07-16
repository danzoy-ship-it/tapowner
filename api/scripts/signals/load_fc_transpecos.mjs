// Trans-Pecos / West Texas border county foreclosure-notice loader. Sibling
// of load_pdf_foreclosures.mjs (imports its shared discover->parse->match->
// upsert machinery; does NOT edit that file). Counties: El Paso, Hudspeth,
// Culberson, Jeff Davis, Brewster, Presidio, Terrell, Val Verde, Edwards,
// Kinney, Maverick, Dimmit, Zavala, La Salle.
//
//   DATABASE_URL=... node scripts/signals/load_fc_transpecos.mjs [--parse-only] [source...]

import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

// Notice/page text that means "not a mortgage trustee sale" -- several of
// these counties dump ALL clerk/public notices (tax seizures, sheriff sales,
// elections, budgets) into the same upload folder as the real Notice of
// [Substitute] Trustee's Sale postings.
const EXCLUDE_RE = /seizure|sheriff|tax\s*sale|election|agenda|minutes|budget|holiday/i;

// Flexible date extractor: tries "Month D, YYYY", "MM/DD/YYYY", "MM-DD-YY(YY)",
// leading "M.D.YY" and leading glued "MMDDYYYY"/"MMDDYY" (filename-embedded
// dates). Returns {year, month, day} or null. Used across every source below
// since each clerk site labels its dates differently (anchor text vs.
// filename, with/without year, dashes vs. slashes vs. glued digits).
function extractDate(s) {
    if (!s) return null;
    let m = s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})/);
    if (m) {
        const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
        if (mon) return { year: +m[3], month: mon, day: +m[2] };
    }
    m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return { year: +m[3], month: +m[1], day: +m[2] };
    m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})(?!\d)/);
    if (m) return { year: 2000 + +m[3], month: +m[1], day: +m[2] };
    m = s.match(/^\W{0,3}(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) return { year: m[3].length === 2 ? 2000 + +m[3] : +m[3], month: +m[1], day: +m[2] };
    m = s.match(/^(\d{2})(\d{2})(\d{4})/);
    if (m) return { year: +m[3], month: +m[1], day: +m[2] };
    m = s.match(/^(\d{2})(\d{2})(\d{2})(?!\d)/);
    if (m) return { year: 2000 + +m[3], month: +m[1], day: +m[2] };
    return null;
}
const validDate = (d) => d && d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31;

const SOURCES = {
    // Jeff Davis County clerk (CivicLive, jeffdaviscounty.texas.gov): one
    // mixed "public/legal notices" folder (/upload/page/6579/) holds trustee
    // sales, tax seizures, and sheriff sales together -- filter to trustee/
    // foreclosure labels only. Anchor text carries the sale date directly
    // (verified against first-Tuesday rule: "February 3, 2026" etc. all land
    // on real first-Tuesdays), in either "Month D, YYYY" or "M/D/YYYY" form.
    jeffdavis_cc: {
        fips: "48243",
        discover: async () => {
            const base = "https://www.jeffdaviscounty.texas.gov";
            const html = await fetchText(base + "/page/jeffdavis.ForeclosureSale");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                const label = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                if (!/trustee|foreclosure/i.test(label) || EXCLUDE_RE.test(label)) continue;
                const d = extractDate(label);
                if (!validDate(d) || !inWindow(d.year, d.month)) continue;
                const url = new URL(encodeURI(m[1]), base).href;
                const name = `jeffdavis_${d.year}-${String(d.month).padStart(2, "0")}_${path.basename(decodeURIComponent(m[1])).replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: d.year, month: d.month, name });
            }
            return out;
        },
    },
    // Brewster County clerk (CivicLive, brewstercounty.gov): trustee-sale
    // PDFs live under /upload/page/0075/ alongside other clerk postings on
    // the /page/public.notices page. Date sometimes in the anchor text
    // ("09-01-2026 Notice of Trustee Sale", "04/07/26 ..."), sometimes only
    // in the filename prefix ("120225Notice of Substitute Trustee Sale.pdf" =
    // 12/02/25, "9.1.26Notice..." = 9/1/26) -- both verified as real
    // first-Tuesday sale dates, used directly.
    brewster_cc: {
        fips: "48043",
        discover: async () => {
            const base = "https://www.brewstercounty.gov";
            const html = await fetchText(base + "/page/public.notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/0075\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                const label = (m[2] || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                const fname = decodeURIComponent(path.basename(m[1]));
                if (!/trustee|foreclosure/i.test(label) && !/trustee|foreclosure/i.test(fname)) continue;
                if (EXCLUDE_RE.test(label) || EXCLUDE_RE.test(fname)) continue;
                let d = extractDate(label);
                if (!validDate(d)) d = extractDate(fname);
                if (!validDate(d) || !inWindow(d.year, d.month)) continue;
                const url = new URL(encodeURI(m[1]), base).href;
                const name = `brewster_${d.year}-${String(d.month).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: d.year, month: d.month, name });
            }
            return out;
        },
    },
    // Edwards County clerk (CivicLive backend newtools.cira.state.tx.us,
    // fronted at co.edwards.tx.us/page/edwards.Foreclosures): /upload/page/
    // 0094/ per-notice PDFs, anchor text is JUST the sale date ("June 2,
    // 2026") -- often WITHOUT a year ("February 3", "Aug 4"), all verified
    // against real first-Tuesdays -> missing year defaults to current year
    // with a near-future roll (same technique as bell_cc/comal_cc).
    edwards_cc: {
        fips: "48137",
        discover: async () => {
            const base = "https://www.co.edwards.tx.us";
            const html = await fetchText(base + "/page/edwards.Foreclosures");
            const now = new Date();
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                const label = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                if (EXCLUDE_RE.test(label)) continue;
                let d = extractDate(label);
                if (!validDate(d)) {
                    const mm = label.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*$/);
                    if (mm) {
                        const mon = MONTHS.indexOf(mm[1].slice(0, 3).toUpperCase()) + 1;
                        if (mon) {
                            let year = now.getFullYear();
                            if (mon - (now.getMonth() + 1) < -6) year += 1;
                            d = { year, month: mon, day: +mm[2] };
                        }
                    }
                }
                if (!validDate(d) || !inWindow(d.year, d.month)) continue;
                const url = new URL(encodeURI(m[1]), base).href;
                const name = `edwards_${d.year}-${String(d.month).padStart(2, "0")}_${path.basename(decodeURIComponent(m[1])).replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: d.year, month: d.month, name });
            }
            return out;
        },
    },
    // Kinney County clerk (same CivicLive/CIRA backend as Edwards,
    // newtools.cira.state.tx.us/page/kinney.Foreclosures): /upload/page/0322/
    // per-notice PDFs, anchor text carries the full sale date WITH year
    // ("Hodges-July 7, 2026", "MAY 5, 2026-KASOWSKI ENTERPRISES LLC"),
    // verified real first-Tuesdays -> used directly.
    kinney_cc: {
        fips: "48271",
        discover: async () => {
            const base = "https://newtools.cira.state.tx.us";
            const html = await fetchText(base + "/page/kinney.Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                const label = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
                if (EXCLUDE_RE.test(label)) continue;
                const d = extractDate(label);
                if (!validDate(d) || !inWindow(d.year, d.month)) continue;
                const url = new URL(encodeURI(m[1]), base).href;
                const name = `kinney_${d.year}-${String(d.month).padStart(2, "0")}_${path.basename(decodeURIComponent(m[1])).replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url, year: d.year, month: d.month, name });
            }
            return out;
        },
    },
    // Zavala County clerk (CivicLive/CIRA "page/open" scheme, same family as
    // Guadalupe): co.zavala.tx.us/page/Foreclosures links /page/open/<id>/0/
    // <slug>[.pdf], slug carries a date ("Posted February 10, 2026", "July
    // 31, 2025") that is the POSTING date, not the sale date (doesn't land on
    // first-Tuesdays) -> routed through saleMonthAfter like Navarro/Upshur.
    zavala_cc: {
        fips: "48507",
        discover: async () => {
            const base = "https://www.co.zavala.tx.us";
            const html = await fetchText(base + "/page/Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/page\/open\/\d+\/0\/([^"]+))"/gi)) {
                const slug = decodeURIComponent(m[2]).replace(/\.pdf$/i, "").replace(/&#39;/g, "'");
                const d = extractDate(slug.replace(/^Posted[-\s]*/i, ""));
                if (!validDate(d)) continue;
                const s = saleMonthAfter(d.year, d.month, d.day);
                if (!inWindow(s.year, s.month)) continue;
                const name = `zavala_${s.year}-${String(s.month).padStart(2, "0")}_${slug.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + encodeURI(m[1]), year: s.year, month: s.month, name });
            }
            return out;
        },
    },
    // La Salle County clerk (own Joomla site, co.la-salle.tx.us): /images/
    // pdfs/clerk/ (older: /images/pdfs/TrusteeSale/) holds TrusteeSale_
    // MMDDYYYY.pdf / Foreclosure_Sale_MMDDYYYY.pdf / Notice_of_Sale_MM_DD_
    // YYYY.pdf / older 6-digit-year variants. None of the embedded dates land
    // on first-Tuesdays -> these are POSTING dates, routed through
    // saleMonthAfter.
    lasalle_cc: {
        fips: "48283",
        discover: async () => {
            const base = "https://www.co.la-salle.tx.us";
            const html = await fetchText(base + "/index.php/offices/county-district-clerk/247-trustee-sales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/images\/pdfs\/(?:clerk|TrusteeSale)\/([^"]+\.pdf))"/gi)) {
                const fname = decodeURIComponent(m[2]);
                const digits = fname.replace(/[^0-9]/g, "");
                let mm, dd, yyyy;
                if (digits.length >= 8) {
                    const d8 = digits.slice(-8);
                    mm = +d8.slice(0, 2); dd = +d8.slice(2, 4); yyyy = +d8.slice(4, 8);
                } else if (digits.length === 6) {
                    mm = +digits.slice(0, 2); dd = +digits.slice(2, 4); yyyy = 2000 + +digits.slice(4, 6);
                } else continue;
                if (!mm || mm > 12 || !dd || dd > 31) continue;
                const s = saleMonthAfter(yyyy, mm, dd);
                if (!inWindow(s.year, s.month)) continue;
                const name = `lasalle_${s.year}-${String(s.month).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + encodeURI(m[1]), year: s.year, month: s.month, name });
            }
            return out;
        },
    },
    // Maverick County clerk (co.maverick.tx.us -- new Astro/Tailwind county
    // site, Cloudflare R2 bucket for documents): /resources/foreclosure-
    // postings lists per-notice PDFs at pub-<hash>.r2.dev/resources/
    // foreclosure-postings/<year>/<MONTH>_<DD>_<YYYY>-<NAME>.pdf; the
    // filename date IS the sale date (verified real first-Tuesdays) -> used
    // directly.
    maverick_cc: {
        fips: "48323",
        discover: async () => {
            const base = "https://co.maverick.tx.us";
            const html = await fetchText(base + "/resources/foreclosure-postings");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(https:\/\/pub-[a-z0-9]+\.r2\.dev\/resources\/foreclosure-postings\/(\d{4})\/([A-Za-z]+)_(\d{1,2})_(\d{4})[_-][^"]+\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[5];
                if (!mon || !inWindow(year, mon)) continue;
                const fname = path.basename(decodeURIComponent(m[1]));
                const name = `maverick_${year}-${String(mon).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: m[1], year, month: mon, name });
            }
            return out;
        },
    },

    // --- SKIP-LOGGED (not loadable, no config entry) ---
    // El Paso 48141: apps.epcountytx.gov/publicrecords/Foreclosures is a
    // search form (POST /ForeclosureSearch) gated by a Cloudflare Turnstile
    // widget (data-sitekey visible in the form HTML) -- the reCAPTCHA-class
    // block flagged in the brief. Do NOT bypass. (elpaso.realforeclose.com
    // is tax-sale only, not mortgage trustee notices -- confirmed separately
    // in FORECLOSURE_SOURCES.md.)
    // Hudspeth 48229: co.hudspeth.tx.us/page/hudspeth.County.District.Clerk
    // has NO foreclosure/trustee-sale content anywhere on the clerk page
    // (verified 2026-07-16, zero "trustee"/"foreclosure" hits). Tiny county
    // (pop ~3,300); no online posting.
    // Culberson 48109: co.culberson.tx.us/page/culberson.County.Clerk has NO
    // foreclosure/trustee-sale content (verified 2026-07-16). The only
    // "Notice of Trustee's Sale" hit found in search is a generic BLANK
    // sample form (newtools.cira.state.tx.us/upload/page/1534/docs/
    // notice_of_trustees_sale.pdf), not an actual posted notice.
    // Presidio 48377: co.presidio.tx.us/page/presidio.CurrentPublicNotices
    // posts "Notice of Sheriff's Sale" (tax/execution) regularly but has NO
    // "Notice of [Substitute] Trustee's Sale" / mortgage-foreclosure postings
    // (verified 2026-07-16, zero "trustee" hits on the notices page).
    // Dimmit 48127: dimmitcounty.org/government/departments/trustee_sales.php
    // (Revize CMS) lists 24 trustee-sale PDFs with clean per-item dates, but
    // EVERY file link 302-redirects to cms9files.revize.com and then 404s
    // there -- verified on 2 different files (one from 2024, one posted
    // 2026-07-01, so it's not just a stale link), with and without the
    // cache-bust query param, with and without a Referer header. The
    // county's own CDN is broken for direct/programmatic fetches; the site's
    // JS may resolve these some other way. Not a URL-construction bug on our
    // end -- skipped as genuinely resistant. Revisit periodically.
    // Terrell 48443: co.terrell.tx.us/page/terrell.Notice%20of%20Foreclosure
    // %20Sale exists and is well-formed (same CivicLive family as Jeff
    // Davis), but the newest posting is January 6, 2026 -- >6 months stale
    // as of 2026-07-16, i.e. no current notices. Tiny county (pop ~760);
    // revisit if postings resume.
    // Val Verde 48465: valverdecounty.texas.gov/283/Foreclosures (CivicPlus)
    // groups notices under sparse "<strong id=isPasted>Month YYYY</strong>"
    // headings, but the CURRENT heading ("July 2026") turned out to cover
    // ~112 /DocumentCenter/View links spanning a wide doc-ID range (8195-
    // 10526) with NO per-notice date anywhere in the URL/slug -- unlike
    // Hill County's genuinely per-sale-date headings, one Val Verde heading
    // clearly spans many months of backlog. The PDFs are image-only (no
    // pdftotext layer) so the true per-notice date can't be cheaply
    // recovered either. Bucketing all 112 under one sale month would be a
    // real accuracy risk -> skipped rather than loaded with fabricated
    // dates. Revisit with an OCR pass to read each notice's own posted date.
};

await runSources(SOURCES, { parseOnly: process.argv.includes("--parse-only") });
