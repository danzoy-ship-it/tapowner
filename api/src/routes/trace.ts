import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { getStripe } from "../lib/stripe.js";
import { getProductConfig } from "../lib/config.js";
import { createTraceProvider } from "../trace/index.js";
import {
    getLatestSubscription,
    isSubscriptionUsable,
    type SubscriptionRow as Subscription,
} from "../lib/entitlements.js";

async function chargeForTrace(
    stripe: Stripe,
    sub: Subscription,
    config: Record<string, any>
): Promise<{ chargedVia: "included" | "metered"; chargedCents: number }> {
    if (sub.tier === "closer" && sub.included_traces_remaining > 0) {
        await pool.query(
            `UPDATE subscriptions SET included_traces_remaining = included_traces_remaining - 1 WHERE id = $1`,
            [sub.id]
        );
        return { chargedVia: "included", chargedCents: 0 };
    }

    const tracePriceId = process.env.STRIPE_PRICE_TRACE;
    if (!tracePriceId) {
        throw new Error("STRIPE_PRICE_TRACE is not configured");
    }
    if (!sub.stripe_subscription_id || !sub.stripe_customer_id) {
        throw new Error(`Subscription ${sub.id} is usable but missing Stripe ids`);
    }

    const items = await stripe.subscriptionItems.list({ subscription: sub.stripe_subscription_id });
    const hasTraceItem = items.data.some((i) => i.price.id === tracePriceId);
    if (!hasTraceItem) {
        await stripe.subscriptionItems.create({
            subscription: sub.stripe_subscription_id,
            price: tracePriceId,
        });
    }

    await stripe.billing.meterEvents.create({
        event_name: "trace_used",
        payload: { stripe_customer_id: sub.stripe_customer_id, value: "1" },
    });

    const priceCents = config.trace_price_cents ?? 29;
    return { chargedVia: "metered", chargedCents: priceCents };
}

export async function traceRoutes(app: FastifyInstance) {
    app.post<{ Params: { parcelId: string } }>("/trace/:parcelId", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const parcelId = Number(request.params.parcelId);
        if (!Number.isInteger(parcelId)) {
            return reply.code(400).send({ error: "Invalid parcel id" });
        }

        // 1. Free re-view: this user already owns a trace for this parcel.
        const { rows: existingRows } = await pool.query(
            `SELECT tr.payload, tr.match_quality
             FROM user_traces ut JOIN trace_results tr ON tr.id = ut.trace_result_id
             WHERE ut.user_id = $1 AND ut.parcel_id = $2`,
            [session.userId, parcelId]
        );
        if (existingRows.length > 0) {
            const row = existingRows[0];
            return reply.send({ matched: true, ...row.payload, matchQuality: row.match_quality, freeReview: true });
        }

        // New charges require a usable subscription -- checked BEFORE any vendor
        // call so a lapsed account can never cost us per-trace vendor spend.
        // (Free re-views above stay accessible: the user already paid for those.)
        const sub = await getLatestSubscription(session.userId);
        if (!isSubscriptionUsable(sub)) {
            return reply.code(402).send({ error: "Your subscription is inactive", subscription_inactive: true });
        }

        const { rows: parcelRows } = await pool.query(
            `SELECT id, apn, county_fips, owner_name, situs_address, situs_city, situs_state, situs_zip
             FROM parcels WHERE id = $1`,
            [parcelId]
        );
        const parcel = parcelRows[0];
        if (!parcel) {
            return reply.code(404).send({ error: "Parcel not found" });
        }

        const config = await getProductConfig();
        const ttlDays = config.trace_cache_ttl_days ?? 90;
        const ownerNameHash = parcel.owner_name
            ? createHash("sha256").update(parcel.owner_name).digest("hex")
            : null;

        let traceResultId: number;
        let payload: { phones: unknown[]; emails: unknown[] };
        let matchQuality: string;
        let vendorCalled = false;

        const { rows: cacheRows } = await pool.query(
            `SELECT id, payload, match_quality FROM trace_results
             WHERE parcel_id = $1 AND owner_name_hash = $2
               AND fetched_at > now() - ($3 || ' days')::interval
             ORDER BY fetched_at DESC LIMIT 1`,
            [parcelId, ownerNameHash, String(ttlDays)]
        );

        if (cacheRows.length > 0) {
            traceResultId = cacheRows[0].id;
            payload = cacheRows[0].payload;
            matchQuality = cacheRows[0].match_quality;
        } else {
            const provider = createTraceProvider();
            if (!provider) {
                return reply.code(503).send({ error: "Trace provider not configured" });
            }

            vendorCalled = true;
            const result = await provider.trace({
                apn: parcel.apn,
                countyFips: parcel.county_fips,
                ownerName: parcel.owner_name,
                situsAddress: parcel.situs_address,
                situsCity: parcel.situs_city,
                situsState: parcel.situs_state,
                situsZip: parcel.situs_zip,
            });

            if (!result.matched) {
                return reply.send({
                    matched: false,
                    phones: [],
                    emails: [],
                    message: "No verified contact found — you were not charged.",
                });
            }

            payload = { phones: result.phones, emails: result.emails };
            matchQuality = result.matchQuality;

            const { rows: insertedRows } = await pool.query(
                `INSERT INTO trace_results (parcel_id, owner_name_hash, payload, vendor, match_quality)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [parcelId, ownerNameHash, JSON.stringify(payload), "batchdata", matchQuality]
            );
            traceResultId = insertedRows[0].id;
        }

        const stripe = getStripe();
        if (!stripe) {
            return reply.code(503).send({ error: "Billing not configured yet" });
        }

        const { chargedVia, chargedCents } = await chargeForTrace(stripe, sub, config);

        await pool.query(
            `INSERT INTO user_traces (user_id, parcel_id, trace_result_id, charged_cents, charged_via)
             VALUES ($1, $2, $3, $4, $5)`,
            [session.userId, parcelId, traceResultId, chargedCents, chargedVia]
        );

        app.log.info({ parcelId, userId: session.userId, vendorCalled, chargedVia }, "trace completed");

        return reply.send({ matched: true, ...payload, matchQuality });
    });
}
