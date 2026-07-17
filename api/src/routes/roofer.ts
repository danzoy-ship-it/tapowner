import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { getRooferConfig } from "../lib/rooferConfig.js";
import {
    resolveRooferSignalsAt,
    resolveRooferSignalsById,
    resolveRooferSignalsInArea,
} from "../lib/rooferResolver.js";
import { logEvent } from "../lib/events.js";

// Roofer vertical (#2) API -- ADDITIVE, and DARK by default.
//
// Every route here 404s unless the roofer product is enabled (lib/rooferConfig:
// products.config.roofer.enabled OR ROOFER_ENABLED env). Default OFF means a V1
// user hitting these paths sees "Not found" -- V1 is untouched. Auth reuses
// V1's requireAuth (no new auth). There is NO billing/entitlement/pricing here
// on purpose -- pricing is the founder's later call.
//
// Area caps mirror V1 farm mode (routes/parcels.ts) so a roofer area query can
// never scan the county.
const AREA_MAX_PARCELS = 500;
const AREA_MAX_KM2 = 25;
const AREA_MAX_VERTICES = 50;

export async function rooferRoutes(app: FastifyInstance) {
    // Per-parcel signal bundle: GET /roofer/signals/at?lat=&lng=  OR  ?parcel_id=
    app.get<{ Querystring: { lat?: string; lng?: string; parcel_id?: string } }>(
        "/roofer/signals/at",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;

            const cfg = await getRooferConfig();
            if (!cfg.enabled) return reply.code(404).send({ error: "Not found" });

            const { lat, lng, parcel_id } = request.query;

            let result;
            if (parcel_id !== undefined) {
                const id = Number(parcel_id);
                if (!Number.isInteger(id) || id <= 0) {
                    return reply.code(400).send({ error: "parcel_id must be a positive integer" });
                }
                result = await resolveRooferSignalsById(id);
            } else {
                if (!lat || !lng) {
                    return reply.code(400).send({ error: "lat and lng (or parcel_id) are required" });
                }
                const latNum = Number(lat);
                const lngNum = Number(lng);
                if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
                    return reply.code(400).send({ error: "lat and lng must be numbers" });
                }
                if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
                    return reply.code(400).send({ error: "lat/lng out of range" });
                }
                result = await resolveRooferSignalsAt(latNum, lngNum);
            }

            if (!result) return reply.code(404).send({ error: "No parcel found at this location" });

            void logEvent(session.userId, "roofer_signals_at", {
                parcel_id: result.parcel.id,
                county_fips: result.parcel.county_fips,
                signal_types: result.signals.signal_types,
            });

            return reply.send(result);
        }
    );

    // Bounded-area roofer leads: POST /roofer/signals/within
    //   { polygon: [[lng,lat],...], signal_types?: string[] }
    // Returns every parcel inside the polygon with its signal bundle, optionally
    // filtered to those firing at least one of the requested signal_types.
    app.post<{ Body: { polygon?: unknown; signal_types?: unknown } }>(
        "/roofer/signals/within",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;

            const cfg = await getRooferConfig();
            if (!cfg.enabled) return reply.code(404).send({ error: "Not found" });

            const raw = request.body?.polygon;
            if (
                !Array.isArray(raw) ||
                raw.length < 3 ||
                raw.length > AREA_MAX_VERTICES ||
                !raw.every(
                    (p): p is [number, number] =>
                        Array.isArray(p) &&
                        p.length === 2 &&
                        Number.isFinite(p[0]) &&
                        Number.isFinite(p[1]) &&
                        p[0] >= -180 &&
                        p[0] <= 180 &&
                        p[1] >= -90 &&
                        p[1] <= 90
                )
            ) {
                return reply.code(400).send({
                    error: `polygon must be 3-${AREA_MAX_VERTICES} [lng,lat] pairs`,
                });
            }

            // Optional signal-type filter (unknown values simply never match).
            const wantTypes = Array.isArray(request.body?.signal_types)
                ? (request.body.signal_types as unknown[]).filter(
                      (t): t is string => typeof t === "string"
                  )
                : [];
            const wantSet = new Set(wantTypes);

            // Close the ring + normalize a self-intersecting tap order (same as V1).
            const ring = [...raw];
            const firstPt = ring[0]!;
            const lastPt = ring[ring.length - 1]!;
            if (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1]) ring.push(firstPt);
            const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });

            const { rows: areaRows } = await pool.query<{ km2: number }>(
                `SELECT ST_Area(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography) / 1e6 AS km2`,
                [geojson]
            );
            const areaKm2 = Number(areaRows[0]?.km2);
            if (!Number.isFinite(areaKm2) || areaKm2 <= 0) {
                return reply
                    .code(400)
                    .send({ error: "That area couldn't be read — try drawing it again." });
            }
            if (areaKm2 > AREA_MAX_KM2) {
                return reply.code(400).send({
                    error: "That area is too large — zoom in and draw a smaller one.",
                    area_km2: Math.round(areaKm2),
                });
            }

            const resolved = await resolveRooferSignalsInArea(geojson, AREA_MAX_PARCELS + 1);
            const capped = resolved.length > AREA_MAX_PARCELS;
            let leads = resolved.slice(0, AREA_MAX_PARCELS);

            if (wantSet.size > 0) {
                leads = leads.filter((r) =>
                    r.signals.signal_types.some((t) => wantSet.has(t))
                );
            }

            await logEvent(session.userId, "roofer_within", {
                count: leads.length,
                capped,
                area_km2: Math.round(areaKm2 * 100) / 100,
                filter: [...wantSet],
            });

            return reply.send({ count: leads.length, capped, leads });
        }
    );
}
