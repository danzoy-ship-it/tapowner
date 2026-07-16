// MRMS MESH hail-size SWATH loader -- upgrade path from the point-report/buffer
// approach in load_hail_roof_damage.mjs to true radar-derived swath polygons.
// See mrms_mesh_contour.py for the feasibility proof + GRIB2->GeoJSON contouring
// (free source: s3://noaa-mrms-pds/CONUS/MESH_Max_1440min_00.50/, 1km grid, deep
// historical archive back to at least 2020, cross-validated against SPC reports
// 2026-07-16). This script loads the contoured GeoJSON (one Feature per hail-size
// band, MultiPolygon geometry) into a NEW small table `hail_swaths` -- polygons,
// NOT millions of per-parcel rows (disk-lean per the strategy-lane design rule).
//
// Usage (from api/):
//   python scripts/signals/mrms_mesh_contour.py 2024-05-28 --out _tmp_mesh.geojson
//   DATABASE_URL=... node scripts/signals/load_mrms_hail_swaths.mjs _tmp_mesh.geojson
//     --count-parcels   after loading, run the parcel ST_Intersects count by band
//                        (county-bound bbox-first via GIST, same pattern as the
//                        hail buffer join) and print alongside the SPC comparison.

import pkg from "pg";
import fs from "node:fs";
const { Client } = pkg;

function parseArgs() {
    const a = process.argv.slice(2);
    const opts = { file: null, countParcels: false, source: "mrms_mesh" };
    for (const t of a) {
        if (t === "--count-parcels") opts.countParcels = true;
        else if (!t.startsWith("--")) opts.file = t;
    }
    if (!opts.file) {
        console.error("usage: load_mrms_hail_swaths.mjs <geojson file> [--count-parcels]");
        process.exit(1);
    }
    return opts;
}

async function ensureSchema(c) {
    await c.query(`CREATE TABLE IF NOT EXISTS hail_swaths(
        id bigserial PRIMARY KEY,
        event_date date NOT NULL,
        min_hail_in numeric NOT NULL,
        source text NOT NULL,
        valid_time timestamptz,
        geom geometry(MultiPolygon, 4326) NOT NULL,
        created_at timestamptz DEFAULT now())`);
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_hail_swaths ON hail_swaths(event_date, min_hail_in, source)`);
    await c.query(`CREATE INDEX IF NOT EXISTS ix_hail_swaths_geom ON hail_swaths USING GIST(geom)`);
}

// GeoJSON Polygon/MultiPolygon -> ST_Multi(ST_GeomFromGeoJSON(...)) keeps this a
// single geometry column value regardless of which shapely wrote out.
async function loadFeature(c, feat, source) {
    const { min_hail_in, event_date, valid_time } = feat.properties;
    const geojson = JSON.stringify(feat.geometry);
    await c.query(
        `INSERT INTO hail_swaths(event_date, min_hail_in, source, valid_time, geom)
         VALUES ($1, $2, $3, $4, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)))
         ON CONFLICT (event_date, min_hail_in, source) DO UPDATE SET
           geom = EXCLUDED.geom, valid_time = EXCLUDED.valid_time, created_at = now()`,
        [event_date, min_hail_in, source, valid_time, geojson]
    );
}

// Parcel count by band. IMPORTANT: a whole-state multipolygon's bbox can span
// nearly all of Texas (many scattered storm cells that day), so bbox `&&`
// against the WHOLE swath barely prunes the 14M-row parcels table -- ST_Dump
// each band into its individual polygon parts (each with a MUCH tighter bbox,
// one per storm cell) into an indexed temp table first, then bbox+ST_Intersects
// per part. Proven 2026-07-16: this took the >=0.75in band from a 3min+ timeout
// down to ~23s on 14.3M parcels.
async function countParcels(c, eventDate, source) {
    const { rows: bands } = await c.query(
        `SELECT id, min_hail_in FROM hail_swaths WHERE event_date=$1 AND source=$2 ORDER BY min_hail_in`,
        [eventDate, source]
    );
    const out = [];
    for (const b of bands) {
        const t0 = Date.now();
        await c.query("BEGIN");
        await c.query(`CREATE TEMP TABLE swath_parts AS SELECT (ST_Dump(geom)).geom AS geom FROM hail_swaths WHERE id=$1`, [b.id]);
        await c.query(`CREATE INDEX ON swath_parts USING GIST(geom)`);
        await c.query(`ANALYZE swath_parts`);
        const { rows } = await c.query(
            `SELECT count(DISTINCT p.id)::bigint AS n
             FROM parcels p JOIN swath_parts s ON p.geom && s.geom AND ST_Intersects(p.geom, s.geom)`
        );
        await c.query(`DROP TABLE swath_parts`);
        await c.query("COMMIT");
        out.push({ min_hail_in: b.min_hail_in, parcels: rows[0].n, ms: Date.now() - t0 });
    }
    return out;
}

async function main() {
    const opts = parseArgs();
    const fc = JSON.parse(fs.readFileSync(opts.file, "utf8"));
    if (!fc.features || fc.features.length === 0) {
        console.error("no features in geojson -- nothing to load");
        process.exit(1);
    }
    const eventDate = fc.features[0].properties.event_date;

    const c = new Client({ connectionString: process.env.DATABASE_URL, statement_timeout: 300000, keepAlive: true });
    await c.connect();
    await ensureSchema(c);

    for (const feat of fc.features) await loadFeature(c, feat, opts.source);
    console.log(`hail_swaths: loaded ${fc.features.length} band polygon(s) for ${eventDate} (source=${opts.source})`);

    const { rows: sizeRows } = await c.query(
        `SELECT min_hail_in, pg_size_pretty(pg_column_size(geom)::bigint) AS sz, ST_NumGeometries(geom) AS n_parts
         FROM hail_swaths WHERE event_date=$1 AND source=$2 ORDER BY min_hail_in`,
        [eventDate, opts.source]
    );
    console.log("bands:", sizeRows.map((r) => `>=${r.min_hail_in}in: ${r.n_parts} parts, ${r.sz}`).join("  "));

    if (opts.countParcels) {
        console.log("\nrunning parcel ST_Intersects count per band (this can take a bit on 14M parcels)...");
        const counts = await countParcels(c, eventDate, opts.source);
        for (const r of counts) console.log(`  >=${r.min_hail_in}in: ${r.parcels} parcels (${r.ms}ms)`);
    }

    await c.end();
}

main();
