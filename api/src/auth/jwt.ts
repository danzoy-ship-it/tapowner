import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not set");
}
const JWT_SECRET: string = process.env.JWT_SECRET;

export interface SessionPayload {
    userId: number;
    email: string;
}

export function signSession(payload: SessionPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifySession(token: string): SessionPayload {
    return jwt.verify(token, JWT_SECRET) as SessionPayload;
}
