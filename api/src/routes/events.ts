import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/middleware.js";
import { logEvent } from "../lib/events.js";

// Only events that originate client-side; everything else is logged
// server-side at the moment it actually happens.
const CLIENT_EVENTS = new Set(["app_open", "contact_saved"]);

export async function eventsRoutes(app: FastifyInstance) {
    app.post<{ Body: { name?: string; props?: Record<string, unknown> } }>(
        "/events",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;

            const name = request.body.name;
            if (!name || !CLIENT_EVENTS.has(name)) {
                return reply.code(400).send({ error: "Unknown event name" });
            }

            const props = request.body.props && typeof request.body.props === "object" ? request.body.props : {};
            await logEvent(session.userId, name, props);
            return reply.send({ ok: true });
        }
    );
}
