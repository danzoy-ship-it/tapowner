// Roofer-vertical seller-signal loader: recent damaging hail -> parcel_signals
// (signal_type='roof_damage'). App-session lane; see ROOFER_SIGNALS.md signal #1
// (flagship) + VERTICALS_STRATEGY.md (one shared engine, every vertical's trigger
// is a signal_type row on the SHARED parcel_signals table, spatially joined to
// parcels). This is the roofer analogue of load_county_foreclosures.mjs.
//
// DATA SOURCE: NOAA/NWS Storm Prediction Center (SPC) daily storm reports -- the
// free, public, decades-stable hail CSV feed:
//   https://www.spc.noaa.gov/climo/reports/YYMMDD_rpts_hail.csv
//   columns: Time,Size,Location,County,State,Lat,Lon,Comments
//   Size = hundredths of an inch (100 = 1.00"); has State (TX filter), Lat/Lon, date.
// Chosen over the ArcGIS "Hail Swath (MRMS MESH)" hub service because that service
// (a) carries NO hail-SIZE attribute (only swath width), (b) holds year 2022 only
// (no 2024-2026), and (c) has ~zero Texas coverage -- see the SKIP-LOG in the
// session report. NCEI Storm Events (bulk CSV) and raw MRMS MESH GRIB2 grids are
// the upgrade paths (GRIB2 gives the true damage footprint but needs wgrib2/GDAL).
//
// SPC reports are sparse POINTS, so each report is buffered into a neighborhood
// catchment (radius scales with hail size, see BUFFER_* below -- TUNABLE; the
// strategy lane owns the final radius + look-back window) and intersected with
// parcels via the GIST index. An "event" is a storm-day; each parcel gets ONE
// roof_damage signal per storm-day carrying the MAX hail size that hit it.
// Hail is a historical event -- signals are NOT expired (unlike foreclosures);
// recency is a query-time filter on event_date (roofers want the last ~6-24 mo).
//
//   DATABASE_URL=... node scripts/signals/load_hail_roof_damage.mjs <start> [end] [opts]
//     <start> [end]   storm-day range, YYYY-MM-DD (end defaults to start)
//     --min-size=1.0  hail-size threshold in inches (default 1.0 = roof-damaging)
//     --explain       print the spatial-join query plan and exit (no writes)
//     --dry-run       run the join, report parcel counts, ROLLBACK (no writes)
//
//   e.g. node scripts/signals/load_hail_roof_damage.mjs 2024-05-28   # proven event

import pkg from "pg";
const { Client } = pkg;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";
const SPC_BASE = "https://www.spc.noaa.gov/climo/reports";
const SOURCE = "hail_spc";

// Point-report -> neighborhood catchment. radius = BASE + PER_INCH*(size-1.0),
// clamped to [BASE, MAX] km. TUNABLE -- strategy lane owns the final values (and a
// grid source like MRMS MESH would replace this buffer with the true swath).
const BUFFER_BASE_KM = 2.0;
const BUFFER_PER_INCH_KM = 1.0;
const BUFFER_MAX_KM = 6.0;

function radiusMeters(sizeIn) {
    const km = Math.min(BUFFER_MAX_KM, Math.max(BUFFER_BASE_KM, BUFFER_BASE_KM + BUFFER_PER_INCH_KM * (sizeIn - 1.0)));
    return Math.round(km * 1000);
}

function parseArgs() {
    const a = process.argv.slice(2);
    const opts = { minSize: 1.0, explain: false, dryRun: false, dates: [] };
    for (const t of a) {
        if (t.startsWith("--min-size=")) opts.minSize = parseFloat(t.split("=")[1]);
        else if (t === "--explain") opts.explain = true;
        else if (t === "--dry-run") opts.dryRun = true;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) opts.dates.push(t);
        else console.error(`ignoring unknown arg: ${t}`);
    }
    if (opts.dates.length === 0) {
        console.error("usage: load_hail_roof_damage.mjs <start YYYY-MM-DD> [end YYYY-MM-DD] [--min-size=1.0] [--explain] [--dry-run]");
        process.exit(1);
    }
    opts.start = opts.dates[0];
    opts.end = opts.dates[1] || opts.dates[0];
    return opts;
}

function* dayRange(startStr, endStr) {
    const d = new Date(startStr + "T00:00:00Z");
    const end = new Date(endStr + "T00:00:00Z");
    while (d <= end) {
        yield new Date(d);
        d.setUTCDate(d.getUTCDate() + 1);
    }
}

const yymmdd = (d) => d.toISOString().slice(2, 10).replace(/-/g, "");
const ymd = (d) => d.toISOString().slice(0, 10);

// Fetch + parse one storm-day's TX hail reports >= minSize. The CSV's Comments
// field can contain commas, so only the first 7 columns are positional.
async function fetchDay(d, minSize) {
    const url = `${SPC_BASE}/${yymmdd(d)}_rpts_hail.csv`;
    let r;
    try {
        r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    } catch (e) {
        console.error(`  ${ymd(d)}: fetch error (${e.message}) -- skipping day`);
        return [];
    }
    if (r.status === 404) return []; // no reports filed that day
    if (!r.ok) {
        console.error(`  ${ymd(d)}: HTTP ${r.status} -- skipping day`);
        return [];
    }
    const text = await r.text();
    const out = [];
    for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        const f = line.split(",");
        if (f.length < 7) continue;
        const sizeRaw = parseInt(f[1], 10); // hundredths of an inch
        if (!Number.isFinite(sizeRaw)) continue; // header / junk line
        if (f[4] !== "TX") continue;
        const sizeIn = sizeRaw / 100;
        if (sizeIn < minSize) continue;
        const lat = parseFloat(f[5]);
        const lon = parseFloat(f[6]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        out.push({ event_date: ymd(d), size_in: sizeIn, loc: f[2] || null, county: f[3] || null, lat, lon, radius_m: radiusMeters(sizeIn) });
    }
    return out;
}

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

