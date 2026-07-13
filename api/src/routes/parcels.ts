import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";

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
                `SELECT ${PARCEL_FIELDS}
                 FROM parcels
                 WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
                 LIMIT 1`,
                [lngNum, latNum]
            );

            if (result.rows.length === 0) {
                return reply.code(404).send({ error: "No parcel found at this location" });
            }

            return reply.send(result.rows[0]);
        }
    );
}
