// County foreclosure-notice loader: NE-corner + South-Central Texas batch.
// Standalone sibling of load_pdf_foreclosures.mjs (per the parallel-loader
// pattern added 2026-07-16) -- imports the shared discover/parse/match/
// upsert machinery and defines only this batch's SOURCES.
//
// Platform mix found while scoping this batch (all verified 2026-07-16):
//   - CivicLive (newtools.cira.state.tx.us template, co.<name>.tx.us):
//     morris, marion, franklin, rains, karnes, dewitt, lavaca, colorado --
//     the same family as wise_cc/vanzandt_cc/wood_cc/etc. in the shared file,
//     each with its own filename-dating quirk (see per-county comments).
//   - Wix (uvaldecounty.gov, NOT CivicLive): uvalde -- structured link text
//     carries the sale date directly, no OCR needed.
//   - Camp, Red River, Delta, Rains(*see below), Bee, Frio, Bandera, Real:
//     no usable discover() found within the campaign budget -- see the
//     SKIPPED block at the bottom for the per-county reason.
//
//   DATABASE_URL=... node scripts/signals/load_fc_ne_southcentral.mjs [--parse-only] [source...]

import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter } from "./load_pdf_foreclosures.mjs";

const basename = (p) => decodeURIComponent(p.split("/").pop());

