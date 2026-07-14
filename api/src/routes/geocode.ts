import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { dataAuth } from "../lib/dataAuth.js";
import { getProductConfig } from "../lib/config.js";
import { logEvent } from "../lib/events.js";

interface GoogleGeocodeResponse {
    status: string;
    error_message?: string;
    results: Array<{
        formatted_address: string;
        geometry: { location: { lat: number; lng: number } };
    }>;
}

export async function geocodeRoutes(app: FastifyInstance) {
    app.get<{ Querystring: { address?: string } }>("/geocode", async (request, reply) => {
        const userId = await dataAuth(request, reply);
        if (userId === undefined) return;

        const address = request.query.address?.trim();
        if (!address) {
            return reply.code(400).send({ error: "address query param is required" });
        }

        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) {
            return reply.code(503).send({ error: "Address search not configured yet" });
        }

        // Every geocode costs Google-budget money: cap per user per day (the
        // per-IP limiter still covers anonymous grace-mode traffic).
        if (userId !== null) {
            const config = await getProductConfig();
            const dailyLimit = config.geocode_daily_limit ?? 200;
            const { rows: countRows } = await pool.query(
                `SELECT count(*) FROM events
                 WHERE user_id = $1 AND name = 'geocode' AND created_at > now() - interval '1 day'`,
                [userId]
            );
            if (Number(countRows[0].count) >= dailyLimit) {
                return reply.code(429).send({ error: "Daily address-search limit reached, try again tomorrow" });
            }
            await logEvent(userId, "geocode", {});
        }

        const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        url.searchParams.set("address", address);
        url.searchParams.set("region", "us");
        url.searchParams.set("components", "administrative_area:TX|country:US");
        url.searchParams.set("key", apiKey);

        const res = await fetch(url);
        if (!res.ok) {
            app.log.error({ status: res.status }, "Google geocode request failed");
            return reply.code(502).send({ error: "Address search failed, try again" });
        }

        const data = (await res.json()) as GoogleGeocodeResponse;
        const top = data.results[0];
        if (data.status !== "OK" || !top) {
            if (data.status !== "ZERO_RESULTS") {
                app.log.error({ status: data.status, message: data.error_message }, "Google geocode non-OK status");
            }
            return reply.code(404).send({ error: "No matching address found" });
        }
        return reply.send({
            lat: top.geometry.location.lat,
            lng: top.geometry.location.lng,
            formatted_address: top.formatted_address,
        });
    });
}
