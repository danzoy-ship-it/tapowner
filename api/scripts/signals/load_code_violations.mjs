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
// SECOND PASS (2026-07-16) -- DFW suburbs + remaining metros/mid-size cities:
//   PLANO        Socrata dashboard.plano.gov `iv2p-bjd2` "Neighborhood Services
//                - Violations Substandard Structure SQL Data" -- LIVE (max
//                date_observed 2026-03-12, 270 2026-YTD opens at query time;
//                refreshed on a ~quarterly cadence, not daily like Austin, but
//                genuinely current -- NOT the 2017/2018-frozen kind of stale).
//                No parcelid/lat-lon on this feed (just `site_addr` free text,
//                e.g. "1612 M AVE") -> address-join via the kofile matcher,
//                county-bound to Collin 48085. Fields: site_addr, violation_type,
//                date_observed, property_type, violation_status, year. 29 KEPT
//                violation_type values (roof + exterior structural shell +
//                explicit dangerous/unsafe-structure): roofs/drainage, exterior
//                walls/foundation/chimney/overhang/structural-members, water-
//                damaged wall/ceiling, unsafe/unlawful/unfit-for-occupancy
//                structure (9,475 matching rows, 262 currently OPEN). DROPPED:
//                plumbing/electrical/fire/mechanical/interior-*/occupancy/
//                weeds/trash/vehicle/zoning (~150 other values) + cosmetic
//                "protective treatment" (paint/sealant, not structural) +
//                accessory-structure/window-door/decorative-feature buckets
//                (too far from the roof/structure-danger signal this loader
//                targets). Sibling dataset `5e5j-txgt` ("Property Exterior SQL")
//                was checked and is NOT a duplicate (73,215 rows vs 28,896, zero
//                address overlap in a spot-check) but carries ZERO roof/
//                structure-type violations of its own -- a different Neighborhood
//                Services program (yard/landscaping-adjacent), correctly out of
//                scope; not loaded. No case-id field exists in the public feed,
//                so source_ref is a sha1 of (site_addr|violation_type|
//                date_observed) -- the closest thing to a stable key Plano
//                exposes; a handful of true duplicate rows (same 3 fields,
//                observed live) collapse harmlessly to one signal.
//   ARLINGTON    Real ArcGIS hosted layer (services.arcgis.com/jXi5GuMZwfCYtZP9
//                /DSSMap_PublicView/FeatureServer/0), "Dangerous and Substandard
//                Structures (DSS)" -- LIVE (layer editingInfo Nov 2025), clean
//                WGS84 coords via outSR=4326, direct GlobalID as source_ref, plus
//                a bonus ParcelId field (not used -- spatial join is simpler and
//                consistent with the rest of this file). CaseType is a clean
//                2-value domain: 'DIL' (Dilapidated) / 'FD' (Fire Damaged) --
//                exactly the roof/structure-danger signal, no filtering needed.
//                Small (99 lifetime cases, 28 currently OPEN) but precise and
//                real. No per-case "opened" date exists (only CaseClosed for
//                resolved cases) -- OPEN kept always; CLOSED kept only if
//                CaseClosed within --recent-days. NOTE: Arlington's broader
//                "Code Complaint" layer (gis2.arlingtontx.gov .../OD_Community/
//                MapServer/6, daily-updated 25-month rolling window) was also
//                surveyed -- its VIOLDESCRIPTION values sampled (Nuisance
//                Outside Storage, Unclean Premises, ...) are yard/nuisance
//                complaints, not structure/roof condition, and it carries no
//                free-text field to reliably pull a "substandard structure"
//                subset out of the noise -- correctly left out (same call as
//                dropping Austin's "Property Abatement" bucket).
//   IRVING       ArcGIS Hub `Code_Violations_{2018,2019,2020,2021,2022}` --
//                5 annual snapshot layers, newest last touched 2022-09-19. No
//                2023+ dataset exists. STALE/discontinued -- genuine absence,
//                not loaded (same call as Dallas/Houston permits).
//   DENTON       CKAN "CIS Code Violations" catalog entry exists but has ZERO
//                resources attached (dead placeholder since 2019). Genuine
//                absence.
//   MESQUITE     Socrata opendata.cityofmesquite.com has no code/violation
//                dataset at all (only budget/checkbook data). Genuine absence.
//   MCKINNEY, GARLAND, GRAND PRAIRIE, FRISCO, CORPUS CHRISTI, ROUND ROCK,
//   COLLEGE STATION, LAREDO, LUBBOCK, AMARILLO, KILLEEN, McALLEN/BROWNSVILLE,
//   MIDLAND/ODESSA, ABILENE, TYLER, WICHITA FALLS, BEAUMONT, PEARLAND/PASADENA --
//   surveyed, no live case-level code-enforcement dataset found. Notable near-
//   misses ruled OUT after verification (not just "not found"): Grand Prairie's
//   top ArcGIS-hub search hit is Grande Prairie, ALBERTA (Canada) -- wrong
//   country; Frisco's top hit (open-data-cfw.hub.arcgis.com) is actually City
//   of FORT WORTH's own hub (CFW = City of Fort Worth), already covered under
//   fort_worth; Waco's "Code Enforcement" ArcGIS Experience app resolves to 4
//   year-named dashboards (2019/2020/2021/2022) all last touched Jan 2023 --
//   discontinued/stale, same as Dallas; Lubbock's only public layer
//   (LubbockPerformanceManagement_PublicView) is aggregate monthly KPI counts,
//   not case-level records; College Station's "Code Enforcement Areas" is
//   officer-jurisdiction zone polygons, not violation cases; Midland's and
//   Pasadena's top search hits resolve to Adams County COLORADO and Pasadena
//   CALIFORNIA respectively -- wrong jurisdictions entirely.
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
//     city in: austin, san_antonio, fort_worth, plano, arlington (default: all five)