// Load the fetched reports into a TEMP table with a pre-computed geography buffer
// (meters -> 4326 geometry). Bbox-bounded GIST join keeps this OFF a 14M-row scan.
async function loadHailTemp(c, recs) {
    const dt = [], sz = [], lc = [], cty = [], lon = [], lat = [], rm = [];
    for (const r of recs) { dt.push(r.event_date); sz.push(r.size_in); lc.push(r.loc); cty.push(r.county); lon.push(r.lon); lat.push(r.lat); rm.push(r.radius_m); }
    await c.query(`CREATE TEMP TABLE hail(event_date date, size_in float8, loc text, county text, lon float8, lat float8, radius_m float8, buf geometry) ON COMMIT DROP`);
    await c.query(
        `INSERT INTO hail(event_date,size_in,loc,county,lon,lat,radius_m,buf)
         SELECT t.event_date,t.size_in,t.loc,t.county,t.lon,t.lat,t.radius_m,
                ST_Buffer(ST_SetSRID(ST_MakePoint(t.lon,t.lat),4326)::geography, t.radius_m)::geometry
         FROM unnest($1::date[],$2::float8[],$3::text[],$4::text[],$5::float8[],$6::float8[],$7::float8[])
              AS t(event_date,size_in,loc,county,lon,lat,radius_m)`,
        [dt, sz, lc, cty, lon, lat, rm]
    );
}

// The spatial-join SELECT (shared by --explain and the real INSERT). bbox `&&`
// + ST_Intersects against parcels_geom_gist; DISTINCT ON keeps ONE row per
// (parcel, storm-day) carrying the MAX hail size that struck it.
const JOIN_SELECT = `
  SELECT DISTINCT ON (p.id, h.event_date)
    p.id AS parcel_id, p.county_fips, 'roof_damage'::text AS signal_type, NULL::text AS subtype,
    h.event_date, '${SOURCE}'::text AS source,
    'spc:'||to_char(h.event_date,'YYYYMMDD')||':'||p.id AS source_ref,
    p.situs_address AS address,
    ST_X(ST_Centroid(p.geom)) AS lon, ST_Y(ST_Centroid(p.geom)) AS lat,
    jsonb_build_object(
      'hail_size_in', h.size_in,
      'storm_date', to_char(h.event_date,'YYYY-MM-DD'),
      'data_source', 'NOAA SPC storm reports',
      'report_location', h.loc,
      'report_county', h.county,
      'buffer_km', round((h.radius_m/1000.0)::numeric,2)
    ) AS meta
  FROM hail h
  JOIN parcels p ON p.geom && h.buf AND ST_Intersects(p.geom, h.buf)
  ORDER BY p.id, h.event_date, h.size_in DESC`;

async function main() {
    const opts = parseArgs();
    const c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 300000, keepAlive: true });
    await c.connect();
    await ensureSchema(c);

    // Pull the storm-day range from SPC.
    const recs = [];
    for (const d of dayRange(opts.start, opts.end)) recs.push(...(await fetchDay(d, opts.minSize)));
    console.log(`SPC ${opts.start}..${opts.end}: ${recs.length} TX hail reports >= ${opts.minSize}"`);
    if (recs.length === 0) { console.log("no reports -- nothing to do"); await c.end(); return; }

    await c.query("BEGIN");
    await loadHailTemp(c, recs);

    if (opts.explain) {
        const { rows } = await c.query(`EXPLAIN ${JOIN_SELECT}`);
        console.log("\n=== query plan (spatial join) ===");
        for (const r of rows) console.log(r["QUERY PLAN"]);
        await c.query("ROLLBACK");
        await c.end();
        return;
    }

    const { rows: res } = await c.query(
        `INSERT INTO parcel_signals(parcel_id,county_fips,signal_type,subtype,event_date,source,source_ref,address,lon,lat,meta)
         ${JOIN_SELECT}
         ON CONFLICT (source,signal_type,source_ref) DO UPDATE SET
           last_seen = current_date,
           meta = CASE WHEN (EXCLUDED.meta->>'hail_size_in')::float8 >= (parcel_signals.meta->>'hail_size_in')::float8
                       THEN EXCLUDED.meta ELSE parcel_signals.meta END
         RETURNING (xmax = 0) AS inserted, county_fips`
    );

    if (opts.dryRun) {
        await c.query("ROLLBACK");
        console.log(`DRY-RUN: ${res.length} parcel-signals would be written (rolled back)`);
    } else {
        await c.query("COMMIT");
        const inserted = res.filter((r) => r.inserted).length;
        const byCounty = {};
        for (const r of res) byCounty[r.county_fips] = (byCounty[r.county_fips] || 0) + 1;
        const top = Object.entries(byCounty).sort((a, b) => b[1] - a[1]).slice(0, 12);
        console.log(`roof_damage: ${res.length} parcel-signals (${inserted} new, ${res.length - inserted} refreshed)`);
        console.log(`top counties: ${top.map(([f, n]) => `${f}:${n}`).join("  ")}`);
    }
    await c.end();
}

main();
