import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { getProductConfig } from "../lib/config.js";
import { DRAFT_TEMPLATES, DRAFT_TONES } from "../draft/templates.js";

const CACHE_TTL_MS = 60_000;

let cached: { body: Record<string, unknown>; at: number } | null = null;

// Whitelist, not the raw products.config: partner commission rates and other
// internal knobs stay server-side.
function buildPayload(config: Record<string, any>): Record<string, unknown> {
    const payload = {
        trial_days: config.trial_days ?? 30,
        trace_price_cents: config.trace_price_cents ?? 29,
        closer_included_traces: config.closer_included_traces ?? 10,
        tiers: config.tiers ?? {},
        draft: {
            templates: DRAFT_TEMPLATES.map((t) => ({ id: t.id, label: t.label })),
            tones: DRAFT_TONES.map((t) => ({ id: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
            rate_limit_per_day: config.draft_rate_limit_per_day ?? 30,
        },
        manage_plan_url_text: "Manage your plan at tapowner.com",
        // Texas Data Broker Act conspicuous-notice slot (compliance appendix
        // item 3): empty until registration; the SOS-prescribed text goes into
        // products.config.data_broker_notice and appears on web + app with no
        // code change.
        data_broker_notice: config.data_broker_notice ?? "",
    };
    const version = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
    return { version, ...payload };
}

export async function configRoutes(app: FastifyInstance) {
    app.get("/config", async (_request, reply) => {
        if (!cached || Date.now() - cached.at > CACHE_TTL_MS) {
            const config = await getProductConfig();
            cached = { body: buildPayload(config), at: Date.now() };
        }
        return reply.header("Cache-Control", "public, max-age=60").send(cached.body);
    });
}
