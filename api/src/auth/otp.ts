import { randomInt, createHash } from "node:crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

export function generateOtpCode(): string {
    return String(randomInt(100000, 1000000));
}

export function hashOtpCode(code: string): string {
    return createHash("sha256").update(code).digest("hex");
}
