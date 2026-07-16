// Court-record seller-signal loader: COLLIN COUNTY (fips 48085) foreclosure
// notices -> parcel_signals. Sibling of load_county_foreclosures.mjs (Bexar
// ArcGIS) and load_pdf_foreclosures.mjs (PDF packets); this one is Collin-only
// because Collin publishes its Notice-of-Trustee-Sale list through a bespoke
// BLAZOR SERVER web app (apps2.collincountytx.gov/ForeclosureNotices), not a
// queryable feed. The prize: every notice the county could geocode carries
// map-marker COORDINATES, so -- exactly like Bexar -- we join SPATIALLY
// (point-in-polygon) to parcels and skip the address-typo lottery entirely.
//
// -------------------------------------------------------------------- how the
// data was obtained (why this reads a SNAPSHOT, not a live URL):
//   The page is Blazor Server. The notice list is pushed to the browser over a
//   SignalR websocket and rendered client-side; there is NO JSON/REST endpoint
//   and NO ArcGIS service (Collin's GIS host gis.collincountytx.gov is also
//   firewalled from our runners). A plain fetch() gets only the prerender
//   shell -- the <table> and map are empty until the circuit connects. So the
//   list cannot be pulled head-lessly with curl/node.
//
//   It CAN be pulled by driving a real browser. In maps.js the app calls
//   setProperties(items) with items = {lat, long, propertyAddress, entryID};
//   L.markerClusterGroup `markers` then holds one L.marker per GEOCODED notice
//   (368 of 670 total notices had coordinates on 2026-07-16). The per-notice
//   SALE DATE is not on the marker, but the "Sale Dates" filter is single-
//   select, so selecting each of the 8 sale-date options in turn re-plots the
//   map to just that date's markers -- tag them, union the 8 sets -> a clean
//   {entryID, lat, lng, address, saleDate} row per notice, no fuzzy join.
//   The captured rows live in collin_foreclosures_snapshot.json next to this
//   file. Re-capture: load the page in a browser, then for each sale-date
//   option read markers.getLayers() -> getLatLng()/getPopup() (popup content
//   is `<a href=DetailPage/{entryID}>{address}</a>`). All TX trustee sales are
//   the first Tuesday of the month, which every captured saleDate already is.
//
// The DB side is identical to load_county_foreclosures.mjs: spatial upsert,
// gov-owner exclusion, ON CONFLICT idempotency, stale-notice expiry. parcels
// is READ-ONLY and every parcels query is county_fips=48085-scoped (Collin is
// large). We ONLY write parcel_signals.
//
//   DATABASE_URL=... node scripts/signals/load_collin_foreclosures.mjs [--dry]
//
// --dry: parse the snapshot + report tie stats against parcels, write nothing.
//
// Verified 2026-07-16: 368 geocoded notices captured.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "pg";
const { Client } = pkg;

const FIPS = "48085";
const SOURCE = "collin_cc";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = process.env.COLLIN_SNAPSHOT || path.join(HERE, "collin_foreclosures_snapshot.json");

// Same gov-owner guard as the shared loaders: never flag a signal on a parcel
// the county/city/ISD/etc. owns (courthouse, right-of-way, tax-seized lots).
const GOV_OWNER =
    "(COUNTY OF|CITY OF|TOWN OF| COUNTY$|STATE OF TEXAS| ISD| MUD |MUNICIPAL UTIL|SCHOOL DIST|HOUSING AUTHORITY|WATER CONTROL|DRAINAGE DIST)";

// "MM/DD/YYYY" -> "YYYY-MM-DD" (the captured sale date; already a first Tuesday).
function toISO(mdy) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(mdy || "").trim());
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function loadSnapshot() {
    const rows = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
    const out = [];
    for (const r of rows) {
        const lon = Number(r.lng);
        const lat = Number(r.lat);
        const event = toISO(r.d);
        if (!r.id || !Number.isFinite(lon) || !Number.isFinite(lat) || !event) continue;
        const addr = String(r.a || "").trim();
        const zip = (addr.match(/,\s*TX\s*(\d{5})/) || [])[1] || null;
        out.push({
            ref: String(r.id),
            addr: addr || null,
            event,
            lon,
            lat,
            meta: { zip, detail_url: `https://apps2.collincountytx.gov/ForeclosureNotices/DetailPage/${r.id}`, sale_date: r.d },
        });
    }
    return out;
}

