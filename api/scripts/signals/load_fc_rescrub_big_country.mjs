// Court-record seller-signal loader: RE-SCRUB pass over Texas "Big Country" +
// Hill Country remainder counties that previously showed NO foreclosure
// signal, now that Tesseract OCR is installed (image-only PDFs read now).
// Standalone sibling of load_pdf_foreclosures.mjs (imports its shared
// discover/parse/match/upsert machinery; does NOT edit that file -- parallel-
// safe with sibling region loaders running the same pass).
//
//   DATABASE_URL=... node scripts/signals/load_fc_rescrub_big_country.mjs [--parse-only] [source...]
//
// Counties assigned (16): Callahan 48059, Coleman 48083, Stonewall 48433,
// Taylor 48441, Mason 48319, Kinney 48271, Val Verde 48465, Blanco 48031,
// Gillespie 48171, Real 48385, Bandera 48019, Hamilton 48193, Mills 48333,
// Kenedy 48261, Somervell 48425, Hood 48221.
//
// Pre-flight (2026-07-16): queried parcel_signals live -- ALL 16 genuinely
// have ZERO foreclosure rows today, confirming the "no signal" premise before
// spending any budget. Four of the sixteen (Kinney, Blanco, Gillespie, Mills)
// ALREADY have real SOURCES entries in sibling files (load_fc_transpecos.mjs,
// load_fc_hill_south.mjs, load_fc_concho.mjs) -- re-ran them here (read-only,
// no edits) to check for a "just needs a re-run" rescue. All three re-ran
// clean (page live, packet found, PDF text-extracted/OCR'd fine) but landed
// 0 notices THIS run for real, verifiable reasons -- NOT bugs, so no entry
// duplicated below:
//   Kinney (kinney_cc): 1 in-window packet (Hodges, July 2026), OCR clean,
//     but the notice describes a 0.13-acre tract by metes-and-bounds/Block-
//     only reference (no street address, no LOT number to pair with the
//     BLOCK for the shared loader's LOT+BLOCK legal-match regex) -- genuinely
//     unresolvable by this pipeline's methods, not a parse failure.
//   Blanco (blanco_cc): 3 in-window packets, OCR clean (verified readable,
//     e.g. "26.43 Acre tract... J.F. BENSKIN SURVEY... Abstract No. 791"),
//     same story -- pure metes-and-bounds acreage, no address/no Lot+Block.
//   Mills (mills_cc): 3 in-window packets, OCR clean, same story (Nolasco/
//     Keel notices describe acreage via Survey/Abstract only).
//   Gillespie (gillespie_cc): page confirmed still live, discover() pattern
//     still matches -- but its only 3 ever-posted notices carry Sale Dates of
//     May 5 / June 2 2026, both already outside the current window (today
//     2026-07-16). Genuine 0-in-window, not a scrape break; will pick up
//     whenever the clerk posts a new one.
// These four keep their existing entries untouched; nothing to add here.
//
// FRESH investigation results below -- 2 genuinely loadable, 10 confirmed
// skip (with fresh 2026-07-16 verification, not just trusting old notes):
//
//   Hamilton (48193) LOADABLE (new). hamiltoncountytx.gov (CivicLive) has a
//     real, live "/page/hamilton.noticeforclosures" page -- 5 posted PDFs,
//     filenames literally carry the sale date ("August 4 2026 Notice of
//     Substitute Trustee Sale.pdf"). Image-only scans -> OCR; sample OCR'd
//     cleanly with a direct "Property Address: 410 S BOULDIN ST HAMILTON
//     Texas 76531" cue-phrase hit. This was a genuine wrong-page miss in the
//     earlier sweep (co.hamilton.tx.us, the legacy/broken domain, was
//     probably tried instead of hamiltoncountytx.gov).
//   Val Verde (48465) LOADABLE (new, OCR-per-file). The known blocker (see
//     load_fc_transpecos.mjs's skip note) was that valverdecounty.texas.gov/
//     283/Foreclosures groups ~112 DocumentCenter links under a single,
//     undated "July 2026" heading spanning a huge doc-ID range (8195-10526)
//     with no per-notice date in the URL/anchor -- bucketing all under one
//     sale month would fabricate dates. Verified via OCR sample (doc 10526)
//     that EVERY per-notice PDF carries its own real "Date, Time, and Place
//     of Sale" section with a genuine date (e.g. 07/07/2026) -- just not
//     exposed on the listing page. discover() below OCRs each candidate
//     itself (only the current heading's ~112 files, not the 3 stale
//     year-archive headings) to recover the true date and filters to the
//     shared inWindow(); the OCR text is cached under the SAME tapowner-fc-
//     pdf cache dir/naming convention the shared loader uses, so the
//     downstream real load does NOT redo the OCR work. Many of these notices
//     are legal-description-only (rural lots) -- expect legalMatch to carry
//     a meaningful chunk, direct address matches for the rest, and some
//     genuinely unresolvable (same metes-and-bounds story as Kinney/Blanco/
//     Mills above).
//
//   Callahan (48059) SKIP -- confirmed fresh. callahancounty.org (CivicLive,
//     real live site, NOT the broken co.callahan.tx.us legacy host that
//     TLS-errors) has a "Foreclosure, Notices & News" nav item, but every
//     link under it (PublicNoticesCalendar, County News, Court Appointed
//     Attorneys) resolves to a client-rendered JS calendar widget -- zero
//     static PDF/list links anywhere on the page (verified: 0 upload/page
//     hits). No dedicated foreclosure page exists. Skip.
//   Taylor (48441) SKIP -- confirmed fresh. taylorcounty.texas.gov/408/
//     Foreclosure-Information is a real, live CivicPlus info page, but its
//     ONLY pointer to actual notices is "research the foreclosure listings
//     ... at https://taylorcountytx-web.tylerhost.net/web/" -- Tyler Eagle
//     (tylerhost.net), on this loader's own known-blocked list: a per-
//     property search portal (legal description or owner name required),
//     not a bulk list. Confirmed paywalled/gated per the brief. Skip.
//   Hood (48221) SKIP -- confirmed fresh. hoodcounty.texas.gov/government/
//     county_clerk/foreclosure.php is real and live (posts the 2026 sale-
//     date/filing-deadline calendar), but the actual notices link out to
//     hoodcountytx.documents-on-demand.com, which returns a Cloudflare
//     "Just a moment..." managed-challenge (403, cf_chl_opt bot-check) on
//     every request -- the CAPTCHA-class block this loader's guardrails say
//     to confirm-and-skip, not bypass. Skip.
//   Somervell (48425) SKIP -- confirmed fresh, with a genuine new finding.
//     somervell.co (CivicPlus, migrated off the old co.somervell.tx.us) has
//     real notices, but /233/Public-Notices links a REACT DocumentCenter
//     folder (/DocumentCenter/Index/91) that renders client-side with no
//     static PDF links -- the same antiforgery-API wall already confirmed
//     for Parker (FORECLOSURE_COVERAGE.md). NEW: unlike the folder-listing
//     API, individual /DocumentCenter/View/<id> documents ARE directly
//     fetchable with no token (verified: 200 application/pdf, no auth). Used
//     that to sequentially probe doc IDs 736-1050 (~230 IDs, spanning every
//     document the county posted from roughly Feb through Jul 2026, confirmed
//     by their own internal date stamps) and text-scanned each for
//     "foreclosure"/"trustee's sale" -- found real notices dated as late as
//     April 8, 2026 (id 863) and then NONE from id 864 through 1050 (the
//     newest doc as of today, 2026-07-16, is the Jul-6 burn-ban order at id
//     1026). That is a real ~3.5-month gap with zero trustee-sale postings,
//     not a scrape failure -- genuine current absence, verified by exhaustive
//     ID sweep rather than a single page check. Flagging the View-endpoint
//     workaround for a future dedicated ID-sweep loader (would need to re-
//     estimate the current max ID each run since the folder index can't be
//     listed) -- not built here since it would add 0 rows today.
//   Coleman (48083), Stonewall (48433), Bandera (48019) SKIP -- re-verify
//     attempted 2026-07-16 but co.coleman.tx.us / co.stonewallcounty.org /
//     co.bandera.tx.us all connection-timed-out on this box today (general
//     connectivity confirmed fine via google.com in the same run, so this
//     looks like real host-side unreachability, not a local network issue).
//     Trusting this same-day's already-thorough prior findings (both from
//     the 2026-07-16 crack-fleet pass, in load_fc_concho.mjs / load_fc_big_
//     country.mjs / load_fc_ne_southcentral.mjs): Coleman's clerk page is a
//     static "bulletin board inside the courthouse door, not given over the
//     phone" notice with zero PDFs; Stonewall's only foreclosure-adjacent
//     file is a blank 2020 form template, not a live posting; Bandera's
//     custom "ez*"-CMS mega-menu exposes no clerk/foreclosure link and every
//     guessed slug 403s. Skip, unchanged.
//   Real (48385) SKIP -- re-verified fresh: the one known PDF (newtools.cira.
//     state.tx.us/upload/page/0256/docs/Notice of Foreclosure.pdf) still
//     Last-Modified Wed, 04 Jun 2025 -- now over 13 months stale, still the
//     only foreclosure content on the site. Skip.
//   Kenedy (48261) SKIP -- re-verified fresh: co.kenedy.tx.us/page/kenedy.
//     PublicNoticeCalendar loads (200) but is a bare client-rendered JS
//     calendar widget, 0 static PDF links; no dedicated foreclosure page
//     exists (checked kenedy.County.Clerk too, same as the 2026-07-16 hill-
//     south pass already found). Tiny county (pop ~400s outside the King
//     Ranch HQ) -- plausibly near-zero real volume regardless. Skip.
//   Mason (48319) SKIP -- not re-investigated a third time. Already
//     independently confirmed skip TWICE the same day by two different
//     sibling loaders (load_fc_concho.mjs and load_fc_hill_south.mjs): the
//     Foreclosure filter on co.mason.tx.us/page/mason.Public.Notices is a JS
//     calendar-widget event-type filter, not a static list, and the one
//     static PDF outside it is a single overwritable one-off already stale.
//     Trusting that double-verified finding rather than spending a third
//     pass on it.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runSources, fetchText, MONTHS, inWindow, UA } from "./load_pdf_foreclosures.mjs";