const SOURCES = {
    // Morris County clerk (CivicLive, co.morris.tx.us): /page/morris.Foreclosures
    // posts a handful of per-notice scans named "Notice of Trustees Sale
    // <M>.<D>.<YYYY><seq>.pdf" -- a 4-digit sequence number runs into the
    // year with no separator (e.g. "8.4.20260001.pdf").
    morris_cc: {
        fips: "48343",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.morris.tx.us";
            const html = await fetchText(base + "/page/morris.Foreclosures");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/\d+\/[^"]*?(\d{1,2})\.(\d{1,2})\.(\d{4})\d{0,4}\.pdf)"/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `morris_${year}-${String(mon).padStart(2, "0")}_${basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Marion County clerk (CivicLive, co.marion.tx.us): /page/marion.Foreclosures
    // posts per-notice scans named with an upload TIMESTAMP
    // (YYYYMMDDHHMMSSmmm, 17 digits) -- no sale date anywhere in the
    // filename or anchor text, so the timestamp is treated as the POSTING
    // date and the earliest legal sale month is derived via saleMonthAfter
    // (Navarro pattern, Tex. Prop. Code 51.002(b) 21-day window).
    marion_cc: {
        fips: "48315",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.marion.tx.us";
            const html = await fetchText(base + "/page/marion.Foreclosures");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/\d+\/(\d{4})(\d{2})(\d{2})\d{9}\.pdf)"/gi)) {
                const s = saleMonthAfter(+m[2], +m[3], +m[4]);
                if (!inWindow(s.year, s.month)) continue;
                out.push({
                    url: base + m[1],
                    year: s.year,
                    month: s.month,
                    name: `marion_${m[2]}${m[3]}${m[4]}_${basename(m[1])}`,
                });
            }
            return out;
        },
    },
    // Franklin County clerk (CivicLive, co.franklin.tx.us): /page/franklin.Foreclosure
    // posts per-notice scans directly under /upload/page/1850/ named
    // "<MM>.<DD>.<YYYY> <Name>.pdf" (a same-page /1850/<year>/ subfolder
    // re-hosts a few of the same notices without a date prefix -- skipped
    // by requiring the date to sit immediately after "1850/").
    franklin_cc: {
        fips: "48159",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.franklin.tx.us";
            const html = await fetchText(base + "/page/franklin.Foreclosure");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/1850\/(\d{2})\.(\d{2})\.(\d{4})\s+[^/"]+\.pdf)"/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `franklin_${year}-${String(mon).padStart(2, "0")}_${basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Rains County clerk (CivicLive, co.rains.tx.us): /page/rains.Foreclosure
    // posts ONE consolidated packet per sale month, "<MONTH> <YYYY> TRUSTEE
    // SALES.pdf" (a dateless "forclosure sales.pdf" catch-all is also
    // linked -- skipped, no month to bucket it by).
    rains_cc: {
        fips: "48379",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.rains.tx.us";
            const html = await fetchText(base + "/page/rains.Foreclosure");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/\d+\/([A-Za-z]+)\s+(\d{4})\s+TRUSTEE\s+SALES\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[3],
                    month: mon,
                    name: `rains_${m[3]}-${String(mon).padStart(2, "0")}.pdf`,
                });
            }
            return out;
        },
    },
    // Karnes County clerk (CivicLive, co.karnes.tx.us): /page/karnes.NoticeofForeclosureSales
    // lists per-notice scans across chaotic filename eras -- 2025 postings
    // use bare MMDDYYYY digits (all fall outside the discovery window and
    // are skipped by construction, since only the /2026/ folder is matched);
    // current postings use "<Name> M.D.YY.pdf" (a couple of double-dot
    // typos, e.g. "8..4.26", tolerated by the regex; "7.726 LOTT.pdf" -- a
    // missing-dot typo -- doesn't parse and is dropped, singleton loss).
    karnes_cc: {
        fips: "48255",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.karnes.tx.us";
            const html = await fetchText(base + "/page/karnes.NoticeofForeclosureSales");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/1042\/FORECLOSURE\/2026\/[^"]*?(\d{1,2})\.\.?(\d{1,2})\.(\d{2})[^"]*\.pdf)"/gi)) {
                const mon = +m[2], day = +m[3], year = 2000 + +m[4];
                if (!mon || mon > 12 || !day || day > 31 || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `karnes_${year}-${String(mon).padStart(2, "0")}_${basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // DeWitt County clerk (CivicLive, co.dewitt.tx.us): /page/dewitt.Foreclosures
    // lists per-notice scans under /upload/page/1638/docs/County Clerk/<year>/
    // with the anchor TEXT carrying the sale date explicitly
    // ("#2026-005 ... -- Date of Sale: 06/02/2026") -- no OCR needed.
    dewitt_cc: {
        fips: "48123",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.dewitt.tx.us";
            const html = await fetchText(base + "/page/dewitt.Foreclosures");
            const out = [];
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/1638\/[^"]*Foreclosure_[^"]*\.pdf)"[^>]*>[\s\S]{0,120}?Date\s+of\s+Sale:\s*(\d{2})\/(\d{2})\/(\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `dewitt_${year}-${String(mon).padStart(2, "0")}_${basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Lavaca County clerk (CivicLive, co.lavaca.tx.us): /page/Foreclosure
    // posts a small mix of consolidated packets -- "<Month> <D> <YYYY>
    // Trustee Sale.pdf", "<MMDDYYYY> Trustee.pdf", and "<MMDDYYYY>notice
    // of [substitute] trustee[s] sale.pdf" (a dateless "site order.pdf" --
    // the Commissioners Court sale-location order -- has no date to match
    // and is skipped).
    lavaca_cc: {
        fips: "48285",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.lavaca.tx.us";
            const html = await fetchText(base + "/page/Foreclosure");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/\d+\/[^"]*\.pdf)"/gi)) {
                const href = m[1], file = basename(href);
                let mon, year;
                let mm = file.match(/^([A-Za-z]+)\s+\d{1,2}\s+(\d{4})\s+Trustee\s+Sale/i);
                if (mm) {
                    mon = MONTHS.indexOf(mm[1].slice(0, 3).toUpperCase()) + 1;
                    year = +mm[2];
                } else if ((mm = file.match(/^(\d{2})(\d{2})(\d{4})\s*(?:notice|Trustee)/i))) {
                    mon = +mm[1];
                    year = +mm[3];
                }
                if (!mon || mon > 12 || !year || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(href),
                    year,
                    month: mon,
                    name: `lavaca_${year}-${String(mon).padStart(2, "0")}_${file.replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Colorado County clerk (CivicLive, co.colorado.tx.us): /page/colorado.PublicNotices
    // links foreclosure/trustee-sale scans under /upload/page/6218/<year>/
    // <M>-<D>-<YY>/ -- the folder itself IS the sale date. Rural land tracts
    // (survey/abstract legal descriptions, e.g. "8.739ac Henry Austin
    // Survey A-4") -- no street address on most notices, so expect a low
    // direct-match tie rate; the shared legal-description matcher targets
    // subdivision/block/lot text and won't parse metes-and-bounds surveys
    // either -- this county is loaded mainly to keep the event on record.
    colorado_cc: {
        fips: "48089",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.colorado.tx.us";
            const html = await fetchText(base + "/page/colorado.PublicNotices");
            const out = [];
            for (const m of html.matchAll(/href="(https?:\/\/[a-z.]*(?:co\.colorado\.tx\.us|cira\.state\.tx\.us)\/upload\/page\/6218\/(\d{4})\/(\d{1,2})-\d{1,2}-\d{2}\/[^"]+\.pdf)"/gi)) {
                const year = +m[2], mon = +m[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: m[1],
                    year,
                    month: mon,
                    name: `colorado_${year}-${String(mon).padStart(2, "0")}_${basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Uvalde County clerk (Wix site, uvaldecounty.gov -- NOT CivicLive):
    // /uvalde-county-public-foreclosure-notices mixes trustee-sale notices
    // with unrelated posts (burn bans, etc); each PDF anchor's visible text
    // is a clean, structured line -- "Notice of [Substitute] Trustee's Sale
    // - MM/DD/YY - posted MM/DD/YY @ h:mm am/pm / initials" -- so the sale
    // date is read straight off the link text, no OCR needed.
    uvalde_cc: {
        fips: "48463",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const html = await fetchText("https://www.uvaldecounty.gov/uvalde-county-public-foreclosure-notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(https:\/\/www\.uvaldecounty\.gov\/_files\/ugd\/[^"]+\.pdf)"[^>]*>([\s\S]{0,600}?)<\/a>/gi)) {
                if (seen.has(m[1])) continue;
                const text = m[2].replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
                if (!/trustee|foreclos/i.test(text)) continue;
                const dm = text.match(/-\s*(\d{1,2})\/(\d{1,2})\/(\d{2})\s*-\s*posted/i);
                if (!dm) continue;
                const mon = +dm[1], year = 2000 + +dm[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                seen.add(m[1]);
                out.push({
                    url: m[1],
                    year,
                    month: mon,
                    name: `uvalde_${year}-${String(mon).padStart(2, "0")}_${basename(m[1])}`,
                });
            }
            return out;
        },
    },

    // ------------------------------------------------------- SKIPPED ------
    // Camp (48063): /page/camp.NOTICEOFFORECLOSURESALEFILEDWITHCOUNTYCLERK
    // renders through a Telerik RadLightBox / ASP.NET WebForms doc viewer
    // (raw HTML is just __VIEWSTATE junk, no PDF hrefs) -- content is
    // client-rendered, no static discover() found. Skip (verified 2026-07-16).
    // Red River (48387): no dedicated foreclosure/trustee page in county nav
    // (checked Home, County Clerk, Public Notices -- the latter links one
    // unrelated employment PDF). Skip (verified 2026-07-16).
    // Delta (48119): deltacountytx.com sits behind a Cloudflare managed
    // challenge (cf-mitigated: challenge on every request, https and http) --
    // reCAPTCHA-equivalent bot wall. Skip (verified 2026-07-16).
    // Bee (48025): CivicPlus site (beecounty.gov); /167/County-Clerk has fee
    // schedules and self-help-resource docs only, sitemap.xml carries no
    // Archive/foreclosure page. No foreclosure notices online. Skip
    // (verified 2026-07-16).
    // Frio (48163): /page/co.public-notices-calendar is a client-rendered
    // events calendar (no PDF hrefs in the static HTML); no other
    // foreclosure-specific page linked from county-clerk nav or sitemap.
    // Skip (verified 2026-07-16).
    // Bandera (48019): custom "ez*"-templated CMS with a JS-built mega menu
    // -- static HTML exposes no clerk/foreclosure link, and every plausible
    // /page/ slug guess (co.county-clerk, CountyClerk, bandera.CountyClerk,
    // County.Clerk) 403s. No foreclosure page found within budget. Skip
    // (verified 2026-07-16).
    // Real (48385): homepage links ONE static PDF (newtools.cira.state.tx.us
    // /upload/page/0256/docs/Notice of Foreclosure.pdf) -- Last-Modified
    // Wed, 04 Jun 2025, over a year stale. Skip, stale (verified 2026-07-16).
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const chosen = want.length ? Object.fromEntries(want.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(chosen, { parseOnly });
