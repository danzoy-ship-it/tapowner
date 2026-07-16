// Permian Basin / West TX county foreclosure-notice loader. Sibling of
// load_pdf_foreclosures.mjs (do NOT edit that file -- import its shared
// discover/extract/parse/match/upsert machinery instead; this file only
// defines the SOURCES for this region and calls runSources()).
//
//   DATABASE_URL=... node scripts/signals/load_fc_permian.mjs [--parse-only] [source...]

import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // ---- Permian Basin wave (2026-07-16) ------------------------------------

    // Gaines County clerk (CivicLive, co.gaines.tx.us): /page/
    // gaines.foreclosuresandsales lists per-notice scanned PDFs under
    // /upload/page/5520/docs/Foreclosures/<MONTH> <YEAR>/<n>.pdf (month token
    // full-name or 3-4 letter abbrev; the folder separator is sometimes a
    // literal space, sometimes %20). Anchor text is just the doc number
    // ("#19") -- sale month comes from the FOLDER name, which the site has
    // kept current back to 2014 (318 total PDFs on the page; inWindow trims
    // to the live few). decodeURIComponent+encodeURI normalizes either
    // encoding of the folder separator.
    gaines_cc: {
        fips: "48165",
        discover: async () => {
            const base = "https://www.co.gaines.tx.us";
            const html = await fetchText(base + "/page/gaines.foreclosuresandsales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/5520\/docs\/Foreclosures\/([A-Za-z]+)(?:%20|\s)(\d{4})\/[^"]+\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[3];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                const clean = decodeURIComponent(m[1]);
                out.push({
                    url: base + encodeURI(clean),
                    year,
                    month: mon,
                    name: `gaines_${year}-${String(mon).padStart(2, "0")}_${path.basename(clean).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },

    // Pecos County clerk (WordPress, co.pecos.tx.us): /foreclosure-notices/
    // links per-notice scanned PDFs directly at wp-content/uploads/<upload
    // Y>/<upload M>/Trustee-Sale-<slugYYYYMMDD>-<n>.pdf. VERIFIED BY OCR
    // (pdf_ocr_text.py on 2 live PDFs, 2026-07-16) that the slug date is
    // consistently ONE YEAR AHEAD of the true sale date printed in the notice
    // body: "Trustee-Sale-20270707-2.pdf" -> notice text reads "Tuesday, July
    // 7, 2026"; "Trustee-Sale-20270804-2.pdf" -> "Tuesday, August 4, 2026".
    // Correct by subtracting 1 from the slug year before the inWindow gate
    // (uncorrected, every current notice reads as ~1yr in the future and gets
    // dropped). No stated sale-venue address in the boilerplate (just "area
    // designated by the Commissioner's Court") -- no venue regex needed.
    pecos_cc: {
        fips: "48371",
        discover: async () => {
            const base = "https://www.co.pecos.tx.us";
            const html = await fetchText(base + "/foreclosure-notices/");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(https:\/\/www\.co\.pecos\.tx\.us\/wp-content\/uploads\/\d{4}\/\d{2}\/(Trustee-Sale-(\d{4})(\d{2})(\d{2})-(\d+)\.pdf))"/gi)) {
                const year = +m[3] - 1; // slug year is off-by-one-ahead (verified)
                const mon = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: m[1],
                    year,
                    month: mon,
                    name: `pecos_${year}-${String(mon).padStart(2, "0")}_${m[6]}.pdf`,
                });
            }
            return out;
        },
    },

    // Reagan County clerk (CivicLive, co.reagan.tx.us): /page/
    // reagan.County.District.Clerk lists trustee-sale PDFs under
    // /upload/page/9275/... alongside a much larger set of unrelated monthly
    // "appointment and fees" reports whose anchor text is a bare month name
    // (no slashes) -- the M/D/YYYY " @ " time suffix on the trustee-sale
    // anchors is what disambiguates them, so the regex requires it.
    reagan_cc: {
        fips: "48383",
        discover: async () => {
            const base = "https://www.co.reagan.tx.us";
            const html = await fetchText(base + "/page/reagan.County.District.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a href="(\/upload\/page\/9275\/[^"]+\.pdf)"[^>]*>\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*@/gi)) {
                const mon = +m[2];
                const year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                const clean = decodeURIComponent(m[1]);
                out.push({
                    url: base + encodeURI(clean),
                    year,
                    month: mon,
                    name: `reagan_${year}-${String(mon).padStart(2, "0")}_${path.basename(clean).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },

    // Crane County clerk (CivicLive, co.crane.tx.us): /page/
    // crane.County.Clerk lists per-notice PDFs under /upload/page/0569/
    // <YYYY> Foreclosures/[<Month Day>/]<name>.pdf, anchor text "<Month> <Day>,
    // <Year>". A couple of filenames repeat with one empty-text thumbnail
    // anchor and one dated anchor (e.g. Martinez.pdf) -- the empty one simply
    // fails the date regex and is skipped; `seen` guards true dupes.
    crane_cc: {
        fips: "48103",
        discover: async () => {
            const base = "https://www.co.crane.tx.us";
            const html = await fetchText(base + "/page/crane.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a href="(\/upload\/page\/0569\/[^"]*Foreclosures[^"]*\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*<\/a>/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[4];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                const clean = decodeURIComponent(m[1]);
                out.push({
                    url: base + encodeURI(clean),
                    year,
                    month: mon,
                    name: `crane_${year}-${String(mon).padStart(2, "0")}_${path.basename(clean).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },

    // Ward County clerk (CivicLive, co.ward.tx.us): /page/ward.Postings mixes
    // foreclosure notices in with unrelated public postings under
    // /upload/page/7249/...; every trustee/foreclosure-sale anchor's own text
    // carries "Foreclosure[&nbsp;] Sale: MM-DD-YYYY" or "MM.DD.YYYY" (mixed
    // separators) -- extracted from the raw (untrimmed) anchor inner HTML
    // since none of the matching anchors nest further tags. Older 2022
    // trustee-sale entries on the same page have NO date in their anchor text
    // (stale, pre-dates the site's date-labeling convention) and are dropped
    // by the same regex requirement.
    ward_cc: {
        fips: "48475",
        discover: async () => {
            const base = "https://www.co.ward.tx.us";
            const html = await fetchText(base + "/page/ward.Postings");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a href="(\/upload\/page\/7249\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                const d = m[2].match(/(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})/);
                if (!d) continue;
                const mon = +d[1], year = +d[3];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                const clean = decodeURIComponent(m[1]);
                out.push({
                    url: base + encodeURI(clean),
                    year,
                    month: mon,
                    name: `ward_${year}-${String(mon).padStart(2, "0")}_${path.basename(clean).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },

    // ---- skip-logged (verified 2026-07-16) ----------------------------------
    // Martin County (48317): NOT here -- co.martin.tx.us (CivicPlus) has a
    // real "Martin County Foreclosure Notices" DocumentCenter folder
    // (/DocumentCenter/Index/46, linked from /152/County-District-Clerk), but
    // it's the newer REACT DocumentCenter whose folder-list API refuses a
    // headless replay (same wall as Parker County in load_pdf_foreclosures.mjs
    // -- SSL/connection failures on every JSON-endpoint guess tried). No
    // static HTML fallback found. Needs a pinned snapshot like Parker's, or a
    // live-page capture; out of scope for this pass.
    // Borden County (48033): NOT here -- co.borden.tx.us/page/County.Clerk has
    // a "Foreclosure Sale Notices" section, but it holds exactly ONE entry
    // ever posted ("January 5, 2021 Sale") -- stale, no notice system in
    // active use.
    // Glasscock County (48173): NOT here -- co.glasscock.tx.us/page/
    // glasscock.foreclosures lists exactly ONE PDF ("February 6, 2024") --
    // stale, nothing posted since.
    // Upton County (48461): NOT here -- co.upton.tx.us/page/upton.County.Clerk
    // has a large but UNDATED archive of trustee/foreclosure-sale PDFs
    // (generic names like "sale.pdf", "trustee sale#4.pdf"); the only dated
    // entries found are from 2019 and one from March 2024 -- nothing to
    // reliably bucket by current sale month (same "no date signal" skip as
    // Newton County in load_pdf_foreclosures.mjs). Note: uptonco.org is a
    // DEAD/parked domain (title "Google") -- the real site is co.upton.tx.us.
    // Winkler County (48495): NOT here -- co.winkler.tx.us/193/County-Clerk
    // links a handful of "Notice of Trustee Sale" / "Notice of Foreclosure
    // Sale" PDFs, but every one is dated September 2023 -- stale, ~3 years
    // with nothing posted since.
    // Loving County (48301): NOT here -- co.loving.tx.us (pop. ~64, smallest
    // county in Texas) has no foreclosure/trustee-sale page or postings
    // anywhere in its County Clerk / Public Notices / Tax Notice pages. No
    // notice system online. (lovingcountytx.com is a separate live mirror,
    // not checked further once co.loving.tx.us confirmed no content.)
    // Reeves County (48389): NOT here -- reevescounty.org's own foreclosure
    // search page IS reeves.tx.publicsearch.us (Kofile/GovOS PublicSearch),
    // the separate parked-platform crack per the skip rule, not a PDF feed.
    // Crockett County (48105): NOT here -- co.crockett.tx.us/page/
    // crockett.CountyClerk lists many per-notice PDFs under /upload/page/9743/
    // but the newest dated file is from October 2024 (~21 months stale as of
    // 2026-07-16) with nothing posted since -- no active notice system.
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const names = want.length ? want : Object.keys(SOURCES);
const picked = Object.fromEntries(names.filter((n) => SOURCES[n]).map((n) => [n, SOURCES[n]]));
await runSources(picked, { parseOnly });
