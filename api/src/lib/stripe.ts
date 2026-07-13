import Stripe from "stripe";

export function getStripe(): Stripe | null {
    const key = process.env.STRIPE_SECRET_KEY;
    return key ? new Stripe(key) : null;
}
