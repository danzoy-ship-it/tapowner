// Court-record seller-signal loader: county foreclosure notices posted as
// monthly PDF PACKETS on the county clerk's CMS -> parcel_signals. Sibling of
// load_county_foreclosures.mjs (which handles the rare clean ArcGIS feeds,
// e.g. Bexar); this one covers the far bigger cluster of TX counties whose
// clerks publish scanned "Notice of [Substitute] Trustee's Sale" packets
// (FORECLOSURE_SOURCES.md). Add a county = one config entry below.
//
// Pipeline (per county, per packet):
//   discover - scrape the clerk page for the posted month PDFs (a packet is
//              ONE sale month; TX sales run the first Tuesday of the month,
//              or first Wednesday when that Tuesday is Jan 1/Jul 4 [HB 1128],
//              so event_date comes from the packet month -- no fragile
//              per-notice date parsing).
//   extract  - pdftotext -layout; image-only PDFs (no text layer) fall back
//              to scripts/signals/pdf_ocr_text.py (PyMuPDF raster + tesseract).
//   parse    - packets hold ~10-160 notices; OCR is dirty, so instead of
//              brittle notice segmentation we sweep every property-address
//              CUE PHRASE ("Commonly known as", "Property Address", ...) with
//              OCR-tolerant regexes, validate/normalize the captured address,
//              and dedupe by normalized street line (re-postings collapse).
//   match    - (a) DIRECT: batch-pull parcels by house number, then match the
//              street name in JS (exact -> suffix-dropped -> levenshtein<=2
//              for OCR noise; city/zip as tie-breaks). (b) leftovers go to
//              the FREE US Census batch geocoder -> lat/lng -> ST_Contains
//              spatial join. `parcels` is READ-ONLY throughout.
//   upsert   - parcel_signals ON CONFLICT (source,signal_type,source_ref)
//              bumps last_seen; source_ref = "<YYYY-MM>:<norm street line>"
//              so re-runs are idempotent. Unlike the ArcGIS loader there is
//              NO stale-row expiry: packets are monthly archives, not a live
//              feed -- filter by event_date downstream.
//
// Deps: pdftotext (poppler; ships with Git Bash on Windows). Image-only
// counties (Bell) additionally need: python + `pip install pymupdf` +
// tesseract (winget install UB-Mannheim.TesseractOCR). Overrides via env:
// PDFTOTEXT_EXE, PYTHON_EXE, TESSERACT_EXE.
//
//   DATABASE_URL=... node scripts/signals/load_pdf_foreclosures.mjs [--parse-only] [source...]
//
// --parse-only: fetch+parse and print per-packet stats/samples, no DB writes.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pkg from "pg";
const { Client } = pkg;

const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CACHE = path.join(os.tmpdir(), "tapowner-fc-pdf");
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// ---------------------------------------------------------------- sources --

