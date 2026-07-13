import type { FastifyInstance } from "fastify";
import Stripe from "stripe";
import { pool } from "../db.js";
import { getStripe } from "../lib/stripe.js";
import { getProductConfig } from "../lib/config.js";
import { logEvent } from "../lib/events.js";

const REFERRAL_COUPON_ID = "user-referral-free-month";

function tierForPriceId(priceId: string | undefined): string | null {
    if (!priceId) return null;
    if (priceId === process.env.STRIPE_PRICE_PROSPECTOR) return "prospector";
    if (priceId === process.env.STRIPE_PRICE_CLOSER) return "closer";
    return null;
}

async function upsertSubscriptionFromStripe(
    userId: number,
    stripeCustomerId: string,
    subscription: Stripe.Subscription
) {
    const tier = tierForPriceId(subscription.items.data[0]?.price.id) ?? "closer";
    const trialEndsAt = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
    const periodEnd = subscription.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000)
        : null;

    const config = await getProductConfig();
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

async function getOrCreateReferralCoupon(stripe: Stripe): Promise<string> {
    try {
        await stripe.coupons.retrieve(REFERRAL_COUPON_ID);
    } catch {
        await stripe.coupons.create({
            id: REFERRAL_COUPON_ID,
            duration: "once",
            percent_off: 100,
            name: "Referral: first month free",
        });
    }
    return REFERRAL_COUPON_ID;
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
    await upsertSubscriptionFromStripe(userId, session.customer as string, subscription);
    await logEvent(userId, "signup_completed", {
        tier: tierForPriceId(subscription.items.data[0]?.price.id) ?? "closer",
    });

    const partnerId = session.metadata?.referral_partner_id;
    if (partnerId) {
        await pool.query(
            `INSERT INTO referrals (partner_id, referred_user_id)
             VALUES ($1, $2)
             ON CONFLICT (referred_user_id) DO NOTHING`,
            [Number(partnerId), userId]
        );
    }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const { rows } = await pool.query(
        `SELECT user_id, status, tier FROM subscriptions WHERE stripe_subscription_id = $1`,
        [subscription.id]
    );
    const prior = rows[0];
    const userId = prior?.user_id;
    if (!userId) return;
    await upsertSubscriptionFromStripe(userId, subscription.customer as string, subscription);

    const newTier = tierForPriceId(subscription.items.data[0]?.price.id) ?? "closer";
    if (prior.status === "trialing" && subscription.status === "active") {
        await logEvent(userId, "trial_converted", { tier: newTier });
    }
    if (prior.tier === "prospector" && newTier === "closer") {
        await logEvent(userId, "upgrade_prospector_to_closer", {});
    }
}

