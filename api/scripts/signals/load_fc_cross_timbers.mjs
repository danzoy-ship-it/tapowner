// Cross Timbers / near-north TX foreclosure-notice loader -> parcel_signals.
// Sibling of load_pdf_foreclosures.mjs (shared DB/join/upsert machinery lives
// there; this file only supplies discover() for its own county cluster). See
// that file's header comment for the full pipeline explanation.
//
//   DATABASE_URL=... node scripts/signals/load_fc_cross_timbers.mjs [--parse-only]
//
// Counties covered (Montague 48337, Clay 48077, Archer 48009, Young 48503,
// Stephens 48429, Eastland 48133, Shackelford 48417, Throckmorton 48447).
// SKIPPED (verified 2026-07-16, not a SOURCES entry, no code to patch):
//   - Clay (48077): every fetch path (curl/schannel, node fetch, PowerShell
//     Invoke-WebRequest, the WebFetch tool) gets the connection reset before
//     the TLS handshake completes against www.co.clay.tx.us on both :443 and
//     :80 -- a network/TLS-level block on this machine's egress IP, not a
//     code bug (matches the documented "datacenter IP gets TLS-blocked"
//     failure mode). Needs a clean-IP retry (residential/cellular), not a
//     parser fix. NB confirmed real domain is www.co.clay.tx.us (not a
//     claycountytx.org/claycountytexas.org lookalike -- both of those don't
//     resolve at all).
//   - Throckmorton (48447): real domain is throckmortoncounty.org (loads
//     fine). Checked county-clerk, district-clerk, and public-notices pages
//     -- zero foreclosure/trustee mentions anywhere in the rendered HTML. A
//     search snippet confirms sales happen "on the steps ... of the County
//     Courthouse" with notices "viewed at throckmortoncounty.org", but no
//     page on the live site actually lists/links any. No online posting to
//     scrape today; re-check later.
import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

const base = (u) => path.basename(decodeURIComponent(u)).replace(/[^\w.-]+/g, "_");

