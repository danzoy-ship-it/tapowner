import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { createEmailProvider } from "../email/index.js";
import { generateOtpCode, hashOtpCode, OTP_MAX_ATTEMPTS, OTP_TTL_MINUTES } from "../auth/otp.js";
import { signSession } from "../auth/jwt.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function authRoutes(app: FastifyInstance) {
    const emailProvider = createEmailProvider(app.log);

    app.post<{ Body: { email?: string } }>("/auth/otp/request", async (request, reply) => {
        const email = request.body.email?.trim().toLowerCase();
        if (!email || !EMAIL_RE.test(email)) {
            return reply.code(400).send({ error: "A valid email is required" });
        }

        const code = generateOtpCode();
        const codeHash = hashOtpCode(code);
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

        await pool.query(
            `INSERT INTO otp_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
            [email, codeHash, expiresAt]
        );

        await emailProvider.sendOtpEmail(email, code);

        return reply.send({ message: "Code sent" });
    });

    app.post<{ Body: { email?: string; code?: string } }>(
        "/auth/otp/verify",
        async (request, reply) => {
            const email = request.body.email?.trim().toLowerCase();
            const code = request.body.code?.trim();
            if (!email || !code) {
                return reply.code(400).send({ error: "email and code are required" });
            }

            const { rows } = await pool.query(
                `SELECT id, code_hash, attempts FROM otp_codes
                 WHERE email = $1 AND consumed_at IS NULL AND expires_at > now()
                 ORDER BY created_at DESC LIMIT 1`,
                [email]
            );
            const otpRow = rows[0];

            if (!otpRow || otpRow.attempts >= OTP_MAX_ATTEMPTS) {
                return reply.code(401).send({ error: "Invalid or expired code" });
            }

            const codeHash = hashOtpCode(code);
            if (codeHash !== otpRow.code_hash) {
                await pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`, [
                    otpRow.id,
                ]);
                return reply.code(401).send({ error: "Invalid or expired code" });
            }

            await pool.query(`UPDATE otp_codes SET consumed_at = now() WHERE id = $1`, [
                otpRow.id,
            ]);

            const { rows: userRows } = await pool.query(
                `INSERT INTO users (product_id, email) VALUES ('tapowner', $1)
                 ON CONFLICT (product_id, email) DO UPDATE SET email = EXCLUDED.email
                 RETURNING id, email`,
                [email]
            );
            const user = userRows[0];

            const token = signSession({ userId: user.id, email: user.email });

            return reply.send({ token, user: { id: user.id, email: user.email } });
        }
    );
}
