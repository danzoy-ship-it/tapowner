import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySession } from "../auth/jwt.js";
import { getProductConfig } from "./config.js";

// C2: auth for the bulk-data endpoints (/tiles, /parcels/at, /geocode). The
// owner dataset must not be scrapeable anonymously, but TestFlight builds <=#8
// don't send tokens on these paths -- so this runs in GRACE MODE by default:
//   - a present-but-invalid token is ALWAYS rejected (never OK),
//   - a missing token passes until products.config.data_auth_required=true.
// Flip the flag once build #9 (which attaches tokens, incl. native tile
// requests via TransformRequestManager) is confirmed on-device. No redeploy
// needed to enforce.

// Tiles arrive dozens-per-second while panning; cache the flag briefly so
// grace-mode checks don't hammer the products table.
let flagCache: { required: boolean; at: number } | null = null;
const FLAG_TTL_MS = 60_000;

async function authRequired(): Promise<boolean> {
    if (!flagCache || Date.now() - flagCache.at > FLAG_TTL_MS) {
        const config = await getProductConfig();
        flagCache = { required: config.data_auth_required === true, at: Date.now() };
    }
    return flagCache.required;
}

/** Returns the userId when authenticated, null when anonymously allowed
 *  (grace mode), or undefined when rejected (a reply has been sent). */
export async function dataAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<number | null | undefined> {
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) {
        try {
            return verifySession(header.slice("Bearer ".length)).userId;
        } catch {
            reply.code(401).send({ error: "Invalid or expired session" });
            return undefined;
        }
    }
    if (await authRequired()) {
        reply.code(401).send({ error: "Missing bearer token" });
        return undefined;
    }
    request.log.debug({ path: request.url }, "data endpoint anonymous (grace mode)");
    return null;
}
