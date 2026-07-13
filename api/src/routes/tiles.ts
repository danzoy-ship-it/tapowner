import type { FastifyInstance } from "fastify";
import { LRUCache } from "lru-cache";
import { pool } from "../db.js";

// Parcel boundaries only make sense at street-level zoom; reject anything
// coarser before it ever reaches the database.
const MIN_ZOOM = 15;

const tileCache = new LRUCache<string, Buffer>({
    max: 2000,
    ttl: 1000 * 60 * 60, // 1h -- StratMap refreshes ~annually, so this is generous, not stale-risk.
});

const TILE_QUERY = `
    WITH mvtgeom AS (
        SELECT
            ST_AsMVTGeom(
                ST_Transform(geom, 3857),
                ST_TileEnvelope($1, $2, $3),
                4096, 64, true
            ) AS geom,
            id, apn, owner_name, situs_address, is_absentee, is_protected
        FROM parcels
        WHERE geom && ST_Transform(ST_TileEnvelope($1, $2, $3), 4326)
    )
    SELECT ST_AsMVT(mvtgeom.*, 'parcels', 4096, 'geom') AS mvt
    FROM mvtgeom
    WHERE geom IS NOT NULL
`;

export async function tilesRoutes(app: FastifyInstance) {
    app.get<{ Params: { z: string; x: string; yext: string } }>(
        "/tiles/:z/:x/:yext",
        async (request, reply) => {
            const { z, x, yext } = request.params;

            if (!yext.endsWith(".mvt")) {
                return reply.code(404).send({ error: "Expected .mvt suffix" });
            }
            const y = yext.slice(0, -4);

            const zNum = Number(z);
            const xNum = Number(x);
            const yNum = Number(y);

            if (![zNum, xNum, yNum].every(Number.isInteger)) {
                return reply.code(400).send({ error: "z/x/y must be integers" });
            }

            if (zNum < MIN_ZOOM) {
                return reply.code(204).send();
            }

            const key = `${zNum}/${xNum}/${yNum}`;
            const cached = tileCache.get(key);
            if (cached) {
                app.log.info({ tile: key, cache: "hit" }, "tile cache hit");
                return reply
                    .header("Content-Type", "application/vnd.mapbox-vector-tile")
                    .send(cached);
            }

            const t0 = Date.now();
            const result = await pool.query(TILE_QUERY, [zNum, xNum, yNum]);
            const elapsedMs = Date.now() - t0;

            const mvt: Buffer | null = result.rows[0]?.mvt ?? null;
            if (!mvt || mvt.length === 0) {
                app.log.info({ tile: key, cache: "miss", elapsedMs }, "tile cache miss (empty)");
                return reply.code(204).send();
            }

            tileCache.set(key, mvt);
            app.log.info({ tile: key, cache: "miss", elapsedMs, bytes: mvt.length }, "tile cache miss");

            return reply
                .header("Content-Type", "application/vnd.mapbox-vector-tile")
                .send(mvt);
        }
    );
}