const SOURCES = {
    // Fort Bend County clerk: one consolidated packet per sale month, linked
    // from the "search for foreclosures" page. Scanned, but ships an embedded
    // OCR text layer (mediocre quality -- the OCR-tolerant parse matters).
    fortbend_cc: {
        fips: "48157",
        // sale venues (current + pre-Dec-2025), printed on every notice; OCR
        // mangles "Heimann" wildly (Heimmm/HeimllDn/HEThfANN) -> match loosely
        venue: /EUGENE\s*HE|GUS\s*GEORGE|(?:HIGHWAY|HWY|TEXAS|TX|STATE)\s*(?:HIGHWAY\s*)?36\s*S/i,
        discover: async () => {
            const page = "https://www.fortbendcountytx.gov/government/departments/county-clerk/search-for-foreclosures";
            const html = await fetchText(page);
            const out = [];
            for (const m of html.matchAll(/href="(https?:[^"]*research-foreclosures\/([A-Za-z]+)-(\d{4})(?:\.\d+)?\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (mon) out.push({ url: m[1], year: +m[3], month: mon, name: path.basename(m[1]) });
            }
            return out;
        },
    },
    // Bell County clerk (Revize CMS): several small scanned PDFs per sale
    // month ("Aug 1.pdf".."Aug 8.pdf"), linked from foreclosures.php with a
    // site-root <base href>. Pure images, NO text layer -> tesseract OCR.
    bell_cc: {
        fips: "48027",
        // sale venue: 1201 Huey Dr, Belton (OCR: Huey/Iluey/lluey)
        venue: /\b[HIl]{1,2}u[ec]y\b|JUSTICE\s*COMPLEX/i,
        discover: async () => {
            const page = "https://www.bellcountytx.com/county_government/county_clerk/foreclosures.php";
            const html = await fetchText(page);
            const now = new Date();
            const out = [];
            for (const m of html.matchAll(/href=\s*"(([A-Za-z]{3,9})\s?\d+\.pdf)(\?t=\d+)?"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon) continue;
                // filenames carry no year: sale months are near-future (year
                // rolls over when the month reads >6 months behind today).
                let year = now.getFullYear();
                if (mon - (now.getMonth() + 1) < -6) year += 1;
                out.push({
                    url: new URL(encodeURI(m[1]), "https://www.bellcountytx.com/").href + (m[3] || ""),
                    year,
                    month: mon,
                    name: m[1],
                });
            }
            return out;
        },
    },
    // Ellis County clerk (CivicPlus ArchiveCenter): one scanned packet per sale
    // month at Archive.aspx?ADID=<id>, link text "Sale Date: July 7, 2026".
    // Pure images, no text layer -> OCR. (Smith County looks similar but its
    // /298/Foreclosures page publishes NO PDFs -- it points to Kofile
    // PublicSearch, which is the parked platform in FORECLOSURE_SOURCES.md.)
    ellis_cc: {
        fips: "48139",
        discover: async () => {
            const html = await fetchText("https://co.ellis.tx.us/Archive.aspx?AMID=60");
            const out = [];
            for (const m of html.matchAll(/href="(Archive\.aspx\?ADID=(\d+))"[\s\S]{0,160}?Sale\s+Date:\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://co.ellis.tx.us/").href,
                    year: +m[4],
                    month: mon,
                    name: `ellis_${m[4]}-${String(mon).padStart(2, "0")}_ADID${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Hays County clerk (CivicPlus DocumentCenter): several small scanned
    // "Batch N" PDFs per sale month. Image-only -> OCR.
    hays_cc: {
        fips: "48209",
        // sale venue: Hays County Government Center, 712 S Stagecoach Trail
        venue: /STAGECOACH\s+TR|GOVERNMENT\s+CENTER/i,
        discover: async () => {
            const html = await fetchText("https://hayscountytx.gov/200/Foreclosures");
            const out = [];
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/\d+\/([A-Za-z]+)-(\d{4})-Batch-(\d+)[^"]*)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://hayscountytx.gov/").href,
                    year: +m[3],
                    month: mon,
                    name: `hays_${m[3]}-${String(mon).padStart(2, "0")}_b${m[4]}.pdf`,
                });
            }
            return out;
        },
    },
    // Kaufman County clerk (CivicPlus DocumentCenter): one big scanned packet
    // per sale month ("7 July 2026"), filed under per-year child pages
    // ("/658/Foreclosure-2026") linked from /383/Foreclosures. Image-only -> OCR.
    kaufman_cc: {
        fips: "48257",
        discover: async () => {
            const base = "https://www.kaufmancounty.net";
            let html = await fetchText(`${base}/383/Foreclosures`);
            const yr = new Date().getFullYear();
            for (const y of new Set([...html.matchAll(/href="(\/\d+\/Foreclosure-(\d{4}))"/gi)].map((m) => m[1]))) {
                if (Math.abs(+y.slice(-4) - yr) <= 1) html += await fetchText(base + y);
            }
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/\d+\/\d{1,2}-([A-Za-z]+)-(\d{4})[^"]*)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                const name = `kaufman_${m[3]}-${String(mon).padStart(2, "0")}.pdf`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + m[1], year: +m[3], month: mon, name });
            }
            return out;
        },
    },
    // Parker County clerk (CivicPlus REACT DocumentCenter): month folders
    // (/DocumentCenter/Index/94..107, one per calendar month, recycled yearly)
    // render client-side; the folder-list API (POST /Admin/DocumentCenter/Home/
    // Document_AjaxBinding + /antiforgery token) rejects every headless
    // replay tried (curl, node fetch, even raw in-page fetch without the
    // app's axios wiring). The packet PDF itself downloads fine, so discovery
    // is PINNED: one {url,year,month} per posted packet, captured from the
    // live page. Refresh monthly (folder ids: Jan=99..Sep=107, Oct=98,
    // Nov=95, Dec=94) until the React API is cracked.
    parker_cc: {
        fips: "48367",
        // sale venue: "Parker County Courthouse / District Court Building,
        // 117 Fort Worth Street, Weatherford" (OCR also yields 17/7 variants)
        venue: /FORT\s*WORTH\s*STREET|COURTHOUSE/i,
        discover: async () => {
            const pinned = [
                { url: "https://www.parkercountytx.gov/DocumentCenter/View/13978/Foreclosures-July-2026", year: 2026, month: 7 },
            ];
            return pinned
                .filter((p) => inWindow(p.year, p.month))
                .map((p) => ({ ...p, name: `parker_${p.year}-${String(p.month).padStart(2, "0")}.pdf` }));
        },
    },
    // Rockwall County clerk (CivicPlus ArchiveCenter): /792/Foreclosure-Notices
    // links one Archive.aspx?AMID=<n> per sale month (anchor text "July 2026");
    // each AMID page lists MANY per-notice scanned PDFs (Archive.aspx?ADID=<n>,
    // link text "07-07-2026 10AM Z"). Image-only -> OCR.
    rockwall_cc: {
        fips: "48397",
        // sale venue: 1111 E Yellowjacket Ln (courthouse; OCR: "1 I II Yellowjacket")
        venue: /YELLOWJACKET/i,
        discover: async () => {
            const base = "https://www.rockwallcountytexas.com/";
            const html = await fetchText(base + "792/Foreclosure-Notices");
            const out = [];
            for (const m of html.matchAll(/href="(?:https?:\/\/www\.rockwallcountytexas\.com)?\/?(Archive\.aspx\?AMID=\d+[^"]*)"[^>]*>\s*([A-Za-z]+)\s+(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                const arch = await fetchText(base + m[1].replace(/&amp;/g, "&"));
                for (const a of arch.matchAll(/href="(Archive\.aspx\?ADID=(\d+))"/gi))
                    out.push({
                        url: base + a[1],
                        year: +m[3],
                        month: mon,
                        name: `rockwall_${m[3]}-${String(mon).padStart(2, "0")}_ADID${a[2]}.pdf`,
                    });
            }
            return out;
        },
    },
    // Randall County clerk (CivicPlus DocumentCenter): ONE packet per sale
    // month at a REUSED document id (/DocumentCenter/View/129/Notice-of-Sale-
    // <MM-DD-YYYY>-PDF) on the County Clerk page; the slug carries the sale
    // date, and the prior month's packet is overwritten in place.
    randall_cc: {
        fips: "48381",
        // sale venue: Randall County Justice Center, 2309 Russell Long Blvd,
        // Canyon (direct-matches the Justice Center parcel -> must filter)
        venue: /RUSSELL\s*LONG|JUSTICE\s*CENTER/i,
        discover: async () => {
            const html = await fetchText("https://www.randallcounty.gov/182/County-Clerk");
            const out = [];
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/\d+\/Notice-of-Sale-(\d{2})-\d{2}-(\d{4})[^"]*)"/gi)) {
                const mon = +m[2];
                if (!mon || !inWindow(+m[3], mon)) continue;
                out.push({
                    url: "https://www.randallcounty.gov" + m[1],
                    year: +m[3],
                    month: mon,
                    name: `randall_${m[3]}-${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Guadalupe County clerk (CivicLive/ezTask, guadalupetx.gov -- NOT the
    // legacy co.guadalupe.tx.us PHP site): /page/coclerk.forclosure links
    // per-year child pages (slug spelling drifts: "forclosure2025" vs
    // "foreclosure2026"); each year page lists one /page/open/<id>/0/<Y-M-D>
    // link per sale date, and that URL IS the consolidated packet PDF (good
    // embedded text layer). Future months are pre-linked before the packet is
    // posted -- fetchPdf 404s on those are expected and logged, not fatal.
    guadalupe_cc: {
        fips: "48187",
        // sale venues: 101 E Court St (courthouse north porch; OCR mangles it
        // hard: "10 I E. Court", "101 E Com1 St", "181 L Court ... Sepia",
        // "1 E. Court") -> drop EVERY "E Court St" spelling, but keep W Court
        // St pinned to the Justice Center's 211 (961 W Court is a real
        // property in the packets)
        venue: /COURT\s*HOUSE|NORTH\s+PORCH|\b[EL1Il]{1,3}\.?\s*CO[UM][RN]?[TN1Il]{0,2}\s+ST|\b211\s+W(?:EST)?\.?\s*COURT\s+ST/i,
        discover: async () => {
            const base = "https://www.guadalupetx.gov";
            let html = await fetchText(base + "/page/coclerk.forclosure");
            const yr = new Date().getFullYear();
            for (const s of new Set([...html.matchAll(/href="(\/page\/coclerk\.fore?closure(\d{4}))"/gi)].map((m) => m[1]))) {
                if (Math.abs(+s.slice(-4) - yr) <= 1) html += await fetchText(base + s);
            }
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/page\/open\/\d+\/\d+\/(\d{4})-(\d{2})-\d{2})"/gi)) {
                const year = +m[2], mon = +m[3];
                if (!mon || !inWindow(year, mon)) continue;
                const name = `guadalupe_${m[2]}-${m[3]}.pdf`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + m[1], year, month: mon, name });
            }
            return out;
        },
    },
    // Bowie County clerk (CivicLive/CIRA, co.bowie.tx.us): /page/
    // bowie.Foreclosures links one packet PDF per sale month at
    // /upload/page/<id>/<M-D-YY> foreclosure.pdf (older: <MM-DD-YYYY>FS.pdf).
    // Image-only scans, NO text layer -> tesseract OCR.
    bowie_cc: {
        fips: "48037",
        // sale venue: Bowie County Courthouse, 710 James Bowie Dr, New Boston
        // (number-pinned: James Bowie Dr has real properties)
        venue: /COURT\s*HOUSE|\b710\s+JAMES\s*BOWIE/i,
        discover: async () => {
            const base = "https://www.co.bowie.tx.us";
            const html = await fetchText(base + "/page/bowie.Foreclosures");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/\d+\/(\d{1,2})-(\d{1,2})-(\d{2,4})[^"]*\.pdf)"/gi)) {
                const mon = +m[2];
                let year = +m[4];
                if (year < 100) year += 2000;
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `bowie_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Ector County clerk (CivicPlus ArchiveCenter -- migrated OFF CivicLive
    // to ectorcountytx.gov): Archive.aspx?AMID=37 lists one packet per sale
    // month (Archive.aspx?ADID=<n>, link text "July 7, 2026 - Notice of
    // Trustee's Sale (PDF)"). Good embedded text layer.
    ector_cc: {
        fips: "48135",
        // sale venue: west entrance, Ector County Courthouse, 300 N Grant Ave,
        // Odessa (number-pinned: N Grant Ave has real properties)
        venue: /COURT\s*HOUSE|\b300\s+N(?:ORTH)?\.?\s*GRANT/i,
        discover: async () => {
            const html = await fetchText("https://www.ectorcountytx.gov/Archive.aspx?AMID=37");
            const out = [];
            for (const m of html.matchAll(/href="(Archive\.aspx\?ADID=(\d+))"[^>]*>[\s\S]{0,120}?([A-Za-z]+)\s+\d{1,2},?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://www.ectorcountytx.gov/").href,
                    year: +m[4],
                    month: mon,
                    name: `ector_${m[4]}-${String(mon).padStart(2, "0")}_ADID${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Comal County clerk (CivicPlus -- migrated comalcountytx.gov ->
    // comalcounty.gov; the old domain's DNS zone is EMPTY and every legacy
    // co.comal.tx.us path soft-lands on the new homepage): /213/Foreclosure-
    // Sales links ONE packet per sale month at /DocumentCenter/View/<id>/
    // <Month>-Foreclosure-Sales (no year in the slug -> near-future roll like
    // Bell). Image-only scan, NO text layer -> OCR.
    comal_cc: {
        fips: "48091",
        discover: async () => {
            const base = "https://www.comalcounty.gov";
            const html = await fetchText(base + "/213/Foreclosure-Sales");
            const now = new Date();
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/\d+\/([A-Za-z]+)-Foreclosure-Sales[^"]*)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon) continue;
                // slug carries no year: sale months are near-future
                let year = now.getFullYear();
                if (mon - (now.getMonth() + 1) < -6) year += 1;
                const name = `comal_${year}-${String(mon).padStart(2, "0")}.pdf`;
                if (!inWindow(year, mon) || seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + m[1], year, month: mon, name });
            }
            return out;
        },
    },
    // McLennan County clerk (CivicPlus ArchiveCenter -- migrated
    // co.mclennan.tx.us -> mclennan.gov): Archive.aspx?AMID=41 ("Notice of
    // Trustee's Sale") lists one consolidated packet per sale month, link text
    // "AUGUST 4, 2026 SALE DATE (Notices filed 05-21-2026 thru 07-14-2026)".
    // Good embedded text layer.
    mclennan_cc: {
        fips: "48309",
        // sale venue: McLennan County Courthouse, 501 Washington Ave, Waco.
        // The GOV_OWNER guard blocks the courthouse PARCEL, but the venue line
        // then suffix-matched 501 Washington St in McGREGOR (a private home)
        // -> drop the line itself, number-pinned (other Washingtons are real).
        venue: /\b501\s+WASHINGTON\b/i,
        discover: async () => {
            const html = await fetchText("https://www.mclennan.gov/Archive.aspx?AMID=41");
            const out = [];
            for (const m of html.matchAll(/href="(Archive\.aspx\?ADID=(\d+))"[\s\S]{0,120}?([A-Za-z]+)\s+\d{1,2},\s*(\d{4})\s+SALE\s+DATE/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://www.mclennan.gov/").href,
                    year: +m[4],
                    month: mon,
                    name: `mclennan_${m[4]}-${String(mon).padStart(2, "0")}_ADID${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Lubbock County clerk (eGov/CORE Business Technologies -- migrated OFF
    // CivicLive co.lubbock.tx.us -> lubbockcounty.gov, so the CivicLive
    // template no longer applies): /department/division.php?structureid=270
    // ("Notice of Trustee Sales") is an HTML table, one row per notice:
    // <filed date> | <sale date> | Download Document -> /egov/apps/document/
    // center.egov?view=item&id=<n> (per-notice PDF, ~3pp). The regex anchors
    // on the date cell immediately followed by the link cell, so it captures
    // the SALE date, not the filed date. Image-only scans -> OCR.
    lubbock_cc: {
        fips: "48303",
        discover: async () => {
            const html = await fetchText("https://www.lubbockcounty.gov/department/division.php?structureid=270");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/(\d{1,2})\/\d{1,2}\/(\d{4})\s*<\/td>\s*<td[^>]*>\s*<a[^>]*href="(?:https?:\/\/www\.lubbockcounty\.gov)?\/?egov\/apps\/document\/center\.egov\?view=item&(?:amp;)?id=(\d+)"/gi)) {
                const mon = +m[1], year = +m[2];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[3])) continue;
                seen.add(m[3]);
                out.push({
                    url: `https://www.lubbockcounty.gov/egov/apps/document/center.egov?view=item&id=${m[3]}`,
                    year,
                    month: mon,
                    name: `lubbock_${year}-${String(mon).padStart(2, "0")}_id${m[3]}.pdf`,
                });
            }
            return out;
        },
    },
    // Smith County: NOT here -- smith-county.com/298/Foreclosures (CivicPlus)
    // publishes NO notice PDFs (re-verified 2026-07: prose + one dead
    // DocumentCenter link + no trustee-sale ArchiveCenter module); notices
    // live only in smith.tx.publicsearch.us (Kofile/GovOS PublicSearch), the
    // separate parked platform crack in FORECLOSURE_SOURCES.md.
    // Jefferson County: NOT here -- the clerk's foreclosure-information page
    // (jeffcotxvotes.gov, WordPress) publishes NO notice PDFs; it points to
    // jefferson.tx.publicsearch.us (Kofile/GovOS PublicSearch, paywalled
    // images), the separate platform crack in FORECLOSURE_SOURCES.md.
    // Midland County: NOT here -- the CivicPlus archive (Archive.aspx?AMID=39)
    // is dead since June 2019; current notices moved to Kofile/GovOS
    // PublicSearch (midland.tx.publicsearch.us), the separate platform crack
    // in FORECLOSURE_SOURCES.md.
};

// sale-month window for discovery on archive-style pages that list years of
// history: current month .. 2 months out (packets are posted ~1 month ahead;
// older months are stale signals and pure OCR cost). Override via FC_BACK env.
function inWindow(y, m, back = +(process.env.FC_BACK || 0), fwd = 2) {
    const now = new Date();
    const d = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    return d >= -back && d <= fwd;
}

// ------------------------------------------------------------- fetch/text --

async function fetchText(url) {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000), redirect: "follow" });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return await r.text();
}

async function fetchPdf(url, name) {
    mkdirSync(CACHE, { recursive: true });
    const file = path.join(CACHE, name.replace(/[^\w.-]+/g, "_"));
    if (existsSync(file) && statSync(file).size > 5000) return file; // cached this run/day
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(120000), redirect: "follow" });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1000 || !buf.subarray(0, 5).toString().startsWith("%PDF")) throw new Error(`${url} -> not a PDF`);
    writeFileSync(file, buf);
    return file;
}

