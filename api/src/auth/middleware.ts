import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySession, type SessionPayload } from "./jwt.js";

export async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<SessionPayload | undefined> {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        reply.code(401).send({ error: "Missing bearer token" });
        return undefined;
    }

    const token = header.slice("Bearer ".length);
    try {
        return verifySession(token);
    } catch {
        reply.code(401).send({ error: "Invalid or expired session" });
        return undefined;
    }
}
