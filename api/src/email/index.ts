import type { FastifyBaseLogger } from "fastify";
import type { EmailProvider } from "./provider.js";
import { ConsoleEmailProvider } from "./console.js";
import { ResendEmailProvider } from "./resend.js";

export type { EmailProvider } from "./provider.js";

export function createEmailProvider(log: FastifyBaseLogger): EmailProvider {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
        return new ResendEmailProvider(apiKey);
    }
    return new ConsoleEmailProvider(log);
}
