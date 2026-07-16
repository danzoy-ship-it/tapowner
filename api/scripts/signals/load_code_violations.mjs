// Roofer-vertical seller-signal loader: city CODE-ENFORCEMENT violations for
// dangerous/substandard structures and deteriorated roofs -> parcel_signals
// (signal_type='code_violation'). See ROOFER_SIGNALS.md signal #21 ("roof-condition
// code violations / tarps"). Same ethics posture as the permit mining: bulk public
// open data only, generic outreach at the app layer (never surface the violation
// itself in AI-drafted copy -- same rule as probate/foreclosure/pre_foreclosure).
//
// CITY SURVEY (2026-07-16) -- what was found, what was usable:
//   AUSTIN       Socrata data.austintexas.gov `6wtj-zbtb` "Austin Code Complaint
//                Cases" -- LIVE (rows dated through today), has parcelid + lat/lon
//                + a `description` field that is really a coarse CATEGORY
//                ('Property Abatement' / 'Structure Condition Violation(s)' /
//                'Land Use Violation(s)' / 'Work Without Permit'). KEPT:
//                'Structure Condition Violation(s)*' only (dangerous/substandard
//                structure incl. roof). DROPPED: Property Abatement (weeds/trash),
//                Land Use (zoning), Work Without Permit (too generic/not roof-tied).
//   SAN ANTONIO  ArcGIS FeatureServer `311_All_Service_Calls` (services.arcgis.com/
//                g1fRTDLeMgspWrYp -- same org as the existing SA permits loader) --
//                LIVE. Code cases route through the 311 system; Department=
//                'Development Services', ReasonName='Code Enforcement'. Surveyed
//                47 distinct TypeName values under that department; KEPT 5:
//                'Dangerous Premise BSB Processed', 'DP Emergency Demolition',
//                'DP Warrant Assessment', 'Property Structure Concerns(Structure
//                Exterior)', 'Structure Maintenance Multi-Tenant (Exterior)'.
//                DROPPED the other 42 (weeds/trash/junk-vehicle/zoning/graffiti/
//                sidewalk/parking/permits-without-inspection/interior-only
//                structure+water-leak complaints -- interior conditions and
//                plumbing leaks are not the roof/exterior-structure signal this
//                loader targets). NOTE: the layer's XCOORD/YCOORD are unreliable
//                (mixed State-Plane-feet and raw lon/lat sentinel values in the
//                same column across rows -- verified live) so this city joins by
//                ADDRESS (ObjectDescription free text: "<street>, SAN ANTONIO, TX
//                <zip>"), reusing the kofile OCR-address matcher verbatim.
//   FORT WORTH   ArcGIS Server `mapit.fortworthtexas.gov` CIVIC/Code_Violations_
//                Experience_Builder/MapServer/4 (same self-hosted host as the
//                existing FW permits loader) -- LIVE, clean WGS84 Latitude/
//                Longitude + Address. 10 Complaint_Type_Description values
//                surveyed; KEPT only 'Substandard Building' (2,565 cases).
//                DROPPED: High Grass/Weeds, Solid Waste Violation, Vehicle,
//                Zoning-Commercial/Residential, Multi-Family, Health Hazard,
//                Homeless Camp Abatement, Property Maintenance (too generic --
//                no free-text description field exists on this layer to
//                disambiguate paint/fence/yard issues from roof/structure ones).
//   DALLAS       Found 3 Socrata "Code Violations" datasets (x9pz-kdq9, xrzj-c8ez,
//                yvha-at84) -- ALL STALE. Verified live: max recorded date across
//                all three is 2018-08-31 / 2017-06-30. Same open-data
//                discontinuation already documented for Dallas permits
//                (PERMIT_COVERAGE.md) -- genuine absence of a *recent* feed, not a
//                failure to look. SKIPPED (nothing to load -- an 8-year-old
//                "Closed" status is not a live signal).
//   HOUSTON      Found a real CKAN bulk dataset (data.houstontx.gov
//                "city-of-houston-building-code-enforcement-violations-don"),
//                incl. a rich XLSX with Violation_Category ('Dangerous Building',
//                'Minimum Standards' -- both roof-relevant per spec) + HCAD parcel
//                id + Merged_Situs address + Project_Status. Downloaded + parsed
//                (376,092 rows; 83,490 roof-relevant). BUT verified live: the
//                file's max RecordCreateDate is 2018-08-22 -- it is a frozen
//                historical export (uploaded to the portal in 2023, but the
//                underlying FORMS data was never refreshed past mid-2018). Even
//                its 14,405 "OPEN" roof-relevant rows reflect open-as-of-2018
//                status, not a live 2026 flag -- loading them as `code_violation`
//                would misrepresent stale data as current. SKIPPED per the same
//                honesty bar as Dallas (genuine staleness, not gated/absent --
//                Houston's LIVE code-enforcement system has no free bulk mirror;
//                same TPIA-records-request path already logged for Houston
//                permits would be the way to get current data).
//
// RECENCY: "open" cases are always kept; a case whose status flips to
// closed/resolved is kept only if it closed within --recent-days (default 180)
// so a homeowner who just got their structure re-roofed/repaired to clear the
// case still shows up briefly (useful "did they finish?" cross-reference) but a
// violation resolved years ago does not. event_date = the case OPENED date (the
// signal's real "why now", independent of status) so a query-time recency filter
// behaves the same as every other signal in this table.
//
//   DATABASE_URL=... node scripts/signals/load_code_violations.mjs [city...] [--recent-days=180] [--dry-run]
//     city in: austin, san_antonio, fort_worth (default: all three)

