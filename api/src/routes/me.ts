import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";

export async function meRoutes(app: FastifyInstance) {
    app.get("/me", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const { rows } = await pool.query(
            `SELECT u.id, u.email, u.agent_profile,
                    s.tier, s.status, s.trial_ends_at, s.included_traces_remaining, s.period_end
             FROM users u
             LEFT JOIN subscriptions s ON s.user_id = u.id
             WHERE u.id = $1
             ORDER BY s.created_at DESC
             LIMIT 1`,
            [session.userId]
        );

        const row = rows[0];
        if (!row) {
            return reply.code(404).send({ error: "User not found" });
        }

        return reply.send({
            id: row.id,
            email: row.email,
            agent_profile: row.agent_profile,
            tier: row.tier ?? null,
            status: row.status ?? null,
            trial_ends_at: row.trial_ends_at,
            included_traces_remaining: row.included_traces_remaining ?? null,
            period_end: row.period_end,
        });
    });

    app.put<{ Body: { name?: string; brokerage?: string; phone?: string } }>(
        "/me/profile",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;

            const name = request.body.name?.trim();
            if (!name) {
                return reply.code(400).send({ error: "name is required" });
            }
            const brokerage = request.body.brokerage?.trim() ?? null;
            const phone = request.body.phone?.trim() ?? null;

            const { rows } = await pool.query(
                `UPDATE users SET agent_profile = $2 WHERE id = $1 RETURNING agent_profile`,
                [session.userId, JSON.stringify({ name, brokerage, phone })]
            );

            return reply.send({ agent_profile: rows[0].agent_profile });
        }
    );
}
