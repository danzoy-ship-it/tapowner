// Roofer vertical (#2) resolver -- the DB-backed layer.
//
// Fetches the raw rows a parcel's roofer signals derive from (parcel_signals
// hail/wind/distress, hail_swath intersects, roof/solar permits) and feeds them
// to the PURE composer in lib/rooferSignals.ts. Two entry points mirror the V1
// parcels routes: per-parcel (`/parcels/at`) and bounded-area (`/parcels/within`).
//
// Index discipline (never full-scans the 14M-row parcels table):
//   - per-parcel signals: ix_parcel_signals_parcel (parcel_id)
//   - permits:            permits_parcel_idx (parcel_id)
//   - hail swaths:        ix_hail_swaths_geom (GIST) via the parcel geom
//   - area lookup:        parcels GIST (geom && poly) + point-on-surface, capped

import { pool } from "../db.js";
import {
    composeRooferSignals,
    type RooferSignalBundle,
    type RooferSignalInput,
    type HailSpcRow,
    type HailSwathRow,
    type WindRow,
    type PermitRow,
    type DistressRow,
} from "./rooferSignals.js";
import { getRooferConfig } from "./rooferConfig.js";

export interface RooferParcel {
    id: number;
    county_fips: string | null;
    situs_address: string | null;
    owner_name: string | null;
    roof_material: string | null;
    /** Carried for the future roof-age slot; NOT used to derive age yet. */
    year_built: number | null;
    effective_year_built: number | null;
    lat: number | null;
    lon: number | null;
}

export interface RooferResolution {
    parcel: RooferParcel;
    signals: RooferSignalBundle;
}

// Raw DB row shapes (bucketed into RooferSignalInput below).
interface SignalRow {
    parcel_id?: number;
    signal_type: string;
    subtype: string | null;
    source: string | null;
    event_date: Date | string | null;
    hail_size_in: number | null;
    wind_speed_kt: number | null;
    status: string | null;
}
interface PermitAggRow {
    parcel_id?: number;
    permit_category: string;
    last_date: Date | string | null;
}
interface SwathRow {
    parcel_id?: number;
    event_date: Date | string | null;
    min_hail_in: number | null;
}

function parcelCols(alias = ""): string {
    const p = alias ? `${alias}.` : "";
    return `${p}id, ${p}county_fips, ${p}situs_address, ${p}owner_name, ${p}roof_material,
            ${p}year_built, ${p}effective_year_built,
            ST_Y(ST_PointOnSurface(${p}geom)) AS lat, ST_X(ST_PointOnSurface(${p}geom)) AS lon`;
}

const SIGNAL_SELECT = `signal_type, subtype, source, event_date,
    (meta->>'hail_size_in')::float8 AS hail_size_in,
    (meta->>'wind_speed_kt')::float8 AS wind_speed_kt,
    meta->>'status' AS status`;

/** Bucket one parcel's raw rows into the pure composer's input shape. */
function bucketRows(
    roofMaterial: string | null,
    sigRows: SignalRow[],
    permitRows: PermitAggRow[],
    swathRows: SwathRow[]
): RooferSignalInput {
    const hailSpc: HailSpcRow[] = [];
    const wind: WindRow[] = [];
    const distress: DistressRow[] = [];
    const roofPermits: PermitRow[] = [];
    const solarPermits: PermitRow[] = [];
    const hailSwath: HailSwathRow[] = swathRows.map((r) => ({
        event_date: r.event_date,
        min_hail_in: r.min_hail_in,
    }));

    for (const r of sigRows) {
        if (r.signal_type === "roof_damage") {
            // Hail and wind both live under roof_damage; wind is source=wind_spc
            // (subtype='wind'), hail is source=hail_spc (subtype NULL).
            if (r.source === "wind_spc" || r.subtype === "wind") {
                wind.push({ event_date: r.event_date, wind_speed_kt: r.wind_speed_kt });
            } else {
                hailSpc.push({ event_date: r.event_date, hail_size_in: r.hail_size_in });
            }
        } else if (
            r.signal_type === "code_violation" ||
            r.signal_type === "pre_foreclosure" ||
            r.signal_type === "probate"
        ) {
            distress.push({
                signal_type: r.signal_type,
                subtype: r.subtype,
                source: r.source,
                event_date: r.event_date,
                status: r.status,
            });
        }
    }

    for (const r of permitRows) {
        if (r.permit_category === "roof") roofPermits.push({ issued_date: r.last_date });
        else if (r.permit_category === "solar") solarPermits.push({ issued_date: r.last_date });
    }

    return {
        roof_material: roofMaterial,
        hail_spc: hailSpc,
        hail_swath: hailSwath,
        wind,
        roof_permits: roofPermits,
        solar_permits: solarPermits,
        distress,
    };
}

