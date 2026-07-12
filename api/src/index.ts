import Fastify from "fastify";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "api",
  time: new Date().toISOString(),
}));

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
