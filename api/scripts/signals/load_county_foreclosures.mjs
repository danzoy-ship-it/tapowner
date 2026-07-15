// Court-record seller-signal loader: county foreclosure notices (Notice of
// Trustee's Sale) -> parcel_signals. App-session lane (SIGNALS_ROADMAP.md /
// HANDOFF 3b amendment). TX law requires every county clerk to post these
// online; many counties expose a queryable ArcGIS feed with POINT geometry, so
// we join SPATIALLY (point-in-polygon) to parcels -- immune to the address
// typos/suffix-variance that make string matching useless (Bexar naive match
// was 7%; spatial match is 97%).
//
// Add a county: drop a config below (its ArcGIS MapServer/FeatureServer + the
// foreclosure layer ids). Re-run daily; ON CONFLICT refreshes last_seen so new
// filings get a fresh first_seen (the daily-alerts diff, SIGNALS_ROADMAP.md).
//
//   DATABASE_URL=... node scripts/signals/load_county_foreclosures.mjs [source...]
//
// Verified 2026-07-16: bexar 277/285 parcels (97%).

import pkg from "pg";
const { Client } = pkg;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";

// Each source = one county clerk's foreclosure feed. layers: the ArcGIS layer
// ids and what kind of foreclosure each is.
const SOURCES = {
    bexar_cc: {
        base: "https://maps.bexar.org/arcgis/rest/services/CC/ForeclosuresProd/MapServer",
        layers: [
            { id: 0, subtype: "mortgage" },
            { id: 1, subtype: "tax" },
        ],
    },
};

// Texas trustee sales are the first Tuesday of the month; notices carry YEAR/MONTH.
function firstTuesday(y, m) {
    const d = new Date(Date.UTC(y, m - 1, 1));
    const off = (2 - d.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(y, m - 1, 1 + off)).toISOString().slice(0, 10);
}

async function fetchLayer(base, id, subtype) {
    const url =
        `${base}/${id}/query?where=1%3D1&outFields=ADDRESS,DOC_NUMBER,YEAR,MONTH,TYPE,CITY,ZIP` +
        `&returnGeometry=true&outSR=4326&resultRecordCount=2000&f=json`;
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`${base}/${id} -> HTTP ${r.status}`);
    const j = await r.json();
    return (j.features || [])
        .map((f) => ({ a: f.attributes || {}, lon: f.geometry?.x, lat: f.geometry?.y, subtype }))
        .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat) && r.a.DOC_NUMBER);
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

async function loadSource(c, name, cfg) {
    const recs = [];
    for (const l of cfg.layers) recs.push(...(await fetchLayer(cfg.base, l.id, l.subtype)));
    if (recs.length === 0) {
        console.log(`${name}: 0 records fetched -- skipping`);
        return;
    }
    const cols = { refs: [], ad: [], dt: [], sb: [], lo: [], la: [], mt: [] };
    for (const r of recs) {
        cols.refs.push(String(r.a.DOC_NUMBER));
        cols.ad.push(r.a.ADDRESS || null);
        cols.dt.push(r.a.YEAR && r.a.MONTH ? firstTuesday(r.a.YEAR, r.a.MONTH) : null);
        cols.sb.push(r.subtype);
        cols.lo.push(r.lon);
        cols.la.push(r.lat);
        cols.mt.push(JSON.stringify({ city: r.a.CITY, zip: r.a.ZIP, type: r.a.TYPE }));
    }
    await c.query("BEGIN");
    await c.query(
        `CREATE TEMP TABLE fc(source_ref text, address text, event_date date, subtype text, lon float8, lat float8, meta jsonb) ON COMMIT DROP`
    );
    await c.query(
        `INSERT INTO fc SELECT * FROM unnest($1::text[],$2::text[],$3::date[],$4::text[],$5::float8[],$6::float8[],$7::text[]::jsonb[])`,
        [cols.refs, cols.ad, cols.dt, cols.sb, cols.lo, cols.la, cols.mt]
    );
    const { rows: ins } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         SELECT p.id, p.county_fips, 'pre_foreclosure', fc.subtype, fc.event_date, $1, fc.source_ref, fc.address, fc.lon, fc.lat, fc.meta
         FROM fc LEFT JOIN parcels p ON ST_Contains(p.geom, ST_SetSRID(ST_MakePoint(fc.lon,fc.lat),4326))
         ON CONFLICT (source,signal_type,source_ref)
           DO UPDATE SET last_seen=current_date, parcel_id=EXCLUDED.parcel_id,
                         event_date=EXCLUDED.event_date, address=EXCLUDED.address
         RETURNING parcel_id`,
        [name]
    );
    // Expire stale notices (cured/sold -> dropped off the county feed today).
    const { rowCount: expired } = await c.query(
        `DELETE FROM parcel_signals WHERE source=$1 AND signal_type='pre_foreclosure' AND last_seen < current_date`,
        [name]
    );
    await c.query("COMMIT");
    const tied = ins.filter((r) => r.parcel_id).length;
    console.log(
        `${name}: ${ins.length} notices, ${tied} tied to a parcel (${Math.round((100 * tied) / ins.length)}%), ${expired} expired`
    );
}

async function main() {
    const want = process.argv.slice(2);
    const names = want.length ? want : Object.keys(SOURCES);
    const c = new Client({
        connectionString: process.env.DATABASE_URL,
        statement_timeout: 180000,
        keepAlive: true,
    });
    await c.connect();
    await ensureSchema(c);
    for (const name of names) {
        const cfg = SOURCES[name];
        if (!cfg) {
            console.log(`unknown source: ${name}`);
            continue;
        }
        try {
            await loadSource(c, name, cfg);
        } catch (e) {
            console.error(`${name} FAILED:`, e.message);
        }
    }
    await c.end();
}

main();
