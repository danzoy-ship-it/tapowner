import { Resend } from "resend";
import type { EmailProvider } from "./provider.js";

// TODO: switch `from` to a verified tapowner.com address once DNS is live
// (Frederick's action item #1). Resend's shared sandbox domain works for
// testing without domain verification.
const FROM_ADDRESS = process.env.OTP_FROM_ADDRESS ?? "TapOwner <onboarding@resend.dev>";

export class ResendEmailProvider implements EmailProvider {
    private resend: Resend;

    constructor(apiKey: string) {
        this.resend = new Resend(apiKey);
    }

    async sendOtpEmail(email: string, code: string): Promise<void> {
        const { error } = await this.resend.emails.send({
            from: FROM_ADDRESS,
            to: email,
            subject: `Your TapOwner code: ${code}`,
            html: `<p>Your TapOwner verification code is <strong>${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
        });
        if (error) {
            throw new Error(`Resend send failed: ${error.message}`);
        }
    }
}
