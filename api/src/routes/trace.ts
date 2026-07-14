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
import { logEvent } from "../lib/events.js";

// Atomically consume one included trace. The `AND included_traces_remaining > 0`
// guard + Postgres row lock means two concurrent traces can't both decrement a
// balance of 1 (the second sees 0 rows affected). Returns true iff one was used.
async function tryConsumeIncludedTrace(sub: Subscription): Promise<boolean> {
    if (sub.tier !== "closer") return false;
    const res = await pool.query(
        `UPDATE subscriptions SET included_traces_remaining = included_traces_remaining - 1
         WHERE id = $1 AND included_traces_remaining > 0`,
        [sub.id]
    );
    return res.rowCount === 1;
}

async function refundIncludedTrace(sub: Subscription): Promise<void> {
    await pool.query(
        `UPDATE subscriptions SET included_traces_remaining = included_traces_remaining + 1 WHERE id = $1`,
        [sub.id]
    );
}

// Metered ("pay-as-you-go") spend already booked this billing cycle. The window
// is anchored to the subscription's period_end (one month back), so it resets
// when Stripe renews and invoices the overage; if period_end is unset we fall
// back to a rolling 30-day window. Used to enforce `metered_cap_cents`.
async function meteredSpentThisCycleCents(userId: string | number, subId: number): Promise<number> {
    const { rows } = await pool.query(
        `SELECT COALESCE(SUM(charged_cents), 0)::int AS spent
         FROM user_traces
         WHERE user_id = $1 AND charged_via = 'metered'
           AND created_at >= COALESCE(
               (SELECT period_end FROM subscriptions WHERE id = $2) - interval '1 month',
               now() - interval '30 days')`,
        [userId, subId]
    );
    return rows[0].spent as number;
}

// Report one metered trace to Stripe. The deterministic `identifier` makes this
// idempotent -- a client retry (or duplicate delivery) with the same user+parcel
// is counted once by Stripe, never double-billed.
async function reportMeteredTrace(
    stripe: Stripe,
    sub: Subscription,
    userId: string | number,
    parcelId: number
): Promise<void> {
    const tracePriceId = process.env.STRIPE_PRICE_TRACE;
    if (!tracePriceId) {
        throw new Error("STRIPE_PRICE_TRACE is not configured");
    }
    if (!sub.stripe_subscription_id || !sub.stripe_customer_id) {
        throw new Error(`Subscription ${sub.id} is usable but missing Stripe ids`);
    }
    const items = await stripe.subscriptionItems.list({ subscription: sub.stripe_subscription_id });
    if (!items.data.some((i) => i.price.id === tracePriceId)) {
        await stripe.subscriptionItems.create({
            subscription: sub.stripe_subscription_id,
            price: tracePriceId,
        });
    }
    await stripe.billing.meterEvents.create({
        event_name: "trace_used",
        identifier: `trace-${userId}-${parcelId}`,
        payload: { stripe_customer_id: sub.stripe_customer_id, value: "1" },
    });
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

        const config = await getProductConfig();

        // Metered spend cap. Only relevant once the included allowance is spent
        // (that's when a trace bills per-use); checked BEFORE the vendor call so
        // a capped account can't run up vendor cost on traces we'll refuse. This
        // is a safety ceiling, not a hard financial boundary -- highly concurrent
        // taps can overshoot by a few cents, which is fine.
        if (sub.tier === "closer" && sub.included_traces_remaining <= 0) {
            const capCents = config.metered_cap_cents ?? 2500;
            const nextChargeCents = config.trace_price_cents ?? 29;
            const spent = await meteredSpentThisCycleCents(session.userId, sub.id);
            if (spent + nextChargeCents > capCents) {
                return reply.code(402).send({
                    error: `You've hit your $${Math.round(capCents / 100)} monthly cap on pay-as-you-go traces. It resets when your plan renews.`,
                    metered_cap_reached: true,
                });
            }
        }

        const { rows: parcelRows } = await pool.query(
            `SELECT id, apn, county_fips, owner_name, is_protected, situs_address, situs_city, situs_state, situs_zip
             FROM parcels WHERE id = $1`,
            [parcelId]
        );
        const parcel = parcelRows[0];
        if (!parcel) {
            return reply.code(404).send({ error: "Parcel not found" });
        }

        // Protected records (Texas Tax Code §25.025) and owner-less parcels must
        // never be sent to the vendor -- it's a compliance line, and their null
        // owner_name would also crash the NOT NULL owner_name_hash insert. Reject
        // BEFORE any vendor call or charge.
        if (parcel.is_protected || !parcel.owner_name) {
            return reply.code(403).send({
                error: "This is a protected record and can't be traced.",
                protected: true,
                phones: [],
                emails: [],
            });
        }

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
                await logEvent(session.userId, "trace_no_match", { parcel_id: parcelId });
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

        // Decide the charge method atomically (included first), but DON'T bill
        // Stripe yet.
        const usedIncluded = await tryConsumeIncludedTrace(sub);
        const chargedVia: "included" | "metered" = usedIncluded ? "included" : "metered";
        const chargedCents = usedIncluded ? 0 : (config.trace_price_cents ?? 29);

        // Concurrency gate: UNIQUE(user_id, parcel_id) lets exactly one request
        // record (and therefore charge) this trace. A concurrent double-tap or
        // retry that loses the race is refunded and served free -- so a trace is
        // never billed twice.
        const { rows: gateRows } = await pool.query(
            `INSERT INTO user_traces (user_id, parcel_id, trace_result_id, charged_cents, charged_via)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, parcel_id) DO NOTHING
             RETURNING id`,
            [session.userId, parcelId, traceResultId, chargedCents, chargedVia]
        );

        if (gateRows.length === 0) {
            if (usedIncluded) await refundIncludedTrace(sub);
            return reply.send({ matched: true, ...payload, matchQuality, freeReview: true });
        }

        // We won the gate -- now (and only now) bill Stripe for a metered trace.
        if (!usedIncluded) {
            await reportMeteredTrace(stripe, sub, session.userId, parcelId);
        }

        await logEvent(session.userId, "trace_purchased", {
            parcel_id: parcelId,
            charged_via: chargedVia,
            charged_cents: chargedCents,
            vendor_called: vendorCalled,
        });
        app.log.info({ parcelId, userId: session.userId, vendorCalled, chargedVia }, "trace completed");

        return reply.send({ matched: true, ...payload, matchQuality });
    });
}