import pkg from "pg";
import { pathToFileURL } from "url";
import { streetFromOcr, matchAddressCandidate, preloadParcelIndex, parseAddressCore } from "./load_kofile_foreclosures.mjs";
const { Client } = pkg;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Same guard the foreclosure/permit signals use: institutional owners are not
// real seller leads.
const GOV_OWNER_RE = "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST|CORRECTIONAL|DETENTION|COUNTY FEE|HOSPITAL DIST|FIRE DIST|JUVENILE)";

function parseArgs() {
    const a = process.argv.slice(2);
    const opts = { cities: [], recentDays: 180, dryRun: false };
    for (const t of a) {
        if (t.startsWith("--recent-days=")) opts.recentDays = parseInt(t.split("=")[1], 10);
        else if (t === "--dry-run") opts.dryRun = true;
        else if (!t.startsWith("--")) opts.cities.push(t);
    }
    if (!opts.cities.length) opts.cities = ["austin", "san_antonio", "fort_worth"];
    return opts;
}

async function fetchRetry(url, opts = {}, attempts = 5) {
    for (let a = 1; a <= attempts; a++) {
        try {
            const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60000), ...opts });
            if (r.ok) return r;
            if (r.status >= 500 && a < attempts) { await sleep(2000 * a); continue; }
            throw new Error(`HTTP ${r.status}`);
        } catch (e) {
            if (a === attempts) throw e;
            await sleep(2000 * a);
        }
    }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (x) => String(x ?? "").replace(/\t/g, " ").replace(/\r/g, " ").replace(/\n/g, " ").trim();

