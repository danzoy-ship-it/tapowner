import type { FastifyBaseLogger } from "fastify";
import type { EmailProvider } from "./provider.js";

// Dev-mode fallback so the OTP flow is fully testable before an email vendor
// is configured. Never used when RESEND_API_KEY is set.
export class ConsoleEmailProvider implements EmailProvider {
    constructor(private log: FastifyBaseLogger) {}

    async sendOtpEmail(email: string, code: string): Promise<void> {
        this.log.warn(
            { email, code },
            "No email provider configured (RESEND_API_KEY unset) -- OTP logged instead of sent"
        );
    }

    async sendEmail(to: string, subject: string, html: string): Promise<void> {
        this.log.warn(
            { to, subject, html },
            "No email provider configured (RESEND_API_KEY unset) -- email logged instead of sent"
        );
    }
}