const SOURCES = {
    // Montague County clerk (easydocs.us -- Integrated Data Services, same
    // vendor/app as Upshur/Navarro/Bosque): /easydocs/foreclosure/ on a BARE
    // IP (no TLS). view.asp?year=<Y> lists showdoc.asp?docName=<YYYY-MM-DD>-
    // foreclosure-<NNN>[-hhmmAM/PM].pdf. Verified (2026 list): dates are
    // spread through the month (02-05, 02-19, 02-26, 03-13...), i.e. the
    // POSTING date like Navarro, NOT first-Tuesday sale dates -> saleMonthAfter.
    // Raw PDF at LinkedDir/<year>/<docName>.
    montague_cc: {
        fips: "48337",
        // sale venue: Montague County Courthouse, 101 E Franklin St, Montague
        venue: /COURT\s*HOUSE|\b10[1Il]\s+E(?:AST)?\.?\s*FRANKLIN\b/i,
        discover: async () => {
            const b = "http://173.185.183.206/easydocs/foreclosure/";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)) - 1; d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${b}view.asp?year=${y}`);
                } catch (e) {
                    console.error(`  montague ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/docName=((\d{4})-(\d{2})-(\d{2})-foreclosures?-[^"'&<> ]*\.pdf)/gi)) {
                    const s = saleMonthAfter(+m[2], +m[3], +m[4]);
                    if (!inWindow(s.year, s.month)) continue;
                    out.push({ url: `${b}LinkedDir/${m[2]}/${m[1]}`, year: s.year, month: s.month, name: `montague_${m[1]}` });
                }
            }
            return out;
        },
    },
    // Archer County clerk (CivicLive, co.archer.tx.us): the
    // /page/archer.Foreclosure.Trustee.Notice page is a plain static content
    // page (NOT a Telerik-driven listing despite the WebForms chrome) --
    // per-year sections of hand-typed links under /upload/page/1344/<year>
    // foreclosure/<file>.pdf, anchor text carrying "<Month> <Day>[st/nd/rd/th]"
    // right next to each href (year comes from the URL folder, not the text).
    archer_cc: {
        fips: "48009",
        // sale venue: Archer County Courthouse, 100 S Center St, Archer City
        venue: /COURT\s*HOUSE|\b10[0O]\s+S(?:OUTH)?\.?\s*CENTER\b/i,
        discover: async () => {
            const b = "https://www.co.archer.tx.us";
            const html = await fetchText(b + "/page/archer.Foreclosure.Trustee.Notice");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/1344\/(\d{4})\s+foreclosure\/[^"]+\.pdf)"\s+target="_blank">\s*([A-Za-z]+)\.?\s+(\d{1,2})/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[2];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({ url: b + encodeURI(m[1]), year, month: mon, name: `archer_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
            }
            return out;
        },
    },
    // Young County clerk (CivicLive, co.young.tx.us): no dedicated
    // foreclosures page -- notices are posted ad hoc directly on
    // /page/young.County.Clerk under a "Notices of Property Sales and
    // Foreclosures" heading, /upload/page/2070/... with the sale date spelled
    // out IN the filename ("Notice of Foreclosure set for April 7th
    // 2026.pdf"). Low volume, rural; verified 2026-07-16 the only two posted
    // notices are for April 2026 (stale, outside the discovery window today
    // -- pattern is still correct and will pick up future postings).
    young_cc: {
        fips: "48503",
        // sale venue: Young County Courthouse, 516 4th St, Graham
        venue: /COURT\s*HOUSE|\b516\s+4TH\b/i,
        discover: async () => {
            const b = "https://www.co.young.tx.us";
            const html = await fetchText(b + "/page/young.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/2070\/[^"]*(?:[Ff]oreclosure|[Nn]otice\s+of\s+[Ss]ale)[^"]*\.pdf)"/g)) {
                const dm = decodeURIComponent(m[1]).match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4})/);
                if (!dm || seen.has(m[1])) continue;
                const mon = MONTHS.indexOf(dm[1].slice(0, 3).toUpperCase()) + 1;
                const year = +dm[3];
                if (!mon || !inWindow(year, mon)) continue;
                seen.add(m[1]);
                out.push({ url: b + encodeURI(m[1]), year, month: mon, name: `young_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
            }
            return out;
        },
    },
    // Stephens County clerk (CivicLive, co.stephens.tx.us):
    // /page/stephens.ForeclosureNotices lists CURRENT notices as root-level
    // files under /upload/page/2596/<name>.pdf with the sale date spelled out
    // at the END of the filename ("JULY 7 2026.pdf", "FORECLOSURE SALE AUGUST
    // 4 2026.pdf"); older notices live under /2596/<year>/... subfolders with
    // no date in the filename at all (can't bucket those -- root-level only,
    // which is exactly the live/upcoming set discovery needs).
    stephens_cc: {
        fips: "48429",
        // sale venue: Stephens County Courthouse, 200 W Walker, Breckenridge
        venue: /COURT\s*HOUSE|\b200\s+W(?:EST)?\.?\s*WALKER\b/i,
        discover: async () => {
            const b = "https://www.co.stephens.tx.us";
            const html = await fetchText(b + "/page/stephens.ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/2596\/[^\/"]*?([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[4];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({ url: b + encodeURI(m[1]), year, month: mon, name: `stephens_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
            }
            return out;
        },
    },
    // Eastland County clerk (CivicLive, eastlandcountytexas.com): per-year
    // pages /page/eastland.Foreclosures<YYYY> render an accordion, ONE panel
    // per calendar month ("January".."December"), each holding that month's
    // /upload/page/<id>/<party name>.pdf links (party-name filenames, NO date
    // anywhere in the URL -- the month comes only from the accordion panel
    // it's nested under). Sequential heading->links scan like Hill/Eastland's
    // own sibling counties in the main loader; folder id changes per year
    // (12576 for 2026, 12200 for 2025) so the regex doesn't pin it.
    eastland_cc: {
        fips: "48133",
        // sale venue: Eastland County Courthouse, 100 W Main St, Eastland
        venue: /COURT\s*HOUSE|\b10[0O]\s+W(?:EST)?\.?\s*MAIN\b/i,
        discover: async () => {
            const b = "https://www.eastlandcountytexas.com";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [], seen = new Set();
            for (const year of years) {
                let html;
                try {
                    html = await fetchText(`${b}/page/eastland.Foreclosures${year}`);
                } catch (e) {
                    console.error(`  eastland ${year}: page fetch failed (${e.message})`);
                    continue;
                }
                const re = /lblTitle[^>]*>\s*([A-Za-z]+)\s*<|href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/\d+\/[^"]+\.pdf)"/gi;
                let cur = null, m;
                while ((m = re.exec(html))) {
                    if (m[1]) {
                        const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                        if (mon) cur = mon;
                    } else if (cur && inWindow(year, cur) && !seen.has(m[2])) {
                        seen.add(m[2]);
                        // some links are pre-percent-encoded (the cira.state.tx.us
                        // mirror), others carry literal spaces -- normalize via a
                        // decode/re-encode round trip so neither path double-encodes
                        out.push({ url: b + encodeURI(decodeURI(m[2])), year, month: cur, name: `eastland_${year}-${String(cur).padStart(2, "0")}_${base(m[2])}` });
                    }
                }
            }
            return out;
        },
    },
    // Shackelford County clerk (CivicLive, shackelfordcounty.org):
    // /page/shackelford.Foreclosure is a flat list of links whose ANCHOR TEXT
    // (not the filename -- those are chaotic: "Untitled.PDF", GUID-named,
    // party-name) carries "Notice of Trustee's Sale MM/DD/YYYY" (current) or
    // MM-DD-YYYY (archived), reliably, for every entry. NB: this is a
    // DIFFERENT source/signal than the "new print-report parser" that solved
    // Shackelford's records-request queue item (that was property-record
    // data, not foreclosure notices) -- this page wasn't loaded before.
    shackelford_cc: {
        fips: "48417",
        // sale venue: Shackelford County Courthouse, 225 S Main St, Albany
        venue: /COURT\s*HOUSE|\b225\s+S(?:OUTH)?\.?\s*MAIN\b/i,
        discover: async () => {
            const b = "https://www.shackelfordcounty.org";
            const html = await fetchText(b + "/page/shackelford.Foreclosure");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/8568\/[^"]+\.[Pp][Dd][Ff])"[^>]*>\s*Notice\s+of\s+(?:Substitute\s+)?Trustee'?s?\s+Sale\s+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({ url: b + encodeURI(m[1]), year, month: mon, name: `shackelford_${year}-${String(mon).padStart(2, "0")}_${base(m[1])}` });
            }
            return out;
        },
    },
    // Clay County (48077): SKIPPED -- see file header. No SOURCES entry.
    // Throckmorton County (48447): SKIPPED -- see file header. No SOURCES entry.
};

await runSources(SOURCES, { parseOnly: process.argv.includes("--parse-only") });