function findExe(envVar, names) {
    if (process.env[envVar]) return process.env[envVar];
    for (const n of names) {
        const probe = spawnSync(n, ["--version"], { stdio: "ignore" });
        if (!probe.error) return n;
        if (existsSync(n)) return n;
    }
    return names[0];
}

const PDFTOTEXT = findExe("PDFTOTEXT_EXE", ["pdftotext", "C:\\Program Files\\Git\\mingw64\\bin\\pdftotext.exe"]);
const PYTHON = findExe("PYTHON_EXE", ["python", "python3"]);
const OCR_HELPER = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "pdf_ocr_text.py");

// pdftotext first (fast, reads the embedded OCR layer); if the PDF turns out
// to be image-only (almost no text), rasterize + tesseract via the helper.
function extractText(pdfFile) {
    const cacheFile = pdfFile + ".txt"; // OCR is slow -- cache beside the PDF
    if (existsSync(cacheFile) && statSync(cacheFile).mtimeMs >= statSync(pdfFile).mtimeMs)
        return readFileSync(cacheFile, "utf8");
    let text = "";
    try {
        text = execFileSync(PDFTOTEXT, ["-layout", pdfFile, "-"], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8" });
    } catch {
        /* fall through to OCR */
    }
    const pages = text.split("\f");
    const avg = text.replace(/\s/g, "").length / Math.max(1, pages.length - 1);
    if (avg < 150) {
        const r = spawnSync(PYTHON, [OCR_HELPER, pdfFile], { maxBuffer: 64 * 1024 * 1024, encoding: "utf8", timeout: 900000 });
        if (r.status !== 0) throw new Error(`OCR failed for ${pdfFile}: ${(r.stderr || "").slice(0, 400)}`);
        text = r.stdout;
    }
    writeFileSync(cacheFile, text);
    return text;
}

// ------------------------------------------------------------- sale dates --

// First Tuesday of the month; HB 1128: first Wednesday when that Tuesday
// falls on Jan 1 or Jul 4.
function saleDate(y, m) {
    const d = new Date(Date.UTC(y, m - 1, 1));
    const off = (2 - d.getUTCDay() + 7) % 7;
    let day = 1 + off;
    if ((m === 1 && day === 1) || (m === 7 && day === 4)) day += 1;
    return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// --------------------------------------------------------- address parsing --

// USPS-ish suffix + directional normalization. Both the notice address and
// the parcel situs run through the SAME normalizer, so internal consistency
// beats USPS completeness.
const SUFFIX = {
    STREET: "ST", STR: "ST", ST: "ST", DRIVE: "DR", DR: "DR", LANE: "LN", LN: "LN", COURT: "CT", CT: "CT",
    ROAD: "RD", RD: "RD", CIRCLE: "CIR", CIR: "CIR", AVENUE: "AVE", AVENU: "AVE", AVE: "AVE", BOULEVARD: "BLVD",
    BLVD: "BLVD", TRAIL: "TRL", TRL: "TRL", PLACE: "PL", PL: "PL", PARKWAY: "PKWY", PKWY: "PKWY", HIGHWAY: "HWY",
    HWY: "HWY", COVE: "CV", CV: "CV", BEND: "BND", BND: "BND", CROSSING: "XING", XING: "XING", TERRACE: "TER",
    TER: "TER", POINT: "PT", PT: "PT", SQUARE: "SQ", SQ: "SQ", TRACE: "TRCE", TRCE: "TRCE", GLEN: "GLN",
    GLN: "GLN", GROVE: "GRV", GRV: "GRV", HOLLOW: "HOLW", HOLW: "HOLW", CREEK: "CRK", CRK: "CRK", RIDGE: "RDG",
    RDG: "RDG", VIEW: "VW", VW: "VW", VALLEY: "VLY", VLY: "VLY", MANOR: "MNR", MNR: "MNR", CANYON: "CYN",
    CYN: "CYN", SPRINGS: "SPGS", SPGS: "SPGS", SPRING: "SPG", SPG: "SPG", MEADOW: "MDW", MEADOWS: "MDWS",
    ESTATES: "ESTS", ESTATE: "EST", EXPRESSWAY: "EXPY", FREEWAY: "FWY", JUNCTION: "JCT", MOUNTAIN: "MTN",
    HEIGHTS: "HTS", HTS: "HTS", CROSS: "CRS", PASS: "PASS", PATH: "PATH", WAY: "WAY", WY: "WAY", LOOP: "LOOP",
    RUN: "RUN", ROW: "ROW", WALK: "WALK", ALLEY: "ALY", ALY: "ALY", BLUFF: "BLF", BLF: "BLF", BROOK: "BRK",
    BRK: "BRK", CLUB: "CLB", COMMONS: "CMNS", CORNER: "COR", COR: "COR", CREST: "CRST", CRST: "CRST",
    GARDENS: "GDNS", GDNS: "GDNS", GARDEN: "GDN", GATE: "GT", HARBOR: "HBR", HBR: "HBR", HILL: "HL", HL: "HL",
    HILLS: "HLS", HLS: "HLS", ISLAND: "IS", KNOLL: "KNL", KNL: "KNL", LAKE: "LK", LK: "LK", LAKES: "LKS",
    LANDING: "LNDG", LNDG: "LNDG", OAKS: "OAKS", PARK: "PARK", PINES: "PNS", PLAZA: "PLZ", PLZ: "PLZ",
    SHORE: "SHR", SHR: "SHR", SHORES: "SHRS", STATION: "STA", STA: "STA", SUMMIT: "SMT", SMT: "SMT",
    VILLAGE: "VLG", VLG: "VLG", VISTA: "VIS", VIS: "VIS",
};
const DIRECTION = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", N: "N", S: "S", E: "E", W: "W", NE: "NE", NW: "NW", SE: "SE", SW: "SW" };

// OCR digit repair for tokens that should be numeric (house numbers, zips).
function fixDigits(tok) {
    return tok.replace(/[OoQ]/g, "0").replace(/[IlLi|!]/g, "1").replace(/[Zz]/g, "2").replace(/[Ss]/g, "5").replace(/B/g, "8").replace(/[Gb]/g, "6");
}

function tokens(street) {
    return street
        .toUpperCase()
        .replace(/[^A-Z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        // drop unit designators and everything after them
        .reduce((acc, t) => {
            if (acc.stop) return acc;
            if (/^(APT|UNIT|SUITE|STE|BLDG|TRLR)$/.test(t)) {
                acc.stop = true;
                return acc;
            }
            acc.list.push(t);
            return acc;
        }, { list: [], stop: false }).list;
}
// Map the directional at the ends and the suffix ONLY at the last position --
// "SAGEMONT SQUARE CT" must keep SQUARE (it's part of the name).
function normTokens(street) {
    const toks = tokens(street);
    return toks.map((t, i) => {
        if (DIRECTION[t] && (i === 0 || i === toks.length - 1)) return DIRECTION[t];
        if (SUFFIX[t] && i === toks.length - 1) return SUFFIX[t];
        return t;
    });
}
const normStreet = (s) => normTokens(s).join(" ");
// every-token suffix mapping: equality net for counties that abbreviate
// mid-name tokens in situs ("CARLISLE CV CT" vs "CARLISLE COVE COURT")
const normStreetAll = (s) => tokens(s).map((t) => DIRECTION[t] || SUFFIX[t] || t).join(" ");
// street with the trailing suffix token dropped -- absorbs suffix OCR damage
function nameOnly(s) {
    const t = normTokens(s);
    if (t.length > 1 && Object.values(SUFFIX).includes(t[t.length - 1])) t.pop();
    return t.join(" ");
}

function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return Math.max(m, n);
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++)
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[n];
}

// Cue phrases that introduce the PHYSICAL property address in a notice --
// written OCR-tolerant (Commonly->Conunonly/Cornmonly, known->know11, etc.).
const CUES = new RegExp(
    [
        String.raw`(?:more\s+)?c[o0][mnru]{1,5}[o0]?n?l?[vy]\s+k[nm][o0]?w[nml1i]{0,3}\s+as`,
        String.raw`pr[o0]pert[vy]\s+address(?:\s*[/\\]\s*mailing\s+address)?`,
        String.raw`purported\s+(?:street\s+)?address`,
        String.raw`(?:currently|which)\s+has\s+the\s+address\s+of`,
        String.raw`(?:street\s+address|situs\s+address|property\s+location|reported\s+address)`,
    ].join("|"),
    "gi"
);

// unanchored sweep: a full "123 STREET[, CITY], TX 7xxxx" anywhere in a line
// (catches law-firm slug lines "25-000143-365-3 // 17607 SAGEMONT ..." and
// standalone caption addresses that have no cue phrase at all)
const ADDR_ANY =
    /(?:^|[\s/])([0-9OolIiZzSsB]{1,7})\s+([A-Za-z][A-Za-z0-9'’. -]{2,59})[,.]?\s+(?:([A-Za-z .'’-]{2,30}?)[,.]\s*)?T[EI]?X[A-Za-z]*\.?,?\s*(7[\dOolIiZzSsB]{4})(?:-\d{2,4})?\b/i;

// A street line: house number (OCR-damaged digits allowed) + name. City/TX/zip
// optional -- many notices carry only the street line.
const ADDR_FULL =
    /^\W{0,4}([0-9OolIiZzSsB]{1,7})\s+([A-Za-z0-9'’. -]{3,60})[,.]?\s+(?:([A-Za-z .'’-]{2,30}?)[,.]\s*)?T[EI]?X[A-Za-z]*\.?,?\s*(7[\dOolIiZzSsB]{4})(?:-\d{2,4})?\b/i;
