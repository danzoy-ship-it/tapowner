export interface EmailProvider {
    sendOtpEmail(email: string, code: string): Promise<void>;
    sendEmail(to: string, subject: string, html: string): Promise<void>;
}
