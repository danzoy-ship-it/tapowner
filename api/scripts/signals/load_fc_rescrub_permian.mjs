// Permian Basin / Trans-Pecos / West-Central TX re-scrub pass (2026-07-16):
// re-attempt counties previously skip-logged with NO foreclosure signal, now
// that Tesseract OCR is installed (image-only PDFs read) and some earlier
// skips were WRONG-PAGE misses. Sibling of load_pdf_foreclosures.mjs --
// imports its shared discover/fetch/join/GOV_OWNER/upsert machinery, does
// NOT edit that file (parallel-safe with sibling region loaders).
//
//   DATABASE_URL=... node scripts/signals/load_fc_rescrub_permian.mjs [--parse-only] [source...]
//
// Assigned counties (24): Borden 48033, Coke 48081, Concho 48095, Crockett
// 48105, Culberson 48109, El Paso 48141, Fisher 48151, Glasscock 48173,
// Hudspeth 48229, Irion 48235, Kent 48263, Loving 48301, Martin 48317,
// Menard 48327, Mitchell 48335, Presidio 48377, Reagan 48383, Reeves 48389,
// Schleicher 48413, Sterling 48431, Sutton 48435, Terrell 48443, Upton
// 48461, Winkler 48495.
//
// ALREADY LOADED elsewhere (verified live, not duplicated here):
//   Concho (48095) -> concho_cc in load_pdf_foreclosures.mjs
//   Coke    (48081) -> coke_cc    in load_pdf_foreclosures.mjs
//   Menard (48327) -> menard_cc  in load_fc_concho.mjs
//   Reagan (48383) -> reagan_cc  in load_fc_permian.mjs
//
// NEW THIS PASS: Mitchell (48335) -- mitchell_cc below. Real, well-organized
// "Foreclosure Notices" folder (co.mitchell.tx.us/page/county.Clerk), but
// unlike every other county in the shared loader the sale date is NOT in the
// filename/URL (just a year folder + case sequence, e.g. "26-0015 Notice
// TTEE Sale.pdf") -- flagged in the brief as needing "OCR-in-discover".
// Verified via a live OCR sample (26-0015 Notice TTEE Sale.pdf, 2026-07-16):
// clean structured field "Date, Time, and Place of Sale. / Date: / Time: /
// Place: / 6/2/2026" -- so discover() downloads+OCRs every candidate PDF
// (only ~21 total, cheap) to learn its sale month before bucketing. This
// breaks the shared architecture's cheap-discover/heavy-parse-only-on-match
// design (a real download+OCR per candidate happens in discover, not just on
// match) but is the only way to get a date signal at all for this county.
// PDFs are cached under the SAME shared CACHE dir/naming scheme fetchPdf()
// uses internally, so the main pipeline's later fetchPdf() call for the
// same packet is a cache hit, not a second download.
//
// RE-VERIFIED (fresh checks 2026-07-16, same findings as the earlier pass --
// see report for detail): Martin (React antiforgery wall, confirmed again),
// El Paso (Cloudflare Turnstile CAPTCHA, confirmed again -- do NOT bypass),
// Reeves (Kofile/GovOS PublicSearch, confirmed again), Loving (pop ~64, zero
// notice infrastructure, confirmed again). Schleicher, Irion, Culberson,
// Hudspeth, Presidio, Kent, Fisher, Sutton, Sterling, Borden, Glasscock,
// Upton, Winkler, Crockett, Terrell: re-checked for wrong-page/sibling-host
// misses (alternate domains, Wayback, legacy vs. current CivicPlus/CivicLive
// templates) -- genuine absence or genuine staleness confirmed on the RIGHT
// page each time; no rescue found. Detail + specific URLs checked in the
// final report.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSources, fetchText, inWindow, MONTHS, UA } from "./load_pdf_foreclosures.mjs";

// same cache dir + naming scheme as the shared module's fetchPdf(), so the
// main pipeline's later download of the same packet is a cache hit
const CACHE = path.join(os.tmpdir(), "tapowner-fc-pdf");
const PDFTOTEXT_EXE = process.env.PDFTOTEXT_EXE || "pdftotext";
const PYTHON_EXE = process.env.PYTHON_EXE || "python";
const OCR_HELPER = path.join(path.dirname(fileURLToPath(import.meta.url)), "pdf_ocr_text.py");

