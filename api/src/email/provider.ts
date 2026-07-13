export interface EmailProvider {
    sendOtpEmail(email: string, code: string): Promise<void>;
}
