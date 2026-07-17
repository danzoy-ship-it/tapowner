import { getProductConfig } from "./config.js";

// Roofer vertical (#2) product config -- a FLAGGED, DISABLED placeholder.
//
// Default OFF so it can NEVER affect V1 (realtor) users: the /roofer/* routes
// 404 until this is enabled. Enablement is config- or env-driven with no
// redeploy, exactly like the data_auth_required flag (lib/dataAuth.ts):
//   - products.config.roofer.enabled = true   (persisted flip in the DB), OR
//   - ROOFER_ENABLED=true                      (env var, for dev / CI / smoke).
//
// PRICING / TIERS ARE DELIBERATELY NULL. Tier structure and pricing are the
// founder's business decision and are NOT inferred here -- they stay null
// placeholders until he sets them in products.config.roofer.

export interface RooferProductConfig {
    /** Master switch. false unless flipped in config or ROOFER_ENABLED env. */
    enabled: boolean;
    /** Founder's call -- never inferred. Placeholder null until set. */
    pricing: null;
    /** Founder's call -- tier structure TBD. Placeholder null until set. */
    tiers: null;
    /** Min hail-swath band (inches) counted as a hit. Tunable via config;
     *  defaults to the 1.0in production band from ROOFER_SIGNALS.md. */
    hail_swath_min_in: number;
}

let cache: { cfg: RooferProductConfig; at: number } | null = null;
const TTL_MS = 60_000;

export async function getRooferConfig(): Promise<RooferProductConfig> {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;

    const productConfig = await getProductConfig();
    const r = (productConfig.roofer ?? {}) as Record<string, unknown>;

    const cfg: RooferProductConfig = {
        enabled: process.env.ROOFER_ENABLED === "true" || r.enabled === true,
        pricing: null, // placeholder -- founder sets pricing, never inferred here
        tiers: null, // placeholder -- founder sets tiers, never inferred here
        hail_swath_min_in:
            typeof r.hail_swath_min_in === "number" && Number.isFinite(r.hail_swath_min_in)
                ? r.hail_swath_min_in
                : 1.0,
    };
    cache = { cfg, at: Date.now() };
    return cfg;
}

/** Test/dev hook: drop the cached flag so an env/config flip is seen at once. */
export function clearRooferConfigCache(): void {
    cache = null;
}
