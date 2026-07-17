// Roofer-vertical seller-signal loader: recent damaging straight-line/thunderstorm
// WIND -> parcel_signals (signal_type='roof_damage'). Near-clone of
// load_hail_roof_damage.mjs (same engine, same parcel_signals table, same
// buffer+GIST-join pattern) -- wind lifts/tears shingles WITHOUT hail dents, so
// it's a distinct peril and a second storm layer on top of the hail signal.
// See ROOFER_SIGNALS.md signal #2 + VERTICALS_STRATEGY.md.
//
// DATA SOURCE: NOAA/NWS Storm Prediction Center (SPC) daily storm reports -- the
// free, public, decades-stable wind CSV feed (same base as hail, different file):
//   https://www.spc.noaa.gov/climo/reports/YYMMDD_rpts_wind.csv
//   columns: Time,Speed,Location,County,State,Lat,Lon,Comments
//   Speed = knots for MEASURED gusts (station/mesonet readings); the SPC feed also
//   carries ESTIMATED reports where Speed is "UNK" (magnitude unknown -- storm
//   damage survey, no instrument) rather than a number. Comments sometimes append
//   qualifiers like "EG"/"MG" for estimated/measured gust on top of that.
//   DECISION (documented, not hidden): rows where Speed doesn't parse as a number
//   are SKIPPED, not treated as at-threshold -- an unknown magnitude could be well
//   under or over the damage threshold, and silently assuming "at threshold" would
//   inflate the signal with unverified reports. This mirrors hail's treatment of
//   non-numeric Size as junk/header lines.
//
// THRESHOLD: damaging/severe wind for roofs is ~58 mph = ~50 kt gust (NWS severe
// thunderstorm wind criterion is 50kt/58mph). Default --min-speed-kt=50, tunable.
//
// SPC reports are sparse POINTS, so each report is buffered into a neighborhood
// catchment and intersected with parcels via the GIST index, exactly like hail.
// Wind swaths differ from hail's tight core-of-damage footprint -- gusts affect a
// broader, flatter area along a line/cell track -- so the base buffer here is
// larger (3km vs hail's 2km) and scales more gently with excess speed above the
// 50kt reference (see BUFFER_* below -- TUNABLE, strategy lane owns the final
// radius + look-back window). An "event" is a storm-day; each parcel gets ONE
// roof_damage signal per storm-day carrying the MAX wind speed that hit it.
// Wind is a historical event -- signals are NOT expired (unlike foreclosures);
// recency is a query-time filter on event_date (roofers want the last ~6-24 mo).
//
//   DATABASE_URL=... node scripts/signals/load_wind_roof_damage.mjs <start> [end] [opts]
//     <start> [end]      storm-day range, YYYY-MM-DD (end defaults to start)
//     --min-speed-kt=50  wind-speed threshold in knots (default 50kt = ~58mph, severe)
//     --explain          print the spatial-join query plan and exit (no writes)
//     --dry-run          run the join, report parcel counts, ROLLBACK (no writes)
//
//   e.g. node scripts/signals/load_wind_roof_damage.mjs 2024-05-28   # proven hail day, cross-check

import pkg from "pg";
const { Client } = pkg;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";
const SPC_BASE = "https://www.spc.noaa.gov/climo/reports";
const SOURCE = "wind_spc"; // distinct from hail's 'hail_spc' so hail vs wind stays filterable

// Point-report -> neighborhood catchment. radius = BASE + PER_10KT*((speed-REF)/10),
// clamped to [BASE, MAX] km. REF is a fixed reference point for the scaling curve
// (independent of the --min-speed-kt filter threshold), mirroring how hail scales
// off a fixed 1.0" reference regardless of --min-size. TUNABLE -- strategy lane
// owns the final values.
const BUFFER_BASE_KM = 3.0;
const BUFFER_PER_10KT_KM = 1.0;
const BUFFER_MAX_KM = 8.0;
const BUFFER_REF_KT = 50;

function radiusMeters(speedKt) {
    const km = Math.min(BUFFER_MAX_KM, Math.max(BUFFER_BASE_KM, BUFFER_BASE_KM + BUFFER_PER_10KT_KM * ((speedKt - BUFFER_REF_KT) / 10)));
    return Math.round(km * 1000);
}

