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
import { fileURLToPath } from "node:url";
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
    // Wise County clerk (CivicPlus Archive.aspx): ONE packet per sale month at
    // Archive.aspx?ADID=<id>, anchor text "<Month> <Year> Foreclosure Notice(s)
    // (PDF)". Image-only -> OCR. Venue (courthouse, gov-owned) dropped by GOV_OWNER.
    wise_cc: {
        fips: "48497",
        discover: async () => {
            const html = await fetchText("https://www.co.wise.tx.us/Archive.aspx?AMID=36");
            const out = [];
            for (const m of html.matchAll(/href="(Archive\.aspx\?ADID=(\d+))"[\s\S]{0,140}?<span>\s*([A-Za-z]+)\s+(\d{4})\s+Foreclosure/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://www.co.wise.tx.us/").href,
                    year: +m[4],
                    month: mon,
                    name: `wise_${m[4]}-${String(mon).padStart(2, "0")}_ADID${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Andrews County clerk (CivicPlus DocumentCenter): the /186/ page lists the
    // last ~90 days as per-notice PDFs /DocumentCenter/View/<id>/<Month>-<Year>-<N>pdf
    // ("August-2026-7pdf"). Text/OCR. Rural, low volume; many PDFs per month.
    andrews_cc: {
        fips: "48003",
        discover: async () => {
            const html = await fetchText("https://www.co.andrews.tx.us/186/Notice-of-Trustee-Sales");
            const out = [];
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/(\d+)\/([A-Za-z]+)-(\d{4})-\d+pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://www.co.andrews.tx.us/").href,
                    year: +m[4],
                    month: mon,
                    name: `andrews_${m[4]}-${String(mon).padStart(2, "0")}_${m[2]}.pdf`,
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
    // Dallas County clerk (custom PHP site): foreclosures.php links a per-city
    // PDF tree (/department/countyclerk/media/foreclosure/<Month>/<City>_<n>.pdf,
    // folder = SALE month, no year -> near-future roll like Bell). Good embedded
    // OCR text layer. NB: notices FILED on/after 2026-02-24 moved to Kofile/GovOS
    // PublicSearch (dallas.tx.publicsearch.us -- the parked platform crack), so
    // this tree ends at the May-2026 sale month; run with FC_BACK=4 to sweep the
    // remaining backlog. Keep the entry: cheap to re-check monthly in case the
    // clerk resumes posting PDFs.
    dallas_cc: {
        fips: "48113",
        // sale venue: north side of the George Allen Courts Building,
        // 600 Commerce St, Dallas (number-pinned; Commerce St has real homes)
        venue: /GEORGE\s+ALLEN|\b600\s+COMMERCE\b/i,
        discover: async () => {
            const base = "https://www.dallascounty.org";
            const html = await fetchText(base + "/government/county-clerk/foreclosures.php");
            const now = new Date();
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/department\/countyclerk\/media\/foreclosure\/([A-Za-z]+)\/([^"]+\.pdf))"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon) continue;
                // folder carries no year: sale months are near-future
                let year = now.getFullYear();
                if (mon - (now.getMonth() + 1) < -6) year += 1;
                if (!inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `dallas_${year}-${String(mon).padStart(2, "0")}_${decodeURIComponent(m[3]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Williamson County clerk (apps.wilco.org, Oracle Portal-era app iframed
    // into wilcotx.gov/308/Foreclosure-Trustee-Sales): /countyclerk/
    // trustee_sales/ is a 12-month calendar, anchor text "July 7, 2026" (sale
    // date WITH year); each month links <Month>/files.aspx listing ~100
    // per-notice scanned PDFs named <filed MM-DD-YYYY>_File_<nnn>.pdf (skip
    // the _File_IDX.pdf index). Image-only, NO text layer -> tesseract OCR.
    // The calendar recycles: stale months keep last year's files, so gate on
    // filed-date distance from the sale month.
    williamson_cc: {
        fips: "48491",
        // sale venue: Williamson County Justice Center, 405 MLK St (also
        // "Martin Luther King"), Georgetown
        venue: /JUSTICE\s+CENTER|\b405\s+(?:M\.?\s*L\.?\s*K|MARTIN\s+LUTHER\s+KING)/i,
        discover: async () => {
            const base = "https://apps.wilco.org/countyclerk/trustee_sales/";
            const cal = await fetchText(base);
            const out = [];
            for (const m of cal.matchAll(/href="([A-Za-z]+)\/files\.aspx"[^>]*>\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[3];
                if (!mon || !inWindow(year, mon)) continue;
                let idx;
                try {
                    idx = await fetchText(`${base}${m[1]}/files.aspx`);
                } catch (e) {
                    console.error(`  williamson ${m[1]}: index fetch failed (${e.message})`);
                    continue;
                }
                for (const f of idx.matchAll(/HREF="((\d{2})-\d{2}-(\d{4})_File_(\d+)\.pdf)"/gi)) {
                    // filed date must sit 0..4 months before the sale month,
                    // else it's last year's leftover on a recycled month page
                    const d = (year - +f[3]) * 12 + (mon - +f[2]);
                    if (d < 0 || d > 4) continue;
                    out.push({
                        url: `${base}${m[1]}/${f[1]}`,
                        year,
                        month: mon,
                        name: `williamson_${year}-${String(mon).padStart(2, "0")}_${f[1]}`,
                    });
                }
            }
            return out;
        },
    },
    // Harris County clerk (cclerk.hctx.net, classic ASP.NET WebForms):
    // FRCL_R.aspx is a GridView search by sale month -- rows carry NO address
    // column (Doc ID / SaleDate / FileDate / Pgs only), but each Doc ID links
    // ViewECdocs.aspx?ID=<token> which streams the per-notice PDF directly,
    // no login/CAPTCHA/cookie. The PDFs are render-on-the-fly scans that
    // pdftotext reads as EMPTY, yet they embed the recorder's own OCR text
    // layer, which the pdf_ocr_text.py helper path picks up fast (~1s/doc).
    // Dance (event validation forces the order): GET (cookies+viewstate) ->
    // __doPostBack ddlYear (registers that year's month options) -> btnSearch
    // per sale month -> walk the pager (Page$N postbacks, ~40 rows/page).
    // One "packet" per notice PDF, like lubbock/williamson. Harris is the
    // biggest TX county: expect 400+ docs per sale month (first full run is
    // slow; PDF+text caching makes re-runs incremental).
    harris_cc: {
        fips: "48201",
        // sale venue: Bayou City Event Center, Magnolia South Ballroom,
        // 9401 Knight Rd, Houston (older notices: Family Law Center,
        // 1115 Congress / 1001 Preston)
        venue: /BAYOU\s*C\S{0,3}TY|9401\s*KN[Il1]GHT|MAGNOL\w*\s+SOUTH|1115\s+CONGRESS|1001\s+PRESTON/i,
        discover: async () => {
            const page = "https://www.cclerk.hctx.net/Applications/WebSearch/FRCL_R.aspx";
            const P = "ctl00$ContentPlaceHolder1$";
            let cookie = "";
            const call = async (form) => {
                const r = await fetch(page, {
                    method: form ? "POST" : "GET",
                    headers: {
                        "User-Agent": UA,
                        ...(cookie ? { Cookie: cookie } : {}),
                        ...(form ? { "Content-Type": "application/x-www-form-urlencoded", Referer: page } : {}),
                    },
                    body: form ? new URLSearchParams(form).toString() : undefined,
                    signal: AbortSignal.timeout(20000),
                    redirect: "follow",
                });
                for (const sc of r.headers.getSetCookie?.() || []) {
                    const kv = sc.split(";")[0], nm = kv.split("=")[0] + "=";
                    cookie = [...cookie.split("; ").filter((x) => x && !x.startsWith(nm)), kv].join("; ");
                }
                if (!r.ok) throw new Error(`FRCL_R.aspx -> HTTP ${r.status}`);
                return r.text();
            };
            const hidden = (html) => {
                const h = {};
                for (const m of html.matchAll(/<input type="hidden" name="([^"]+)"[^>]*value="([^"]*)"/g))
                    h[m[1]] = m[2].replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
                return h;
            };
            const form = (html, extra) => ({
                ...hidden(html),
                __EVENTTARGET: "",
                __EVENTARGUMENT: "",
                __LASTFOCUS: "",
                [P + "txtFileNo"]: "",
                [P + "rbtlDate"]: "SaleDate",
                ...extra,
            });
            // candidate sale months = the same window inWindow() enforces
            const now = new Date(), months = [];
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                months.push({ year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 });
            }
            const out = [], seen = new Set();
            let html = await call();
            let boundYear = null;
            for (const { year, month } of months) {
                if (year !== boundYear) {
                    html = await call(form(html, { __EVENTTARGET: P + "ddlYear", [P + "ddlYear"]: String(year), [P + "ddlMonth"]: "Select -" }));
                    boundYear = year;
                }
                if (!new RegExp(`<select name="ctl00\\$ContentPlaceHolder1\\$ddlMonth"[\\s\\S]*?value="${month}"`).test(html))
                    continue; // month not offered for that year (no filings yet)
                html = await call(form(html, { [P + "ddlYear"]: String(year), [P + "ddlMonth"]: String(month), [P + "btnSearch"]: "Search" }));
                for (let pg = 1; pg < 100; pg++) {
                    if (pg > 1) {
                        if (!html.includes(`Page$${pg}`)) break;
                        html = await call(form(html, {
                            __EVENTTARGET: P + "GridView1",
                            __EVENTARGUMENT: `Page$${pg}`,
                            [P + "ddlYear"]: String(year),
                            [P + "ddlMonth"]: String(month),
                        }));
                    }
                    let got = 0;
                    for (const m of html.matchAll(/ViewECdocs\.aspx\?ID=([^"]+)"[^>]*>(FRCL-\d{4}-\d+)</g)) {
                        const name = `harris_${year}-${String(month).padStart(2, "0")}_${m[2]}.pdf`;
                        if (seen.has(name)) continue;
                        seen.add(name);
                        out.push({
                            url: "https://www.cclerk.hctx.net/Applications/WebSearch/ViewECdocs.aspx?ID=" + encodeURIComponent(m[1]),
                            year,
                            month,
                            name,
                        });
                        got++;
                    }
                    if (!got) break; // "no records" month / stale pager
                }
            }
            return out;
        },
    },
    // Wood County clerk (CivicLive, mywoodcounty.com): /page/cc_foreclosure
    // links one or more packets per sale month at /upload/page/0074/
    // "<Month> <Year> Foreclosure[s] [N].pdf".
    wood_cc: {
        fips: "48499",
        // sale venue: Wood County Courthouse, 100 S Main St, Quitman
        // (number-pinned: Main St has real properties)
        venue: /COURT\s*HOUSE|\b10[0O]\s+S(?:OUTH)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.mywoodcounty.com";
            const html = await fetchText(base + "/page/cc_foreclosure");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/\d+\/([A-Za-z]+)\s+(\d{4})\s+Foreclosure[^"]*\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[3],
                    month: mon,
                    name: `wood_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Upshur County clerk (own IIS/ASP directory on records.countyofupshur.com,
    // "Integrated Data Services" footer): /countyclerk/foreclosures/
    // listDocs-new.asp?year=<Y> lists per-notice docs showdoc.asp?year=<Y>&
    // docName=<YYYY-MM-DD>-foreclosure-<NN>.pdf -- the docName date IS the
    // sale date. showdoc.asp is an HTML <object> viewer; the raw PDF lives at
    // LinkedDir/<year>/<docName>. HTTP only (no TLS on the records host).
    upshur_cc: {
        fips: "48459",
        // sale venue: Upshur County Justice Center, 405 N Titus St, Gilmer
        venue: /JUSTICE\s*CENTER|\b4[0O]5\s+N(?:ORTH)?\.?\s*TITUS/i,
        discover: async () => {
            const base = "http://records.countyofupshur.com/countyclerk/foreclosures/";
            // years covered by the discovery window (Nov/Dec runs roll into Jan)
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}listDocs-new.asp?year=${y}`);
                } catch (e) {
                    console.error(`  upshur ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/href=\s*"?showdoc\.asp\?year=\d+&(?:amp;)?docName=(((\d{4})-(\d{2})-\d{2})[^"'& ]*\.pdf)/gi)) {
                    const year = +m[3], mon = +m[4];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({
                        url: `${base}LinkedDir/${y}/${m[1]}`,
                        year,
                        month: mon,
                        name: `upshur_${m[1]}`,
                    });
                }
            }
            return out;
        },
    },
    // Angelina County clerk (WordPress, angelinacounty.net): trustee-sale
    // notices are calendar EVENTS (/events/notice-of-...-N/); each event page
    // links per-notice PDFs under /files/pdf/sales/<MMDDYY>/ where the MMDDYY
    // folder IS the sale date. Events listing shows current/upcoming sales only.
    angelina_cc: {
        fips: "48005",
        // sale venue: 211 East Shepherd Ave, Lufkin (OCR: "21 I East
        // Shepherd", "Lufldn"); number-pinned
        venue: /COURT\s*HOUSE|\b21\s?[1Il]?\s+E(?:AST)?\.?\s*SHEPHERD/i,
        discover: async () => {
            const base = "https://www.angelinacounty.net";
            const html = await fetchText(base + "/events/");
            const evs = new Set();
            for (const m of html.matchAll(/href="(?:https?:\/\/www\.angelinacounty\.net)?(\/events\/notice-of-[^"]*(?:trustee|foreclosure)[^"]*\/)"/gi))
                evs.add(m[1]);
            const out = [], seen = new Set();
            for (const ev of evs) {
                let page;
                try {
                    page = await fetchText(base + ev);
                } catch (e) {
                    console.error(`  angelina ${ev}: event fetch failed (${e.message})`);
                    continue;
                }
                for (const f of page.matchAll(/href="(?:https?:\/\/www\.angelinacounty\.net)?(\/files\/pdf\/sales\/(\d{2})(\d{2})(\d{2})\/[^"]+\.pdf)"/gi)) {
                    const mon = +f[2], year = 2000 + +f[4];
                    if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(f[1])) continue;
                    seen.add(f[1]);
                    out.push({
                        url: base + encodeURI(f[1]),
                        year,
                        month: mon,
                        name: `angelina_${year}-${String(mon).padStart(2, "0")}_${path.basename(f[1]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Van Zandt County clerk (CivicLive, vanzandtcounty.org): /page/
    // vanzandt.Foreclosures lists YEARS of per-notice scans under
    // /upload/page/2713/...; file/folder names are chaotic ("7.7.26_4.pdf",
    // "august_420263.pdf") but the anchor TEXT carries the sale date
    // ("July,7, 2026" / "September 1, 2026"). Trustee's-DEED scans (post-sale
    // paperwork) share the list -- skip on filename.
    vanzandt_cc: {
        fips: "48467",
        // sale venue: Van Zandt County Courthouse, 121 E Dallas St, Canton
        venue: /COURT\s*HOUSE|\b12[1Il]\s+E(?:AST)?\.?\s*DALLAS\b/i,
        discover: async () => {
            const base = "https://www.vanzandtcounty.org";
            const html = await fetchText(base + "/page/vanzandt.Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/2713\/[^"]+\.pdf)"[^>]*>(?:\s|<[^>]+>)*([A-Za-z]+)[,.\s]+\d{1,2}[,.\s]+\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon) || /deed/i.test(m[1]) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[3],
                    month: mon,
                    name: `vanzandt_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Panola County clerk (CivicPlus ArchiveCenter): Archive.aspx?AMID=39
    // ("Foreclosures") lists per-notice scans at Archive.aspx?ADID=<id>,
    // anchor text "Trustee's Sale - July 7, 2026" / "Foreclosure Sale -
    // May 5, 2026" (sale date WITH year).
    panola_cc: {
        fips: "48365",
        // sale venue: Panola County Courthouse, 110 S Sycamore St, Carthage
        // (OCR: "1 IO S. Sycamore"; number-pinned)
        venue: /COURT\s*HOUSE|\b1\s?[1IL][0O]?\s+S(?:OUTH)?\.?\s*SYCAMORE/i,
        discover: async () => {
            const html = await fetchText("https://www.co.panola.tx.us/Archive.aspx?AMID=39");
            const out = [];
            for (const m of html.matchAll(/href="(Archive\.aspx\?ADID=(\d+))"[\s\S]{0,160}?(?:Trustee|Foreclosure)[^<>]{0,6}Sale\s*-\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[4], mon)) continue;
                out.push({
                    url: new URL(m[1], "https://www.co.panola.tx.us/").href,
                    year: +m[4],
                    month: mon,
                    name: `panola_${m[4]}-${String(mon).padStart(2, "0")}_ADID${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Henderson County clerk (Granicus govAccess, henderson-county.com --
    // the Akamai front 403s curl, but plain Node fetch passes): /departments/
    // county-clerk/county-clerk-foreclosure-sales-listings links ONE packet
    // per sale month at /home/showpublisheddocument/<id>/<ticks>, anchor text
    // "<Month> <Year>".
    henderson_cc: {
        fips: "48213",
        // sale venue: Henderson County Courthouse, 100 E Tyler St, Athens
        venue: /COURT\s*HOUSE|\b10[0O]\s+E(?:AST)?\.?\s*TYLER\b/i,
        discover: async () => {
            const base = "https://www.henderson-county.com";
            const html = await fetchText(base + "/departments/county-clerk/county-clerk-foreclosure-sales-listings");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/home\/showpublisheddocument\/\d+\/\d+)"[^>]*>(?:\s|<[^>]+>)*([A-Za-z]+)\s+(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                const name = `henderson_${m[3]}-${String(mon).padStart(2, "0")}.pdf`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + m[1], year: +m[3], month: mon, name });
            }
            return out;
        },
    },
    // Navarro County clerk (easydocs.us -- Integrated Data Services, the SAME
    // vendor/app as Upshur's records site): /foreclosures/listDocs-new.asp?
    // year=<Y> lists per-notice docs showdoc.asp?docName=<YYYY-MM-DD>-
    // foreclosures-<YYYY>-<NNN>.pdf. Unlike Upshur, the docName date is the
    // POSTING date (spread across the month, not first-Tuesdays) -> sale
    // month = earliest legal sale via saleMonthAfter (+21d, Prop. Code
    // 51.002). Raw PDF at LinkedDir/<year>/<docName>.
    navarro_cc: {
        fips: "48349",
        // sale venue: Navarro County Courthouse, 300 W 3rd Ave, Corsicana
        venue: /COURT\s*HOUSE|\b3[0O][0O]\s+W(?:EST)?\.?\s*3RD\b/i,
        discover: async () => {
            const base = "https://navarro.easydocs.us/foreclosures/";
            const now = new Date(), years = new Set();
            // -1 extra month back: December postings roll into January sales
            for (let d = -(+(process.env.FC_BACK || 0)) - 1; d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}listDocs-new.asp?year=${y}`);
                } catch (e) {
                    console.error(`  navarro ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/docName=((\d{4})-(\d{2})-(\d{2})-foreclosures-[^"'&<> ]*\.pdf)/gi)) {
                    const s = saleMonthAfter(+m[2], +m[3], +m[4]);
                    if (!inWindow(s.year, s.month)) continue;
                    out.push({ url: `${base}LinkedDir/${m[2]}/${m[1]}`, year: s.year, month: s.month, name: `navarro_${m[1]}` });
                }
            }
            return out;
        },
    },
    // Bosque County clerk (easydocs/Integrated Data Services app on a BARE IP
    // -- http://107.143.183.49/foreclosure/, linked "Foreclosure Notices
    // (Online)" from bosquecounty.gov/171/County-Clerk): view.asp?year=<Y>
    // lists showdoc.asp?docName=<YYYY-MM-DD>-foreclosure-<NNN>.pdf where the
    // docName date IS the sale date (verified: all first-Tuesdays), like
    // Upshur. Raw PDF at LinkedDir/<year>/<docName>. HTTP only. NB: parcels
    // for 48035 ship NO situs_zip -> sweep pass disabled, cue+legal carry it.
    bosque_cc: {
        fips: "48035",
        // sale venue: Bosque County Courthouse, 110 S Main St, Meridian
        venue: /COURT\s*HOUSE|\b11[0O]\s+S(?:OUTH)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "http://107.143.183.49/foreclosure/";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}view.asp?year=${y}`);
                } catch (e) {
                    console.error(`  bosque ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/docName=(((\d{4})-(\d{2})-\d{2})[^"'&<> ]*\.pdf)/gi)) {
                    const year = +m[3], mon = +m[4];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({ url: `${base}LinkedDir/${y}/${m[1]}`, year, month: mon, name: `bosque_${m[1]}` });
                }
            }
            return out;
        },
    },
    // Hill County clerk (CivicLive, co.hill.tx.us): /page/hill.Foreclosures
    // holds per-year accordions; inside, <strong>/<h2> SALE-DATE headings
    // ("September 1, 2026") each followed by that sale's per-notice PDFs
    // under /upload/page/10297/ (a few links point at the CivicLive origin
    // newtools.cira.state.tx.us -- same paths serve from the county host).
    // Sequential heading->links scan buckets each PDF to its sale month.
    hill_cc: {
        fips: "48217",
        // sale venue: Hill County Courthouse, 1 N Waco St, Hillsboro
        venue: /COURT\s*HOUSE|\b[1Il]\s+N(?:ORTH)?\.?\s*WACO\b/i,
        discover: async () => {
            const base = "https://www.co.hill.tx.us";
            const html = await fetchText(base + "/page/hill.Foreclosures");
            const re = /:?>\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})\b|href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/10297\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    if (mon) cur = { year: +m[2], month: mon };
                } else if (cur && inWindow(cur.year, cur.month)) {
                    // cira-hosted copies of a link come PRE-encoded ("%20") --
                    // decode first so (a) encodeURI doesn't double-encode to
                    // %2520 (404) and (b) the dedupe key matches the plain copy
                    let p = m[3];
                    try {
                        if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                    } catch { /* malformed % -- keep raw */ }
                    if (seen.has(p)) continue;
                    seen.add(p);
                    out.push({
                        url: base + encodeURI(p),
                        year: cur.year,
                        month: cur.month,
                        name: `hill_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Coryell County clerk (WordPress/Elementor on its OWN domain,
    // coryellcountyclerk.com -- the county's Revize site just links out):
    // per-sale-month pages /<month>-<year>-fcs/ list per-notice PDFs in
    // wp-content/uploads/<posted Y>/<posted M>/; filenames are the address/
    // legal. The nav menu embeds evergreen form/fee PDFs on EVERY page ->
    // filter by upload-year recency + junk keywords.
    coryell_cc: {
        fips: "48099",
        // sale venue: Coryell County Courthouse, 620 E Main St, Gatesville
        venue: /COURT\s*HOUSE|\b62[0O]\s+E(?:AST)?\.?\s*MAIN\b/i,
        discover: async () => {
            const FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
            const now = new Date(), out = [], seen = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                const year = t.getUTCFullYear(), mon = t.getUTCMonth() + 1;
                let html;
                try {
                    html = await fetchText(`https://coryellcountyclerk.com/${FULL[mon - 1]}-${year}-fcs/`);
                } catch {
                    continue; // month page not created yet
                }
                for (const m of html.matchAll(/href="(https:\/\/coryellcountyclerk\.com\/wp-content\/uploads\/(\d{4})\/\d{2}\/([^"]+\.pdf))"/gi)) {
                    if (+m[2] < year - 1) continue; // old upload = nav boilerplate
                    if (/holiday|fee|request|order|checklist|affidavit|financial|budget|agenda|minute|accounting|report/i.test(m[3])) continue;
                    const name = `coryell_${year}-${String(mon).padStart(2, "0")}_${m[3].replace(/[^\w.-]+/g, "_")}`;
                    if (seen.has(name)) continue;
                    seen.add(name);
                    out.push({ url: m[1], year, month: mon, name });
                }
            }
            return out;
        },
    },
    // Lampasas County clerk (CivicLive): the notices live on /page/
    // lampasas.ForeclosureSaleSite (linked "Foreclosure Sale Site" from the
    // clerk page; PublicNotices has none) -- ONE consolidated packet per sale
    // month at /upload/page/6696/"<Month> [26] Sale <N>.pdf", anchor text =
    // sale date WITH year ("July 7, 2026"). A rare second packet with an
    // EMPTY anchor is skipped (no date to bucket it by).
    lampasas_cc: {
        fips: "48281",
        // sale venue: Lampasas County Courthouse, 501 E 4th St, Lampasas
        venue: /COURT\s*HOUSE|\b5[0O][1Il]\s+E(?:AST)?\.?\s*4TH\b/i,
        discover: async () => {
            const base = "https://www.co.lampasas.tx.us";
            const html = await fetchText(base + "/page/lampasas.ForeclosureSaleSite");
            const out = [];
            for (const m of html.matchAll(/href="(\/upload\/page\/6696\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[3],
                    month: mon,
                    name: `lampasas_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Burnet County clerk (CivicLive): /page/cclerk.foreclose lists bare
    // month-name headings ("August") each followed by that sale month's
    // per-notice PDFs under /upload/page/0085/ (chaotic filenames; the /docs/
    // subfolder is clerk boilerplate, not notices). Headings carry NO year ->
    // near-future roll like Bell. Case-SENSITIVE month tokens (prose "may"
    // must not match).
    burnet_cc: {
        fips: "48053",
        // sale venue: area outside the County Clerk's office, 220 S Pierce
        // St, Burnet (east side of the courthouse) -- number-pinned
        venue: /COURT\s*HOUSE|\b22[0O]\s+S(?:OUTH)?\.?\s*PIERCE\b/i,
        discover: async () => {
            const base = "https://www.burnetcountytexas.org";
            const html = await fetchText(base + "/page/cclerk.foreclose");
            const re = />\s*(January|February|March|April|May|June|July|August|September|October|November|December)(?:&nbsp;|\s)*<|href="(\/upload\/page\/0085\/[^"]+\.pdf)"/g;
            const now = new Date();
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    let year = now.getFullYear();
                    if (mon - (now.getMonth() + 1) < -6) year += 1;
                    cur = { year, month: mon };
                } else if (cur && !/\/docs\//.test(m[2]) && inWindow(cur.year, cur.month) && !seen.has(m[2])) {
                    seen.add(m[2]);
                    out.push({
                        url: base + encodeURI(m[2]),
                        year: cur.year,
                        month: cur.month,
                        name: `burnet_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(m[2]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Milam County clerk (Revize, like Bell -- site-root <base href>):
    // foreclosures.php lists per-notice PDFs, current ones straight off the
    // web root ("NOTICE OF TRUSTEE SALE 07-07-2026.pdf?t=<upload stamp>").
    // Sale month from the filename's M-D-Y(YYY) date when present, else
    // projected from the ?t= upload date via saleMonthAfter (+21d).
    milam_cc: {
        fips: "48331",
        // sale venue: Milam County Courthouse, 102 S Fannin Ave, Cameron
        venue: /COURT\s*HOUSE|\b1[0O]2\s+S(?:OUTH)?\.?\s*FANNIN\b/i,
        discover: async () => {
            const base = "https://www.milamcounty.net/"; // <base href> = site root
            const html = await fetchText(base + "government/county_clerk/foreclosures.php");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="([^"]*\.pdf)\?t=(\d{4})(\d{2})(\d{2})(\d*)"/gi)) {
                if (!/foreclos|trustee/i.test(m[1])) continue;
                const fn = path.basename(m[1]);
                let year, mon;
                const fd = fn.match(/\b(\d{1,2})[-.](\d{1,2})[-.](\d{2,4})\b/);
                if (fd && +fd[1] >= 1 && +fd[1] <= 12) {
                    mon = +fd[1];
                    year = +fd[3] < 100 ? 2000 + +fd[3] : +fd[3];
                } else {
                    ({ year, month: mon } = saleMonthAfter(+m[2], +m[3], +m[4]));
                }
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                const name = `milam_${year}-${String(mon).padStart(2, "0")}_${fn.replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: new URL(encodeURI(m[1]), base).href + `?t=${m[2]}${m[3]}${m[4]}${m[5]}`, year, month: mon, name });
            }
            return out;
        },
    },
    // Freestone County clerk (CivicLive): the notices sit ON the clerk page
    // itself (/page/freestone.county.clerk), per-notice PDFs under
    // /upload/page/1887/, anchor text carries the sale date ("Notice of
    // Trustee Sales/Foreclosures - August 4, 2026 #2603756"; ordinals and
    // spacing drift). Past years live on freestone.Foreclosures.Previous.Years
    // (ignored -- inWindow gates anyway). freestone.tx.publicsearch.us also
    // exists (Kofile) but the clerk PDFs here are free.
    freestone_cc: {
        fips: "48161",
        // sale venue: south-side courthouse steps, 118 E Commerce St, Fairfield
        venue: /COURT\s*HOUSE|\b118\s+E(?:AST)?\.?\s*COMMERCE\b/i,
        discover: async () => {
            const base = "https://www.co.freestone.tx.us";
            const html = await fetchText(base + "/page/freestone.county.clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/1887\/[^"]+\.pdf)"[^>]*>[^<]{0,80}?([A-Za-z]+)\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[3],
                    month: mon,
                    name: `freestone_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Limestone County clerk (CivicLive): /page/limestone.NoticeofTrusteeSales
    // is one long page of "<Month> <Year> Sale" headings, each followed by
    // that month's per-notice PDFs under /upload/page/5639/ (filenames
    // "FC-<year>-<seq> <surname>.pdf"; links repeat 2-3x -> dedupe).
    // Sequential heading->links scan. NB: 48293 parcels ship ~no situs_zip ->
    // sweep pass disabled, cue+legal carry it.
    limestone_cc: {
        fips: "48293",
        // sale venue: Limestone County Courthouse, 200 W State St, Groesbeck
        venue: /COURT\s*HOUSE|\b2[0O][0O]\s+W(?:EST)?\.?\s*STATE\b/i,
        discover: async () => {
            const base = "https://www.co.limestone.tx.us";
            const html = await fetchText(base + "/page/limestone.NoticeofTrusteeSales");
            const re = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})|href="(\/upload\/page\/5639\/[^"]+\.pdf)"/g;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) cur = { year: +m[2], month: MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1 };
                else if (cur && inWindow(cur.year, cur.month) && !seen.has(m[3])) {
                    seen.add(m[3]);
                    out.push({
                        url: base + encodeURI(m[3]),
                        year: cur.year,
                        month: cur.month,
                        name: `limestone_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(m[3]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Kerr County clerk (custom static site, co.kerr.tx.us; the www host
    // TLS-blocks Node fetch but the LEGACY host serves the same tree and
    // passes): legacy.co.kerr.tx.us/cclerk/docs/trustee/ has directory
    // listing ON -- one consolidated packet per sale month named
    // "<YYYY>-<FullMonth>_Trustee-Floreclosure.pdf" (the clerk's own
    // "Floreclosure" typo is load-bearing). /cclerk/trustee/trustee_sales.pdf
    // is a rolling "current" copy (no month in URL) -- ignored, the monthly
    // archives cover it.
    kerr_cc: {
        fips: "48265",
        // sale venue: front entrance, Kerr County Courthouse, 700 Main St,
        // Kerrville (number-pinned: Main St has real properties)
        venue: /COURT\s*HOUSE|\b7[0O][0O]\s+MAIN\b/i,
        discover: async () => {
            const base = "https://legacy.co.kerr.tx.us/cclerk/docs/trustee/";
            const html = await fetchText(base);
            const out = [];
            for (const m of html.matchAll(/href="((\d{4})-([A-Za-z]+)_Trustee-Floreclosure\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[2], mon)) continue;
                out.push({
                    url: base + m[1],
                    year: +m[2],
                    month: mon,
                    name: `kerr_${m[2]}-${String(mon).padStart(2, "0")}.pdf`,
                });
            }
            return out;
        },
    },
    // Medina County clerk (CivicLive, medinatx.gov): /page/medina.
    // noticeoftrusteesales (redirects to /page/noticeoftrusteesales) lists
    // sale-date headings ("July 7, 2026, See Instrument for Sale Time") each
    // followed by that sale's per-notice PDFs under /upload/page/0092/
    // (filename = clerk instrument number; anchor text = LEGAL description --
    // rural county, expect legal-match to carry a lot). Sequential
    // heading->links scan like Hill. A commissioners-court affidavit PDF sits
    // BEFORE the first heading -> cur=null skips it.
    medina_cc: {
        fips: "48325",
        // sale venue: east side, Medina County Courthouse ANNEX, 1300 Avenue M,
        // Hondo (number-pinned; "Avenue M" is a real street pattern)
        venue: /COURT\s*HOUSE|\b13[0O][0O]\s+AVE(?:NUE)?\.?\s*M\b/i,
        discover: async () => {
            const base = "https://www.medinatx.gov";
            const html = await fetchText(base + "/page/medina.noticeoftrusteesales");
            const re = />\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4}),?\s*See\s+Instrument[^<]{0,40}<|href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/0092\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    if (mon) cur = { year: +m[2], month: mon };
                } else if (cur && inWindow(cur.year, cur.month)) {
                    let p = m[3];
                    try {
                        if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                    } catch { /* malformed % -- keep raw */ }
                    if (seen.has(p)) continue;
                    seen.add(p);
                    out.push({
                        url: base + encodeURI(p),
                        year: cur.year,
                        month: cur.month,
                        name: `medina_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Atascosa County clerk (WordPress, co.atascosa.tx.us -- migrated OFF the
    // CivicLive atascosacounty.texas.gov site): /county-clerk/ has a "Notices
    // of Foreclosure Sales" section with <h3> sale-date headings ("August 4,
    // 2026") each followed by per-notice PDFs at /wp-content/uploads/<Y>/<M>/
    // FORECLOSURE-NOTICE-<NNN>.pdf (anchor text = just the number).
    // Sequential heading->links scan. The clerk also posts post-sale monthly
    // archive packets ("June 2026" -> 26-06.pdf) -- not matched here.
    atascosa_cc: {
        fips: "48013",
        // sale venue: west porch, Atascosa County Courthouse, 1 Courthouse
        // Circle Dr, Jourdanton ("COURTHOUSE CIRCLE" matches COURT\s*HOUSE)
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const html = await fetchText("https://co.atascosa.tx.us/county-clerk/");
            const re = /<h3[^>]*>\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})|href="(https:\/\/co\.atascosa\.tx\.us\/wp-content\/uploads\/\d{4}\/\d{2}\/FORECLOSURE-NOTICE-[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    if (mon) cur = { year: +m[2], month: mon };
                } else if (cur && inWindow(cur.year, cur.month) && !seen.has(m[3])) {
                    seen.add(m[3]);
                    out.push({
                        url: m[3],
                        year: cur.year,
                        month: cur.month,
                        name: `atascosa_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(m[3]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Caldwell County clerk (CivicLive, co.caldwell.tx.us): /page/Foreclosures
    // (NB: the /page/caldwell.Foreclosures alias 403s -- use this one) lists
    // per-notice PDFs under /upload/page/0132/ whose FILENAME carries the sale
    // date: "8-4-26 Salinas.pdf", "10-6-2026 Zavala.pdf", day sometimes
    // missing ("9-2026 Jones.pdf"). Older years live in "/0132/<year>
    // Foreclosure[s]/" subfolders (different naming; inWindow gates anyway).
    caldwell_cc: {
        fips: "48055",
        // sale venue: Caldwell County Justice Center, 1703 S Colorado St,
        // Lockhart (number-pinned: Colorado St has real properties)
        venue: /JUSTICE\s*CENTER|\b17[0O]3\s+S(?:OUTH)?\.?\s*COLORADO\b/i,
        discover: async () => {
            const base = "https://www.co.caldwell.tx.us";
            const html = await fetchText(base + "/page/Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/0132\/(\d{1,2})-(?:\d{1,2}-)?(\d{2,4})[^"/]*\.pdf)"/gi)) {
                const mon = +m[2];
                let year = +m[3];
                if (year < 100) year += 2000;
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `caldwell_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Gonzales County clerk (CivicLive, co.gonzales.tx.us): the notices sit on
    // the CLERK page itself (/page/gonzales.County.Clerk), per-notice PDFs
    // under /upload/page/2420/, anchor text "(Foreclosure|Trustee) Sale
    // <Month> <D>, <YYYY>" (sale date WITH year; the day drifts -- "August 8,
    // 2026" for the Aug 4 sale -- month is what we bucket by). Low volume.
    gonzales_cc: {
        fips: "48177",
        // sale venue: southeast corner, Gonzales County Courthouse,
        // 414 St Joseph St (number-pinned)
        venue: /COURT\s*HOUSE|\b414\s+S(?:AIN)?T\.?\s*JOSEPH\b/i,
        discover: async () => {
            const base = "https://www.co.gonzales.tx.us";
            const html = await fetchText(base + "/page/gonzales.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/2420\/[^"]+\.pdf)"[^>]*>[^<]{0,60}?(?:Foreclosure|Trustee)\s+Sale\s+([A-Za-z]+)\s+\d{1,2},?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +m[3],
                    month: mon,
                    name: `gonzales_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Bastrop County clerk (CivicLive, bastropcounty.gov): /page/
    // co.county_clerk_foreclosure links ONE consolidated packet per sale month
    // at /page/open/3641/0/<Month>%20Foreclosure%20Sale.pdf (href arrives
    // pre-encoded; no year in the name -> near-future roll like Bell).
    bastrop_cc: {
        fips: "48021",
        // sale venue: Bastrop County Courthouse, 804 Pecan St, Bastrop
        // (number-pinned: Pecan St has real properties)
        venue: /COURT\s*HOUSE|\b8[0O]4\s+PECAN\b/i,
        discover: async () => {
            const base = "https://www.bastropcounty.gov";
            const html = await fetchText(base + "/page/co.county_clerk_foreclosure");
            const now = new Date();
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/page\/open\/3641\/0\/([A-Za-z]+)(?:%20|\s)Foreclosure(?:%20|\s)Sale\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon) continue;
                // name carries no year: sale months are near-future
                let year = now.getFullYear();
                if (mon - (now.getMonth() + 1) < -6) year += 1;
                const name = `bastrop_${year}-${String(mon).padStart(2, "0")}.pdf`;
                if (!inWindow(year, mon) || seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + m[1], year, month: mon, name });
            }
            return out;
        },
    },
    // Fayette County clerk (CivicLive, co.fayette.tx.us): the notices sit on
    // the CLERK page itself (/page/fayette.County.Clerk), per-notice PDFs
    // under /upload/page/1728/ (chaotic filenames, some links point at the
    // CivicLive origin newtools.cira.state.tx.us -- same path serves from the
    // county host); anchor TEXT carries the sale date ("July 7, 2026 -
    // Barnes").
    fayette_cc: {
        fips: "48149",
        // sale venue: Fayette County Courthouse, 151 N Washington St,
        // La Grange (number-pinned: Washington St has real properties)
        venue: /COURT\s*HOUSE|\b151\s+N(?:ORTH)?\.?\s*WASHINGTON\b/i,
        discover: async () => {
            const base = "https://www.co.fayette.tx.us";
            const html = await fetchText(base + "/page/fayette.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/1728\/[^"]+\.pdf)"[^>]*>(?:\s|<[^>]+>|&nbsp;)*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                const name = `fayette_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + encodeURI(p), year: +m[3], month: mon, name });
            }
            return out;
        },
    },
    // Lee County clerk (CivicLive, co.lee.tx.us): the notices sit on the CLERK
    // page itself (/page/lee.County.Clerk), per-notice PDFs under /upload/
    // page/5446/docs/Trustee Sales/, anchor text "<Month> <D>, <YYYY> -
    // (Trustee|Foreclosure) Sale" (sale date WITH year). One URL can repeat
    // under several sale dates (re-posted sale) -> dedupe by month+file name.
    lee_cc: {
        fips: "48287",
        // sale venue: Lee County Courthouse, 200 S Main St, Giddings
        // (number-pinned: Main St has real properties)
        venue: /COURT\s*HOUSE|\b2[0O][0O]\s+S(?:OUTH)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.co.lee.tx.us";
            const html = await fetchText(base + "/page/lee.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/5446\/docs\/Trustee[^"]+\.pdf)"[^>]*>(?:\s|<[^>]+>|&nbsp;)*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                const name = `lee_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + encodeURI(m[1]), year: +m[3], month: mon, name });
            }
            return out;
        },
    },
    // Cooke County clerk (CivicLive, co.cooke.tx.us): /page/cooke.
    // ForeclosureNotices lists per-notice PDFs under /upload/page/3114/docs/
    // foreclosurenotice_<Name><M-D-YYYY>.pdf -- the filename date IS the sale
    // date (first-Tuesdays; zero-padding drifts: 8-4-2026 / 06-02-2026 /
    // 01-6-2026). Some hrefs point at the CivicLive origin
    // newtools.cira.state.tx.us -- the same path serves from the county host.
    cooke_cc: {
        fips: "48097",
        // sale venue: Cooke County Courthouse, 101 S Dixon St, Gainesville
        venue: /COURT\s*HOUSE|\b10[1Il]\s+S(?:OUTH)?\.?\s*DIXON\b/i,
        discover: async () => {
            const base = "https://www.co.cooke.tx.us";
            const html = await fetchText(base + "/page/cooke.ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/3114\/docs\/[^"]*foreclosurenotice[^"]*?(\d{1,2})-(\d{1,2})-(\d{4})\.pdf)"/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                if (seen.has(p)) continue;
                seen.add(p);
                out.push({
                    url: base + encodeURI(p),
                    year,
                    month: mon,
                    name: `cooke_${year}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Hunt County clerk (IDS/easydocs app on apps.huntcounty.net, linked
    // "Foreclosures Archive" / "Sale Notices" from the CivicLive site's
    // /page/trustees): /foreclosures/listDocs.asp?year=<Y> lists per-notice
    // docs with DIRECT raw-PDF hrefs LinkedDir/<year>/<YYYY-MM-DD>-
    // foreclosure-<NN>.pdf -- the docName date IS the sale date
    // (first-Tuesdays), like Upshur/Bosque.
    hunt_cc: {
        fips: "48231",
        // sale venue: Hunt County Courthouse, 2507 Lee St, Greenville
        venue: /COURT\s*HOUSE|\b25[0O]7\s+LEE\b/i,
        discover: async () => {
            const base = "https://apps.huntcounty.net/foreclosures/";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}listDocs.asp?year=${y}`);
                } catch (e) {
                    console.error(`  hunt ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/href="LinkedDir\/\d{4}\/(((\d{4})-(\d{2})-\d{2})[^"'&<> ]*\.pdf)"/gi)) {
                    const year = +m[3], mon = +m[4];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({ url: `${base}LinkedDir/${y}/${m[1]}`, year, month: mon, name: `hunt_${m[1]}` });
                }
            }
            return out;
        },
    },
    // Hopkins County clerk (easydocs/IDS, hopkins.easydocs.us -- plain HTTP
    // ONLY, the https handshake fails): /foreclosure/listDocs-new.asp?year=<Y>
    // lists showdoc.asp?docName=<YYYY-MM-DD>-foreclosure-<NNN>.pdf where the
    // docName date IS the sale date (first-Tuesdays, Upshur semantics -- NOT
    // Navarro's posting dates). Raw PDF at LinkedDir/<year>/<docName>.
    // NB: 48223 parcels ship situs_address as "SUNSET ST ~ 722 ~, Hopkins
    // County, TX" (street first, number between tildes, no situs_number) ->
    // the shared direct-match number derivation gets nothing, and the Census
    // geocode pass came back empty on the first run -> 0% tie for now. Lever:
    // normalize the tilde format upstream in the parcels load, not here.
    hopkins_cc: {
        fips: "48223",
        // sale venue: Hopkins County Courthouse, 118 Church St, Sulphur Springs
        venue: /COURT\s*HOUSE|\b118\s+CHURCH\b/i,
        discover: async () => {
            const base = "http://hopkins.easydocs.us/foreclosure/";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}listDocs-new.asp?year=${y}`);
                } catch (e) {
                    console.error(`  hopkins ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/docName=(((\d{4})-(\d{2})-\d{2})[^"'&<> ]*\.pdf)/gi)) {
                    const year = +m[3], mon = +m[4];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({ url: `${base}LinkedDir/${y}/${m[1]}`, year, month: mon, name: `hopkins_${m[1]}` });
                }
            }
            return out;
        },
    },
    // Palo Pinto County clerk (CivicLive, co.palo-pinto.tx.us): /page/
    // ForeclosureNotices links ONE consolidated packet per sale month at
    // /page/open/1127/0/<Month>%20<Year>%20Foreclosures[.pdf] (href arrives
    // pre-encoded; month AND year in the name; the trailing ".pdf" drifts).
    palopinto_cc: {
        fips: "48363",
        // sale venue: Palo Pinto County Courthouse, 520 Oak St, Palo Pinto
        venue: /COURT\s*HOUSE|\b52[0O]\s+OAK\b/i,
        discover: async () => {
            const base = "https://www.co.palo-pinto.tx.us";
            const html = await fetchText(base + "/page/ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/page\/open\/1127\/0\/([A-Za-z]+)(?:%20|\s)(\d{4})(?:%20|\s)Foreclosures[^"]*)"/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[3];
                if (!mon || !inWindow(year, mon)) continue;
                const name = `palopinto_${year}-${String(mon).padStart(2, "0")}.pdf`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + m[1], year, month: mon, name });
            }
            return out;
        },
    },
    // Erath County clerk (CivicPlus): /158/Foreclosure-Postings holds twelve
    // MONTH child pages (/159/January .. /170/December, page id = 158+month)
    // that recycle yearly with NO year anywhere -- prior years' per-notice
    // DocumentCenter PDFs stay listed beside the fresh ones (and Last-Modified
    // is a useless CDN stamp). Doc ids are monotonic, so gate on an id floor:
    // desc-sort all ids across the window's pages and chain while the gap to
    // the next stays < 400 (year cohorts sit ~900 apart); the current month is
    // always posted, so the newest cohort is this year's crop. "NO-SALE ...
    // (RESOLVED)" slugs are cancelled sales -> skipped.
    erath_cc: {
        fips: "48143",
        // sale venue: south door, Erath County Courthouse, 100 W Washington
        // St, Stephenville (number-pinned)
        venue: /COURT\s*HOUSE|\b10[0O]\s+W(?:EST)?\.?\s*WASHINGTON\b/i,
        discover: async () => {
            const base = "https://www.co.erath.tx.us";
            const FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const now = new Date(), cands = [];
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                const year = t.getUTCFullYear(), mon = t.getUTCMonth() + 1;
                let html;
                try {
                    html = await fetchText(`${base}/${158 + mon}/${FULL[mon - 1]}`);
                } catch (e) {
                    console.error(`  erath ${FULL[mon - 1]}: page fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/(\d+)\/([^"]*))"/gi)) {
                    if (/NO-?SALE|RESOLVED|CANCEL/i.test(m[3])) continue;
                    cands.push({ id: +m[2], url: base + m[1], year, month: mon });
                }
            }
            const ids = [...new Set(cands.map((c) => c.id))].sort((a, b) => b - a);
            let floor = ids[0] || 0;
            for (let i = 1; i < ids.length && ids[i - 1] - ids[i] < 400; i++) floor = ids[i];
            const seen = new Set();
            return cands
                .filter((c) => c.id >= floor && !seen.has(c.id) && seen.add(c.id))
                .map((c) => ({
                    url: c.url,
                    year: c.year,
                    month: c.month,
                    name: `erath_${c.year}-${String(c.month).padStart(2, "0")}_${c.id}.pdf`,
                }));
        },
    },
    // Fannin County clerk: notices do NOT live on the CivicLive county site
    // (the clerk + fannin.Public.Notices pages carry only forms and orders) --
    // they're filed as "Foreclosure"-type entries in the county's AgendaSuite
    // portal ("County Clerk Postings" link): agendasuite.org/iip/fannin/
    // ordinance/list is a plain HTML table, one row per posting: type |
    // grantor name | SALE date (M/D/YYYY, first-Tuesdays) | per-notice PDF at
    // /iip/fannin/file/getfile/<id>. Full history on one page; inWindow gates.
    fannin_cc: {
        fips: "48147",
        // sale venue: Fannin County Courthouse, 101 E Sam Rayburn Dr, Bonham
        // (OCR: "Raybum" -- rn/m confusion -> match the stem)
        venue: /COURT\s*HOUSE|\b10[1Il]\s+E(?:AST)?\.?\s*SAM\s*RAYBU\w*/i,
        discover: async () => {
            const base = "https://agendasuite.org";
            const html = await fetchText(base + "/iip/fannin/ordinance/list");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/Foreclosure\s*<\/td>[\s\S]{0,400}?>\s*(\d{1,2})\/\d{1,2}\/(\d{4})\s*<\/td>[\s\S]{0,300}?href="(\/iip\/fannin\/file\/getfile\/(\d+))"/gi)) {
                const mon = +m[1], year = +m[2];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[4])) continue;
                seen.add(m[4]);
                out.push({
                    url: base + m[3],
                    year,
                    month: mon,
                    name: `fannin_${year}-${String(mon).padStart(2, "0")}_${m[4]}.pdf`,
                });
            }
            return out;
        },
    },
    // Jackson County clerk (CivicLive, co.jackson.tx.us): /page/
    // ForeclosureNotice lists per-notice scans under /upload/page/0089/docs/
    // Public Notice/Foreclosure Sale/<YEAR>/ -- the folder carries the year,
    // the chaotic filenames carry the sale month as a month NAME ("Notice of
    // Trustee Sale July 7th", "2026 Feb Notice", "Foreclosure Sale September
    // 1") or as a scanner stamp ("Scan2026-07-09_161209" = posting date ->
    // saleMonthAfter). Undatable files ("Substitute Trustee Sale.pdf") are
    // skipped. Rural, low volume.
    jackson_cc: {
        fips: "48239",
        // sale venue: Jackson County Courthouse, 115 W Main St, Edna
        venue: /COURT\s*HOUSE|\b115\s+W(?:EST)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.co.jackson.tx.us";
            const html = await fetchText(base + "/page/ForeclosureNotice");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/0089\/docs\/Public(?:%20|\s)Notice\/Foreclosure(?:%20|\s)Sale\/(\d{4})\/([^"]+\.pdf))"/gi)) {
                const dirYear = +m[2];
                let fn = m[3];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(fn)) fn = decodeURIComponent(fn);
                } catch { /* keep raw */ }
                if (/deed/i.test(fn)) continue; // post-sale trustee-deed scans
                let year = dirYear, mon = 0;
                const nm = fn.match(/January|February|March|April|May|June|July|August|September|October|November|December|\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\b/i);
                if (nm) mon = MONTHS.indexOf(nm[0].slice(0, 3).toUpperCase()) + 1;
                else {
                    const sc = fn.match(/Scan(\d{4})-(\d{2})-(\d{2})/i);
                    if (sc) ({ year, month: mon } = saleMonthAfter(+sc[1], +sc[2], +sc[3]));
                }
                if (!mon || !inWindow(year, mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                if (seen.has(p)) continue;
                seen.add(p);
                out.push({
                    url: base + encodeURI(p),
                    year,
                    month: mon,
                    name: `jackson_${year}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Victoria County clerk (CivicLive, vctx.org): /page/county.clerk.
    // foreclosures links ONE consolidated packet per sale date at /page/open/
    // <pid>/0/<Month>[ ]<D>.pdf ("January 6.pdf", "Sept5.pdf") -- each pid is
    // one calendar YEAR of first-Tuesday sale dates but NO year text sits near
    // the links, so each pid's year is inferred by majority-voting its
    // month+day pairs against saleDate() (clerk drift tolerated: the 2026 set
    // writes May 7/June 5 for the May 5/Jun 2 sales). All 12 months are
    // pre-linked before posting -- fetchPdf failures on future months are
    // expected and logged, not fatal.
    victoria_cc: {
        fips: "48469",
        // sale venue: Victoria County Courthouse, 101 N Bridge St, Victoria
        venue: /COURT\s*HOUSE|\b10[1Il]\s+N(?:ORTH)?\.?\s*BRIDGE\b/i,
        discover: async () => {
            const base = "https://www.vctx.org";
            const html = await fetchText(base + "/page/county.clerk.foreclosures");
            const cands = [];
            for (const m of html.matchAll(/href="(\/page\/open\/(\d+)\/0\/([A-Za-z]+)\.?(?:%20|\s)?(\d{1,2})\.pdf)"/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (mon) cands.push({ pid: m[2], url: m[1], mon, day: +m[4] });
            }
            const yr = new Date().getFullYear();
            const pidYear = new Map();
            for (const pid of new Set(cands.map((c) => c.pid))) {
                const files = cands.filter((c) => c.pid === pid);
                let best = null, bestHits = 0;
                for (const y of [yr - 1, yr, yr + 1]) {
                    const hits = files.filter((f) => saleDate(y, f.mon).endsWith(`-${String(f.day).padStart(2, "0")}`)).length;
                    if (hits > bestHits) {
                        bestHits = hits;
                        best = y;
                    }
                }
                if (best && (bestHits >= 6 || bestHits > files.length / 2)) pidYear.set(pid, best);
            }
            const out = [], seen = new Set();
            for (const c of cands) {
                const year = pidYear.get(c.pid);
                if (!year || !inWindow(year, c.mon)) continue;
                const name = `victoria_${year}-${String(c.mon).padStart(2, "0")}.pdf`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + c.url, year, month: c.mon, name });
            }
            return out;
        },
    },
    // Goliad County clerk (CivicLive, co.goliad.tx.us): /page/goliad.
    // CountyandDistrictClerkPublicNotices ("Trustee/Foreclosure Sales") lists
    // per-notice scans under /upload/page/2540/ (chaotic filenames, some
    // hrefs point at the CivicLive origin newtools.cira.state.tx.us); the
    // anchor TEXT carries the sale date WITH year ("July 7th, 2026",
    // "May 06,2025"). Tiny county; tax sales share the list (subtype comes
    // from the notice text).
    goliad_cc: {
        fips: "48175",
        // sale venue: Goliad County Courthouse, 127 N Courthouse Square
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.goliad.tx.us";
            const html = await fetchText(base + "/page/goliad.CountyandDistrictClerkPublicNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/2540\/[^"]+\.pdf)"[^>]*>(?:\s|<[^>]+>|&nbsp;)*([A-Za-z]+)\.?\s+\d{1,2}(?:st|nd|rd|th)?\s*,?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                if (seen.has(p)) continue;
                seen.add(p);
                out.push({
                    url: base + encodeURI(p),
                    year: +m[3],
                    month: mon,
                    name: `goliad_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Wharton County clerk (CivicLive, co.wharton.tx.us): /page/wharton.
    // County.Clerk links ONE consolidated packet for the CURRENT sale month
    // ("click here") at /upload/page/6991/docs/County Clerk/Foreclosures/
    // <YYYY><MM> FORECLOSURES.pdf -- the filename prefix IS the sale month;
    // prior months drop off the page (no archive). The Sheriff CivilNotices
    // page carries only tax-sale bid sheets, not trustee notices.
    wharton_cc: {
        fips: "48481",
        // sale venue: Wharton County Courthouse, 100 S Fulton St, Wharton
        venue: /COURT\s*HOUSE|\b10[0O]\s+S(?:OUTH)?\.?\s*FULTON\b/i,
        discover: async () => {
            const base = "https://www.co.wharton.tx.us";
            const html = await fetchText(base + "/page/wharton.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/6991\/docs\/County(?:%20|\s)Clerk\/Foreclosures\/(\d{4})(\d{2})[^"]*\.pdf)"/gi)) {
                const year = +m[2], mon = +m[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                const name = `wharton_${year}-${String(mon).padStart(2, "0")}.pdf`;
                if (seen.has(name)) continue;
                seen.add(name);
                out.push({ url: base + encodeURI(p), year, month: mon, name });
            }
            return out;
        },
    },
    // Houston County clerk (CivicLive, co.houston.tx.us): the notices sit on
    // the CLERK page itself (/page/houston.County.Clerk) -- a "<YYYY> Sales"
    // heading opens each year, then "Month:" headings each followed by that
    // sale month's per-notice "Sale N" PDFs under /upload/page/2944/ (chaotic
    // filenames/folders -- "2026 Jan Sale 1.pdf", "July foreclosure 3.pdf",
    // "Foreclosure 5a.pdf"; some hrefs point at the CivicLive origin
    // newtools.cira.state.tx.us). Sequential year+month heading -> links scan
    // like Hill/Burnet; filename must look foreclosure-ish (the same page
    // hosts fee charts + vital-records forms).
    houston_cc: {
        fips: "48225",
        // sale venue: east side, Houston County Courthouse, 401 E Houston
        // Ave, Crockett (number-pinned: Houston Ave has real properties)
        venue: /COURT\s*HOUSE|\b4[0O][1Il]\s+E(?:AST)?\.?\s*HOUSTON\b/i,
        discover: async () => {
            const base = "https://www.co.houston.tx.us";
            const html = await fetchText(base + "/page/houston.County.Clerk");
            const re = />\s*(\d{4})\s+Sales\s*<|>\s*(January|February|March|April|May|June|July|August|September|October|November|December)(?:&nbsp;|\s)*:|href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/2944\/[^"]+\.pdf)"/g;
            const out = [], seen = new Set();
            let year = null, mon = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    year = +m[1];
                    mon = null;
                } else if (m[2]) mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                else if (year && mon && inWindow(year, mon)) {
                    let p = m[3];
                    try {
                        if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                    } catch { /* malformed % -- keep raw */ }
                    if (!/foreclos|forclos|sale/i.test(path.basename(p)) || seen.has(p)) continue;
                    seen.add(p);
                    out.push({
                        url: base + encodeURI(p),
                        year,
                        month: mon,
                        name: `houston_${year}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Leon County clerk (CivicLive, co.leon.tx.us): /page/leon.
    // NoticeofSubstituteTrusteeSales lists per-notice PDFs under
    // /upload/page/4985/ (filename = grantor names); the anchor TEXT carries
    // the sale date as "NAME - M/D/YYYY" (first-Tuesdays). Tiny county.
    leon_cc: {
        fips: "48289",
        // sale venue: south entrance, Leon County Courthouse, 130 West
        // St Marys St, Centerville (printed on the notices)
        venue: /COURT\s*HOUSE|\b13[0O]\s+W(?:EST)?\.?\s*ST\.?\s*MARYS?\b/i,
        discover: async () => {
            const base = "https://www.co.leon.tx.us";
            const html = await fetchText(base + "/page/leon.NoticeofSubstituteTrusteeSales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/4985\/[^"]+\.pdf)"[^>]*>[^<]{0,100}?(\d{1,2})\/\d{1,2}\/(\d{4})/gi)) {
                const mon = +m[2], year = +m[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                if (seen.has(p)) continue;
                seen.add(p);
                out.push({
                    url: base + encodeURI(p),
                    year,
                    month: mon,
                    name: `leon_${year}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Madison County clerk (CivicLive, co.madison.tx.us): the notices sit on
    // the CLERK page itself (/page/madison.County.Clerk) under "<Month> <YYYY>
    // Sale" headings (all 12 months pre-listed, most empty), each followed by
    // that month's per-notice PDFs in /upload/page/0396/docs/County Clerk/
    // Foreclosure <YYYY>/ (filename = grantor names). Sequential heading ->
    // links scan like Hill. Tiny county.
    madison_cc: {
        fips: "48313",
        // sale venue: first-floor lobby, Madison County Courthouse,
        // 101 W Main St, Madisonville (number-pinned)
        venue: /COURT\s*HOUSE|\b10[1Il]\s+W(?:EST)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.co.madison.tx.us";
            const html = await fetchText(base + "/page/madison.County.Clerk");
            const re = />\s*([A-Za-z]+)\s+(\d{4})\s+Sale|href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/0396\/docs\/County(?:%20|\s)Clerk\/Foreclosure(?:%20|\s)\d{4}\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    cur = mon ? { year: +m[2], month: mon } : null;
                } else if (cur && inWindow(cur.year, cur.month)) {
                    let p = m[3];
                    try {
                        if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                    } catch { /* malformed % -- keep raw */ }
                    if (seen.has(p)) continue;
                    seen.add(p);
                    out.push({
                        url: base + encodeURI(p),
                        year: cur.year,
                        month: cur.month,
                        name: `madison_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Titus County clerk (IDS "listDocPDF" app on a BARE IP -- http://
    // 208.180.79.74:81/listDocPDF/index.asp?path=Foreclosures, linked
    // "Foreclosures" from co.titus.tx.us/page/coclerk.foreclosures; same
    // Integrated Data Services vendor as Upshur/Hunt/Bosque but a different
    // app): per-notice PDFs at Foreclosures/<M.D.YYYY> <name>.pdf where the
    // filename date IS the sale date (first-Tuesdays; separator drifts
    // 07.07.2026 / 8.4.2026). Current window only (no year archive). HTTP only.
    titus_cc: {
        fips: "48449",
        // sale venue: Titus County Courthouse, 100 W 1st St, Mount Pleasant
        venue: /COURT\s*HOUSE|\b10[0O]\s+W(?:EST)?\.?\s*(?:1ST|FIRST)\b/i,
        discover: async () => {
            const base = "http://208.180.79.74:81/listDocPDF/";
            const html = await fetchText(base + "index.asp?path=Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(Foreclosures\/(\d{1,2})[.\-](\d{1,2})[.\-](\d{4})[^"]*\.pdf)"/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `titus_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Lamar County clerk (CivicPlus, lamarcountytx.gov): /1234/Foreclosure-
    // Sales lists per-notice PDFs at /DocumentCenter/View/<id>/<slug> where
    // the slug carries the sale date + grantor ("AUGUST-4-2026-CALLAWAY-PDF";
    // day zero-padding and dashes drift: "AUGUST-04-2026---PIKE-PDF",
    // "June-022026---PETERSON-PDF" glues day+year). The undated
    // "Info-Sheet-on-Foreclosures" doc never matches the date pattern.
    lamar_cc: {
        fips: "48277",
        // sale venue: Lamar County Courthouse, 119 N Main St, Paris
        // (number-pinned: Main St has real properties)
        venue: /COURT\s*HOUSE|\b119\s+N(?:ORTH)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.lamarcountytx.gov";
            const html = await fetchText(base + "/1234/Foreclosure-Sales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/(\d+)\/([A-Za-z]+)-0?(\d{1,2})-?(20\d{2})[^"]*)"/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[5];
                if (!mon || !inWindow(year, mon) || seen.has(m[2])) continue;
                seen.add(m[2]);
                out.push({
                    url: base + m[1],
                    year,
                    month: mon,
                    name: `lamar_${year}-${String(mon).padStart(2, "0")}_${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Cass County clerk (CivicLive, co.cass.tx.us): /page/cass.Foreclosures
    // lists per-notice PDFs under /upload/page/1180/ (+ per-year subfolders
    // /1180/2025/, /1180/2026/; filename = grantor or scan stamp; some hrefs
    // point at the CivicLive origin newtools.cira.state.tx.us, pre-encoded);
    // the anchor TEXT carries the sale date ("September 1, 2026", "August 4,
    // 2026- King"). A few anchors split the date across elements ("April 7" /
    // "," / "2026") -- those rare ones are skipped.
    cass_cc: {
        fips: "48067",
        // sale venue: Cass County Courthouse, 100 E Houston St, Linden
        // (notices drop the "E": "100 Houston, Linden" -- number-pinned)
        venue: /COURT\s*HOUSE|\b10[0O]\s+(?:E(?:AST)?\.?\s*)?HOUSTON\b/i,
        discover: async () => {
            const base = "https://www.co.cass.tx.us";
            const html = await fetchText(base + "/page/cass.Foreclosures");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/1180\/[^"]+\.pdf)"[^>]*>(?:\s|<[^>]+>|&nbsp;)*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+m[3], mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                if (seen.has(p)) continue;
                seen.add(p);
                out.push({
                    url: base + encodeURI(p),
                    year: +m[3],
                    month: mon,
                    name: `cass_${m[3]}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Anderson County: NOT here -- andersoncountytx.gov (CivicLive) posts NO
    // notice PDFs: the homepage + clerk page "Foreclosure Notices" links go
    // straight to andersontx.search.kofile.com/48001 (Kofile search product,
    // kofile.com flavor rather than publicsearch.us) = the separate platform
    // crack. Skip (verified 2026-07-16).
    // Walker County: NOT here -- co.walker.tx.us (eGov/CORE, same vendor as
    // Lubbock) publishes NO trustee notices: the document center's title
    // search returns 0 for "foreclosure"/"trustee" (elections + campaign
    // finance only); records live on walker.tx.publicsearch.us (Kofile) ->
    // the separate platform crack (verified 2026-07-16).
    // Grimes County: NOT here -- grimescountytexas.gov (GovOffice CMS) has a
    // "Foreclosure Sales" page that links only TDHCA foreclosure-assistance +
    // the delinquent-TAX-sale law firms (mvbalaw.com, taxsales.lgbs.com), no
    // trustee notices; grimes.tx.publicsearch.us (Kofile) is up -> the
    // separate platform crack (verified 2026-07-16).
    // Robertson County: NOT here -- co.robertson.tx.us (CivicLive) clerk page
    // is one long GENERAL public-postings feed (appraisal-district meetings,
    // towing auctions, water-district notices); trustee notices appear only
    // sporadically ("Notice of Sale - May 5, 2026") with no parseable
    // pattern, and the "2026 Foreclosure" folder holds a single groundwater-
    // district tax sale. No notice system online (verified 2026-07-16).
    // Brazoria County: NOT here -- brazoriacountytx.gov (Granicus) publishes
    // NO foreclosure/trustee pages at all (sitemap swept 2026-07-15: zero
    // hits); clerk records sit behind portal-txbrazoria.tylertech.cloud
    // (Tyler, login-gated per the metro survey). Skip.
    // Matagorda County: NOT here -- matagordatx.gov (CivicLive) clerk page
    // posts only post-hoc ANNUAL "Foreclosure List <year>" PDFs, stale at
    // 2021-2024 with nothing for 2025/2026; no current notices (2026-07-15).
    // Calhoun County: NOT here -- the clerk's own site (calhouncoclerk.org,
    // GoDaddy builder; the county WordPress site just links out) has a
    // /foreclosures page whose Downloads section says "Files coming soon" --
    // no notices online (2026-07-15).
    // Aransas County: NOT here -- aransascountytx.gov/clerk/forcnotices.php
    // points only at aransascountytx-web.tylerhost.net DOCSEARCH519S1 ("Search
    // Public Notices & Notice of Foreclosures") = Tyler Eagle, the paywalled/
    // search-only platform. Skip (2026-07-15).
    // San Patricio County: NOT here -- sanpatriciocountytx.gov (CivicLive)
    // /page/county.clerk.foreclosures is STALE: monthly packets end at
    // February 2023 (pids 1110-1115 = 2023..2018). sanpatricio.tx.
    // publicsearch.us (Kofile) is up -> the separate platform crack
    // (verified 2026-07-15).
    // Refugio County: NOT here -- co.refugio.tx.us (CivicLive) /page/
    // refugio.RealEstateNotices is STALE (newest notice 2018); PublicNotices
    // carries none. No notices online (2026-07-15).
    // Hood County: NOT here -- hoodcounty.texas.gov (Revize; the legacy
    // co.hood.tx.us host connection-times-out entirely) links its foreclosure
    // notices ONLY to hoodcountytx.documents-on-demand.com (third-party
    // search portal, no scrapeable list; re-verified 2026-07-15). Skip.
    // Somervell County: NOT here -- somervell.co (CivicPlus) files notices in
    // a REACT DocumentCenter (/DocumentCenter/Index/91 "Foreclosure Notices",
    // client-rendered; the Document_AjaxBinding replay hits the same
    // antiforgery wall as Parker, returns the admin login page). Would need
    // Parker-style pinned URLs from a live browser; tiny county -- parked
    // (verified 2026-07-15).
    // Jack County: NOT here -- www.jackcounty.org WAF-403s every headless
    // client tried (curl + Node fetch, full browser headers); alternate
    // domain jackcountytexas.com is just a promo video iframe (2026-07-15).
    // Wichita County: NOT here -- wichitacountytx.com (WordPress; 403s Node
    // fetch, curl passes) publishes NO notice PDFs on the clerk pages; county
    // records live on Tyler Eagle (wichitacountytx-recorder.tylerhost.net),
    // the paywalled platform. Skip (verified 2026-07-15).
    // Kendall County: NOT here -- co.kendall.tx.us (CivicPlus) posts NO notice
    // PDFs: the clerk page's "Foreclosures / Trustee's Sales Search" links
    // straight to kendall.tx.publicsearch.us (Kofile/GovOS PublicSearch), the
    // separate platform crack in FORECLOSURE_SOURCES.md (verified 2026-07-15).
    // Wilson County: NOT here -- co.wilson.tx.us (CivicLive) posts NO trustee
    // notices: /page/wilson.PublicSaleofProperty points only at
    // wilson.texas.sheriffsaleauctions.com (sheriff/TAX-sale auction vendor,
    // not mortgage trustee notices) and wilson.PublicNotices carries none;
    // wilson.tx.publicsearch.us (Kofile) is up -> the separate platform crack
    // (verified 2026-07-15).
    // Llano County: NOT here -- llanocounty.gov (CivicLive) posts NO notices:
    // the clerk page's "Foreclosure Notices" accordion holds only the
    // sale-location designation resolution (re-verified 2026-07-15);
    // llano.tx.publicsearch.us (Kofile) is up -> the separate platform crack.
    // Nacogdoches County: NOT here -- the county moved to a minimal CivicPlus
    // site (nacogdochesco.gov, re-verified 2026-07-15: sitemap has NO
    // foreclosure page, /167/Public-Notices carries none); notices live only
    // in nacogdoches.tx.publicsearch.us (Kofile/GovOS), the separate platform
    // crack in FORECLOSURE_SOURCES.md.
    // Rusk County: NOT here -- co.rusk.tx.us (CivicLive) clerk page posts only
    // a "Designated Foreclosure Resolution" PDF + stray scans, no notice
    // system (re-verified 2026-07-15); rusk.tx.publicsearch.us (Kofile) is up
    // -> the separate platform crack.
    // Harrison County: NOT here -- harrisoncountytexas.org/.gov (CivicLive)
    // publishes NO foreclosure notices (clerk + PublicNoticeInfo pages carry
    // only election/holiday notices, re-verified 2026-07-15); no Kofile
    // subdomain either. Notices appear to be courthouse-posting only.
    // Cherokee County: NOT here -- co.cherokee.tx.us is a tiny static site
    // (commissioners-court agendas only, every path serves the homepage,
    // re-verified 2026-07-15); no Kofile subdomain. No notices online.
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

    // ---- West TX / Panhandle / South Plains wave (2026-07-16) --------------
    // fips corrections vs the candidate list: Coke County is 48081, NOT 48079
    // (48079 is Cochran County); Scurry County is 48415, NOT 48227 (48227 is
    // Howard County -- Howard's own fips WAS correct despite the flag).

    // Tom Green County clerk (custom static site, deptpages.co.tom-green.tx.us
    // -- the modern tomgreencountytx.gov Telerik/.NET site just links out):
    // County Clerk > "Tax Properties & Trustee sales" > "current list of
    // sales" leads to an Excel-published static table, TrusteeSalesNotices.htm,
    // whose hrefs are per-notice PDFs at <YYYY>/<M-D-YY>/NTS <NN>.pdf -- the
    // date SUBFOLDER is the sale date. Directory listing itself 403s (IIS) but
    // this specific page doesn't. Good embedded text layer.
    tom_green_cc: {
        fips: "48451",
        // sale venue (verified against actual notice text, NOT the county's
        // own web copy which says "112"): Edd B. Keyes Building,
        // 113 W Beauregard Ave, San Angelo
        venue: /COURT\s*HOUSE|KEYES\s+BUILDING|\b113\s+W(?:EST)?\.?\s*BEAUREGARD\b/i,
        discover: async () => {
            const base = "http://deptpages.co.tom-green.tx.us/countyClerk/TrusteeSales/";
            const html = await fetchText(base + "TrusteeSalesNotices.htm");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="((\d{4})\/(\d{1,2})-\d{1,2}-\d{2,4}\/[^"]+\.pdf)"/gi)) {
                const year = +m[2], mon = +m[3];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + m[1],
                    year,
                    month: mon,
                    name: `tom_green_${year}-${String(mon).padStart(2, "0")}_${path.basename(decodeURIComponent(m[1])).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Nolan County clerk (CivicLive, co.nolan.tx.us): the notices sit on the
    // CLERK page itself (/page/nolan.county.clerk), per-notice PDFs mixed in
    // with fee-schedule boilerplate under /upload/page/0491/; anchor TEXT
    // carries "<Grantor(s)> MM/DD/YYYY" (sale date WITH slashes). A rare
    // truncated anchor ("Dawson/Staatz 01/07/202") is skipped (no 4-digit year).
    nolan_cc: {
        fips: "48353",
        // sale venue: Nolan County Courthouse, 100 E 3rd St, Sweetwater
        venue: /COURT\s*HOUSE|\b10[0O]\s+E(?:AST)?\.?\s*3RD\b/i,
        discover: async () => {
            const base = "https://www.co.nolan.tx.us";
            const html = await fetchText(base + "/page/nolan.county.clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(?:https?:\/\/[a-z.]*cira\.state\.tx\.us)?(\/upload\/page\/0491\/[^"]+\.pdf)"[^>]*>[^<]{0,100}?(\d{1,2})\/(\d{1,2})\/(\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                let p = m[1];
                try {
                    if (/%[0-9A-Fa-f]{2}/.test(p)) p = decodeURIComponent(p);
                } catch { /* malformed % -- keep raw */ }
                if (seen.has(p)) continue;
                seen.add(p);
                out.push({
                    url: base + encodeURI(p),
                    year,
                    month: mon,
                    name: `nolan_${year}-${String(mon).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Concho County clerk (CivicLive, co.concho.tx.us -- the intuitive
    // "foreclosures-trustee sales" slug 403s at the IIS level; the real slug
    // swaps the dash for a dot: "concho.foreclosures.tax.trustee sales"):
    // per-notice PDFs sit directly on the page under /upload/page/6115/;
    // anchor text carries the sale date ("TRUSTEE'S SALE- MM/DD/YYYY"). A
    // sibling "TAX SALE" entry (delinquent tax auction, not a mortgage
    // trustee notice) is excluded by requiring "TRUSTEE" in the anchor text.
    // Tiny county, very low volume.
    concho_cc: {
        fips: "48095",
        // sale venue: Concho County Courthouse, 152 N Roberts Ave, Paint Rock
        venue: /COURT\s*HOUSE|\b152\s+N(?:ORTH)?\.?\s*ROBERTS\b/i,
        discover: async () => {
            const base = "https://www.co.concho.tx.us";
            const html = await fetchText(base + "/page/concho.foreclosures.tax.trustee%20sales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/6115\/[^"]+\.pdf)"[^>]*>([^<]*)<\/a>/gi)) {
                if (!/TRUSTEE/i.test(m[2])) continue;
                const d = m[2].match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (!d) continue;
                const mon = +d[1], year = +d[3];
                if (!inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `concho_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Coke County clerk (CivicLive, co.coke.tx.us): the notices sit on the
    // CLERK page itself (/page/coke.County.Clerk), per-notice PDFs under
    // /upload/page/0168/; anchor TEXT carries "NOTICE OF [SUBSTITUTE]
    // TRUSTEE'S SALE|FORECLOSURE SALE #<case> <Month> <D>, <YYYY>" (sale date
    // WITH year). Tiny county, very low volume.
    coke_cc: {
        fips: "48081",
        // sale venue: Coke County Courthouse, 13 E 7th St, Robert Lee
        venue: /COURT\s*HOUSE|\b13\s+E(?:AST)?\.?\s*7TH\b/i,
        discover: async () => {
            const base = "https://www.co.coke.tx.us";
            const html = await fetchText(base + "/page/coke.County.Clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/0168\/[^"]+\.pdf)"[^>]*>([^<]*)<\/a>/gi)) {
                if (!/NOTICE\s+OF/i.test(m[2])) continue;
                const d = m[2].match(/([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})/);
                if (!d) continue;
                const mon = MONTHS.indexOf(d[1].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(+d[3], mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: +d[3],
                    month: mon,
                    name: `coke_${d[3]}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Runnels County clerk (CivicLive, runnelscounty.org -- the county
    // migrated OFF co.runnels.tx.us): /page/runnels.ForeclosureNotices lists
    // per-notice PDFs under /upload/page/8479/ (a sibling /5972/ folder holds
    // unrelated clerk-history boilerplate, excluded by path); anchor text
    // carries "<Month> <D>, <YYYY>-<seq>" (spacing/comma drift, and one
    // "uly 1, 2025" typo missing the J -- skipped, no month match).
    runnels_cc: {
        fips: "48399",
        // sale venue: Runnels County Courthouse, 613 Hutchings Ave, Ballinger
        venue: /COURT\s*HOUSE|\b613\s+HUTCHINGS\b/i,
        discover: async () => {
            const base = "https://www.runnelscounty.org";
            const html = await fetchText(base + "/page/runnels.ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/8479\/[^"]+\.pdf)"[^>]*>[^<]{0,60}?([A-Za-z]+)\.?\s+\d{1,2},?\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[3];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `runnels_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Scurry County clerk (CivicLive, co.scurry.tx.us): /page/coclerk.Foreclosure
    // holds bare sale-date headings ("<Month> <D>, <YYYY>", bold/no anchor)
    // each followed by that sale's per-notice PDFs under /upload/page/0094/
    // (a sibling /0114/ folder holds an unrelated conflict-of-interest form,
    // excluded by path); anchor text is the LEGAL DESCRIPTION, not an address
    // or date -- some filenames carry a real street address instead
    // ("217 35TH.pdf" -> 217 35th St, Snyder), a bonus for the direct-match
    // pass. Sequential heading->links scan like Hill/Medina/Burnet.
    scurry_cc: {
        fips: "48415",
        // sale venue: Scurry County Courthouse, 1806 25th St, Snyder
        venue: /COURT\s*HOUSE|\b1806\s+25TH\b/i,
        discover: async () => {
            const base = "https://www.co.scurry.tx.us";
            const html = await fetchText(base + "/page/coclerk.Foreclosure");
            const re = /<strong>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*<\/strong>|href="(\/upload\/page\/0094\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    cur = mon ? { year: +m[3], month: mon } : null;
                } else if (cur && inWindow(cur.year, cur.month) && !seen.has(m[4])) {
                    seen.add(m[4]);
                    out.push({
                        url: base + encodeURI(m[4]),
                        year: cur.year,
                        month: cur.month,
                        name: `scurry_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(m[4]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Howard County clerk (CivicPlus DocumentCenter, co.howard.tx.us):
    // /1209/Foreclosure-Notices lists ~440 per-notice PDFs going back years;
    // slugs mostly read "<Month>-<D>-<YYYY>-at-<time>[-<name>][-<seq>]-PDF"
    // but drift wildly after the date (a handful of 2021/22-era docs use a
    // different "Grantor---Name---Date-of-sale---M-D-YYYY" slug with no
    // leading date -- out of window anyway, skipped). Matching only the
    // leading Month-D-YYYY (not anchoring the rest of the slug) survives the
    // drift. Good embedded text layer.
    howard_cc: {
        fips: "48227",
        // sale venue: Howard County Courthouse, 300 S Main St, Big Spring
        venue: /COURT\s*HOUSE|\b3[0O][0O]\s+S(?:OUTH)?\.?\s*MAIN\b/i,
        discover: async () => {
            const base = "https://www.co.howard.tx.us";
            const html = await fetchText(base + "/1209/Foreclosure-Notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/DocumentCenter\/View\/(\d+)\/([A-Za-z]+)-(\d{1,2})-(\d{4})[^"]*)"/gi)) {
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                const year = +m[5];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[2])) continue;
                seen.add(m[2]);
                out.push({
                    url: base + m[1],
                    year,
                    month: mon,
                    name: `howard_${year}-${String(mon).padStart(2, "0")}_${m[2]}.pdf`,
                });
            }
            return out;
        },
    },
    // Dawson County clerk (CivicLive, co.dawson.tx.us): /page/dawsonTrustee.Sales
    // lists per-notice PDFs under /upload/page/1708/ (+ per-year subfolders);
    // anchor text carries "M/D/YYYY" (sale date, zero-padding drifts), a few
    // with a trailing grantor name or "#2" for a same-day re-posting.
    dawson_cc: {
        fips: "48115",
        // sale venue: Dawson County Courthouse, 400 S 1st St, Lamesa
        venue: /COURT\s*HOUSE|\b4[0O][0O]\s+S(?:OUTH)?\.?\s*1ST\b/i,
        discover: async () => {
            const base = "https://www.co.dawson.tx.us";
            const html = await fetchText(base + "/page/dawsonTrustee.Sales");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<a[^>]*href="(\/upload\/page\/1708\/[^"]+\.pdf)"[^>]*>[^<]{0,60}?(\d{1,2})\/(\d{1,2})\/(\d{2,4})/gi)) {
                const mon = +m[2];
                let year = +m[4];
                if (year < 100) year += 2000;
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `dawson_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Duval County clerk (CivicLive, co.duval.tx.us): the OLD "duval.Foreclosures"
    // slug is a dead page (stalled at 2020); the live page is the differently-
    // cased "/page/Foreclosures" -- accordion, one heading per sale date
    // ("July 7, 2026") followed by that sale's per-notice PDFs under
    // /upload/page/8842/. Sequential heading->links scan (same shape as hill_cc).
    duval_cc: {
        fips: "48131",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.duval.tx.us";
            const html = await fetchText(base + "/page/Foreclosures");
            const re = /lblTitle_\d+">\s*([A-Za-z]+)\s+\d{1,2},\s*(\d{4})\s*<\/span>|href="(\/upload\/page\/8842\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    if (mon) cur = { year: +m[2], month: mon };
                } else if (cur && inWindow(cur.year, cur.month)) {
                    const p = m[3];
                    if (seen.has(p)) continue;
                    seen.add(p);
                    out.push({
                        url: base + encodeURI(p),
                        year: cur.year,
                        month: cur.month,
                        name: `duval_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(p).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Kleberg County clerk (CivicLive, co.kleberg.tx.us): /page/kleberg.County.Clerk
    // has a "FORECLOSURES FILED" list, one <p> per notice: "<date filed> <legal
    // description> <date of sale>" with the PDF link wrapping the filed-date+
    // description text (/upload/page/6331/<chaotic filename>.pdf). Unlike most
    // sources here, the SALE date is printed directly (2nd date in the <p>) --
    // no +21-day inference needed. Per-<p> scan avoids cross-notice date bleed.
    kleberg_cc: {
        fips: "48273",
        // sale venue: westside steps of the Kleberg County Courthouse, Kingsville
        venue: /COURT\s*HOUSE|WESTSIDE\s+STEPS/i,
        discover: async () => {
            const base = "https://www.co.kleberg.tx.us";
            const html = await fetchText(base + "/page/kleberg.County.Clerk");
            const out = [], seen = new Set();
            for (const p of html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
                const block = p[1];
                const hrefm = block.match(/href="(\/upload\/page\/6331\/[^"]+\.pdf)"/i);
                if (!hrefm || seen.has(hrefm[1])) continue;
                const dates = [...block.matchAll(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/g)];
                if (!dates.length) continue;
                const last = dates[dates.length - 1]; // "Date of Sale" column, always 2nd/last date in the block
                const mon = +last[1], year = +last[3];
                if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                seen.add(hrefm[1]);
                out.push({
                    url: base + encodeURI(hrefm[1]),
                    year,
                    month: mon,
                    name: `kleberg_${year}-${String(mon).padStart(2, "0")}_${path.basename(hrefm[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Brooks County clerk (CivicLive, co.brooks.tx.us): /page/brooks.county.clerk
    // "Foreclosures" section links per-notice PDFs under /upload/page/5147/ --
    // NO date text on the page at all, but filenames ARE the posting timestamp
    // (YYYYMMDDHHMMSSmmm.pdf, e.g. 20260713111157767.pdf = posted 2026-07-13).
    // Posting date, not sale date -> saleMonthAfter (like Navarro). Tiny/rural:
    // expect a handful of notices at a time.
    brooks_cc: {
        fips: "48047",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.brooks.tx.us";
            const html = await fetchText(base + "/page/brooks.county.clerk");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/5147\/[^"]*?(\d{4})(\d{2})(\d{2})\d{6,9}\.pdf)"/gi)) {
                const py = +m[2], pm = +m[3], pd = +m[4];
                if (!pm || pm > 12 || !pd || pd > 31 || seen.has(m[1])) continue;
                const s = saleMonthAfter(py, pm, pd);
                if (!inWindow(s.year, s.month)) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year: s.year,
                    month: s.month,
                    name: `brooks_${py}${String(pm).padStart(2, "0")}${String(pd).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Willacy County clerk (CivicLive, co.willacy.tx.us): /page/willacy.public.notices
    // mixes all public notices; foreclosure ones are `<h2><a href="/upload/page/
    // 6544/docs/County Clerks/<year> Nots/<chaotic filename>.pdf">Notice of Sale
    // MM/DD/YYYY HH:MMAM/PM</a></h2>` -- sale date printed directly in the anchor.
    willacy_cc: {
        fips: "48489",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.willacy.tx.us";
            const html = await fetchText(base + "/page/willacy.public.notices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/<h2>\s*<a href="(\/upload\/page\/6544\/[^"]+\.pdf)">\s*Notice of Sale\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/gi)) {
                const mon = +m[2], year = +m[4];
                if (!mon || mon > 12 || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `willacy_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Live Oak County clerk (CivicLive, co.live-oak.tx.us): /page/
    // liveoak.ForeclosureNotices links per-notice PDFs under /upload/page/1222/
    // <year>/<chaotic filename incl. spaces>.pdf, anchor text "<Month D, YYYY>-
    // <legal description>" (sale date WITH year, printed directly). Very rural:
    // most notices are bare acreage/survey legal descriptions, not street
    // addresses -> expect the legal-description match phase to carry this one.
    liveoak_cc: {
        fips: "48297",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.live-oak.tx.us";
            const html = await fetchText(base + "/page/liveoak.ForeclosureNotices");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/1222\/[^"]+\.pdf)"[^>]*>\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[4];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `liveoak_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Webb County clerk (bespoke, webbcountytx.gov): the "Foreclosures" nav
    // entry iframes a static Word-generated page (ForeclosuresArchives/test.htm)
    // that -- unlike the FORECLOSURE_SOURCES.md note calling Webb a dead-end --
    // DOES link one consolidated packet PER SALE MONTH ("2026 PDF'S/August 1-40
    // (PDF).pdf"). Good embedded text layer (Word->PDF).
    webb_cc: {
        fips: "48479",
        // sale venue: NW first-floor entrance, Webb County Justice Center,
        // 1110 Victoria St, Laredo (number-pinned; Victoria St has real homes)
        venue: /JUSTICE\s*CENTER|\b1110\s+VICTORIA\b/i,
        discover: async () => {
            const base = "https://www.webbcountytx.gov/CountyClerk/Foreclosures/ForeclosuresArchives/";
            const html = await fetchText(base + "test.htm");
            const out = [];
            for (const m of html.matchAll(/href="((\d{4})(?:%20| )PDF'S\/([A-Za-z]+)[^"]*\.pdf)"/gi)) {
                const year = +m[2];
                const mon = MONTHS.indexOf(m[3].slice(0, 3).toUpperCase()) + 1;
                if (!mon || !inWindow(year, mon)) continue;
                out.push({
                    url: new URL(m[1], base).href,
                    year,
                    month: mon,
                    name: `webb_${year}-${String(mon).padStart(2, "0")}_${m[3]}.pdf`,
                });
            }
            return out;
        },
    },
    // Callahan County: NOT here -- callahancounty.org's nav has a "Foreclosure,
    // Notices & News" menu HEADER, but it's just a category label (children:
    // Public Calendar / County News / Court Appointed Attorneys) with no
    // dedicated notices page; both child pages carry 0 foreclosure/trustee
    // PDFs. No Kofile subdomain either (callahan.tx.publicsearch.us: DNS
    // NXDOMAIN). No notice system online (verified 2026-07-16).
    // Sterling County: NOT here -- co.sterling.tx.us 302-redirects to a new
    // domain (sterlingcotx.gov); /page/ForeclosureNotice there IS real (CivicLive,
    // /upload/page/0089/) but STALE -- only 5 notices total, newest Aug 5,
    // 2025 (~11 months old), nothing in the current window. Skip per the
    // >6mo staleness rule (verified 2026-07-16).
    // RGV wave (2026-07-16) -- Zapata (48505), Starr (48427), Jim Wells (48249):
    // NOT here -- all three counties' county-clerk foreclosure pages now point
    // ONLY to a Kofile PublicSearch subdomain (zapatatx.search.kofile.com,
    // starr.tx.publicsearch.us / starrtx.search.kofile.com, jimwellstx.search.
    // kofile.com); no direct PDFs left on the county site (Jim Wells' page still
    // lists 2018 archive PDFs, but nothing current). Per the Kofile-only skip
    // rule -- see load_kofile_foreclosures.mjs for that platform instead.
    // McMullen County (48311): NOT here -- mcmullencounty.org/county-clerk/ has
    // no foreclosure/trustee-sale content at all (checked the full page); no
    // Kofile subdomain found either. No online notice posting (verified
    // 2026-07-16, tiny county, pop. ~700).
    // Brooks' fips is 48047, NOT 48027 (that's Bell County -- already loaded
    // as bell_cc above). Verified against the standard TX alphabetical FIPS
    // sequence (2026-07-16).

    // ---- Deep East TX / Piney Woods wave (2026-07-16) ----------------------
    // Candidate fips verified against the standard TX alphabetical FIPS
    // sequence (cross-checked vs. already-loaded entries above: Harris=48201,
    // Bell=48027, Ellis=48139, Wise=48497, Kerr=48265, Webb=48479, Brooks=48047,
    // Coke=48081, Scurry=48415 all confirmed consistent) + WebSearch spot-checks
    // on Jasper/Sabine/San Jacinto/Shelby. All 10 candidates checked out.

    // Polk County clerk (easydocs/IDS app on polkcountyapps.net -- the modern
    // polktx.gov/312/Foreclosures CivicPlus page just links out): /easydocs/
    // foreclosure/listDocs-new.asp?year=<Y> lists showdoc.asp?year=<Y>&
    // docName=<YYYY-MM-DD>-foreclosure-<NNN>.pdf where the docName date IS the
    // sale date (first-Tuesdays, Upshur/Bosque semantics). Raw PDF at
    // LinkedDir/<year>/<docName>. HTTP only (no TLS on the app host).
    polk_cc: {
        fips: "48373",
        // sale venue: Dunbar Gym, 1103 Dunbar St, Livingston (effective
        // Aug 10, 2022, per the clerk page's own venue-designation order)
        venue: /COURT\s*HOUSE|DUNBAR\s+GYM|\b11[0O]3\s+DUNBAR\b/i,
        discover: async () => {
            const base = "http://polkcountyapps.net/easydocs/foreclosure/";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}listDocs-new.asp?year=${y}`);
                } catch (e) {
                    console.error(`  polk ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/docName=(((\d{4})-(\d{2})-\d{2})[^"'&<> ]*\.pdf)/gi)) {
                    const year = +m[3], mon = +m[4];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({ url: `${base}LinkedDir/${y}/${m[1]}`, year, month: mon, name: `polk_${m[1]}` });
                }
            }
            return out;
        },
    },
    // Tyler County clerk (CivicLive, co.tyler.tx.us): /page/tyler.Forclosures
    // is an accordion, one heading per sale MONTH ("SEPTEMBER 2026 FORECLUSRE"
    // -- the clerk's own typo, "FORECLUSRE" not "FORECLOSURE", so match on the
    // "FOR" stem) each followed by that month's per-notice PDFs under
    // /upload/page/3326/ (filename = grantor names + notice type). Sequential
    // heading->links scan like Hill/Medina/Burnet.
    tyler_cc: {
        fips: "48457",
        // sale venue: under the stairs of the north entrance, Tyler County
        // Courthouse, 100 West Bluff, Woodville (number-pinned)
        venue: /COURT\s*HOUSE|\b1[0O][0O]\s+W(?:EST)?\.?\s*BLUFF\b/i,
        discover: async () => {
            const base = "https://www.co.tyler.tx.us";
            const html = await fetchText(base + "/page/tyler.Forclosures");
            const re = /lblTitle_\d+">\s*([A-Za-z]+)\s+(\d{4})\s+FOR|href="(\/upload\/page\/3326\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let cur = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    const mon = MONTHS.indexOf(m[1].slice(0, 3).toUpperCase()) + 1;
                    cur = mon ? { year: +m[2], month: mon } : null;
                } else if (cur && inWindow(cur.year, cur.month) && !seen.has(m[3])) {
                    seen.add(m[3]);
                    out.push({
                        url: base + encodeURI(m[3]),
                        year: cur.year,
                        month: cur.month,
                        name: `tyler_${cur.year}-${String(cur.month).padStart(2, "0")}_${path.basename(m[3]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // San Jacinto County clerk (CivicLive, co.san-jacinto.tx.us): /page/
    // sanjacinto.ForeclosureListings links ONE consolidated packet per sale
    // month, anchor text "<MONTH> <YYYY> FORECLOSURE LISTINGS" (month+year
    // WITH year, printed directly -- no day). A sibling "NOTICE OF CONSTABLE
    // SALE" entry (delinquent-tax constable sale, not a mortgage trustee
    // notice) doesn't match the FORECLOSURE-suffix requirement.
    sanjacinto_cc: {
        fips: "48407",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.san-jacinto.tx.us";
            const html = await fetchText(base + "/page/sanjacinto.ForeclosureListings");
            const out = [], seen = new Set();
            for (const m of html.matchAll(/href="(\/upload\/page\/6947\/[^"]+\.pdf)">\s*([A-Za-z]+)\s+(\d{4})\s+FORECLOSURE/gi)) {
                const mon = MONTHS.indexOf(m[2].slice(0, 3).toUpperCase()) + 1;
                const year = +m[3];
                if (!mon || !inWindow(year, mon) || seen.has(m[1])) continue;
                seen.add(m[1]);
                out.push({
                    url: base + encodeURI(m[1]),
                    year,
                    month: mon,
                    name: `sanjacinto_${year}-${String(mon).padStart(2, "0")}_${path.basename(m[1]).replace(/[^\w.-]+/g, "_")}`,
                });
            }
            return out;
        },
    },
    // Shelby County clerk (CivicLive, co.shelby.tx.us): /page/
    // shelby.ForeclosureNotices lists per-notice PDFs under /upload/page/2757/
    // docs/<year>/FC-<year>-<NNN>.pdf, each preceded by "Posted M/D/YY:" text
    // (the FILING date, not the sale date) -> saleMonthAfter (+21d, Prop. Code
    // 51.002), like Navarro/Milam. Sequential posted-date -> link scan.
    shelby_cc: {
        fips: "48419",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "https://www.co.shelby.tx.us";
            const html = await fetchText(base + "/page/shelby.ForeclosureNotices");
            const re = /Posted\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4}):|href="(\/upload\/page\/2757\/docs\/[^"]+\.pdf)"/gi;
            const out = [], seen = new Set();
            let posted = null, m;
            while ((m = re.exec(html))) {
                if (m[1]) {
                    let py = +m[3];
                    if (py < 100) py += 2000;
                    posted = { y: py, m: +m[1], d: +m[2] };
                } else if (posted && m[4] && !seen.has(m[4])) {
                    seen.add(m[4]);
                    const s = saleMonthAfter(posted.y, posted.m, posted.d);
                    if (!inWindow(s.year, s.month)) continue;
                    out.push({
                        url: base + encodeURI(m[4]),
                        year: s.year,
                        month: s.month,
                        name: `shelby_${path.basename(m[4]).replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Sabine County clerk (easydocs/IDS app, sabine.easydocs.us -- the
    // CivicLive co.sabine.tx.us site's PublicDocuments page just links out):
    // /foreclosures/listDocs-new.asp?year=<Y> lists showdoc.asp?year=<Y>&
    // docName=<YYYY-MM-DD>-<grantor(s)> foreclosure--<time>.pdf where the
    // docName date IS the sale date (first-Tuesdays, Upshur/Polk semantics).
    // Filenames carry literal SPACES (unlike Upshur/Polk's dash-only names)
    // -> encodeURI the built URL.
    sabine_cc: {
        fips: "48403",
        venue: /COURT\s*HOUSE/i,
        discover: async () => {
            const base = "http://sabine.easydocs.us/foreclosures/";
            const now = new Date(), years = new Set();
            for (let d = -(+(process.env.FC_BACK || 0)); d <= 2; d++) {
                const t = new Date(Date.UTC(now.getFullYear(), now.getMonth() + d, 1));
                years.add(t.getUTCFullYear());
            }
            const out = [];
            for (const y of years) {
                let html;
                try {
                    html = await fetchText(`${base}listDocs-new.asp?year=${y}`);
                } catch (e) {
                    console.error(`  sabine ${y}: list fetch failed (${e.message})`);
                    continue;
                }
                for (const m of html.matchAll(/docName=(((\d{4})-(\d{2})-\d{2})[^"]*\.pdf)/gi)) {
                    const year = +m[3], mon = +m[4];
                    if (!mon || mon > 12 || !inWindow(year, mon)) continue;
                    out.push({
                        url: `${base}LinkedDir/${y}/${encodeURI(m[1])}`,
                        year,
                        month: mon,
                        name: `sabine_${m[1].replace(/[^\w.-]+/g, "_")}`,
                    });
                }
            }
            return out;
        },
    },
    // Liberty County: NOT here -- co.liberty.tx.us/page/liberty.Foreclosures
    // (CivicLive, per-notice PDFs under /upload/page/4883/ with filename
    // "F<MMDDYYYY>.<seq>.pdf" carrying the sale date) is STALE: the newest
    // accordion heading is "AUGUST 2023" -- nearly 3 years old, no 2024/2025/
    // 2026 content anywhere on the page. Per the >6mo staleness rule, skip
    // (verified 2026-07-16; --parse-only confirmed 0 packets in-window).
    // Jasper County: NOT here -- co.jasper.tx.us/page/jasper.Foreclosures is a
    // CivicLive CALENDAR widget (client-rendered), not a static list; its own
    // iCal feed (newtools.cira.state.tx.us/page/calendar/16795/0/calendar.ics)
    // is STALE -- every event dated 2018 (verified 2026-07-16). No current
    // notice system online.
    // Newton County: NOT here -- co.newton.tx.us/page/newton.county.clerk lists
    // per-notice foreclosure PDFs (/upload/page/3507/docs/Foreclosures/<case#>
    // <name>.pdf) in a static side-menu widget with NO dates anywhere (not in
    // the filename, not in the anchor text, not in a heading) -- nothing to
    // bucket by sale month. Skip (verified 2026-07-16).
    // Hardin County: NOT here -- hardincountytx.gov/page/Foreclosures (the
    // co.hardin.tx.us legacy host 302s here) renders the Foreclosures content
    // block completely EMPTY right now (just the page title, no notices, no
    // links); historical PDFs exist at /upload/page/8842/Docs/<Y>/<MON>/ (e.g.
    // Aug 2025) but nothing current to build a working discover() against.
    // Re-check when postings resume (verified 2026-07-16).
    // Trinity County: NOT here -- no foreclosure/trustee-sale page is linked
    // from the current co.trinity.tx.us nav (checked Home, County Clerk,
    // Public Notices); the older indexed URL (trinity.events_foreclosuresales2)
    // 403s under both curl and Node fetch regardless of case. Only "County Tax
    // Sales" (delinquent tax, not mortgage trustee notices) found. Skip
    // (verified 2026-07-16).
};

// sale-month window for discovery on archive-style pages that list years of
// history: current month .. 2 months out (packets are posted ~1 month ahead;
// older months are stale signals and pure OCR cost). Override via FC_BACK env.
function inWindow(y, m, back = +(process.env.FC_BACK || 0), fwd = 2) {
    const now = new Date();
    const d = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    return d >= -back && d <= fwd;
}

// Earliest legal sale month for a notice POSTED on y-m-d: the first
// (HB 1128-adjusted) first-Tuesday sale date >= posting + the 21-day statutory
// window (Tex. Prop. Code 51.002(b)). For sources whose listings carry the
// posting/upload date, not the sale date (Navarro; Milam fallback). Trustees
// that post extra-early land a month early -- accepted, event_date is a
// lead-freshness field, and most post 21-30 days out.
function saleMonthAfter(y, m, d) {
    let t = new Date(Date.UTC(y, m - 1, d + 21));
    for (let i = 0; i < 3; i++) {
        const sy = t.getUTCFullYear(), sm = t.getUTCMonth() + 1;
        if (saleDate(sy, sm) >= t.toISOString().slice(0, 10)) return { year: sy, month: sm };
        t = new Date(Date.UTC(sy, sm, 1));
    }
    return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 };
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
        String.raw`be[il1]ng\s+kn[o0]?[vw][nml1i]{0,3}\s+as`,
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
    "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST|CORRECTIONAL|DETENTION|COUNTY FEE|HOSPITAL DIST|FIRE DIST|JUVENILE)";

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
async function legalMatch(c, fips, notices, deadline = Infinity) {
    // OCR confuses single-letter blocks with digits (Block S vs 5, O vs 0)
    const CONFUSE = { O: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6" };
    let deferred = 0;
    for (const n of notices) {
        if (n.parcel_id || !n.legal) continue;
        // huge counties (Harris: 1.5M parcels, ~3s/probe, 200+ legal-only
        // notices) can't finish this phase inside one machine-capped run:
        // FC_LEGAL_MS budgets it, and the prior-match preload in loadSource
        // makes successive runs pick up where the last one stopped.
        if (Date.now() > deadline) {
            deferred++;
            continue;
        }
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
    if (deferred) console.log(`    legalMatch: FC_LEGAL_MS budget hit -- ${deferred} legal-only notices deferred to a re-run`);
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
        // preload matches persisted by a prior run (source_ref is stable), so
        // interrupted big-county runs converge instead of re-matching from
        // scratch -- parcel_signals READ only.
        const { rows: prior } = await c.query(
            `SELECT source_ref, parcel_id, lon, lat FROM parcel_signals
             WHERE source=$1 AND signal_type='pre_foreclosure' AND parcel_id IS NOT NULL
               AND source_ref = ANY($2::text[])`,
            [name, notices.map((n) => `${monthKey}:${n.key}`)]
        );
        const priorByRef = new Map(prior.map((r) => [r.source_ref, r]));
        for (const n of notices) {
            const hit = priorByRef.get(`${monthKey}:${n.key}`);
            if (hit && !n.parcel_id) {
                n.parcel_id = hit.parcel_id;
                n.lon = hit.lon;
                n.lat = hit.lat;
                n.match = "prior";
            }
        }
        await directMatch(c, cfg.fips, notices);
        await geocodeMatch(c, cfg.fips, notices);
        await legalMatch(c, cfg.fips, notices, process.env.FC_LEGAL_MS ? Date.now() + +process.env.FC_LEGAL_MS : Infinity);
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
        const pri = notices.filter((n) => n.match === "prior").length;
        console.log(
            `    matched ${direct + geo + leg + pri}/${notices.length} (${direct} direct, ${geo} geocode, ${leg} legal${pri ? `, ${pri} prior-run` : ""}) -> upserted ${notices.length} rows (${inserted} new)`
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

// --- shared-core exports (added 2026-07-16 to enable parallel per-region loaders
// without editing this file concurrently). A sibling script defines its own SOURCES
// object and calls runSources(itsSources) after importing the helpers below; the
// join/GOV_OWNER/upsert machinery stays single-sourced here. ---
export { MONTHS, inWindow, saleMonthAfter, fetchText, loadSource, UA };

export async function runSources(sources, { parseOnly = false } = {}) {
    let c = null;
    if (!parseOnly && !process.env.DATABASE_URL) throw new Error("DATABASE_URL required (or use --parse-only)");
    if (process.env.DATABASE_URL) {
        c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 180000, keepAlive: true });
        await c.connect();
    }
    for (const [name, cfg] of Object.entries(sources)) {
        try {
            await loadSource(c, name, cfg, parseOnly);
        } catch (e) {
            console.error(`${name} FAILED:`, e.message);
        }
    }
    if (c) await c.end();
}

// Only run the full 76-county main() when THIS file is executed directly
// (node load_pdf_foreclosures.mjs ...). When a per-region loader imports this
// module for its helpers, importing must NOT trigger a load run.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