const ADDR_BARE = /^\W{0,4}([0-9OolIiZzSsB]{1,7})\s+([A-Za-z0-9'’. -]{4,60}?)\s*[,.]?\s*$/;

// "3206THEBES" -> "3206 THEBES": OCR drops the number/name space sometimes
const deglue = (s) => s.replace(/\b(\d{2,7})([A-Za-z]{3,})/g, "$1 $2");

function splitCity(street, city) {
    if (city) return { street, city };
    // "31710 CARLISLE COVE COURT FULSHEAR": cut the street at its last suffix
    // token; whatever follows is the city.
    const toks = street.split(/\s+/);
    for (let i = toks.length - 2; i > 0; i--) {
        if (SUFFIX[toks[i].toUpperCase().replace(/\W/g, "")])
            return { street: toks.slice(0, i + 1).join(" "), city: toks.slice(i + 1).join(" ") };
    }
    return { street, city: "" };
}

// "ELIZAMEADOWCOURT" -> "ELIZAMEADOW COURT": peel a glued suffix word off
// long tokens so the suffix-based street/city split and matching can work
const unglueSuffix = (street) =>
    street.replace(
        /([A-Za-z]{6,}?)(COURT|DRIVE|LANE|CIRCLE|STREET|ROAD|TRAIL|PLACE|BOULEVARD|PARKWAY|AVENUE|BLVD)\b/i,
        "$1 $2"
    );

function parseAddrLine(line) {
    const s = deglue(line.replace(/\s+/g, " ").trim());
    let m = s.match(ADDR_FULL);
    if (m) {
        const { street, city } = splitCity(unglueSuffix(m[2].trim()), (m[3] || "").trim());
        return { num: fixDigits(m[1]), street, city, zip: fixDigits(m[4]) };
    }
    m = s.match(ADDR_BARE);
    if (m && /[A-Za-z]{3}/.test(m[2]) && !/\b(PAGE|BLOCK|LOT|SECTION|VOLUME|ACRES|FEET|DEED|PLAT|COUNTY|CLERK|FILE|TRACT|SURVEY|ABSTRACT)\b/i.test(m[2]))
        return { num: fixDigits(m[1]), street: m[2].trim(), city: "", zip: "" };
    return null;
}

function validAddr(a) {
    return a && /^\d{1,6}$/.test(a.num) && /[A-Za-z]{3}/.test(a.street) && (!a.zip || /^7\d{4}$/.test(a.zip));
}

// Legal description: "LOT 6, BLOCK 9, HYMESA ESTATES PHASE ONE, CITY OF ..."
// or "Lot 14, Block 2, of TAMARRON WEST SECTION 4, a subdivision in ..." or
// spelled-out "LOT ONE HUNDRED THREE (103), IN BLOCK FOUR (4) OF X". Some law
// firms (Codilis & Moody notably) print NO street address at all -- the legal
// description is the only handle, and parcels.legal_description can match it.
const LEGAL_RE =
    /L[O0]TS?\s+(?:[A-Z\- ]{2,36}\(\s*)?(\d{1,4})\s*\)?\s*[,.]?\s*(?:IN\s+)?B[LI1][O0]CK\s+(?:[A-Z\- ]{2,30}\(\s*)?(\d{1,4}|[A-Z])\s*\)?\s*[,.]?\s*(?:[O0]F\s+)?([A-Z][A-Z0-9'&. -]{3,60}?)(?:\s*,|\s+A\s+SUBDIVISION|\s+AN\s+ADDITION|\s+ACC[O0]RDING|\s+CITY\s+[O0]F|\s+PLAT\b|\s+REC[O0]RDED|\s*\.(?:\s|$))/i;

// lines that carry party/venue addresses, not the property being sold
const PARTY_LINE = /trustee|servicer|mortgagee|attorney|law\s+firm|\bP\.?\s?C\.?\s*[,.]|\bLLP\b|\bPLLC\b|located\s+at|whose\s+address|c\/o\s|firm|bank|p\.?o\.?\s*box/i;

// Sweep one packet's text for property addresses. Two passes per page:
//   1) cue phrases ("Commonly known as", ...) with look-ahead for the value;
//   2) unanchored full-address sweep, zip-gated to the county and filtered
//      against party/venue lines (many notices only carry the address as a
//      caption or a law-firm slug line).
// Returns unique notices keyed by normalized street line (re-postings and
// duplicate cue hits collapse). cueMisses = cue phrases where no address
// could be validated nearby (the honesty number for OCR damage).
function parsePacket(text, { zipSet, citySet } = {}) {
    const pages = text.split("\f");
    const found = new Map();
    let cueHits = 0, cueMisses = 0;
    const add = (addr, pi, isTax, how) => {
        // property must be in-county: an out-of-county zip means we captured a
        // party (servicer/trustee/law-firm) address, not the property
        if (addr.zip && zipSet && !zipSet.has(addr.zip)) return;
        // "374 Stafford": a street that is just a city name is a parse artifact
        if (citySet && citySet.has(nameOnly(addr.street))) return;
        // "3905 FOXGLOVE KILLEEN": no suffix token to split on -- peel a known
        // city name off the street tail instead
        if (!addr.city && citySet) {
            const toks = addr.street.trim().split(/\s+/);
            for (let k = Math.min(3, toks.length - 1); k >= 1; k--) {
                const tail = toks.slice(-k).join(" ").toUpperCase().replace(/[^A-Z ]+/g, "");
                if (citySet.has(tail)) {
                    addr.city = tail;
                    addr.street = toks.slice(0, -k).join(" ");
                    break;
                }
            }
        }
        const key = `${addr.num} ${nameOnly(addr.street)}`;
        let n = found.get(key);
        if (!n) {
            n = {
                ...addr,
                key,
                normStreet: normStreet(addr.street),
                subtype: isTax ? "tax" : "mortgage",
                raw: `${addr.num} ${addr.street}${addr.city ? ", " + addr.city : ""}${addr.zip ? ", TX " + addr.zip : ""}`,
                found: how,
                pages: new Set(),
            };
            found.set(key, n);
        } else {
            if (!n.zip && addr.zip) Object.assign(n, { zip: addr.zip, city: addr.city || n.city });
            if (how === "cue") n.found = "cue";
        }
        n.pages.add(pi);
    };
    for (let pi = 0; pi < pages.length; pi++) {
        const lines = pages[pi].split("\n");
        const pageUp = pages[pi].toUpperCase();
        const isTax = /TAX\s+CODE|DELINQUENT\s+TAX(?:ES)?|TAX\s+FORECLOSURE|SEIZED\s+UNDER\s+A?\s*TAX\s+WARRANT/.test(pageUp);
        for (let li = 0; li < lines.length; li++) {
            CUES.lastIndex = 0;
            const cm = CUES.exec(lines[li]);
            if (cm) {
                cueHits++;
                const rest = lines[li].slice(cm.index + cm[0].length).replace(/^[\s:;,.\-_]+/, "");
                let addr = parseAddrLine(rest);
                // value continues on / lives on the next line(s)
                if ((!addr || (!addr.zip && !addr.city)) && li + 1 < lines.length) {
                    const joined = parseAddrLine(rest + " " + lines[li + 1].trim());
                    if (validAddr(joined) && joined.zip) addr = joined;
                }
                if (!validAddr(addr)) {
                    for (let k = 1; k <= 6 && li + k < lines.length; k++) {
                        const cand = parseAddrLine(lines[li + k]) ||
                            (li + k + 1 < lines.length ? parseAddrLine(lines[li + k].trim() + " " + lines[li + k + 1].trim()) : null);
                        if (validAddr(cand)) {
                            addr = cand;
                            break;
                        }
                    }
                }
                if (validAddr(addr)) {
                    add(addr, pi, isTax, "cue");
                    continue;
                }
                cueMisses++;
            }
            // pass 2: address-anywhere sweep, county-zip-gated
            if (PARTY_LINE.test(lines[li])) continue;
            const sm = deglue(lines[li].replace(/\s+/g, " ")).match(ADDR_ANY);
            if (!sm) continue;
            const { street, city } = splitCity(unglueSuffix(sm[2].trim()), (sm[3] || "").trim());
            const addr = { num: fixDigits(sm[1]), street, city, zip: fixDigits(sm[4]) };
            if (!validAddr(addr) || !addr.zip) continue;
            if (!zipSet) continue; // sweep only runs zip-gated (needs a DB conn)
            add(addr, pi, isTax, "sweep");
        }
    }
    // legal-description pass: only on pages that yielded NO street address
    // (a 2-page notice with legal on p1 + address on p2 resolves to the same
    // parcel and gets merged after matching)
    const addrPages = new Set([...found.values()].flatMap((n) => [...n.pages]));
    for (let pi = 0; pi < pages.length; pi++) {
        if (addrPages.has(pi)) continue;
        const flat = pages[pi].replace(/\s+/g, " ");
        const m = flat.match(LEGAL_RE);
        if (!m) continue;
        const lot = m[1].replace(/^0+/, ""), blk = m[2].replace(/^0+/, "");
        const subdiv = m[3]
            .replace(/^(?:OF|IN|THE)\s+/i, "")
            .toUpperCase()
            .replace(/['’]/g, "") // MORGAN'S -> MORGANS (DB drops the quote)
            .replace(/[^A-Z0-9 ]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!lot || !blk || !/[A-Z]{4}/.test(subdiv)) continue;
        // reject boilerplate captures ("...BLOCK 3, ... COUNTY, TEXAS")
        if (/^(COUNTY|CITY|TEXAS|STATE|SAID|BLOCK|PLAT|RECORDED|BELL|FORT|LOTS?)\b/.test(subdiv)) continue;
        const key = `L${lot} B${blk} ${subdiv.split(" ").slice(0, 2).join(" ")}`;
        const isTax = /TAX\s+CODE|DELINQUENT\s+TAX(?:ES)?|TAX\s+FORECLOSURE/i.test(pages[pi]);
        let n = found.get(key);
        if (!n) {
            n = {
                key,
                legal: { lot, blk, subdiv },
                subtype: isTax ? "tax" : "mortgage",
                raw: `Lot ${lot}, Block ${blk}, ${subdiv}`,
                found: "legal",
                pages: new Set(),
            };
            found.set(key, n);
        }
        n.pages.add(pi);
    }
    // FC_DEBUG=1: list notice-title pages that yielded no address (recall audit)
    if (process.env.FC_DEBUG) {
        const title = /^\s*NOTICE\s+OF\s+[A-Z'\s]{0,45}SALE\b/im;
        const got = new Set([...found.values()].flatMap((n) => [...n.pages]));
        const missed = pages.map((p, i) => (title.test(p) && !got.has(i) && !got.has(i + 1) ? i : -1)).filter((i) => i >= 0);
        if (missed.length) console.error(`    DEBUG title pages w/o address: ${missed.join(",")}`);
    }
    return { notices: [...found.values()], cueHits, cueMisses };
}

// ------------------------------------------------------------ parcel join --

// Gov-owned parcels (courthouse, county land, city lots, school/ISD, MUDs) are
// never foreclosure TARGETS -- when a notice's VENUE or foreclosing-PARTY
// address happens to match one, it's a false positive (batch 1-2 lesson:
// "ELLIS COUNTY OF" @ courthouse, "BEXAR COUNTY", "City of Katy"). Exclude them
// from every candidate pool so no county can ever surface one. The two-word
// civic phrases are specific enough to use as bare substrings (they don't hit
// "COUNTY LINE PROPERTIES LLC"); the short tokens ISD/MUD are space-guarded.
// NB: avoid Postgres \m/\M word-boundary escapes here -- verified they silently
// fail to match through parameter binding on this DB. Accepted tradeoff: a firm
// literally named "...CITY OFFICE LLC" is skipped (a rare missed lead, never a
// false courthouse foreclosure).
const GOV_OWNER =
    "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST)";

// Direct match: one batched query pulls every parcel in the county sharing a
// house number with any notice, then streets are compared in JS.
async function directMatch(c, fips, notices) {
    const nums = [...new Set(notices.filter((n) => n.num).map((n) => n.num))];
    if (!nums.length) return;
    const { rows } = await c.query(
        `SELECT id, situs_number, situs_street, situs_city, situs_zip, situs_address,
                ST_X(ST_PointOnSurface(geom)) lon, ST_Y(ST_PointOnSurface(geom)) lat
         FROM parcels
         WHERE county_fips=$1
           AND owner_name !~* $3
           AND regexp_replace(COALESCE(situs_number, split_part(situs_address,' ',1)),'\\D','','g') = ANY($2::text[])`,
        [fips, nums, GOV_OWNER]
    );
    const byNum = new Map();
    for (const r of rows) {
        // some counties only populate situs_address ("9019  WOODLEIGH DR,
        // HOUSTON, TX 77083") -- derive number + street from it (Bowie ships
        // NO situs_number/situs_street at all)
        if (!r.situs_number && r.situs_address) r.situs_number = r.situs_address.split(/[\s,]/)[0];
        if (!r.situs_street && r.situs_address)
            r.situs_street = r.situs_address.split(",")[0].trim().replace(/^\d[\w/-]*\s+/, "");
        const k = (r.situs_number || "").replace(/\D/g, "");
        if (!byNum.has(k)) byNum.set(k, []);
        byNum.get(k).push(r);
    }
    for (const n of notices) {
        if (!n.num) continue;
        const cands = byNum.get(n.num) || [];
        if (!cands.length) continue;
        const nFull = n.normStreet, nAll = normStreetAll(n.street), nName = nameOnly(n.street);
        let best = null, bestTier = 9;
        for (const cand of cands) {
            const cs = cand.situs_street || "";
            const cFull = normStreet(cs), cName = nameOnly(cs);
            let tier = 9;
            if (nFull && (nFull === cFull || nAll === normStreetAll(cs))) tier = 1;
            else if (nName && nName === cName) tier = 2;
            else if (nName && cName && levenshtein(nName, cName) <= (Math.min(nName.length, cName.length) >= 8 ? 2 : 1)) tier = 3;
            if (tier === 9) continue;
            // city/zip agreement breaks ties within a tier
            const bonus = (n.zip && n.zip === cand.situs_zip ? 0 : 0.2) + (n.city && cand.situs_city && n.city.toUpperCase() !== cand.situs_city.toUpperCase() ? 0.2 : 0);
            if (tier + bonus < bestTier) {
                bestTier = tier + bonus;
                best = cand;
            } else if (best && tier + bonus === bestTier && cand.id !== best.id) best = { ...best, ambiguous: true };
        }
        if (best && !best.ambiguous) {
            n.parcel_id = best.id;
            n.matched_situs = best.situs_address;
            n.lon = best.lon;
            n.lat = best.lat;
            n.match = bestTier < 2 ? "direct" : bestTier < 3 ? "direct_nosuffix" : "direct_fuzzy";
        }
    }
}

// Legal-description match for notices that carry no street address at all:
// anchor word from the subdivision + block + lot against parcels.legal_description
// (both Bell and Fort Bend store it as "SUBDIV ..., BLOCK n, LOT n").
async function legalMatch(c, fips, notices) {
    // OCR confuses single-letter blocks with digits (Block S vs 5, O vs 0)
    const CONFUSE = { O: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
    for (const n of notices) {
        if (n.parcel_id || !n.legal) continue;
        const { lot, blk, subdiv } = n.legal;
        let blkAlt = blk;
        if (CONFUSE[blk.toUpperCase()]) blkAlt = `(?:${blk}|${CONFUSE[blk.toUpperCase()]})`;
        // subdivision words can be OCR-damaged ("IDJNTERS GLEN") -- try each
        // usable word as the ILIKE anchor until something comes back
        const anchors = subdiv.split(" ").filter((w) => w.length >= 4).slice(0, 3);
        if (!anchors.length) continue;
        let rows = [];
        for (const anchor of anchors) {
            try {
                ({ rows } = await c.query(
                    `SELECT id, situs_address, legal_description,
                            ST_X(ST_PointOnSurface(geom)) lon, ST_Y(ST_PointOnSurface(geom)) lat
                     FROM parcels
                     WHERE county_fips=$1 AND legal_description ILIKE $2
                       AND legal_description ~* $3 AND legal_description ~* $4
                       AND owner_name !~* $5
                     ORDER BY id
                     LIMIT 6`,
                    [fips, `%${anchor}%`, `\\m(?:BLOCK|BLK)\\s*0*${blkAlt}\\M`, `\\m(?:LOT|LT)S?\\s*(?:PT\\s*)?0*${lot}\\M`, GOV_OWNER]
                ));
            } catch {
                continue; // hostile OCR chars in the anchor -> try the next word
            }
            if (rows.length) break;
        }
        if (!rows.length) continue;
        // disambiguate on subdivision similarity ("PHASE ONE" vs "PHASE TWO"
        // can share block+lot): normalized levenshtein on the legal prefix
        const score = (r) => {
            const dbSub = (r.legal_description || "").split(/,\s*(?:BLOCK|BLK)/i)[0].toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
            return levenshtein(subdiv, dbSub) / Math.max(subdiv.length, dbSub.length, 1);
        };
        rows.sort((a, b) => score(a) - score(b));
        const s0 = score(rows[0]);
        if (s0 > 0.5) continue; // verified against real mismatches ("CROSS ADDITION" -> "CROSSLAND ESTATES" scores 0.53)
        if (rows.length > 1 && score(rows[1]) - s0 < 0.05 && rows[1].id !== rows[0].id) continue; // ambiguous
        n.parcel_id = rows[0].id;
        n.matched_situs = rows[0].situs_address;
        n.lon = rows[0].lon;
        n.lat = rows[0].lat;
        n.match = "legal";
    }
}

// Census batch geocoder (free, no key) for whatever direct match missed.
// Census points are TIGER street-centerline interpolations -- they almost
// never fall INSIDE the parcel polygon, so instead of ST_Contains we take the
// nearby parcels (<=~60m) and verify house number / street name against the
// notice before accepting. Accuracy over recall: no verification, no match.
async function geocodeMatch(c, fips, notices) {
    const todo = notices.filter((n) => !n.parcel_id && n.num && (n.city || n.zip));
    if (!todo.length) return;
    const clean = (s) => s.replace(/["'.]/g, "").trim();
    const csv = todo.map((n, i) => `${i},"${n.num} ${clean(n.street)}","${clean(n.city)}",TX,${n.zip}`).join("\n");
    const fd = new FormData();
    fd.append("benchmark", "Public_AR_Current");
    fd.append("addressFile", new Blob([csv], { type: "text/csv" }), "batch.csv");
    let body;
    try {
        const r = await fetch("https://geocoding.geo.census.gov/geocoder/locations/addressbatch", {
            method: "POST",
            body: fd,
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(180000),
        });
        if (!r.ok) throw new Error(`census geocoder HTTP ${r.status}`);
        body = await r.text();
    } catch (e) {
        console.error(`  census geocoder failed (${e.message}) -- leaving ${todo.length} unmatched`);
        return;
    }
    const pts = [];
    for (const line of body.split("\n")) {
        // "id","input","Match","Exact|Non_Exact","matched addr","lon,lat",tiger,side
        const m = line.match(/^"?(\d+)"?,".*?","Match","(?:Exact|Non_Exact)","(.*?)","(-?[\d.]+),(-?[\d.]+)"/);
        if (m) pts.push({ i: +m[1], lon: +m[3], lat: +m[4], matched: m[2] });
    }
    if (!pts.length) return;
    const { rows } = await c.query(
        `SELECT g.i, p.id, p.situs_address, p.situs_number, p.situs_street,
                p.plon, p.plat
         FROM unnest($2::int[], $3::float8[], $4::float8[]) g(i,lon,lat)
         CROSS JOIN LATERAL (
            SELECT id, situs_address, situs_number, situs_street,
                   ST_X(ST_PointOnSurface(geom)) plon, ST_Y(ST_PointOnSurface(geom)) plat
            FROM parcels
            WHERE county_fips=$1
              AND owner_name !~* $5
              AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(g.lon,g.lat),4326), 0.0006)
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(g.lon,g.lat),4326)
            LIMIT 10
         ) p`,
        [fips, pts.map((p) => p.i), pts.map((p) => p.lon), pts.map((p) => p.lat), GOV_OWNER]
    );
    const byI = new Map();
    for (const r of rows) {
        if (!byI.has(r.i)) byI.set(r.i, []);
        byI.get(r.i).push(r);
    }
    for (const [i, cands] of byI) {
        const n = todo[i];
        for (const cand of cands) {
            if (!cand.situs_street && cand.situs_address)
                cand.situs_street = cand.situs_address.split(",")[0].trim().replace(/^\d[\w/-]*\s+/, "");
            const numOk = (cand.situs_number || "").replace(/\D/g, "") === n.num;
            const cName = nameOnly(cand.situs_street || ""), nName = nameOnly(n.street);
            const streetOk = cName && nName && (cName === nName || levenshtein(cName, nName) <= 2);
            if (numOk || streetOk) {
                n.parcel_id = cand.id;
                n.matched_situs = cand.situs_address;
                n.lon = cand.plon;
                n.lat = cand.plat;
                n.match = numOk ? "geocode" : "geocode_near";
                break;
            }
        }
    }
    // keep the raw point even when no nearby parcel verified
    for (const p of pts) if (!todo[p.i].parcel_id && todo[p.i].lon == null) Object.assign(todo[p.i], { lon: p.lon, lat: p.lat });
}

// ----------------------------------------------------------------- upsert --

async function upsert(c, source, fips, saleDt, notices) {
    const cols = { ref: [], ad: [], sb: [], pid: [], lo: [], la: [], mt: [] };
    for (const n of notices) {
        cols.ref.push(`${saleDt.slice(0, 7)}:${n.key}`);
        cols.ad.push(n.raw);
        cols.sb.push(n.subtype);
        cols.pid.push(n.parcel_id || null);
        cols.lo.push(n.lon ?? null);
        cols.la.push(n.lat ?? null);
        cols.mt.push(JSON.stringify({ city: n.city || null, zip: n.zip || null, packet: n.packet, match: n.match || null, legal: n.legal }));
    }
    await c.query("BEGIN");
    await c.query(
        `CREATE TEMP TABLE fc(source_ref text, address text, subtype text, parcel_id bigint, lon float8, lat float8, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO fc SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::bigint[],$5::float8[],$6::float8[],$7::text[]::jsonb[])`,
        [cols.ref, cols.ad, cols.sb, cols.pid, cols.lo, cols.la, cols.mt]
    );
    const { rows } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT fc.parcel_id, $2, 'pre_foreclosure', fc.subtype, $3::date, $1, fc.source_ref, fc.address, fc.lon, fc.lat, fc.meta
         FROM fc
         ON CONFLICT (source,signal_type,source_ref)
           DO UPDATE SET last_seen=current_date,
                         parcel_id=COALESCE(EXCLUDED.parcel_id, parcel_signals.parcel_id),
                         lon=COALESCE(EXCLUDED.lon, parcel_signals.lon),
                         lat=COALESCE(EXCLUDED.lat, parcel_signals.lat),
                         address=EXCLUDED.address, meta=EXCLUDED.meta
         RETURNING (xmax = 0) AS inserted`,
        [source, fips, saleDt]
    );
    await c.query("COMMIT");
    return rows.filter((r) => r.inserted).length;
}

// ------------------------------------------------------------------- main --

async function loadSource(c, name, cfg, parseOnly) {
    const packets = (await cfg.discover()).sort((a, b) => a.year - b.year || a.month - b.month);
    if (!packets.length) {
        console.log(`${name}: discovery found no packets -- clerk page layout may have changed`);
        return;
    }
    console.log(`${name}: ${packets.length} packet(s): ${packets.map((p) => p.name).join(", ")}`);
    // county zip set gates the sweep pass (property must be in-county);
    // available whenever we have a DB connection, incl. --parse-only runs.
    let zipSet = null, citySet = null;
    if (c) {
        const z = await c.query(
            `SELECT DISTINCT situs_zip FROM parcels WHERE county_fips=$1 AND situs_zip ~ '^7\\d{4}'`,
            [cfg.fips]
        );
        zipSet = new Set(z.rows.map((r) => r.situs_zip.slice(0, 5)));
        // some counties ship (nearly) no situs zips (Ector 0, Bowie 14): an
        // empty gate would reject EVERY zip-bearing address -> disable gating
        // (which also disables the sweep pass; cue + legal still run)
        if (zipSet.size < 5) zipSet = null;
        const ct = await c.query(
            `SELECT DISTINCT upper(situs_city) city FROM parcels WHERE county_fips=$1 AND situs_city IS NOT NULL`,
            [cfg.fips]
        );
        citySet = new Set(ct.rows.map((r) => r.city.trim()));
    }
    // group packets by sale month (Bell posts many small PDFs per month)
    const byMonth = new Map();
    for (const p of packets) {
        const k = `${p.year}-${String(p.month).padStart(2, "0")}`;
        if (!byMonth.has(k)) byMonth.set(k, []);
        byMonth.get(k).push(p);
    }
    for (const [monthKey, group] of byMonth) {
        const dt = saleDate(group[0].year, group[0].month);
        const merged = new Map();
        let cueHits = 0, cueMisses = 0;
        for (const p of group) {
            let file, text;
            try {
                file = await fetchPdf(p.url, p.name);
                text = extractText(file);
            } catch (e) {
                console.error(`  ${p.name}: FAILED (${e.message})`);
                continue;
            }
            const res = parsePacket(text, { zipSet, citySet });
            cueHits += res.cueHits;
            cueMisses += res.cueMisses;
            for (const n of res.notices) {
                n.packet = p.name;
                const prev = merged.get(n.key);
                if (!prev) merged.set(n.key, n);
                else {
                    for (const pg of n.pages) prev.pages.add(`${p.name}:${pg}`);
                    if (prev.found !== "cue" && n.found === "cue") prev.found = "cue";
                }
            }
        }
        let notices = [...merged.values()];
        // boilerplate filter: the sale VENUE ("1521 Eugene Heimann Circle...")
        // shows up on nearly every page; real property addresses on 1-3.
        // Applies to sweep finds only + explicit per-county venue regex. The
        // venue regex tests the full raw line (number+street+city) so it can
        // pin to the venue's house number ("211 W Court St" is the Guadalupe
        // Justice Center; "961 W Court St" is a real property).
        const before = notices.length;
        notices = notices.filter(
            (n) => !(n.found === "sweep" && n.pages.size >= 6) && !(cfg.venue && n.street && cfg.venue.test(n.raw))
        );
        const boiler = before - notices.length;
        console.log(
            `  ${monthKey} (sale ${dt}): ${notices.length} notices ` +
            `(${notices.filter((n) => n.found === "cue").length} cue / ${notices.filter((n) => n.found === "sweep").length} sweep / ` +
            `${notices.filter((n) => n.found === "legal").length} legal-only; ` +
            `${cueMisses}/${cueHits + cueMisses} cue misses; ${boiler} boilerplate dropped)`
        );
        if (!notices.length) continue;
        if (parseOnly) {
            for (const n of notices.slice(0, 12)) console.log(`    [${n.found}] ${n.raw}`);
            continue;
        }
        await directMatch(c, cfg.fips, notices);
        await geocodeMatch(c, cfg.fips, notices);
        await legalMatch(c, cfg.fips, notices);
        // two OCR spellings of one street can land on the same parcel: keep one
        const seen = new Map();
        notices = notices.filter((n) => {
            if (!n.parcel_id) return true;
            if (seen.has(n.parcel_id)) return false;
            seen.set(n.parcel_id, n);
            return true;
        });
        const inserted = await upsert(c, name, cfg.fips, dt, notices);
        const direct = notices.filter((n) => n.match?.startsWith("direct")).length;
        const geo = notices.filter((n) => n.match?.startsWith("geocode")).length;
        const leg = notices.filter((n) => n.match === "legal").length;
        console.log(
            `    matched ${direct + geo + leg}/${notices.length} (${direct} direct, ${geo} geocode, ${leg} legal) -> upserted ${notices.length} rows (${inserted} new)`
        );
        for (const n of notices.filter((x) => x.parcel_id).slice(0, 5))
            console.log(`      ${n.raw}  ->  ${n.matched_situs} [${n.match}]`);
        const misses = notices.filter((x) => !x.parcel_id);
        if (misses.length) console.log(`    unmatched: ${misses.map((n) => n.raw).slice(0, 8).join(" | ")}`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const parseOnly = args.includes("--parse-only");
    const want = args.filter((a) => !a.startsWith("--"));
    const names = want.length ? want : Object.keys(SOURCES);
    let c = null;
    if (!parseOnly && !process.env.DATABASE_URL) throw new Error("DATABASE_URL required (or use --parse-only)");
    if (process.env.DATABASE_URL) {
        // connect even for --parse-only when we can: the county zip set
        // (read-only query) gates the sweep pass against party addresses
        c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 180000, keepAlive: true });
        await c.connect();
    }
    for (const name of names) {
        const cfg = SOURCES[name];
        if (!cfg) {
            console.log(`unknown source: ${name} (have: ${Object.keys(SOURCES).join(", ")})`);
            continue;
        }
        try {
            await loadSource(c, name, cfg, parseOnly);
        } catch (e) {
            console.error(`${name} FAILED:`, e.message);
        }
    }
    if (c) await c.end();
}

main();