// Credits `partnerUserId`'s own Stripe customer balance by the value of one
// month at their current tier (falls back to the Closer price if they have
// no subscription of their own).
async function creditReferrerFreeMonth(stripe: Stripe, partnerUserId: number, config: Record<string, any>) {
    const { rows } = await pool.query(
        `SELECT stripe_customer_id, tier FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [partnerUserId]
    );
    const referrerSub = rows[0];
    if (!referrerSub?.stripe_customer_id) return;

    const tier = referrerSub.tier ?? "closer";
    const amountCents = config.tiers?.[tier]?.price_cents ?? config.tiers?.closer?.price_cents ?? 1999;

    await stripe.customers.createBalanceTransaction(referrerSub.stripe_customer_id, {
        amount: -amountCents,
        currency: "usd",
        description: "Referral reward: 1 free month",
    });
}

function nonMeteredRevenueCents(invoice: Stripe.Invoice): number {
    return invoice.lines.data
        .filter((line) => line.pricing?.price_details?.price !== process.env.STRIPE_PRICE_TRACE)
        .reduce((sum, line) => sum + line.amount, 0);
}

async function handleInvoicePaid(stripe: Stripe, invoice: Stripe.Invoice, eventId: string) {
    const subscriptionId =
        typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : invoice.parent?.subscription_details?.subscription?.id;
    if (!subscriptionId) return;

    const { rows: subRows } = await pool.query(
        `SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1`,
        [subscriptionId]
    );
    const userId = subRows[0]?.user_id;
    if (!userId) return;

    const { rows: referralRows } = await pool.query(
        `SELECT id, partner_id, first_paid_at FROM referrals WHERE referred_user_id = $1`,
        [userId]
    );
    const referral = referralRows[0];
    if (!referral) return; // not a referred user, nothing to do

    const isFirstPaidInvoice = referral.first_paid_at === null;
    if (isFirstPaidInvoice) {
        await pool.query(
            `UPDATE referrals SET status = 'activated', first_paid_at = now() WHERE id = $1`,
            [referral.id]
        );
    }

    const { rows: partnerRows } = await pool.query(`SELECT * FROM partners WHERE id = $1`, [
        referral.partner_id,
    ]);
    const partner = partnerRows[0];
    if (!partner || partner.status !== "active") return;

    const config = await getProductConfig();

    if (partner.type === "user_referral" || partner.type === "founding_agent") {
        if (isFirstPaidInvoice && partner.user_id) {
            await creditReferrerFreeMonth(stripe, partner.user_id, config);
        }
        return;
    }

    if (partner.type === "affiliate") {
        const { rows: countRows } = await pool.query(
            `SELECT count(*) FROM commission_ledger WHERE referral_id = $1`,
            [referral.id]
        );
        const alreadyCommissionedCount = Number(countRows[0].count);
        const monthsCap = partner.months_cap ?? config.affiliate_months ?? 12;

        const revenueCents = nonMeteredRevenueCents(invoice);
        if (revenueCents <= 0) return;

        let amountCents: number;
        if (partner.comp_model === "flat") {
            if (alreadyCommissionedCount > 0) return; // one-time bounty, already paid
            amountCents = config.affiliate_flat_cents ?? 2000;
        } else {
            if (alreadyCommissionedCount >= monthsCap) return; // past the commission window
            const rate = partner.rate ?? config.affiliate_rate ?? 0.25;
            amountCents = Math.round(revenueCents * rate);
        }

        await pool.query(
            `INSERT INTO commission_ledger (partner_id, referral_id, invoice_id, amount_cents, stripe_event_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (stripe_event_id) DO NOTHING`,
            [partner.id, referral.id, invoice.id, amountCents, eventId]
        );
    }
}

async function handleChargeRefunded(stripe: Stripe, charge: Stripe.Charge, eventId: string) {
    const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntentId) return;

    const invoicePayments = await stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: paymentIntentId },
    });
    const invoiceRef = invoicePayments.data[0]?.invoice;
    const invoiceId = typeof invoiceRef === "string" ? invoiceRef : invoiceRef?.id;
    if (!invoiceId) return;

    const { rows } = await pool.query(
        `SELECT id, partner_id, referral_id, amount_cents FROM commission_ledger
         WHERE invoice_id = $1 AND amount_cents > 0`,
        [invoiceId]
    );

    for (const row of rows) {
        await pool.query(
            `INSERT INTO commission_ledger (partner_id, referral_id, invoice_id, amount_cents, stripe_event_id)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (stripe_event_id) DO NOTHING`,
            [row.partner_id, row.referral_id, invoiceId, -row.amount_cents, `clawback:${row.id}`]
        );
    }
}

export async function billingRoutes(app: FastifyInstance) {
    app.post<{ Body: { email?: string; referralCode?: string; referralAttributedAt?: number } }>(
        "/billing/checkout-session",
        async (request, reply) => {
            const stripe = getStripe();
            const priceId = process.env.STRIPE_PRICE_CLOSER;
            if (!stripe || !priceId) {
                return reply.code(503).send({ error: "Billing not configured yet" });
            }

            const email = request.body.email?.trim().toLowerCase();
            if (!email) {
                return reply.code(400).send({ error: "email is required" });
            }

            // The users row doesn't exist until the checkout webhook fires,
            // so the funnel start is keyed by email only.
            await logEvent(null, "signup_started", { email });

            const config = await getProductConfig();
            const trialDays = config.trial_days ?? 30;

            let partnerId: number | null = null;
            let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;

            const referralCode = request.body.referralCode?.trim().toUpperCase();
            const { referralAttributedAt } = request.body;
            const attributionWindowMs = (config.attribution_days ?? 60) * 24 * 60 * 60 * 1000;
            const withinAttributionWindow =
                referralAttributedAt !== undefined &&
                Date.now() - referralAttributedAt <= attributionWindowMs;

            if (referralCode && withinAttributionWindow) {
                const { rows } = await pool.query(
                    `SELECT p.id, p.type, u.email AS partner_email
                     FROM partners p LEFT JOIN users u ON u.id = p.user_id
                     WHERE p.code = $1 AND p.status = 'active'`,
                    [referralCode]
                );
                const partner = rows[0];
                const isSelfReferral = partner?.partner_email === email;
                if (partner && !isSelfReferral) {
                    partnerId = partner.id;
                    if (partner.type === "user_referral" || partner.type === "founding_agent") {
                        const couponId = await getOrCreateReferralCoupon(stripe);
                        discounts = [{ coupon: couponId }];
                    }
                }
            }

            const session = await stripe.checkout.sessions.create({
                mode: "subscription",
                customer_email: email,
                line_items: [{ price: priceId, quantity: 1 }],
                subscription_data: { trial_period_days: trialDays },
                ...(discounts ? { discounts } : {}),
                ...(partnerId ? { metadata: { referral_partner_id: String(partnerId) } } : {}),
                success_url: `${process.env.WEB_BASE_URL}/welcome?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.WEB_BASE_URL}/signup`,
            });

            return reply.send({ url: session.url });
        }
    );

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
                    await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                    break;
                case "invoice.paid":
                    await handleInvoicePaid(stripe, event.data.object as Stripe.Invoice, event.id);
                    break;
                case "charge.refunded":
                    await handleChargeRefunded(stripe, event.data.object as Stripe.Charge, event.id);
                    break;
                default:
                    app.log.info({ type: event.type }, "Unhandled Stripe webhook event type");
            }

            return reply.send({ received: true });
        });
    });
}