function parseArgs() {
    const a = process.argv.slice(2);
    const opts = { minSpeedKt: 50, explain: false, dryRun: false, dates: [] };
    for (const t of a) {
        if (t.startsWith("--min-speed-kt=")) opts.minSpeedKt = parseFloat(t.split("=")[1]);
        else if (t === "--explain") opts.explain = true;
        else if (t === "--dry-run") opts.dryRun = true;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) opts.dates.push(t);
        else console.error(`ignoring unknown arg: ${t}`);
    }
    if (opts.dates.length === 0) {
        console.error("usage: load_wind_roof_damage.mjs <start YYYY-MM-DD> [end YYYY-MM-DD] [--min-speed-kt=50] [--explain] [--dry-run]");
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

// Fetch + parse one storm-day's TX wind reports >= minSpeedKt. The CSV's Comments
// field can contain commas, so only the first 7 columns are positional.
async function fetchDay(d, minSpeedKt) {
    const url = `${SPC_BASE}/${yymmdd(d)}_rpts_wind.csv`;
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
        const speedRaw = parseInt(f[1], 10); // knots; non-numeric ("UNK", header, etc.) -> NaN -> skip
        if (!Number.isFinite(speedRaw)) continue;
        if (f[4] !== "TX") continue;
        if (speedRaw < minSpeedKt) continue;
        const lat = parseFloat(f[5]);
        const lon = parseFloat(f[6]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        out.push({ event_date: ymd(d), speed_kt: speedRaw, loc: f[2] || null, county: f[3] || null, lat, lon, radius_m: radiusMeters(speedRaw) });
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
async function loadWindTemp(c, recs) {
    const dt = [], sp = [], lc = [], cty = [], lon = [], lat = [], rm = [];
    for (const r of recs) { dt.push(r.event_date); sp.push(r.speed_kt); lc.push(r.loc); cty.push(r.county); lon.push(r.lon); lat.push(r.lat); rm.push(r.radius_m); }
    await c.query(`CREATE TEMP TABLE wind(event_date date, speed_kt float8, loc text, county text, lon float8, lat float8, radius_m float8, buf geometry) ON COMMIT DROP`);
    await c.query(
        `INSERT INTO wind(event_date,speed_kt,loc,county,lon,lat,radius_m,buf)
         SELECT t.event_date,t.speed_kt,t.loc,t.county,t.lon,t.lat,t.radius_m,
                ST_Buffer(ST_SetSRID(ST_MakePoint(t.lon,t.lat),4326)::geography, t.radius_m)::geometry
         FROM unnest($1::date[],$2::float8[],$3::text[],$4::text[],$5::float8[],$6::float8[],$7::float8[])
              AS t(event_date,speed_kt,loc,county,lon,lat,radius_m)`,
        [dt, sp, lc, cty, lon, lat, rm]
    );
}

// The spatial-join SELECT (shared by --explain and the real INSERT). bbox `&&`
// + ST_Intersects against parcels_geom_gist; DISTINCT ON keeps ONE row per
// (parcel, storm-day) carrying the MAX wind speed that struck it.
const JOIN_SELECT = `
  SELECT DISTINCT ON (p.id, w.event_date)
    p.id AS parcel_id, p.county_fips, 'roof_damage'::text AS signal_type, 'wind'::text AS subtype,
    w.event_date, '${SOURCE}'::text AS source,
    'wind_spc:'||to_char(w.event_date,'YYYYMMDD')||':'||p.id AS source_ref,
    p.situs_address AS address,
    ST_X(ST_Centroid(p.geom)) AS lon, ST_Y(ST_Centroid(p.geom)) AS lat,
    jsonb_build_object(
      'wind_speed_kt', w.speed_kt,
      'storm_date', to_char(w.event_date,'YYYY-MM-DD'),
      'data_source', 'NOAA SPC storm reports',
      'report_location', w.loc,
      'report_county', w.county,
      'buffer_km', round((w.radius_m/1000.0)::numeric,2)
    ) AS meta
  FROM wind w
  JOIN parcels p ON p.geom && w.buf AND ST_Intersects(p.geom, w.buf)
  ORDER BY p.id, w.event_date, w.speed_kt DESC`;

async function main() {
    const opts = parseArgs();
    const c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 300000, keepAlive: true });
    await c.connect();
    await ensureSchema(c);

    // Pull the storm-day range from SPC.
    const recs = [];
    for (const d of dayRange(opts.start, opts.end)) recs.push(...(await fetchDay(d, opts.minSpeedKt)));
    console.log(`SPC ${opts.start}..${opts.end}: ${recs.length} TX wind reports >= ${opts.minSpeedKt}kt`);
    if (recs.length === 0) { console.log("no reports -- nothing to do"); await c.end(); return; }

    await c.query("BEGIN");
    await loadWindTemp(c, recs);

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
           meta = CASE WHEN (EXCLUDED.meta->>'wind_speed_kt')::float8 >= (parcel_signals.meta->>'wind_speed_kt')::float8
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
        console.log(`roof_damage(wind): ${res.length} parcel-signals (${inserted} new, ${res.length - inserted} refreshed)`);
        console.log(`top counties: ${top.map(([f, n]) => `${f}:${n}`).join("  ")}`);
    }
    await c.end();
}

main();