async function ensureSchema(c) {
    await c.query(`CREATE TABLE IF NOT EXISTS parcel_signals(
        id bigserial PRIMARY KEY, parcel_id bigint, county_fips text, signal_type text NOT NULL,
        subtype text, event_date date, source text NOT NULL, source_ref text, address text,
        lon float8, lat float8, meta jsonb,
        first_seen date DEFAULT current_date, last_seen date DEFAULT current_date)`);
    await c.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_parcel_signals_src ON parcel_signals(source, signal_type, source_ref)`
    );
    await c.query(`CREATE INDEX IF NOT EXISTS ix_parcel_signals_parcel ON parcel_signals(parcel_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS ix_parcel_signals_type ON parcel_signals(county_fips, signal_type)`);
}

async function main() {
    const dry = process.argv.includes("--dry");
    const recs = loadSnapshot();
    if (recs.length === 0) {
        console.log(`${SOURCE}: snapshot empty -- refusing to run (would expire everything)`);
        return;
    }

    const cols = { refs: [], ad: [], dt: [], lo: [], la: [], mt: [] };
    for (const r of recs) {
        cols.refs.push(r.ref);
        cols.ad.push(r.addr);
        cols.dt.push(r.event);
        cols.lo.push(r.lon);
        cols.la.push(r.lat);
        cols.mt.push(JSON.stringify(r.meta));
    }

    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        statement_timeout: 180000,
        keepAlive: true,
    });
    await c.connect();
    await ensureSchema(c);
    await c.query("BEGIN");
    await c.query(
        `CREATE TEMP TABLE fc(source_ref text, address text, event_date date, lon float8, lat float8, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO fc SELECT * FROM unnest($1::text[],$2::text[],$3::date[],$4::float8[],$5::float8[],$6::text[]::jsonb[])`,
        [cols.refs, cols.ad, cols.dt, cols.lo, cols.la, cols.mt]
    );

    // Spatial join: point-in-parcel, Collin-scoped, gov-owners excluded. A
    // notice whose point lands in no (non-gov) Collin parcel ties parcel_id=NULL
    // (still stored as a signal; downstream can revisit).
    const joinSql = `
        FROM fc
        LEFT JOIN parcels p
          ON p.county_fips = '${FIPS}'
         AND p.owner_name !~* $1
         AND ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(fc.lon, fc.lat), 4326))`;

    if (dry) {
        const { rows: r2 } = await c.query(
            `SELECT count(*) n, count(p.id) tied ${joinSql}`,
            [GOV_OWNER]
        );
        await c.query("ROLLBACK");
        await c.end();
        const { n, tied } = r2[0];
        console.log(
            `${SOURCE} [DRY]: ${n} notices, ${tied} tie to a Collin parcel (${Math.round((100 * tied) / n)}%)`
        );
        return;
    }

    const { rows: ins } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT p.id, '${FIPS}', 'pre_foreclosure', NULL, fc.event_date, '${SOURCE}', fc.source_ref, fc.address, fc.lon, fc.lat, fc.meta
         ${joinSql}
         ON CONFLICT (source,signal_type,source_ref)
           DO UPDATE SET last_seen=current_date, parcel_id=EXCLUDED.parcel_id,
                         event_date=EXCLUDED.event_date, address=EXCLUDED.address, meta=EXCLUDED.meta,
                         lon=EXCLUDED.lon, lat=EXCLUDED.lat
         RETURNING parcel_id`,
        [GOV_OWNER]
    );

    // Expire notices that fell off today's full snapshot (cured / sold / past).
    const { rowCount: expired } = await c.query(
        `DELETE FROM parcel_signals WHERE source='${SOURCE}' AND signal_type='pre_foreclosure' AND last_seen < current_date`
    );
    await c.query("COMMIT");

    // Sanity: confirm 0 signals landed on a gov-owned parcel.
    const { rows: govChk } = await c.query(
        `SELECT count(*) n FROM parcel_signals s JOIN parcels p ON p.id=s.parcel_id
         WHERE s.source='${SOURCE}' AND p.owner_name ~* $1`,
        [GOV_OWNER]
    );
    await c.end();

    const tied = ins.filter((r) => r.parcel_id).length;
    console.log(
        `${SOURCE}: ${ins.length} notices, ${tied} tied to a parcel (${Math.round((100 * tied) / ins.length)}%), ${expired} expired, gov-owned signals=${govChk[0].n}`
    );
}

main().catch((e) => {
    console.error(`${SOURCE} FAILED:`, e.message);
    process.exit(1);
});