async function ensureSchema(c) {
    await c.query(`CREATE TABLE IF NOT EXISTS parcel_signals(
        id bigserial PRIMARY KEY, parcel_id bigint, county_fips text, signal_type text NOT NULL,
        subtype text, event_date date, source text NOT NULL, source_ref text, address text,
        lon float8, lat float8, meta jsonb,
        first_seen date DEFAULT current_date, last_seen date DEFAULT current_date)`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_parcel_signals_src ON parcel_signals(source, signal_type, source_ref)`);
    await c.query(`CREATE INDEX IF NOT EXISTS ix_parcel_signals_parcel ON parcel_signals(parcel_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS ix_parcel_signals_type ON parcel_signals(county_fips, signal_type)`);
}

// ---------------------------------------------------------------- AUSTIN (Socrata)

async function fetchAustin(recentDays) {
    const cutoff = new Date(Date.now() - recentDays * 86400000).toISOString().slice(0, 19);
    const where = `description like 'Structure Condition Violation%' AND (status='Active' OR status='Pending' OR (status='Closed' AND closed_date >= '${cutoff}'))`;
    const base = "https://data.austintexas.gov/resource/6wtj-zbtb.json";
    const select = "case_id,parcelid,address,house_number,street_name,city,zip_code,status,opened_date,closed_date,description,latitude,longitude,violationcasenumber";
    const PAGE = 5000;
    let offset = 0;
    const out = [];
    while (true) {
        const url = `${base}?$select=${encodeURIComponent(select)}&$where=${encodeURIComponent(where)}&$order=case_id&$limit=${PAGE}&$offset=${offset}`;
        const r = await fetchRetry(url);
        const rows = await r.json();
        for (const row of rows) {
            const lat = parseFloat(row.latitude), lon = parseFloat(row.longitude);
            out.push({
                source_ref: row.case_id, status: row.status, opened_date: (row.opened_date || "").slice(0, 10) || null,
                closed_date: (row.closed_date || "").slice(0, 10) || null, address: clean(row.address),
                lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
                meta: { case_type: "Complaints", description: "Structure Condition Violation(s)", department: "Code Enforcement", parcelid: row.parcelid, violationcasenumber: row.violationcasenumber, city: row.city, zip: row.zip_code },
            });
        }
        offset += rows.length;
        if (rows.length < PAGE) break;
    }
    return out;
}

// ---------------------------------------------------------------- SAN ANTONIO (ArcGIS, address-join)

const SA_TYPES = ["Dangerous Premise BSB Processed", "DP Emergency Demolition", "DP Warrant Assessment", "Property Structure Concerns(Structure Exterior)", "Structure Maintenance Multi-Tenant (Exterior)"];
const SA_SUBTYPE = {
    "Dangerous Premise BSB Processed": "dangerous_premise_bsb",
    "DP Emergency Demolition": "dp_emergency_demolition",
    "DP Warrant Assessment": "dp_warrant_assessment",
    "Property Structure Concerns(Structure Exterior)": "structure_exterior",
    "Structure Maintenance Multi-Tenant (Exterior)": "structure_multitenant_exterior",
};

async function fetchSanAntonio(recentDays) {
    const cutoffDate = new Date(Date.now() - recentDays * 86400000).toISOString().slice(0, 10);
    const typeList = SA_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
    const where = `TypeName IN (${typeList}) AND (CaseStatus='OPEN' OR (CaseStatus='CLOSED' AND ClosedDateTime >= timestamp '${cutoffDate} 00:00:00'))`;
    const base = "https://services.arcgis.com/g1fRTDLeMgspWrYp/arcgis/rest/services/311_All_Service_Calls/FeatureServer/0/query";
    const PAGE = 2000;
    let offset = 0;
    const out = [];
    while (true) {
        const params = new URLSearchParams({
            // NOTE: this layer's `CaseID` field is 0 for every row (verified live
            // 2026-07-16 -- a real data quirk of the source, not populated for the
            // Development Services rows even though it's a real integer column) so
            // it cannot serve as our unique key. OBJECTID (the service's own
            // uniqueIdField) is used instead.
            where, outFields: "OBJECTID,CaseID,TypeName,CaseStatus,OpenedDateTime,ClosedDateTime,ObjectDescription",
            returnGeometry: "false", f: "json", resultRecordCount: String(PAGE), resultOffset: String(offset),
            orderByFields: "OBJECTID",
        });
        const r = await fetchRetry(`${base}?${params}`);
        const data = await r.json();
        const feats = data.features || [];
        for (const ft of feats) {
            const a = ft.attributes;
            out.push({
                source_ref: `sa311_${a.OBJECTID}`, type_name: a.TypeName, status: a.CaseStatus,
                opened_date: a.OpenedDateTime ? new Date(a.OpenedDateTime).toISOString().slice(0, 10) : null,
                closed_date: a.ClosedDateTime ? new Date(a.ClosedDateTime).toISOString().slice(0, 10) : null,
                raw_address: clean(a.ObjectDescription),
            });
        }
        offset += feats.length;
        if (!data.exceededTransferLimit && feats.length < PAGE) break;
    }
    return out;
}

// ---------------------------------------------------------------- FORT WORTH (ArcGIS, spatial join)

async function fetchFortWorth(recentDays) {
    const cutoffDate = new Date(Date.now() - recentDays * 86400000).toISOString().slice(0, 10);
    const where = `Complaint_Type_Description='Substandard Building' AND (Case_Current_Status='Open' OR (Case_Current_Status='Closed' AND Update_Date >= timestamp '${cutoffDate} 00:00:00'))`;
    const base = "https://mapit.fortworthtexas.gov/ags/rest/services/CIVIC/Code_Violations_Experience_Builder/MapServer/4/query";
    const PAGE = 1000;
    let offset = 0;
    const out = [];
    while (true) {
        const params = new URLSearchParams({
            where, outFields: "Case_ID,Address,Case_Created_Date,Case_Current_Status,Update_Date,Latitude,Longitude,ZipCode",
            returnGeometry: "false", f: "json", resultRecordCount: String(PAGE), resultOffset: String(offset),
            orderByFields: "CCV_ID",
        });
        const r = await fetchRetry(`${base}?${params}`);
        const data = await r.json();
        const feats = data.features || [];
        for (const ft of feats) {
            const a = ft.attributes;
            const lat = a.Latitude, lon = a.Longitude;
            out.push({
                source_ref: String(a.Case_ID), status: a.Case_Current_Status,
                opened_date: a.Case_Created_Date ? new Date(a.Case_Created_Date).toISOString().slice(0, 10) : null,
                update_date: a.Update_Date ? new Date(a.Update_Date).toISOString().slice(0, 10) : null,
                address: clean(a.Address), zip: a.ZipCode,
                lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
            });
        }
        offset += feats.length;
        if (!data.exceededTransferLimit && feats.length < PAGE) break;
    }
    return out;
}

// ---------------------------------------------------------------- spatial-join loader (Austin, Fort Worth)

// Bulk point-in-polygon join: exact parcel match via ST_Contains (no fuzzy
// address parsing needed -- both cities publish real WGS84 coordinates), scoped
// to the city's county so it's an indexed lookup, never a 14M-row scan.
async function loadSpatial(c, name, source, fips, records, toRow, dryRun) {
    const withCoords = records.filter((r) => r.lat != null && r.lon != null);
    console.log(`${name}: ${records.length} cases fetched, ${withCoords.length} have coordinates`);
    if (!withCoords.length) return;

    await c.query("BEGIN");
    try {
        await c.query(`CREATE TEMP TABLE cv(source_ref text, event_date date, lon float8, lat float8, address text, meta jsonb) ON COMMIT DROP`);
        // Dedupe by source_ref (the source feed occasionally repeats a case across
        // pages) -- keep the last occurrence, same pattern as the kofile loader.
        const byRef = new Map();
        for (const r of withCoords) byRef.set(toRow(r).source_ref, { r, row: toRow(r) });
        const uniq = [...byRef.values()];
        const refs = [], dates = [], lons = [], lats = [], addrs = [], metas = [];
        for (const { r, row } of uniq) {
            refs.push(row.source_ref); dates.push(row.event_date); lons.push(r.lon); lats.push(r.lat);
            addrs.push(row.address); metas.push(JSON.stringify(row.meta));
        }
        await c.query(
            `INSERT INTO cv SELECT * FROM unnest($1::text[],$2::date[],$3::float8[],$4::float8[],$5::text[],$6::text[]::jsonb[])`,
            [refs, dates, lons, lats, addrs, metas]
        );
        // DISTINCT ON source_ref alone -- one case must resolve to at most ONE
        // parcel (a point on a shared boundary could otherwise match 2 adjacent
        // parcels, which would violate the (source,signal_type,source_ref)
        // conflict target).
        const { rows: ins } = await c.query(
            `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
             SELECT DISTINCT ON (cv.source_ref)
               p.id, $2, 'code_violation', cv.meta->>'subtype', cv.event_date, $1, cv.source_ref, cv.address, cv.lon, cv.lat, cv.meta
             FROM cv
             JOIN parcels p ON p.county_fips=$2
               AND ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(cv.lon,cv.lat),4326))
               AND (p.owner_name IS NULL OR p.owner_name !~* '${GOV_OWNER_RE}')
             ORDER BY cv.source_ref, p.id
             ON CONFLICT (source,signal_type,source_ref) DO UPDATE SET
               last_seen=current_date, parcel_id=EXCLUDED.parcel_id, event_date=EXCLUDED.event_date,
               address=EXCLUDED.address, lon=EXCLUDED.lon, lat=EXCLUDED.lat, meta=EXCLUDED.meta
             RETURNING parcel_id`,
            [source, fips]
        );
        // GC: the fetch step above always pulls the FULL current set of open +
        // recently-closed cases (not an incremental delta), so any previously
        // stored row whose source_ref is NOT in this run's set is, by
        // construction, no longer open and no longer recently-closed -- safe to
        // drop unconditionally (no arbitrary time threshold needed).
        const { rowCount: expired } = await c.query(
            `DELETE FROM parcel_signals WHERE source=$1 AND signal_type='code_violation' AND NOT (source_ref = ANY($2::text[]))`,
            [source, refs]
        );
        console.log(`${name}: ${ins.length} tied to a parcel (of ${withCoords.length} geocoded), ${expired} aged-out rows GC'd${dryRun ? " [DRY-RUN, rolled back]" : ""}`);
        await c.query(dryRun ? "ROLLBACK" : "COMMIT");
    } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
    }
}