import pkg from "pg";
import { pathToFileURL } from "url";
import crypto from "crypto";
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
    if (!opts.cities.length) opts.cities = ["austin", "san_antonio", "fort_worth", "plano", "arlington"];
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

// ---------------------------------------------------------------- PLANO (Socrata, address-join)

// The 29 KEPT violation_type values -- roof + exterior structural shell +
// explicit dangerous/unsafe-structure -- out of ~180 distinct values this
// dataset carries (plumbing/electrical/fire/mechanical/interior-*/occupancy/
// weeds/trash/vehicle/zoning/cosmetic "protective treatment" all dropped; see
// the CITY SURVEY note above for the full reasoning).
const PLANO_TYPES = [
    "ROOFS & DRAINAGE (GUTTERS)", "ROOFS", "ROOF-DEFECTIVE", "EXTERIOR STRUCTURE - ROOFS AND DRAINAGE",
    "EXTERIOR STRUCTURE - GENERAL", "EXTERIOR STRUCTURE - WALLS", "EXTERIOR STRUCTURAL MEMBERS",
    "EXTERIOR STRUCTURE - STRUCTURAL MEMBERS", "EXTERIOR STRUCTURE - FOUNDATION WALLS", "EXTERIOR FOUNDATION WALLS",
    "EXTERIOR WALLS", "EXTERIOR STRUCTURE - CHIMNEY AND TOWERS", "EXTERIOR CHIMNEYS & TOWERS", "CHIMNEYS AND TOWERS",
    "EXTERIOR STRUCTURE - OVERHANG EXTENSIONS", "EXTERIOR OVERHANG EXTENSIONS", "EXTERIOR STRUCTURE - OVERHANG EXTENTIONS",
    "WALL/OVERHANG-SOFFIT/FASCIA", "WALL/OVERHANG-ROT/HOLES", "WALL/OVERHANG-SIDING INTACT", "WALL/CEILING-WATER DAMAGED",
    "UNSAFE STRUCTURE", "UNSAFE STRUCTURES", "UNSAFE STRUCTURE - UNSAFE EQUIPMENT", "UNSAFE STRUCTURES - UNSAFE EQUIPMENT",
    "UNSAFE STRUCTURES - UNFIT FOR HUMAN OCCUPANCY", "UNSAFE STRUCTURES - UNLAWFUL STRUCTURE",
    "STRUCTURE UNFIT FOR OCCUPANCY", "UNLAWFUL STRUCTURE",
];
function planoSubtype(t) {
    const u = (t || "").toUpperCase();
    if (u.includes("ROOF")) return "roof";
    if (u.includes("UNSAFE") || u.includes("UNLAWFUL") || u.includes("UNFIT")) return "unsafe_structure";
    return "exterior_structure";
}

async function fetchPlano(recentDays) {
    const cutoff = new Date(Date.now() - recentDays * 86400000).toISOString().slice(0, 10);
    const typeList = PLANO_TYPES.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
    const where = `violation_type in(${typeList}) AND (violation_status='OPEN' OR (violation_status='CLOSED' AND date_observed >= '${cutoff}'))`;
    const base = "https://dashboard.plano.gov/resource/iv2p-bjd2.json";
    const PAGE = 5000;
    let offset = 0;
    const out = [];
    while (true) {
        const params = new URLSearchParams({
            $where: where, $order: "date_observed", $limit: String(PAGE), $offset: String(offset),
        });
        const r = await fetchRetry(`${base}?${params}`);
        const rows = await r.json();
        for (const row of rows) {
            out.push({
                site_addr: clean(row.site_addr), violation_type: row.violation_type,
                date_observed: (row.date_observed || "").slice(0, 10) || null,
                property_type: row.property_type, violation_status: row.violation_status, year: row.year,
            });
        }
        offset += rows.length;
        if (rows.length < PAGE) break;
    }
    return out;
}

