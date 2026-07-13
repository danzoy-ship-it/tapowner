import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { pool } from "../db.js";

function getStripe(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    return key ? new Stripe(key) : null;
}

function tierForPriceId(priceId: string | undefined): string | null {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_PROSPECTOR) return "prospector";
    if (priceId === process.env.STRIPE_PRICE_CLOSER) return "closer";
    return null;
}

async function upsertSubscriptionFromStripe(
    stripe: Stripe,
    userId: number,
    stripeCustomerId: string,
    subscription: Stripe.Subscription
) {
    const tier = tierForPriceId(subscription.items.data[0]?.price.id) ?? "closer";
    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    const periodEnd = subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null;

    const { rows: productRows } = await pool.query(
        `SELECT config FROM products WHERE id = 'tapowner'`
    );
    const config = productRows[0]?.config ?? {};
    const includedTraces = tier === "closer" ? (config.closer_included_traces ?? 0) : 0;

    await pool.query(
        `INSERT INTO subscriptions (
             user_id, stripe_customer_id, stripe_subscription_id, tier, status,
             trial_ends_at, included_traces_remaining, period_end
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (stripe_subscription_id) DO UPDATE SET
             tier = EXCLUDED.tier,
             status = EXCLUDED.status,
             trial_ends_at = EXCLUDED.trial_ends_at,
             period_end = EXCLUDED.period_end,
             updated_at = now()`,
        [
            userId,
            stripeCustomerId,
            subscription.id,
            tier,
            subscription.status,
            trialEndsAt,
            includedTraces,
            periodEnd,
        ]
    );
}

async function handleCheckoutCompleted(stripe: Stripe, session: Stripe.Checkout.Session) {
    const email = session.customer_details?.email ?? session.customer_email;
    if (!email || !session.subscription || !session.customer) return;

    const { rows: userRows } = await pool.query(
        `INSERT INTO users (product_id, email) VALUES ('tapowner', $1)
         ON CONFLICT (product_id, email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [email.toLowerCase()]
    );
    const userId = userRows[0].id;

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    await upsertSubscriptionFromStripe(stripe, userId, session.customer as string, subscription);
}

async function handleSubscriptionUpdated(stripe: Stripe, subscription: Stripe.Subscription) {
    const { rows } = await pool.query(
        `SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1`,
        [subscription.id]
    );
    const userId = rows[0]?.user_id;
    if (!userId) return;
    await upsertSubscriptionFromStripe(stripe, userId, subscription.customer as string, subscription);
}

export async function billingRoutes(app: FastifyInstance) {
    app.post<{ Body: { email?: string } }>("/billing/checkout-session", async (request, reply) => {
        const stripe = getStripe();
        const priceId = process.env.STRIPE_PRICE_CLOSER;
        if (!stripe || !priceId) {
            return reply.code(503).send({ error: "Billing not configured yet" });
        }

        const email = request.body.email?.trim().toLowerCase();
        if (!email) {
            return reply.code(400).send({ error: "email is required" });
        }

        const { rows: productRows } = await pool.query(
            `SELECT config FROM products WHERE id = 'tapowner'`
        );
        const trialDays = productRows[0]?.config?.trial_days ?? 30;

        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer_email: email,
            line_items: [{ price: priceId, quantity: 1 }],
            subscription_data: { trial_period_days: trialDays },
            success_url: `${process.env.WEB_BASE_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.WEB_BASE_URL}/signup`,
        });

        return reply.send({ url: session.url });
    });

    // Scoped child plugin: overrides the JSON body parser to keep the raw
    // buffer, which Stripe's signature verification requires. Fastify's
    // encapsulation means this only affects routes registered in this scope.
    await app.register(async (instance) => {
        instance.addContentTypeParser(
            "application/json",
            { parseAs: "buffer" },
            (_req, body, done) => done(null, body)
        );

        instance.post("/webhooks/stripe", async (request, reply) => {
            const stripe = getStripe();
            const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
            if (!stripe || !webhookSecret) {
                return reply.code(503).send({ error: "Billing not configured yet" });
            }

            const signature = request.headers["stripe-signature"];
            if (!signature || typeof signature !== "string") {
                return reply.code(400).send({ error: "Missing stripe-signature header" });
            }

            let event: Stripe.Event;
            try {
                event = stripe.webhooks.constructEvent(
                    request.body as Buffer,
                    signature,
                    webhookSecret
                );
            } catch (err) {
                app.log.warn({ err }, "Stripe webhook signature verification failed");
                return reply.code(400).send({ error: "Invalid signature" });
            }

            switch (event.type) {
                case "checkout.session.completed":
                    await handleCheckoutCompleted(
                        stripe,
                        event.data.object as Stripe.Checkout.Session
                    );
                    break;
                case "customer.subscription.updated":
                case "customer.subscription.deleted":
                    await handleSubscriptionUpdated(
                        stripe,
                        event.data.object as Stripe.Subscription
                    );
                    break;
                default:
                    app.log.info({ type: event.type }, "Unhandled Stripe webhook event type");
            }

            return reply.send({ received: true });
        });
    });
}
