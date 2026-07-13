import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { parcelsRoutes } from "./routes/parcels.js";
import { tilesRoutes } from "./routes/tiles.js";
import { authRoutes } from "./routes/auth.js";
import { meRoutes } from "./routes/me.js";
import { billingRoutes } from "./routes/billing.js";
import { partnersRoutes } from "./routes/partners.js";
import { traceRoutes } from "./routes/trace.js";
import { draftRoutes } from "./routes/draft.js";
import { savedPropertiesRoutes } from "./routes/savedProperties.js";
import { geocodeRoutes } from "./routes/geocode.js";

const app = Fastify({ logger: true });

// The mobile app (React Native) isn't subject to browser CORS; this is only
// for web/ calling the API from a browser context.
const webOrigins = [
    process.env.WEB_BASE_URL,
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
].filter((origin): origin is string => Boolean(origin));

await app.register(cors, {
    origin: webOrigins,
});

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
await app.register(partnersRoutes);
await app.register(traceRoutes);
await app.register(draftRoutes);
await app.register(savedPropertiesRoutes);
await app.register(geocodeRoutes);

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
    await app.listen({ port, host });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}
