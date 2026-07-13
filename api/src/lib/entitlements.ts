import type { FastifyReply } from "fastify";
import { pool } from "../db.js";
import { getProductConfig } from "./config.js";

export interface SubscriptionRow {
    id: number;
    stripe_customer_id: string | null;
    stripe_subscription_id: string | null;
    tier: string;
    status: string;
    trial_ends_at: string | null;
    included_traces_remaining: number;
}

export async function getLatestSubscription(userId: string | number): Promise<SubscriptionRow | null> {
    const { rows } = await pool.query(
        `SELECT id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, included_traces_remaining
         FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
    return rows[0] ?? null;
}

export function isSubscriptionUsable(sub: SubscriptionRow | null): sub is SubscriptionRow {
    return sub !== null && (sub.status === "trialing" || sub.status === "active");
}

export function tierHasFeature(config: Record<string, any>, tier: string, feature: string): boolean {
    return Boolean(config.tiers?.[tier]?.features?.[feature]);
}

/**
 * Shared gate: an inactive/missing subscription sends 402 (the app shows the
 * trial-expiry screen); an active subscription whose tier lacks the feature
 * sends 403 with `upgrade_required` (the app shows the upgrade sheet).
 * Returns the subscription row when the request may proceed.
 */
export async function requireFeature(
    userId: string | number,
    feature: string,
    reply: FastifyReply
): Promise<SubscriptionRow | null> {
    const sub = await getLatestSubscription(userId);
    if (!isSubscriptionUsable(sub)) {
        reply.code(402).send({ error: "Your subscription is inactive", subscription_inactive: true });
        return null;
    }
    const config = await getProductConfig();
    if (!tierHasFeature(config, sub.tier, feature)) {
        reply.code(403).send({
            error: "This feature requires the Closer plan",
            upgrade_required: true,
            feature,
        });
        return null;
    }
    return sub;
}