async function fetchPdfLocal(url, name) {
    mkdirSync(CACHE, { recursive: true });
    const file = path.join(CACHE, name.replace(/[^\w.-]+/g, "_"));
    if (existsSync(file) && statSync(file).size > 5000) return file;
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120000), redirect: "follow" });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000 || !buf.subarray(0, 5).toString().startsWith("%PDF")) throw new Error(`${url} -> not a PDF`);
    writeFileSync(file, buf);
    return file;
}

// pdftotext first (fast); image-only PDFs fall back to the shared tesseract/
// winocr helper -- same logic as the main module's (unexported) extractText.
function extractTextLocal(pdfFile) {
    let text = "";
    try {
        text = execFileSync(PDFTOTEXT_EXE, ["-layout", pdfFile, "-"], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
    } catch {
        /* fall through to OCR */
    }
    if (text.replace(/\s/g, "").length < 150) {
        const r = spawnSync(PYTHON_EXE, [OCR_HELPER, pdfFile], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8", timeout: 900000 });
        if (r.status !== 0) throw new Error(`OCR failed for ${pdfFile}: ${(r.stderr || "").slice(0, 400)}`);
        text = r.stdout;
    }
    return text;
}

// Mitchell notices use AT LEAST 4 different trustee/law-firm templates (own
// live sample of 5 PDFs, 2026-07-16), each labeling the sale date
// differently: "Date, Time, and Place of Sale. / Date: / Time: / Place: /
// 6/2/2026", "SALE INFORMATION: / Date of Sale: / ... / April 7, 2026",
// bare "Date: February 3rd, 2026" right after the property description, and
// prose "on Tuesday, the 7th day of April, 2026". No single anchor phrase
// covers all four, so: collect EVERY date-like token in the doc (numeric
// M/D/YYYY, "Month D, YYYY", and the prose "day of Month, YYYY" form),
// exclude any sitting within 60 chars of a deed-of-trust/recording keyword
// (those are the instrument date, not the sale date), then prefer whichever
// remaining candidate lands EXACTLY on the legally-required first-Tuesday-of
// -month (HB 1128 Wednesday exception) -- a near-unique validator since
// deed/recording dates essentially never coincidentally land on one, and it
// tolerates OCR-mangled day digits (e.g. "3rd" misread as "Yd") by falling
// back to proximity-to-a-sale-keyword when no candidate's day parses cleanly.
const NEG_DATE_CTX = /Deed of Trust dated|recorded (?:on|in)|FILED FOR RECORD|Recording\s*Information|DEED OF TRUST\s*I[NnUu]?[OoFf]?RMATION/i;
const POS_DATE_CTX = /Date of Sale|SALE\s*INFORMATION|Date,?\s*Time,?\s*and\s*Place\s*of\s*Sale|Earliest Time Sale|foreclosure sale will be conducted|Trustee.s Sale was posted/i;
function firstTuesday(y, m) {
    const d = new Date(Date.UTC(y, m - 1, 1));
    const off = (2 - d.getUTCDay() + 7) % 7;
    let day = 1 + off;
    if ((m === 1 && day === 1) || (m === 7 && day === 4)) day += 1;
    return day;
}
function extractSaleDate(text) {
    const negIdx = [...text.matchAll(new RegExp(NEG_DATE_CTX, "gi"))].map((m) => m.index);
    const posIdx = [...text.matchAll(new RegExp(POS_DATE_CTX, "gi"))].map((m) => m.index);
    const candidates = [];
    for (const m of text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g))
        candidates.push({ idx: m.index, month: +m[1], day: +m[2], year: +m[3] });
    for (const m of text.matchAll(/([A-Za-z]{3,9})\.?\s+([A-Za-z0-9]{1,4})(?:st|nd|rd|th)?,\s*(\d{4})/g)) {
        const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
        if (!mon) continue;
        const dayNum = parseInt(m[2], 10);
        candidates.push({ idx: m.index, month: mon, day: Number.isNaN(dayNum) ? null : dayNum, year: +m[3] });
    }
    for (const m of text.matchAll(/the\s+(\d{1,2})(?:st|nd|rd|th)?\s+day\s+of\s+([A-Za-z]{3,9}),?\s*(\d{4})/gi)) {
        const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
        if (!mon) continue;
        candidates.push({ idx: m.index, month: mon, day: +m[1], year: +m[3] });
    }
    candidates.sort((a, b) => a.idx - b.idx);
    const filtered = candidates.filter((c) => !negIdx.some((n) => c.idx > n && c.idx - n < 60));
    if (!filtered.length) return null;
    const scored = filtered.map((c) => ({
        ...c,
        nearestPos: posIdx.length ? Math.min(...posIdx.map((p) => Math.abs(c.idx - p))) : Infinity,
        tuesdayMatch: c.day != null && c.year >= 2000 && c.month >= 1 && c.month <= 12 && c.day === firstTuesday(c.year, c.month),
    }));
    scored.sort((a, b) => (a.tuesdayMatch !== b.tuesdayMatch ? (a.tuesdayMatch ? -1 : 1) : a.nearestPos - b.nearestPos));
    return scored[0];
}

const SOURCES = {
    // Mitchell County clerk (CivicLive, co.mitchell.tx.us): /page/county.Clerk
    // links a real "Foreclosure Notices/<year>/<case#> Notice ... Sale.pdf"
    // folder (image-only scans). No date in filename/URL -> download+OCR
    // every candidate here to learn its sale month (only ~21 PDFs total).
    mitchell_cc: {
        fips: "48335",
        // sale venue: Mitchell County Courthouse, 349 Oak Street, Colorado City
        venue: /COURT\s*HOUSE|\b349\s+OAK\s+ST/i,
        discover: async () => {
            const base = "https://www.co.mitchell.tx.us";
            const html = await fetchText(base + "/page/county.Clerk");
            const out = [];
            const links = [...html.matchAll(/href="(\/upload\/page\/0075\/docs\/Foreclosure Notices\/(\d{4})\/[^"]+\.pdf)"/gi)];
            for (const m of links) {
                const href = m[1];
                const url = base + encodeURI(href);
                const fname = path.basename(href);
                // probe under a placeholder name first (year/month unknown
                // until OCR'd); once the date is known, re-fetch under the
                // FINAL packet name (fetchPdfLocal caches by name, cheap
                // no-op if bytes already match) so the shared pipeline's own
                // fetchPdf(url, p.name) call later is a cache hit, not a
                // second real download.
                const probeName = `mitchell_probe_${m[2]}_${fname.replace(/[^\w.-]+/g, "_")}`;
                let file, text, d;
                try {
                    file = await fetchPdfLocal(url, probeName);
                    text = extractTextLocal(file);
                    d = extractSaleDate(text);
                } catch (e) {
                    console.error(`  mitchell ${fname}: probe failed (${e.message})`);
                    continue;
                }
                if (!d || !d.month || d.month > 12 || !inWindow(d.year, d.month)) continue;
                const name = `mitchell_${d.year}-${String(d.month).padStart(2, "0")}_${fname.replace(/[^\w.-]+/g, "_")}`;
                await fetchPdfLocal(url, name).catch(() => {}); // prime the cache under the final name
                out.push({ url, year: d.year, month: d.month, name });
            }
            return out;
        },
    },

    // ---- skip-logged (re-verified 2026-07-16, RE-SCRUB pass) ---------------
    // Martin (48317): co.martin.tx.us (CivicPlus) has a real "Martin County
    // Foreclosure Notices" DocumentCenter folder (/DocumentCenter/Index/46,
    // linked from /152/County-District-Clerk) -- re-confirmed live -- but the
    // folder listing renders client-side via the REACT DocumentCenter's
    // Document_AjaxBinding + antiforgery-token endpoint, same wall as Parker
    // County (load_pdf_foreclosures.mjs): every headless POST replay (curl,
    // node fetch, in-page fetch without the app's axios wiring) fails or
    // returns no rows. No static HTML fallback, no RSS/JSON feed found on a
    // fresh check. Needs a pinned live-page capture (like Parker) or the
    // React antiforgery flow cracked -- out of scope for this pass.
    // El Paso (48141): apps.epcountytx.gov/publicrecords/Foreclosures re-
    // confirmed gated by a Cloudflare Turnstile widget on the search POST
    // (data-sitekey present in the form HTML) -- the CAPTCHA-class block
    // flagged in the brief. Confirmed + skipped, NOT bypassed per instructions.
    // Reeves (48389): reevescounty.org's own foreclosure page re-confirmed to
    // BE reeves.tx.publicsearch.us (Kofile/GovOS PublicSearch) -- the parked-
    // platform crack applies here, not a PDF feed; no separate clerk PDF
    // archive found on a fresh check of the live site.
    // Loving (48301): co.loving.tx.us and the lovingcountytx.com mirror both
    // re-checked (County Clerk, Public Notices, Tax Notice pages) -- still
    // zero foreclosure/trustee-sale content anywhere. Smallest county in
    // Texas (pop ~64); genuine absence, no notice system online.
    // Schleicher (48413): the earlier "403 IIS block" verdict was a WRONG-PAGE
    // miss -- schleichercounty.gov/page/ForeclosureNotice (the guessed slug)
    // now soft-redirects to the homepage (site restructured off the old IIS
    // host), not a 403. Walked the live nav instead and found the REAL page,
    // /page/Foreclosure ("Trustee Sales | Schleicher County, TX", 200 OK):
    // it lists exactly 2 postings, both stale -- "March 3, 2020" and
    // "December 2, 2019". Genuine staleness confirmed on the right page;
    // corrected from a false "blocked" verdict to a true "stale" one.
    // Irion (48235): also re-walked live (co.irion.tx.us is now a normal
    // CivicPlus site, not dead) -- /1193/County-Clerk and /1202/District-Clerk
    // pages plus the site's own search (?searchPhrase=foreclosure) all return
    // zero "foreclosure" hits. Confirmed genuine absence on the current site,
    // not a 404/dead-template miss as the prior pass concluded.
    // Sutton (48435): re-checked on the direct county domain (co.sutton.tx.us
    // resolves natively now, not just via the newtools.cira.state.tx.us
    // backend) -- /page/sutton.Foreclosures loads (200, "Foreclosures" title)
    // but the only 5 occurrences of "foreclosure" on the page are the nav/
    // breadcrumb/heading label itself; zero PDF links, zero notice text.
    // Genuine empty page, re-confirmed on the right (and now canonical) host.
    // Culberson (48109) / Hudspeth (48229): re-checked on their real
    // co.<name>.tx.us CivicLive sites (not parked lookalikes) -- County
    // Clerk / District Clerk pages still carry zero "trustee"/"foreclosure"
    // hits. Tiny border counties (pop 2,200-3,300); genuine no online
    // posting, confirmed a second time.
    // Presidio (48377) / Fisher (48151): co.presidio.tx.us and co.fisher.tx.us
    // both timed out (HTTP 000, connection failure) on THIS pass's fresh
    // check from this IP -- an intermittent-connectivity result, not a new
    // finding either way. Falling back to the earlier same-day pass's
    // page-level findings (both DID load then): Presidio's Current-Public-
    // Notices page posts only Sheriff's Sale (tax/execution) notices, no
    // mortgage Notice of Trustee's Sale; Fisher's general PostedNotices board
    // has only 2 foreclosure-looking filenames in the whole 2019-2026 archive
    // (one >2yr stale, one undated), no dedicated foreclosure page. Revisit
    // trigger: retry from a different IP/network if this recurs.
    // Kent (48263): co.kent.tx.us re-checked -- no foreclosure/trustee page
    // exists under County-Clerk or Public-Notices (the latter carries only
    // tax-abatement hearing notices); no sibling/alternate domain found.
    // Genuine no online posting (pop ~740).
    // Sterling (48431): sterlingcotx.gov/page/ForeclosureNotice re-checked --
    // still live and correctly templated, newest posting still August 5,
    // 2025 (~11mo stale as of 2026-07-16). No newer posting appeared; genuine
    // staleness, not a wrong-page issue (this IS the right, current page).
    // Borden (48033) / Glasscock (48173) / Upton (48461) / Winkler (48495) /
    // Crockett (48105) / Terrell (48443): each re-checked on its live
    // CivicLive page (co.<name>.tx.us) -- same single-stale-entry (Borden
    // 2021, Glasscock 2024) / undated-archive (Upton) / stale (Winkler 2023,
    // Crockett Oct 2024, Terrell Jan 2026) findings as the earlier pass, on
    // the confirmed-correct page each time. No newer content, no sibling
    // host with a different (live) picture.
};

await runSources(SOURCES, { parseOnly: process.argv.includes("--parse-only") });