// ---------------------------------------------------------------- address-join loader (San Antonio)

async function loadSanAntonio(c, source, fips, records, recentDays, dryRun) {
    console.log(`san_antonio: ${records.length} cases fetched`);
    if (!records.length) return;

    // Parse "<street>, SAN ANTONIO, TX <zip>" out of ObjectDescription (the exact
    // shape the kofile OCR-street regex targets) and preload the whole batch's
    // candidate parcels in one county-bound query (fix-3 pattern from the
    // foreclosure loader) instead of a per-row scan.
    const parsed = records.map((r) => ({ r, street: streetFromOcr(r.raw_address, null) }));
    const nums = [];
    for (const { street } of parsed) if (street) { const p = parseAddressCore(street.street); if (p) nums.push(p.num); }
    const parcelIndex = await preloadParcelIndex(c, fips, nums);

    let matched = 0, unmatched = 0;
    const rows = [];
    for (const { r, street } of parsed) {
        if (!street) { unmatched++; continue; }
        const m = await matchAddressCandidate(c, fips, street.street, { city: street.city, zip: street.zip, parcelIndex });
        if (!m) { unmatched++; continue; }
        matched++;
        rows.push({
            parcel_id: m.parcel_id, source_ref: r.source_ref, event_date: r.opened_date,
            address: `${street.street}, ${street.city}, TX ${street.zip}`, lon: m.lon, lat: m.lat,
            meta: JSON.stringify({ subtype: SA_SUBTYPE[r.type_name] || "other", type_name: r.type_name, department: "Development Services", reason: "Code Enforcement", status: r.status, opened_date: r.opened_date, closed_date: r.closed_date, raw_address: r.raw_address }),
        });
    }
    console.log(`san_antonio: address-match ${matched} / ${records.length} (${unmatched} unmatched)`);
    // Dedupe by source_ref (defensive -- same repeat-across-pages risk as the
    // other cities), keep the last occurrence.
    const byRef = new Map();
    for (const x of rows) byRef.set(x.source_ref, x);
    const uniqRows = [...byRef.values()];
    if (!uniqRows.length) return;

    await c.query("BEGIN");
    try {
        await c.query(`CREATE TEMP TABLE cv(parcel_id bigint, source_ref text, event_date date, address text, lon float8, lat float8, meta jsonb) ON COMMIT DROP`);
        await c.query(
            `INSERT INTO cv SELECT * FROM unnest($1::bigint[],$2::text[],$3::date[],$4::text[],$5::float8[],$6::float8[],$7::text[]::jsonb[])`,
            [uniqRows.map((x) => x.parcel_id), uniqRows.map((x) => x.source_ref), uniqRows.map((x) => x.event_date),
             uniqRows.map((x) => x.address), uniqRows.map((x) => x.lon), uniqRows.map((x) => x.lat), uniqRows.map((x) => x.meta)]
        );
        const { rows: ins } = await c.query(
            `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
             SELECT cv.parcel_id, $2, 'code_violation', cv.meta->>'subtype', cv.event_date, $1, cv.source_ref, cv.address, cv.lon, cv.lat, cv.meta
             FROM cv
             ON CONFLICT (source,signal_type,source_ref) DO UPDATE SET
               last_seen=current_date, parcel_id=EXCLUDED.parcel_id, event_date=EXCLUDED.event_date,
               address=EXCLUDED.address, lon=EXCLUDED.lon, lat=EXCLUDED.lat, meta=EXCLUDED.meta
             RETURNING parcel_id`,
            [source, fips]
        );
        // Same full-snapshot GC rule as loadSpatial -- this fetch always pulls the
        // complete current open+recently-closed set, so anything stored that
        // isn't in it anymore is stale.
        const allRefs = records.map((r) => r.source_ref);
        const { rowCount: expired } = await c.query(
            `DELETE FROM parcel_signals WHERE source=$1 AND signal_type='code_violation' AND NOT (source_ref = ANY($2::text[]))`,
            [source, allRefs]
        );
        console.log(`san_antonio: ${ins.length} parcel_signals upserted, ${expired} aged-out rows GC'd${dryRun ? " [DRY-RUN, rolled back]" : ""}`);
        await c.query(dryRun ? "ROLLBACK" : "COMMIT");
    } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
    }
}

