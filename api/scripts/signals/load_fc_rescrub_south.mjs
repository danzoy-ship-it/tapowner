// South TX / Coastal Bend / SE re-scrub loader (2026-07-16 bounded pass).
// Sibling of load_pdf_foreclosures.mjs (imports its shared discover->parse->
// match->upsert machinery; does NOT edit that file). Scope: Aransas, Bee,
// Brooks, Brazoria, Calhoun, Chambers, Dimmit, Frio, Galveston, Jim Wells,
// Karnes, La Salle, Matagorda, McMullen, Refugio, Zapata, Zavala, Burleson,
// Montgomery, Tarrant -- 20 counties with NO foreclosure signal in
// parcel_signals as of this pass, re-checked now that Tesseract OCR is
// installed (image-only PDFs read) and to catch wrong-page misses.
//
//   DATABASE_URL=... node scripts/signals/load_fc_rescrub_south.mjs [--parse-only] [source...]
//
// ---------------------------------------------------------------- RESULT --
// Only 2 of the 20 counties had a genuinely loadable, previously-unconfigured
// source: Chambers (React DocumentCenter, pinned) and Galveston (Vision
// Internet CMS, WAF-blocked to curl but NOT to Node's fetch()). The other 18
// are either already configured elsewhere (re-run, still 0 -- parser-format
// gap, not OCR) or genuinely have no online notice posting. See the bottom
// comment block for the full per-county disposition.

import { runSources, fetchText, inWindow, saleMonthAfter, UA } from "./load_pdf_foreclosures.mjs";

