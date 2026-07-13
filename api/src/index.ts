import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { parcelsRoutes } from "./routes/parcels.js";
import { tilesRoutes } from "./routes/tiles.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { billingRoutes } from "./routes/billing.js";

const app = Fastify({ logger: true });

// Per-IP rate limiting pre-auth (Phase 2). Per-user limiting layers on top
// once sessions exist (Phase 5) -- not a rewrite, just an additional keyGenerator.
await app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 100),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
});

app.get("/health", async () => ({
    status: "ok",
    service: "api",
    time: new Date().toISOString(),
}));

await app.register(parcelsRoutes);
await app.register(tilesRoutes);
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(billingRoutes);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
    await app.listen({ port, host });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
