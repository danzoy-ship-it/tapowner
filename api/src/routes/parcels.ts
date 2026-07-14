import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { formatSitusAddress } from "../lib/address.js";
import { csvCell } from "../lib/csv.js";
import { isPlaceholderOwner } from "../lib/owners.js";
import { getLatestSubscription, isSubscriptionUsable } from "../lib/entitlements.js";
import { logEvent } from "../lib/events.js";

// Farm mode caps: a neighborhood farm is a few hundred homes. The result cap
// keeps responses bounded; the area cap stops a polygon drawn around half the
// county from scanning millions of rows.
const FARM_MAX_PARCELS = 500;
const FARM_MAX_AREA_KM2 = 25;
const FARM_MAX_VERTICES = 50;

const PARCEL_FIELDS = `
    id, apn, source_property_id, county_fips, county_name,
    situs_address, situs_number, situs_street, situs_city, situs_state, situs_zip,
    owner_name, owner_name_care,
    mailing_address, mailing_city, mailing_state, mailing_zip,
    is_absentee, is_protected, land_use, legal_description, source_date,
    living_area_sqft, year_built, bedrooms, baths_full, baths_half, stories,
    lot_size_sqft, has_pool, has_garage,
    assessed_land_value, assessed_improvement_value, assessed_total_value,
    last_sale_date, last_sale_price
`;

export async function parcelsRoutes(app: FastifyInstance) {
    app.get<{ Querystring: { lat?: string; lng?: string } }>(
        "/parcels/at",
        async (request, reply) => {
            const { lat, lng } = request.query;

            if (!lat || !lng) {
                return reply.code(400).send({ error: "lat and lng query params are required" });
            }

            const latNum = Number(lat);
            const lngNum = Number(lng);

            if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
                return reply.code(400).send({ error: "lat and lng must be numbers" });
            }
            if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
                return reply.code(400).send({ error: "lat/lng out of range" });
            }

            const result = await pool.query(
                // A point can fall inside several overlapping parcels (condo
                // units share a building footprint). Without an ORDER BY, LIMIT 1
                // returns an arbitrary row that can change tap-to-tap. Order by
                // smallest area first (the specific unit over a building-envelope
                // parcel), with id as a unique tiebreaker so the same tap always
                // resolves to the same parcel.
                `SELECT ${PARCEL_FIELDS}
                 FROM parcels
                 WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
                 ORDER BY ST_Area(geom) ASC, id ASC
                 LIMIT 1`,
                [lngNum, latNum]
            );

            if (result.rows.length === 0) {
                return reply.code(404).send({ error: "No parcel found at this location" });
            }

            const parcel = result.rows[0];
            parcel.situs_address = formatSitusAddress(parcel);
            return reply.send(parcel);
        }
    );

    // Farm mode: every owner inside a drawn polygon. Owner names + mailing
    // addresses are already-licensed county data (no vendor cost), so this
    // endpoint charges nothing -- but it IS a bulk read of the dataset, so it
    // requires a usable subscription, excludes protected records outright, and
    // is capped in both area and result count.
    app.post<{ Body: { polygon?: unknown; format?: string } }>(
        "/parcels/within",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;

            const sub = await getLatestSubscription(session.userId);
            if (!isSubscriptionUsable(sub)) {
                return reply
                    .code(402)
                    .send({ error: "Your subscription is inactive", subscription_inactive: true });
            }

            const raw = request.body?.polygon;
            if (
                !Array.isArray(raw) ||
                raw.length < 3 ||
                raw.length > FARM_MAX_VERTICES ||
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
                    error: `polygon must be 3-${FARM_MAX_VERTICES} [lng,lat] pairs`,
                });
            }

            // Close the ring (GeoJSON requires first === last) and normalize a
            // possibly self-intersecting tap order with ST_MakeValid.
            const ring = [...raw];
            const first = ring[0]!;
            const last = ring[ring.length - 1]!;
            if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
            const geojson = JSON.stringify({ type: "Polygon", coordinates: [ring] });

            const { rows: areaRows } = await pool.query(
                `SELECT ST_Area(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography) / 1e6 AS km2`,
                [geojson]
            );
            const areaKm2 = Number(areaRows[0].km2);
            if (!Number.isFinite(areaKm2) || areaKm2 <= 0) {
                return reply.code(400).send({ error: "That area couldn't be read — try drawing it again." });
            }
            if (areaKm2 > FARM_MAX_AREA_KM2) {
                return reply.code(400).send({
                    error: "That area is too large — zoom in and draw a smaller one.",
                    area_km2: Math.round(areaKm2),
                });
            }

            // && (bbox overlap) prunes via the GIST index; the point-on-surface
            // test gives the intuitive "house is inside my shape" semantics so a
            // parcel merely clipped by the boundary line doesn't sneak in.
            const { rows } = await pool.query(
                `WITH poly AS (
                     SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS g
                 )
                 SELECT p.id, p.owner_name,
                        p.situs_address, p.situs_number, p.situs_street,
                        p.situs_city, p.situs_state, p.situs_zip,
                        p.mailing_address, p.mailing_city, p.mailing_state, p.mailing_zip,
                        p.is_absentee
                 FROM parcels p, poly
                 WHERE p.geom && poly.g
                   AND ST_Within(ST_PointOnSurface(p.geom), poly.g)
                   AND p.is_protected = false
                   AND p.owner_name IS NOT NULL
                 ORDER BY p.situs_street NULLS LAST, p.situs_number NULLS LAST, p.id
                 LIMIT ${FARM_MAX_PARCELS + 1}`,
                [geojson]
            );

            const capped = rows.length > FARM_MAX_PARCELS;
            const parcels = rows
                .slice(0, FARM_MAX_PARCELS)
                .filter((r) => !isPlaceholderOwner(r.owner_name))
                .map((r) => ({
                    id: r.id,
                    owner_name: r.owner_name,
                    situs_address: formatSitusAddress(r),
                    situs_city: r.situs_city,
                    situs_zip: r.situs_zip,
                    mailing_address: r.mailing_address,
                    mailing_city: r.mailing_city,
                    mailing_state: r.mailing_state,
                    mailing_zip: r.mailing_zip,
                    is_absentee: r.is_absentee,
                }));

            await logEvent(session.userId, "farm_search", {
                count: parcels.length,
                capped,
                area_km2: Math.round(areaKm2 * 100) / 100,
            });

            if (request.body?.format === "csv") {
                const header = [
                    "Owner", "Property Address", "City", "ZIP",
                    "Mailing Address", "Mailing City", "Mailing State", "Mailing ZIP", "Absentee",
                ];
                const lines = [header.map(csvCell).join(",")];
                for (const p of parcels) {
                    lines.push(
                        [
                            p.owner_name,
                            p.situs_address ?? "",
                            p.situs_city ?? "",
                            p.situs_zip ?? "",
                            p.mailing_address ?? "",
                            p.mailing_city ?? "",
                            p.mailing_state ?? "",
                            p.mailing_zip ?? "",
                            p.is_absentee ? "Yes" : "",
                        ]
                            .map(csvCell)
                            .join(",")
                    );
                }
                return reply
                    .header("Content-Type", "text/csv; charset=utf-8")
                    .header("Content-Disposition", 'attachment; filename="tapowner-farm.csv"')
                    .send(lines.join("\r\n"));
            }

            return reply.send({ count: parcels.length, capped, parcels });
        }
    );
}