const SOURCES = {
    // Galveston County clerk (Vision Internet CMS, galvestoncountytx.gov):
    // /our-county/county-clerk/foreclosure-information/property-foreclosures
    // has 12 static month-name folders (Jan..Dec, ids below -- NOT
    // sequential: Jan=302, Nov=303 were re-added later, rest 63-72). Each
    // folder lists ALL notices whose SALE falls in that calendar month
    // ACROSS MULTIPLE YEARS (Oct's folder had more entries than July's on a
    // July run -- confirmed backlog, not a rolling single-year bucket) --
    // so folder name alone can't be trusted for {year,month}. Fix: the doc
    // URL is /home/showpublisheddocument/<id>/<versionStamp>, and
    // <versionStamp> is a raw .NET DateTime.Ticks value (100ns since
    // 0001-01-01) that decodes to the file's real upload/posting date
    // (verified: one doc's ticks decoded to 2026-06-10, a "Notice of
    // Substitute Trustee's Sale" posted for a July 7, 2026 sale -- textbook
    // ~4-week lead). So each doc is dated by its OWN ticks -> routed through
    // saleMonthAfter (posting date -> next first-Tuesday sale), same
    // pattern as Navarro/Brooks/Willacy, which naturally drops stale-year
    // backlog via inWindow.
    // IMPORTANT: curl/plain fetch gets a WAF 403 on this host (confirmed
    // both the folder-listing page AND the document endpoint); Node's
    // built-in fetch() (what fetchText/fetchPdf use) PASSES with a 200 on
    // both -- verified live 2026-07-16. Do not "fix" this into a browser
    // scraper; it already works via the shared fetchText/fetchPdf.
    // Notices carry a full street address right in the link text ("July -
    // 1024 Shady Oaks Ln Dickinson, TX 77539") AND inside the PDF ("More
    // commonly known as ...") -- clean text layer, no OCR needed. Biggest
    // find of this pass by volume (dozens of notices/month).
    galveston_cc: {
        fips: "48167",
        venue: /COURT\s*HOUSE|JUSTICE\s*CENTER/i,
        discover: async () => {
            const base = "https://www.galvestoncountytx.gov";
            const folders = [302, 63, 64, 65, 66, 67, 68, 69, 70, 71, 303, 72]; // Jan..Dec
            const EPOCH_TICKS = 621355968000000000n; // .NET ticks at 1970-01-01
            const out = [], seen = new Set();
            for (const f of folders) {
                let html;
                try {
                    html = await fetchText(
                        `${base}/our-county/county-clerk/foreclosure-information/property-foreclosures/-folder-${f}`
                    );
                } catch {
                    continue; // one bad folder id shouldn't kill the whole discover
                }
                for (const m of html.matchAll(
                    /href="(\/home\/showpublisheddocument\/(\d+)\/(\d+))"[^>]*>([^<]*)/gi
                )) {
                    const [, href, docId, ticksStr, labelRaw] = m;
                    if (seen.has(docId)) continue;
                    seen.add(docId);
                    let ticks;
                    try {
                        ticks = BigInt(ticksStr);
                    } catch {
                        continue;
                    }
                    const ms = Number((ticks - EPOCH_TICKS) / 10000n);
                    const posted = new Date(ms);
                    if (isNaN(posted.getTime()) || posted.getUTCFullYear() < 2020) continue;
                    const s = saleMonthAfter(posted.getUTCFullYear(), posted.getUTCMonth() + 1, posted.getUTCDate());
                    if (!inWindow(s.year, s.month)) continue;
                    const label = labelRaw.trim().replace(/[^\w.-]+/g, "_").slice(0, 80);
                    out.push({
                        url: base + href,
                        year: s.year,
                        month: s.month,
                        name: `galveston_${docId}_${label}.pdf`,
                    });
                }
            }
            return out;
        },
    },
    // Chambers County clerk (CivicPlus REACT DocumentCenter, same antiforgery
    // wall as Parker/Somervell -- POST /Admin/DocumentCenter/Home/
    // Document_AjaxBinding returns the admin login page to curl/Node fetch,
    // confirmed 2026-07-16). Found via chamberscountytx.gov's sitemap.xml ->
    // /244/County-Clerk -> "Foreclosures" nav item -> /DocumentCenter/Index/157.
    // Real, CURRENT, clean-text-layer "Notice of [Substitute] Trustee's Sale"
    // / "Notice of Acceleration and Notice of Trustee's Sale" PDFs with real
    // street addresses (verified 2 of them: "126 Comal Drive, Baytown" and
    // "9626 Pinehurst Street, Baytown"). Same Parker-style fix: PINNED list
    // harvested from a live browser session on 2026-07-16 (the folder's full
    // 24-doc listing at that time) since the AjaxBinding API can't be
    // replayed headless. NEEDS A MONTHLY REFRESH (re-open DocumentCenter/
    // Index/157 in a real browser, re-harvest the <a href="/DocumentCenter/
    // View/..."> list) -- same maintenance burden as parker_cc.
    chambers_cc: {
        fips: "48071",
        venue: /COURT\s*HOUSE|JUSTICE\s*CENTER/i,
        discover: async () => {
            const base = "https://www.chamberscountytx.gov";
            // {docId, slug, title, sale "Mon D, YYYY"} pinned 2026-07-16 from
            // /DocumentCenter/Index/157 (24 of 24 rows shown, no pagination).
            const PINNED = [
                [6828, "May-5-2026---L-40-B-4-RIVER-FARMS-S-1-FINAL-PLAT-PDF", "May 5, 2026"],
                [6908, "June-2-2026---FC-L-56-B-10-W-D-WILLCOX-ADDN-PDF", "June 2, 2026"],
                [6911, "May-5-2026---L-5-B-1-CYPRESS-POINT-S-3-PDF", "May 5, 2026"],
                [6912, "June-2-2026---FC--L-3-B-2-MAGNOLIA-LANDING-SUBD-S-1-FINAL-PLAT-PDF", "June 2, 2026"],
                [7119, "August-4-2026---L-4-B-2-DEVINWOOD-SUBD-PHASE-1-PDF", "August 4, 2026"],
                [7140, "August-8-2026---PN-L-12-B-3-BARROW-RANCH-S-4-PDF", "August 8, 2026"],
                [7142, "August-4-2026---FC-L-80-B-1-LYNNWOOD-S-3-PDF", "August 4, 2026"],
                [7143, "August-8-2026---FC-L-26-B-2-LYNNWOOD-S-1-AMENDING-PLAT-PDF", "August 8, 2026"],
                [7156, "August-4-2026---L-323-PINEHURST-SUBD-PDF", "August 4, 2026"],
                [7241, "September-1-2026---L-5-B-4-LAKES-OF-CHAMPIONS-ESTATES-S-3-PDF", "September 1, 2026"],
                [7259, "September-1-2026---L-18-B-2-LEGENDS-BAY-SUBD-S-7-FINAL-PLAT-PDF", "September 1, 2026"],
                [7260, "September-1-2026---L-7-B-6-JOSEPHS-COVE-S-3-PDF", "September 1, 2026"],
                [7274, "September-1-2026---L-32-B-1-CHAMPIONS-FOREST-PDF", "September 1, 2026"],
                [7275, "September-1-2026---L-31-B-3-LEGENDS-BAY-S-2-FINAL-PLAT-PDF", "September 1, 2026"],
                [7276, "August-4-2026---L-3-B-3-COVE-AT-COTTON-CREEK-AMENDED-PLAT-PDF", "August 4, 2026"],
                [7277, "Agusut-4-2026---L-25-B-4-SOUTHWINDS-S-2-FINAL-PLAT-PDF", "August 4, 2026"],
                [7325, "August-4-2026---L-13-COUNTRY-MEADOWS-S-4-PDF", "August 4, 2026"],
                [7336, "September-1-2026---L-8-B-7-LEGENDS-BAY-2-FINAL-PLAT-PDF", "September 1, 2026"],
                [7337, "August-4-2026---L-4-B-1-RESERVE-OF-CHAMPIONS-ESTATES-S-2-PDF", "August 4, 2026"],
                [7338, "September-1-2026---L-16-B-1-LEGENDS-BAY-SUBD-S-7-FINAL-PLAT-PDF", "September 1, 2026"],
                [7340, "August-4-2026--L-12-B-3-BARROW-RANCH-S-4-PDF", "August 4, 2026"],
                [7341, "August-4-2026---FC-L-9-B-3-RIVER-FARMS-S-3-FINAL-PLAT-pdf", "August 4, 2026"],
                [7343, "October-6-2026---L-14-B-1-SOUTHWINDS-S-5-PDF", "October 6, 2026"],
                [7344, "August-4-2026---FC-L-1-TRIPLE-S-SUBD-MINOR-PLAT-PDF", "August 4, 2026"],
            ];
            const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const out = [];
            for (const [id, slug, dateStr] of PINNED) {
                const dm = dateStr.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
                if (!dm) continue;
                const mon = MON.indexOf(dm[1].slice(0, 3)) + 1;
                const year = +dm[3];
                if (!mon || !inWindow(year, mon)) continue;
                out.push({
                    url: `${base}/DocumentCenter/View/${id}/${slug}`,
                    year,
                    month: mon,
                    name: `chambers_${year}-${String(mon).padStart(2, "0")}_${id}.pdf`,
                });
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

// ------------------------------------------------------- SKIP-LOG (2026-07-16) --
// Full disposition of all 20 counties in this pass's scope. "Already
// skip-logged" = a same-day sibling loader already investigated it with a
// specific, verified reason -- re-checked here for wrong-page misses per the
// "never conclude absence cheaply" doctrine but found no reason to overturn.
//
// LOADABLE (added above): Galveston 48167, Chambers 48071.
//
// ALREADY CONFIGURED ELSEWHERE, RE-RUN TODAY (Tesseract now installed) --
// discovery + OCR work, but 0 rescued: current-window packets are
// non-standard-format legal-description-only notices (Tract refs / missing
// Lot numbers from OCR noise) that the SHARED cue/legal parser in
// load_pdf_foreclosures.mjs doesn't catch. This is a parser-format gap, not
// an OCR failure -- OCR text is now legible (spot-checked). NOT fixed here
// (shared file, other agents editing in parallel per the campaign rules).
//   Brooks 48047 (brooks_cc, load_pdf_foreclosures.mjs): 4 packets in
//     window, 0 notices -- both are "Legal description: Tract One (1) of
//     the Whelihan Estates..." (no Lot/Block, no street address at all).
//   Karnes 48255 (karnes_cc, load_fc_ne_southcentral.mjs): 3 packets, 0
//     notices -- 2 are Lot/Block-only (no street address); the 3rd
//     ("2470 S US 181, Karnes City, TX 78118") DOES have a real repeated
//     street address in the OCR text but it's a bare header/footer line,
//     not behind a "Commonly known as"-style cue phrase the sweep expects
//     -- a genuine near-miss, flagged for the parser owner.
//   La Salle 48283 (lasalle_cc, load_fc_transpecos.mjs): 1 packet, 0
//     notices -- Lot/Block-only legal description, no street address.
//   Zavala 48507 (zavala_cc, load_fc_transpecos.mjs): re-checked live --
//     CONFIRMED STALE, not a bug. Newest posting on the page is "Posted
//     April 9, 2026"; routed through saleMonthAfter that resolves to a sale
//     month already >2 months in the past relative to 2026-07-16, so
//     nothing survives inWindow. No May/June/July postings found on the
//     live page. Revisit if the county resumes posting.
//   Burleson 48051 (load_fc_brazos_valley.mjs skip-log): confirmed --
//     burlesoncountytx.gov has no foreclosure/trustee content; only surface
//     is burleson.tx.publicsearch.us (Kofile), out of scope for this loader.
//
// ALREADY SKIP-LOGGED (load_pdf_foreclosures.mjs comment block), spot-
// re-checked, no change:
//   Aransas 48007 -- Tyler Eagle (paywalled/search-only), no direct PDFs.
//   Brazoria 48039 -- Granicus site publishes no foreclosure page; clerk
//     records behind Tyler login (portal-txbrazoria.tylertech.cloud).
//   Calhoun 48057 -- clerk's /foreclosures Downloads section: "Files coming
//     soon", genuinely empty.
//   Matagorda 48321 -- only stale ANNUAL "Foreclosure List <year>" PDFs,
//     newest 2024, nothing for 2025/2026.
//   Refugio 48391 -- CivicLive RealEstateNotices page stale since 2018.
//   McMullen 48311 -- no foreclosure/trustee content anywhere on site, no
//     Kofile subdomain either; tiny county (pop ~700).
//   Zapata 48505 / Jim Wells 48249 -- county clerk pages point only to a
//     Kofile PublicSearch subdomain now (zapatatx.search.kofile.com,
//     jimwellstx.search.kofile.com); no direct PDFs left on the county
//     site. NOTE: the standard .tx.publicsearch.us Kofile crack in
//     load_kofile_foreclosures.mjs does NOT cover these -- they're on the
//     DIFFERENT .search.kofile.com host, explicitly DISABLED there after
//     testing returned HTTP 500 / no connection (2026-07-16). Genuinely
//     unreachable right now, not just "handled elsewhere."
//
// ALREADY SKIP-LOGGED (load_fc_ne_southcentral.mjs SKIPPED block), spot-
// re-checked, no change:
//   Bee 48025 -- CivicPlus /167/County-Clerk has fee schedules/self-help
//     docs only; sitemap.xml carries no Archive/foreclosure page.
//   Frio 48163 -- /page/co.public-notices-calendar is a client-rendered
//     events calendar, no PDF hrefs in static HTML; no other foreclosure
//     page linked from nav or sitemap.
//
// ALREADY SKIP-LOGGED (load_fc_transpecos.mjs SKIPPED block), spot-
// re-checked, no change:
//   Dimmit 48127 -- dimmitcounty.org/government/departments/trustee_sales.php
//     (Revize) lists 24 trustee-sale PDFs with clean dates, but EVERY file
//     link 302-redirects to cms9files.revize.com and then 404s there
//     (verified on 2 different files, old and fresh-posted) -- the county's
//     own CDN is broken for direct/programmatic fetches. Not a URL bug on
//     our end.
//
// NEW THIS PASS (not previously investigated):
//   Montgomery 48339 -- checked mctx.org's REAL county-clerk page
//     (countyclerk.mctx.org redirects to mctx.org/index_clerk.php) and its
//     dedicated foreclosures page (index_clerk/public_records/foreclosures/
//     index.php, found live 2026-07-16): it lists ONLY fee-schedule PDFs
//     (FY25_MoCoClerk_*.pdf) -- ZERO trustee-sale notice PDFs -- and links
//     out to montgomery.texas.realforeclose.com (RealAuction, TAX
//     foreclosures only, not mortgage trustee notices) and
//     montgomery.tx.publicsearch.us (Kofile, the already-known parked
//     platform, untested-prep in load_kofile_foreclosures.mjs). Confirms
//     the FORECLOSURE_SOURCES.md finding with a fresh direct look at the
//     actual page. Skip -- no own-site notice PDFs exist to load.
//   Tarrant 48439 -- CONFIRMED handled elsewhere: already configured
//     (tarrant: {sub:"tarrant", fips:"48439"}) in the ACTIVE Kofile list in
//     load_kofile_foreclosures.mjs. That platform requires a clean
//     (non-datacenter) IP -- home residential rate-limits after ~30 conns,
//     datacenter/VPN IPs are TLS-blocked -- out of scope for this curl/
//     Node-fetch-only rescrub. Per FORECLOSURE_SOURCES.md's prior run,
//     Tarrant's Kofile notices came back "all past-sale (expired)" anyway.
//     Skip here, not a candidate for a pinned/static loader.
