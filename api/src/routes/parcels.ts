import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { dataAuth } from "../lib/dataAuth.js";
import { formatSitusAddress } from "../lib/address.js";
import { csvCell } from "../lib/csv.js";
import { isPlaceholderOwner } from "../lib/owners.js";
import { getLatestSubscription, isSubscriptionUsable } from "../lib/entitlements.js";
import { getProductConfig } from "../lib/config.js";
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
            // C2 grace-mode auth: see lib/dataAuth.ts.
            const viewerId = await dataAuth(request, reply);
            if (viewerId === undefined) return;

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

            // Felt-gap instrumentation (property-data API decision, 2026-07-14):
            // record what each opened card was missing so the real
            // user-experienced blank rate is measurable, not estimated. The
            // vendor-vs-own-pipeline call gets made from this data.
            void logEvent(viewerId, "parcel_viewed", {
                parcel_id: parcel.id,
                county_fips: parcel.county_fips,
                has_sqft: parcel.living_area_sqft !== null,
                has_beds: parcel.bedrooms !== null,
                has_pool_known: parcel.has_pool !== null,
                has_year: parcel.year_built !== null,
            });

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
                        p.is_absentee,
                        p.living_area_sqft, p.bedrooms, p.baths_full, p.baths_half,
                        p.stories, p.year_built, p.has_pool,
                        tr.payload AS trace_payload
                 FROM parcels p
                 CROSS JOIN poly
                 LEFT JOIN user_traces ut ON ut.user_id = $2 AND ut.parcel_id = p.id
                 LEFT JOIN trace_results tr ON tr.id = ut.trace_result_id
                 WHERE p.geom && poly.g
                   AND ST_Within(ST_PointOnSurface(p.geom), poly.g)
                   AND p.is_protected = false
                   AND p.owner_name IS NOT NULL
                 ORDER BY p.situs_street NULLS LAST, p.situs_number NULLS LAST, p.id
                 LIMIT ${FARM_MAX_PARCELS + 1}`,
                [geojson, session.userId]
            );

            const capped = rows.length > FARM_MAX_PARCELS;
            const parcels = rows
                .slice(0, FARM_MAX_PARCELS)
                .filter((r) => !isPlaceholderOwner(r.owner_name))
                .map((r) => {
                    // Contacts the user already paid to trace ride along (owned
                    // data only -- the LEFT JOIN is scoped to this user).
                    const payload = (r.trace_payload ?? null) as {
                        phones?: Array<{ number?: string }>;
                        emails?: Array<{ email?: string }>;
                    } | null;
                    return {
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
                        living_area_sqft: r.living_area_sqft,
                        bedrooms: r.bedrooms,
                        baths_full: r.baths_full,
                        baths_half: r.baths_half,
                        stories: r.stories,
                        year_built: r.year_built,
                        has_pool: r.has_pool,
                        phones: payload ? (payload.phones ?? []).map((x) => x.number).filter(Boolean) : [],
                        emails: payload ? (payload.emails ?? []).map((x) => x.email).filter(Boolean) : [],
                    };
                });

            await logEvent(session.userId, "farm_search", {
                count: parcels.length,
                capped,
                area_km2: Math.round(areaKm2 * 100) / 100,
            });

            if (request.body?.format === "csv") {
                const header = [
                    "Owner", "Property Address", "City", "ZIP",
                    "Mailing Address", "Mailing City", "Mailing State", "Mailing ZIP", "Absentee",
                    "Sqft", "Beds", "Baths Full", "Baths Half", "Stories", "Year Built", "Pool",
                    "Phones", "Emails",
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
                            p.living_area_sqft ?? "",
                            p.bedrooms ?? "",
                            p.baths_full ?? "",
                            p.baths_half ?? "",
                            p.stories ?? "",
                            p.year_built ?? "",
                            p.has_pool === true ? "Yes" : p.has_pool === false ? "No" : "",
                            p.phones.join("; "),
                            p.emails.join("; "),
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

    // Farm export accounting. Beta (config farm_export_beta=true): free, capped
    // at farm_export_beta_cap_rows per calendar month; the client calls this
    // BEFORE sharing the file and blocks on allowed=false. At launch the flag
    // flips and this becomes the hook that reports Stripe meter events at
    // farm_export_price_cents/row.
    app.post<{ Body: { rows?: number } }>("/farm/export-log", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const rows = Number(request.body?.rows);
        if (!Number.isInteger(rows) || rows <= 0 || rows > FARM_MAX_PARCELS) {
            return reply.code(400).send({ error: "rows must be 1-" + FARM_MAX_PARCELS });
        }

        const config = await getProductConfig();
        const beta = config.farm_export_beta ?? true;
        const cap = config.farm_export_beta_cap_rows ?? 300;

        if (!beta) {
            // Launch mode: no cap here (metering to be wired when the flag
            // flips). Log and allow.
            await pool.query(`INSERT INTO farm_export_log (user_id, rows) VALUES ($1, $2)`, [
                session.userId,
                rows,
            ]);
            return reply.send({ allowed: true, beta: false, remaining: null });
        }

        const { rows: usedRows } = await pool.query(
            `SELECT COALESCE(SUM(rows), 0)::int AS used FROM farm_export_log
             WHERE user_id = $1 AND created_at >= date_trunc('month', now())`,
            [session.userId]
        );
        const used = usedRows[0].used as number;
        if (used + rows > cap) {
            return reply.send({
                allowed: false,
                beta: true,
                remaining: Math.max(0, cap - used),
                error: `Beta export limit: ${cap} rows/month. ${Math.max(0, cap - used)} left — resets on the 1st.`,
            });
        }
        await pool.query(`INSERT INTO farm_export_log (user_id, rows) VALUES ($1, $2)`, [
            session.userId,
            rows,
        ]);
        return reply.send({ allowed: true, beta: true, remaining: cap - used - rows });
    });
}