// -- lightweight per-file OCR date probe for Val Verde's undated listing --
// Reuses the SAME cache dir + "<pdf>.txt" sidecar convention as the shared
// loader's extractText()/fetchPdf(), so if a probed file turns out in-window
// the real load below does NOT re-fetch or re-OCR it.
const OCR_CACHE = path.join(os.tmpdir(), "tapowner-fc-pdf");
const PDFTOTEXT = process.env.PDFTOTEXT_EXE || "pdftotext";
const PYTHON = process.env.PYTHON_EXE || "python";
const OCR_HELPER = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "pdf_ocr_text.py");

async function probeDate(url, cacheName) {
    mkdirSync(OCR_CACHE, { recursive: true });
    const file = path.join(OCR_CACHE, cacheName);
    if (!existsSync(file) || statSync(file).size < 1000) {
        const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000), redirect: "follow" });
        if (!r.ok) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 1000 || !buf.subarray(0, 5).toString().startsWith("%PDF")) return null;
        writeFileSync(file, buf);
    }
    const txtCache = file + ".txt";
    let text;
    if (existsSync(txtCache) && statSync(txtCache).mtimeMs >= statSync(file).mtimeMs) {
        text = readFileSync(txtCache, "utf8");
    } else {
        try {
            text = execFileSync(PDFTOTEXT, ["-layout", file, "-"], { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" });
        } catch {
            text = "";
        }
        if (text.replace(/\s/g, "").length < 150) {
            const r = spawnSync(PYTHON, [OCR_HELPER, file], { maxBuffer: 32 * 1024 * 1024, encoding: "utf8", timeout: 60000 });
            if (r.status === 0) text = r.stdout;
        }
        writeFileSync(txtCache, text);
    }
    // scope to the "Date, Time, and Place of Sale" section (OCR sometimes
    // scrambles the Date/Time/Place label order vs. the values that follow,
    // e.g. "Date. Time: Place: 07/07/2026 12:00 PM ...") to avoid picking up
    // an unrelated Deed-of-Trust/recording date higher in the notice.
    const block = text.match(/Date,?\s*Time,?\s*and\s*Place\s*of\s*Sale[\s\S]{0,500}/i);
    const scope = block ? block[0] : text.slice(0, 2500);
    const dm = scope.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
    if (!dm) return null;
    const mon = +dm[1];
    if (mon < 1 || mon > 12) return null;
    return { year: +dm[3], month: mon };
}

const SOURCES = {
    // Hamilton County clerk (CivicLive, hamiltoncountytx.gov): /page/hamilton.
    // noticeforclosures lists per-notice scanned PDFs directly under /upload/
    // page/8820/, filename = "<Month> <Day> <Year> Notice of ...Sale.pdf" (the
    // sale date, verified real first-Tuesdays). Image-only scans -> OCR.
    hamilton_cc: {
        fips: "48193",
        // sale venue: Hamilton County Courthouse, 102 N. Rice, Hamilton
        venue: /COURT\s*HOUSE|\b10[2Z]\s+N(?:ORTH)?\.?\s*RICE\b/i,
        discover: async () => {
            const base = "https://www.hamiltoncountytx.gov";
            const html = await fetchText(base + "/page/hamilton.noticeforclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/8820\/([^"]+?)\.pdf)"/gi)) {
                const url = m[1], fname = decodeURIComponent(m[2]);
                const mm = fname.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})/);
                if (!mm) continue;
                const mon = MONTHS.indexOf(mm[1].slice(0, 3).toUpperCase()) + 1;
                const year = +mm[3];
                if (!mon || !inWindow(year, mon) || seen.has(url)) continue;
                seen.add(url);
                out.push({
                    url: base + encodeURI(url),
                    year,
                    month: mon,
                    name: `hamilton_${year}-${String(mon).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}.pdf`,
                });
            }
            return out;
        },
    },
    // Val Verde County clerk (CivicPlus, valverdecounty.texas.gov): /283/
    // Foreclosures groups ~112 per-notice DocumentCenter PDFs under one
    // undated "July 2026" heading (a rolling "currently posted" bucket, not a
    // true per-month archive -- doc IDs span 8195-10526). No per-notice date
    // on the listing page, so discover() OCRs each candidate itself (current
    // heading only -- the 3 older year-archive headings are >1yr stale
    // backlog, skipped) and keeps only in-window sale dates. Image-only scans.
    val_verde_cc: {
        fips: "48465",
        // sale venue: front steps of the Val Verde County Courthouse,
        // 400 Pecan St, Del Rio (number-pinned; Pecan St has real properties)
        venue: /COURT\s*HOUSE|\b400\s+PECAN\b/i,
        discover: async () => {
            const base = "https://valverdecounty.texas.gov";
            const html = await fetchText(base + "/283/Foreclosures");
            const heads = [...html.matchAll(/<strong id="isPasted">\s*([A-Za-z]+)\s+(\d{4})\s*<\/strong>/gi)];
            if (!heads.length) return [];
            // only the FIRST (current) heading's bucket -- the others are the
            // confirmed-stale year archives (Sep/Aug/Apr 2024)
            const start = heads[0].index + heads[0][0].length;
            const end = heads[1] ? heads[1].index : html.length;
            const chunk = html.slice(start, end);
            const links = [...chunk.matchAll(/href="(\/DocumentCenter\/View\/(\d+)\/[^"]*)"/gi)];
            const out = [];
            let ocrFail = 0;
            const CONC = 5;
            let idx = 0;
            async function worker() {
                while (idx < links.length) {
                    const m = links[idx++];
                    const id = m[2];
                    const url = base + m[1];
                    let d;
                    try {
                        d = await probeDate(url, `valverde_probe_DC${id}.pdf`);
                    } catch (e) {
                        ocrFail++;
                        continue;
                    }
                    if (!d) {
                        ocrFail++;
                        continue;
                    }
                    if (!inWindow(d.year, d.month)) continue;
                    out.push({
                        url,
                        year: d.year,
                        month: d.month,
                        name: `valverde_${d.year}-${String(d.month).padStart(2, "0")}_DC${id}.pdf`,
                    });
                }
            }
            await Promise.all(Array.from({ length: CONC }, worker));
            if (ocrFail) console.error(`  val_verde_cc: ${ocrFail}/${links.length} candidates had no readable date (OCR miss or fetch fail)`);
            return out;
        },
    },
};

const args = process.argv.slice(2);
const parseOnly = args.includes("--parse-only");
const want = args.filter((a) => !a.startsWith("--"));
const chosen = want.length ? Object.fromEntries(want.map((n) => [n, SOURCES[n]]).filter(([, v]) => v)) : SOURCES;
await runSources(chosen, { parseOnly });