// ---------------------------------------------------------------- main

async function main() {
    const opts = parseArgs();
    const c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 300000, keepAlive: true });
    await c.connect();
    await ensureSchema(c);

    for (const city of opts.cities) {
        try {
            if (city === "austin") {
                const recs = await fetchAustin(opts.recentDays);
                await loadSpatial(c, "austin", "austin_code", "48453", recs, (r) => ({
                    source_ref: r.source_ref, event_date: r.opened_date,
                    address: r.address, meta: { subtype: "structure_condition", ...r.meta, status: r.status, opened_date: r.opened_date, closed_date: r.closed_date, case_id: r.source_ref },
                }), opts.dryRun);
            } else if (city === "san_antonio") {
                const recs = await fetchSanAntonio(opts.recentDays);
                await loadSanAntonio(c, "san_antonio_code", "48029", recs, opts.recentDays, opts.dryRun);
            } else if (city === "fort_worth") {
                const recs = await fetchFortWorth(opts.recentDays);
                await loadSpatial(c, "fort_worth", "fort_worth_code", "48439", recs, (r) => ({
                    source_ref: r.source_ref, event_date: r.opened_date,
                    address: r.address, meta: { subtype: "substandard_building", status: r.status, opened_date: r.opened_date, update_date: r.update_date, case_id: r.source_ref, zip: r.zip },
                }), opts.dryRun);
            } else {
                console.log(`unknown city: ${city} (known: austin, san_antonio, fort_worth)`);
            }
        } catch (e) {
            console.error(`${city} FAILED:`, e.message);
        }
    }

    const { rows: totals } = await c.query(
        `SELECT source, count(*) FROM parcel_signals WHERE signal_type='code_violation' GROUP BY source ORDER BY 2 DESC`
    );
    console.log("\ncode_violation totals by source:");
    for (const r of totals) console.log(`  ${r.source}: ${r.count}`);
    await c.end();
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    main();
}