async function buildSignalsForParcel(parcel: RooferParcel): Promise<RooferSignalBundle> {
    const cfg = await getRooferConfig();

    const [sig, perm, swath] = await Promise.all([
        pool.query<SignalRow>(
            `SELECT ${SIGNAL_SELECT} FROM parcel_signals WHERE parcel_id = $1`,
            [parcel.id]
        ),
        pool.query<PermitAggRow>(
            `SELECT permit_category, max(issued_date) AS last_date
             FROM permits
             WHERE parcel_id = $1 AND permit_category IN ('roof', 'solar')
             GROUP BY permit_category`,
            [parcel.id]
        ),
        // Swath intersect via the parcel geom subquery -- no geometry shipped to
        // node; uses ix_hail_swaths_geom (GIST).
        pool.query<SwathRow>(
            `SELECT hs.event_date, hs.min_hail_in::float8 AS min_hail_in
             FROM hail_swaths hs
             WHERE hs.min_hail_in >= $2
               AND ST_Intersects(hs.geom, (SELECT geom FROM parcels WHERE id = $1))`,
            [parcel.id, cfg.hail_swath_min_in]
        ),
    ]);

    return composeRooferSignals(bucketRows(parcel.roof_material, sig.rows, perm.rows, swath.rows));
}

export async function resolveRooferSignalsById(id: number): Promise<RooferResolution | null> {
    const { rows } = await pool.query<RooferParcel>(
        `SELECT ${parcelCols()} FROM parcels WHERE id = $1 LIMIT 1`,
        [id]
    );
    const parcel = rows[0];
    if (!parcel) return null;
    return { parcel, signals: await buildSignalsForParcel(parcel) };
}

export async function resolveRooferSignalsAt(
    lat: number,
    lon: number
): Promise<RooferResolution | null> {
    // Same tap-stable ordering as V1 /parcels/at (smallest area first, id tiebreak).
    const { rows } = await pool.query<RooferParcel>(
        `SELECT ${parcelCols()}
         FROM parcels
         WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
         ORDER BY ST_Area(geom) ASC, id ASC
         LIMIT 1`,
        [lon, lat]
    );
    const parcel = rows[0];
    if (!parcel) return null;
    return { parcel, signals: await buildSignalsForParcel(parcel) };
}

/**
 * Bounded-area resolver: every parcel inside the polygon with its roofer signal
 * bundle. Caller MUST pass a validated GeoJSON polygon + a row cap (the route
 * enforces the area/vertex/cap limits, mirroring V1 farm mode). Composes the
 * pure bundle per parcel from bulk-fetched rows (no N+1 round-trips).
 */
export async function resolveRooferSignalsInArea(
    geojson: string,
    limit: number
): Promise<RooferResolution[]> {
    const cfg = await getRooferConfig();

    const { rows: parcels } = await pool.query<RooferParcel>(
        `WITH poly AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS g)
         SELECT ${parcelCols("p")}
         FROM parcels p CROSS JOIN poly
         WHERE p.geom && poly.g
           AND ST_Within(ST_PointOnSurface(p.geom), poly.g)
           AND p.is_protected = false
           AND p.owner_name IS NOT NULL
         ORDER BY p.id
         LIMIT $2`,
        [geojson, limit]
    );
    if (parcels.length === 0) return [];

    const ids = parcels.map((p) => p.id);

    const [sig, perm, swath] = await Promise.all([
        pool.query<SignalRow>(
            `SELECT parcel_id, ${SIGNAL_SELECT} FROM parcel_signals WHERE parcel_id = ANY($1)`,
            [ids]
        ),
        pool.query<PermitAggRow>(
            `SELECT parcel_id, permit_category, max(issued_date) AS last_date
             FROM permits
             WHERE parcel_id = ANY($1) AND permit_category IN ('roof', 'solar')
             GROUP BY parcel_id, permit_category`,
            [ids]
        ),
        // Two-stage to stay fast over 500 parcels: first narrow the 557 daily
        // swaths to the FEW that intersect the drawn polygon (GIST on hs.geom),
        // then intersect those against the parcels. Lossless in practice --
        // parcels resolve inside the polygon, so a swath hitting a parcel hits
        // the polygon too.
        pool.query<SwathRow>(
            `WITH poly AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)) AS g),
                  cand AS (
                      SELECT hs.event_date, hs.min_hail_in, hs.geom
                      FROM hail_swaths hs, poly
                      WHERE hs.min_hail_in >= $2 AND ST_Intersects(hs.geom, poly.g)
                  )
             SELECT p.id AS parcel_id, c.event_date, c.min_hail_in::float8 AS min_hail_in
             FROM parcels p
             JOIN cand c ON ST_Intersects(p.geom, c.geom)
             WHERE p.id = ANY($1)`,
            [ids, cfg.hail_swath_min_in, geojson]
        ),
    ]);

    const sigBy = groupBy(sig.rows, (r) => r.parcel_id);
    const permBy = groupBy(perm.rows, (r) => r.parcel_id);
    const swathBy = groupBy(swath.rows, (r) => r.parcel_id);

    return parcels.map((parcel) => ({
        parcel,
        signals: composeRooferSignals(
            bucketRows(
                parcel.roof_material,
                sigBy.get(parcel.id) ?? [],
                permBy.get(parcel.id) ?? [],
                swathBy.get(parcel.id) ?? []
            )
        ),
    }));
}

function groupBy<T>(rows: T[], key: (row: T) => number | undefined): Map<number, T[]> {
    const m = new Map<number, T[]>();
    for (const row of rows) {
        const k = key(row);
        if (k === undefined) continue;
        const arr = m.get(k);
        if (arr) arr.push(row);
        else m.set(k, [row]);
    }
    return m;
}
