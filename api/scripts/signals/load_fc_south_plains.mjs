// County foreclosure notices -> parcel_signals: Texas South Plains / SE
// Panhandle batch (Deaf Smith, Parmer, Castro, Swisher, Briscoe, Hall,
// Childress, Bailey, Lamb, Hale, Floyd, Cottle, Donley, Collingsworth).
// Standalone sibling of load_pdf_foreclosures.mjs -- imports the shared
// discover/extract/parse/match/upsert machinery, defines only this batch's
// SOURCES. Do NOT edit the shared file from here (parallel wave in flight).
//
//   DATABASE_URL=... node scripts/signals/load_fc_south_plains.mjs [--parse-only] [source...]

import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // Deaf Smith County clerk (CivicLive, co.deaf-smith.tx.us): notices sit on
    // the CLERK page itself (/page/deafsmith.County.Clerk), per-notice PDFs
    // under /upload/page/8035/ mixed in with unrelated clerk docs (fee
    // schedules, commissioners agendas) -- filtered by "TRUSTEE" in the
    // filename. Anchor text carries the sale date+time WITH year ("JULY 07,
    // 2026 @ 11:00 AM").
    deafsmith_cc: {
        fips: "48117",
        discover: async () => {
            const base = "https://www.co.deaf-smith.tx.us";
            const html = await fetchText(base + "/page/deafsmith.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/8035\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*@/g)) {
                if (!/trustee/i.test(m[1])) continue;
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `deafsmith_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Parmer County (WordPress, parmercounty.texas.gov -- NOT the legacy
    // parmercounty.org site): "Notices of Foreclosure" page (?p=2179) is a
    // flat list of <p><a href="...pdf">Foreclosure M-D-YYYY</a></p> lines;
    // the anchor TEXT carries the sale date reliably even when the filename
    // doesn't (e.g. "NOTICE.pdf", "Image_004.pdf"). Good embedded text layer.
    parmer_cc: {
        fips: "48369",
        venue: /COURT\s*HOUSE|\b401\s+3RD\b/i, // 401 3rd St, Farwell
        discover: async () => {
            const html = await fetchText("https://parmercounty.texas.gov/?p=2179");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a href="([^"]+\.pdf)">Foreclosure\s+(\d{1,2})-(\d{1,2})-(\d{4})<\/a>/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: m[1],
                    year,
                    month: mon,
                    name: `parmer_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Castro County clerk (CivicLive, co.castro.tx.us): /page/
    // castro.ForeclosureNotices lists per-notice PDFs under /upload/page/1464/
    // (some nested in year subfolders); anchor text carries "Foreclosure
    // (Notice|Sale) <Month> <D>, <YYYY>" (day zero-padding drifts). A rare
    // undated entry ("NOTICE OF TRUSTEE'S SALE AND APPOINTMENT...") has no
    // date in the anchor -- skipped (nothing to bucket it by).
    castro_cc: {
        fips: "48069",
        // sale venue: Castro County Courthouse, 100 East Bedford Street,
        // Dimmitt (verified against actual notice text -- "Place of sale of
        // Property:" line geocodes to a real nearby parcel, so it slips past
        // GOV_OWNER; number-pinned since other Bedford addresses may be real)
        venue: /COURT\s*HOUSE|\b1[0O][0O]\s+E(?:AST)?\.?\s*BEDFORD\b/i,
        discover: async () => {
            const base = "https://www.co.castro.tx.us";
            const html = await fetchText(base + "/page/castro.ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/1464\/[^"]+\.pdf)"[^>]*>Foreclosure\s+(?:Notice|Sale)\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `castro_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Swisher County & District Clerk (custom Website.com/dmBuilder site,
    // swisherclerk.com -- NOT the CivicLive co.swisher.tx.us mirror, which
    // just links out here): /foreclosure-notices renders per-notice PDFs as
    // icon BUTTONS (no visible anchor text) hosted on a signed CDN
    // (cdn.website-editor.net, long-lived ?Expires= token); the sale date
    // lives in a plain-text heading immediately before each button ("NOTICE
    // OF SUBSTITUTE TRUSTEE'S SALE POSTED 6-11-2026 WITH A SALE DATE SET FOR
    // 9-1-2026" / "...WITH A SALE DATE OF 8/4/26" -- both "SET FOR" and "OF"
    // phrasing seen, dash and slash date separators both seen). DOM order is
    // button-THEN-caption (the icon-button widget is emitted before its text
    // heading in the raw HTML, despite reading visually the other way) --
    // scan sequentially, holding the most recent unconsumed link as
    // "pending" until the next heading claims it; a link with no following
    // heading (the non-foreclosure quick-links further down the page) is
    // left unclaimed and dropped.
    swisher_cc: {
        fips: "48437",
        venue: /COURT\s*HOUSE|\b119\s+S(?:OUTH)?\.?\s*MAXWELL\b/i,
        discover: async () => {
            const html = await fetchText("https://www.swisherclerk.com/foreclosure-notices");
            const re = /SALE\s+DATE\s+(?:SET\s+FOR|OF)\s+(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})|href="(https:\/\/cdn\.website-editor\.net\/[^"]+\.pdf\?[^"]*)"/gi;
            const out = [];
            let pending = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    if (pending) {
                        let year = +m[3];
                        if (year < 100) year += 2000;
                        const month = +m[1];
                        if (inWindow(year, month)) {
                            out.push({
                                url: pending,
                                year,
                                month,
                                name: `swisher_${year}-${String(month).padStart(2, "0")}_${path.basename(pending.split("?")[0]).replace(/[^\w.-]+/g, "_")}`,
                            });
                        }
                        pending = null;
                    }
                } else {
                    pending = m[4];
                }
            }
            return out;
        },
    },
    // Cottle County clerk (CivicLive, co.cottle.tx.us): notices sit on the
    // CLERK page itself (/page/cottle.County.Clerk), per-notice PDFs under
    // /upload/page/0603/ (some links point at the CivicLive origin
    // newtools.cira.state.tx.us -- same path serves from the county host);
    // anchor text carries "<Month> <D>, <YYYY> at <time>" (am/pm spacing +
    // capitalization drift, tolerated by the trailing "at").
    cottle_cc: {
        fips: "48101",
        discover: async () => {
            const base = "https://www.co.cottle.tx.us";
            const html = await fetchText(base + "/page/cottle.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(?:https?:\/\/newtools\.cira\.state\.tx\.us)?(\/upload\/page\/0603\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+at/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[4],
                    month: mon,
                    name: `cottle_${m[4]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Donley County clerk (CivicLive, co.donley.tx.us): /page/donley.
    // ForeclosureandSheriffSales is one shared list mixing trustee-sale,
    // foreclosure-sale, sheriff-sale (tax) and seizure notices under
    // /upload/page/8009/ -- Sheriff/Seizure entries are excluded (not private
    // mortgage foreclosures). The clerk's posting format drifted over the
    // years; only the two CURRENT (2025-26) shapes are matched: (a) numeric
    // "MM/DD/YYYY Notice of ..." INSIDE the anchor text, or (b) a bare
    // "Notice of [Substitute Trustee's/Foreclosure] Sale" anchor followed by
    // "Tuesday <Month> <D>[st/nd/rd/th], <Year>" trailing text. Older
    // (pre-2025) ALL-CAPS-heading and date-only-anchor formats aren't
    // matched, but those months are outside the discovery window anyway.
    donley_cc: {
        fips: "48129",
        discover: async () => {
            const base = "https://www.co.donley.tx.us";
            const html = await fetchText(base + "/page/donley.ForeclosureandSheriffSales");
            const HREF = '(?:https?:\\/\\/newtools\\.cira\\.state\\.tx\\.us)?(\\/upload\\/page\\/8009\\/[^"]+\\.pdf)';
            const out = [], seen = new Set();
            for (const m of html.matchAll(new RegExp(`<a href="${HREF}"[^>]*>\\s*(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})\\s+Notice of ([^<]+)<\\/a>`, "gi"))) {
                if (/sheriff|seizure/i.test(m[5])) continue;
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `donley_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            for (const m of html.matchAll(new RegExp(`<a href="${HREF}"[^>]*>\\s*Notice of ([^<]+)<\\/a>[^A-Za-z]{0,10}Tuesday\\s+([A-Za-z]+)\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})`, "gi"))) {
                if (/sheriff|seizure/i.test(m[2]) || seen.has(m[1])) continue;
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[5];
                if (!mon || !inWindow(year, mon)) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `donley_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Hale County (Revize CMS, halecounty.org -- SAME platform as Bell): the
    // foreclosures page sits at /county_offices/foreclosures_posted_in_hale_
    // county.php but the page ships a site-root <base href="https://www.
    // halecounty.org/" />, so its relative PDF hrefs resolve against the
    // ROOT, not /county_offices/ (a naive same-directory join 404s). Per-
    // notice PDFs are grouped under bare "<Month> <Year><br/>" headings, each
    // link carrying an upload timestamp query (?t=YYYYMMDDHHMMSSx -- the
    // POSTING date/time, not the sale date). Filtered to Trustee/Foreclosure
    // anchor text (drops unrelated quick-link PDFs mixed into the same
    // page). Sale month projected from the posting date via saleMonthAfter
    // (+21d statutory window), more precise than trusting the heading.
    hale_cc: {
        fips: "48189",
        // sale venue: Hale County Courthouse, 500 Broadway, Plainview
        // (verified against actual notice text -- "conducted at the Hale
        // County Courthouse, 500 Broadway" direct-matched a real nearby
        // parcel, so it slips past GOV_OWNER)
        venue: /COURT\s*HOUSE|\b5[0O][0O]\s+BROADWAY\b/i,
        discover: async () => {
            const base = "https://www.halecounty.org/"; // <base href> = site root
            const html = await fetchText(base + "county_offices/foreclosures_posted_in_hale_county.php");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href=\s*"([^"?]+\.pdf)\?t=(\d{4})(\d{2})(\d{2})(\d+)"\s+target="_blank"\s*>([^<]*)<\/a>/gi)) {
                if (!/trustee|foreclosure/i.test(m[6])) continue;
                const s = saleMonthAfter(+m[2], +m[3], +m[4]);
                if (!inWindow(s.year, s.month) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]) + `?t=${m[2]}${m[3]}${m[4]}${m[5]}`,
                    year: s.year,
                    month: s.month,
                    name: `hale_${m[2]}-${m[3]}-${m[4]}_${m[1].replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Lamb County clerk (CivicLive, co.lamb.tx.us): the real page is /page/
    // lamb.Forclosurenotices (note the clerk's own misspelling -- the
    // "lamb.foreclosures" alias just links out to it). A nested Year->Month
    // ASP.NET accordion (ezToggle) lists per-notice PDFs under /upload/page/
    // 5033/docs/ as bare case numbers ("#7102") -- NO sale date anywhere, only
    // the posting month via the accordion it's filed under. Sale month
    // projected from that posting month (day assumed = 1st, the earliest/
    // most-inclusive read) via saleMonthAfter.
    lamb_cc: {
        fips: "48279",
        venue: /COURT\s*HOUSE|\b100\s+6TH\s+DR/i, // 100 6th Dr, Littlefield (clerk's office)
        discover: async () => {
            const base = "https://www.co.lamb.tx.us";
            const html = await fetchText(base + "/page/lamb.Forclosurenotices");
            const re = /lblTitle_\d+">([A-Za-z0-9]+)</g;
            const hrefRe = /href="(\/upload\/page\/5033\/[^"]+\.pdf)"/g;
            // walk both matches in document order together
            const tokens = [];
            let m;
            while ((m = re.exec(html))) tokens.push({ i: m.index, kind: "label", val: m[1] });
            while ((m = hrefRe.exec(html))) tokens.push({ i: m.index, kind: "href", val: m[1] });
            tokens.sort((a, b) => a.i - b.i);
            const out = [], seen = new Set();
            let year = null, month = null;
            for (const t of tokens) {
                if (t.kind === "label") {
                    if (/^\d{4}$/.test(t.val)) {
                        year = +t.val;
                    } else {
                        const mon = MONTHS.indexOf(t.val.slice(0, 3).toUpperCase()) + 1;
                        if (mon) month = mon;
                    }
                } else if (year && month && !seen.has(t.val)) {
                    const s = saleMonthAfter(year, month, 1);
                    if (inWindow(s.year, s.month)) {
                        seen.add(t.val);
                        out.push({
                            url: base + encodeURI(t.val),
                            year: s.year,
                            month: s.month,
                            name: `lamb_${year}-${String(month).padStart(2, "0")}_${path.basename(t.val).replace(/[^\w.-]+/g, "_")}`,
                        });
                    }
                }
            }
            return out;
        },
    },

    // --- SKIP-LOG (verified 2026-07-16, "don't fight the fortress") ---
    // Briscoe County: NOT here -- co.briscoe.tx.us has County Clerk + District
    // Clerk pages but no foreclosure/trustee-sale link anywhere in the nav;
    // WebSearch turns up no dedicated page either. Tiny county (~1,500 pop),
    // courthouse-posting-only. Skip.
    // Hall County: NOT here -- co.hall.tx.us's "Public Notices" and "District
    // County Clerk" pages carry commissioners-court/tax/budget notices only;
    // no "foreclosure" text anywhere in either page's HTML despite a stray
    // AI-summary claim of a "Foreclosure Notices" menu (false positive --
    // grepped the raw HTML directly, zero hits). No foreclosure page found.
    // Skip.
    // Childress County: NOT here -- co.childress.tx.us fails to resolve
    // (DNS SERVFAIL, confirmed via curl + nslookup from two different
    // resolvers) as of 2026-07-16. Site appears to be down, not just
    // content-less. Skip (worth a re-check once the domain is back up).
    // Bailey County: NOT here -- co.bailey.tx.us's County Clerk page and
    // Public Notices Calendar carry no foreclosure content or link; no
    // dedicated foreclosure page exists in the site nav. Skip.
    // Floyd County: NOT here -- co.floyd.tx.us's nav has no foreclosure page
    // (only a generic "Public Notices Calendar", itself foreclosure-free);
    // WebSearch found only the county-clerk contact page, no notice listing.
    // Skip.
    // Collingsworth County: NOT here -- co.collingsworth.tx.us's County Clerk
    // page states "Foreclosures - None at this time as of 06/09/2021" --
    // stale placeholder text, five years old, no posting mechanism since.
    // Skip.
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const names = args.filter((a) => !a.startsWith("--"));
const sources = names.length ? Object.fromEntries(names.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(sources, { parseOnly });