// No case-id field exists in Plano's public feed (fields are just site_addr /
// violation_type / date_observed / property_type / violation_status / year) --
// sha1 of the first three gives a stable dedupe/upsert key across runs. A
// literal duplicate (same address+type+date, observed live in a spot-check)
// collapses harmlessly to one row.
function planoSourceRef(r) {
    const key = `${r.site_addr}|${r.violation_type}|${r.date_observed}`.toUpperCase();
    return "plano_" + crypto.createHash("sha1").update(key).digest("hex").slice(0, 20);
}

async function loadPlano(c, source, fips, records, dryRun) {
    console.log(`plano: ${records.length} cases fetched`);
    if (!records.length) return;

    const nums = [];
    for (const r of records) { const p = parseAddressCore(r.site_addr); if (p) nums.push(p.num); }
    const parcelIndex = await preloadParcelIndex(c, fips, nums);

    let matched = 0, unmatched = 0;
    const rows = [];
    for (const r of records) {
        const m = await matchAddressCandidate(c, fips, r.site_addr, { city: "PLANO", parcelIndex });
        if (!m) { unmatched++; continue; }
        matched++;
        rows.push({
            parcel_id: m.parcel_id, source_ref: planoSourceRef(r), event_date: r.date_observed,
            address: `${r.site_addr}, PLANO, TX`, lon: m.lon, lat: m.lat,
            meta: JSON.stringify({ subtype: planoSubtype(r.violation_type), violation_type: r.violation_type, status: r.violation_status, property_type: r.property_type, date_observed: r.date_observed }),
        });
    }
    console.log(`plano: address-match ${matched} / ${records.length} (${unmatched} unmatched)`);
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
        const allRefs = records.map((r) => planoSourceRef(r));
        const { rowCount: expired } = await c.query(
            `DELETE FROM parcel_signals WHERE source=$1 AND signal_type='code_violation' AND NOT (source_ref = ANY($2::text[]))`,
            [source, allRefs]
        );
        console.log(`plano: ${ins.length} parcel_signals upserted, ${expired} aged-out rows GC'd${dryRun ? " [DRY-RUN, rolled back]" : ""}`);
        await c.query(dryRun ? "ROLLBACK" : "COMMIT");
    } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
    }
}

// ---------------------------------------------------------------- ARLINGTON (ArcGIS, spatial join)

const ARLINGTON_SUBTYPE = { DIL: "dilapidated", FD: "fire_damaged" };

function parseMDY(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
}

async function fetchArlington(recentDays) {
    const cutoff = Date.now() - recentDays * 86400000;
    const base = "https://services.arcgis.com/jXi5GuMZwfCYtZP9/arcgis/rest/services/DSSMap_PublicView/FeatureServer/0/query";
    const params = new URLSearchParams({
        where: "1=1",
        outFields: "LocationAddress,PropertyType,CaseType,CaseStatus,CaseClosed,ComplianceMethod,ParcelId,GlobalID",
        outSR: "4326", returnGeometry: "true", f: "json", resultRecordCount: "2000",
    });
    const r = await fetchRetry(`${base}?${params}`);
    const data = await r.json();
    const feats = data.features || [];
    const out = [];
    for (const ft of feats) {
        const a = ft.attributes, g = ft.geometry;
        const closedDate = parseMDY(a.CaseClosed);
        // OPEN kept always; CLOSED kept only if it closed within --recent-days
        // (this layer has no separate "opened" date field to gate on instead).
        if (a.CaseStatus === "C" && (!closedDate || closedDate.getTime() < cutoff)) continue;
        if (!g || g.x == null || g.y == null) continue;
        out.push({
            source_ref: a.GlobalID, address: clean(a.LocationAddress), lat: g.y, lon: g.x,
            case_type: a.CaseType, status: a.CaseStatus, case_closed: a.CaseClosed,
            compliance_method: a.ComplianceMethod, property_type: a.PropertyType, parcel_id_src: a.ParcelId,
            event_date: closedDate ? closedDate.toISOString().slice(0, 10) : null,
        });
    }
    return out;
}

// ---------------------------------------------------------------- spatial-join loader (Austin, Fort Worth, Arlington)

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
            } else if (city === "plano") {
                const recs = await fetchPlano(opts.recentDays);
                await loadPlano(c, "plano_code", "48085", recs, opts.dryRun);
            } else if (city === "arlington") {
                const recs = await fetchArlington(opts.recentDays);
                await loadSpatial(c, "arlington", "arlington_code", "48439", recs, (r) => ({
                    source_ref: r.source_ref, event_date: r.event_date,
                    address: r.address, meta: { subtype: ARLINGTON_SUBTYPE[r.case_type] || "other", case_type: r.case_type, status: r.status, case_closed: r.case_closed, compliance_method: r.compliance_method, property_type: r.property_type, arlington_parcel_id: r.parcel_id_src },
                }), opts.dryRun);
            } else {
                console.log(`unknown city: ${city} (known: austin, san_antonio, fort_worth, plano, arlington)`);
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
