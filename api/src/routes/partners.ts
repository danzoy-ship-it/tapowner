import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L -- avoids ambiguity read aloud or printed

function generateCode(length = 8): string {
    const bytes = randomBytes(length);
    let code = "";
    for (let i = 0; i < length; i++) {
        code += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    }
    return code;
}

async function generateUniqueCode(): Promise<string> {
    while (true) {
        const candidate = generateCode();
        const { rows } = await pool.query(`SELECT id FROM partners WHERE code = $1`, [candidate]);
        if (rows.length === 0) return candidate;
    }
}

// v1 has no real admin-role system yet (that's a later phase); a shared
// secret is a reasonable stopgap for the one admin action that needs gating.
function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
    const secret = process.env.ADMIN_SECRET;
    if (!secret) {
        reply.code(503).send({ error: "Admin actions not configured" });
        return false;
    }
    if (request.headers["x-admin-secret"] !== secret) {
        reply.code(401).send({ error: "Unauthorized" });
        return false;
    }
    return true;
}

interface CreatePartnerBody {
    type?: "user_referral" | "founding_agent" | "affiliate";
    email?: string;
    name?: string;
    comp_model?: "recurring" | "flat";
    rate?: number;
    months_cap?: number;
    code?: string;
}

export async function partnersRoutes(app: FastifyInstance) {
    app.post<{ Body: CreatePartnerBody }>("/partners", async (request, reply) => {
        if (!requireAdmin(request, reply)) return;

        const { type, email, name, comp_model, rate, months_cap } = request.body;
        if (!type || !["user_referral", "founding_agent", "affiliate"].includes(type)) {
            return reply.code(400).send({ error: "type must be user_referral, founding_agent, or affiliate" });
        }
        if (!email || !name) {
            return reply.code(400).send({ error: "email and name are required" });
        }

        const { rows: userRows } = await pool.query(
            `INSERT INTO users (product_id, email) VALUES ('tapowner', $1)
             ON CONFLICT (product_id, email) DO UPDATE SET email = EXCLUDED.email
             RETURNING id`,
            [email.trim().toLowerCase()]
        );
        const userId = userRows[0].id;

        let code = request.body.code?.trim().toUpperCase();
        if (code) {
            const { rows: existing } = await pool.query(`SELECT id FROM partners WHERE code = $1`, [code]);
            if (existing.length > 0) {
                return reply.code(409).send({ error: "Code already in use" });
            }
        } else {
            code = await generateUniqueCode();
        }

        const model = comp_model ?? "recurring";
        // A flat-bounty affiliate has no rate/months window (the bounty is
        // config.affiliate_flat_cents); leave both NULL so the record isn't
        // misleading. Recurring affiliates default to 25% / 12 months.
        const isRecurringAffiliate = type === "affiliate" && model !== "flat";
        const defaultRate = isRecurringAffiliate ? 0.25 : null;
        const defaultMonthsCap = isRecurringAffiliate ? 12 : null;
        const finalRate = model === "flat" ? null : (rate ?? defaultRate);
        const finalMonthsCap = model === "flat" ? null : (months_cap ?? defaultMonthsCap);

        const { rows } = await pool.query(
            `INSERT INTO partners (type, user_id, name, code, comp_model, rate, months_cap)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, type, name, code, comp_model, rate, months_cap, status, created_at`,
            [type, userId, name, code, model, finalRate, finalMonthsCap]
        );

        if (type === "founding_agent") {
            await pool.query(`UPDATE users SET lifetime_closer = TRUE WHERE id = $1`, [userId]);
        }

        return reply.send(rows[0]);
    });

    app.get<{ Params: { code: string } }>("/partners/:code", async (request, reply) => {
        const code = request.params.code.trim().toUpperCase();
        const { rows } = await pool.query(
            `SELECT code, type, status FROM partners WHERE code = $1`,
            [code]
        );
        const partner = rows[0];
        if (!partner || partner.status !== "active") {
            return reply.code(404).send({ error: "Invalid or inactive code" });
        }
        return reply.send({ code: partner.code, type: partner.type });
    });

    app.get<{ Params: { code: string } }>("/partners/:code/qr", async (request, reply) => {
        const code = request.params.code.trim().toUpperCase();
        const { rows } = await pool.query(
            `SELECT id FROM partners WHERE code = $1 AND status = 'active'`,
            [code]
        );
        if (rows.length === 0) {
            return reply.code(404).send({ error: "Invalid or inactive code" });
        }
        const webBase = process.env.WEB_BASE_URL ?? "https://tapowner.com";
        const url = `${webBase}/r/${code}`;
        const png = await QRCode.toBuffer(url, { type: "png", width: 512 });
        return reply.header("Content-Type", "image/png").send(png);
    });

    // Partner dashboard data: clicks, signups, trials, paid conversions, earned, paid-out.
    app.get("/partners/me/dashboard", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const { rows: partnerRows } = await pool.query(
            `SELECT id, type, name, code, comp_model, rate, months_cap, status FROM partners WHERE user_id = $1`,
            [session.userId]
        );
        const partner = partnerRows[0];
        if (!partner) {
            return reply.code(404).send({ error: "No partner account for this user" });
        }

        const { rows: clickRows } = await pool.query(
            `SELECT count(*) FROM events WHERE name = 'referral_click' AND props->>'partner_id' = $1`,
            [String(partner.id)]
        );
        const { rows: referralRows } = await pool.query(
            `SELECT count(*) AS signups,
                    count(*) FILTER (WHERE status = 'activated') AS paid_conversions
             FROM referrals WHERE partner_id = $1`,
            [partner.id]
        );
        const { rows: ledgerRows } = await pool.query(
            `SELECT
                 COALESCE(sum(amount_cents), 0) AS earned_cents,
                 COALESCE(sum(amount_cents) FILTER (WHERE paid_out_at IS NOT NULL), 0) AS paid_out_cents
             FROM commission_ledger WHERE partner_id = $1`,
            [partner.id]
        );

        return reply.send({
            partner: {
                type: partner.type,
                name: partner.name,
                code: partner.code,
                comp_model: partner.comp_model,
                rate: partner.rate,
                months_cap: partner.months_cap,
                status: partner.status,
            },
            clicks: Number(clickRows[0].count),
            signups: Number(referralRows[0].signups),
            paid_conversions: Number(referralRows[0].paid_conversions),
            earned_cents: Number(ledgerRows[0].earned_cents),
            paid_out_cents: Number(ledgerRows[0].paid_out_cents),
        });
    });

    // ---------- Admin manager (Frederick's console; x-admin-secret gated) ----------

    // Every partner with rolled-up program stats + what's currently owed
    // (unpaid ledger net, clawbacks included since they're negative rows).
    app.get("/admin/partners", async (request, reply) => {
        if (!requireAdmin(request, reply)) return;

        const { rows } = await pool.query(
            `SELECT
                 p.id, p.type, p.name, p.code, p.comp_model, p.rate, p.months_cap,
                 p.status, p.created_at,
                 u.email AS email,
                 COALESCE(c.clicks, 0)                                   AS clicks,
                 COALESCE(r.signups, 0)                                  AS signups,
                 COALESCE(r.paid_conversions, 0)                         AS paid_conversions,
                 COALESCE(l.earned_cents, 0)                             AS earned_cents,
                 COALESCE(l.paid_out_cents, 0)                           AS paid_out_cents,
                 COALESCE(l.owed_cents, 0)                               AS owed_cents
             FROM partners p
             LEFT JOIN users u ON u.id = p.user_id
             LEFT JOIN (
                 SELECT props->>'partner_id' AS pid, count(*) AS clicks
                 FROM events WHERE name = 'referral_click' GROUP BY 1
             ) c ON c.pid = p.id::text
             LEFT JOIN (
                 SELECT partner_id,
                        count(*)                                  AS signups,
                        count(*) FILTER (WHERE status = 'activated') AS paid_conversions
                 FROM referrals GROUP BY partner_id
             ) r ON r.partner_id = p.id
             LEFT JOIN (
                 SELECT partner_id,
                        COALESCE(sum(amount_cents), 0)                                   AS earned_cents,
                        COALESCE(sum(amount_cents) FILTER (WHERE paid_out_at IS NOT NULL), 0) AS paid_out_cents,
                        COALESCE(sum(amount_cents) FILTER (WHERE paid_out_at IS NULL), 0)     AS owed_cents
                 FROM commission_ledger GROUP BY partner_id
             ) l ON l.partner_id = p.id
             ORDER BY owed_cents DESC, p.created_at DESC`
        );

        // payout_threshold_cents lives in product config; surface it so the UI
        // can flag who's over the bar without hardcoding the number.
        const { rows: cfgRows } = await pool.query(
            `SELECT (config->>'payout_threshold_cents')::int AS threshold
             FROM products WHERE id = 'tapowner'`
        );

        return reply.send({
            payout_threshold_cents: cfgRows[0]?.threshold ?? 5000,
            partners: rows,
        });
    });

    // Record a manual payout: mark every currently-unpaid ledger row for this
    // partner as paid out now. Returns the net amount just settled. Idempotent
    // in effect — a second call finds nothing unpaid and settles $0.
    app.post<{ Params: { id: string } }>("/admin/partners/:id/payout", async (request, reply) => {
        if (!requireAdmin(request, reply)) return;

        const partnerId = Number(request.params.id);
        if (!Number.isInteger(partnerId)) {
            return reply.code(400).send({ error: "Invalid partner id" });
        }

        const { rows: partnerRows } = await pool.query(
            `SELECT id FROM partners WHERE id = $1`,
            [partnerId]
        );
        if (partnerRows.length === 0) {
            return reply.code(404).send({ error: "Partner not found" });
        }

        const { rows } = await pool.query(
            `UPDATE commission_ledger
                SET paid_out_at = now()
              WHERE partner_id = $1 AND paid_out_at IS NULL
              RETURNING amount_cents`,
            [partnerId]
        );
        const paidCents = rows.reduce((sum, r) => sum + Number(r.amount_cents), 0);

        return reply.send({ ok: true, entries_settled: rows.length, paid_cents: paidCents });
    });

    // Revoke or reactivate a partner code (kills/restores attribution + links).
    app.post<{ Params: { id: string }; Body: { status?: string } }>(
        "/admin/partners/:id/status",
        async (request, reply) => {
            if (!requireAdmin(request, reply)) return;

            const partnerId = Number(request.params.id);
            const status = request.body.status;
            if (!Number.isInteger(partnerId)) {
                return reply.code(400).send({ error: "Invalid partner id" });
            }
            if (status !== "active" && status !== "revoked") {
                return reply.code(400).send({ error: "status must be active or revoked" });
            }

            const { rows } = await pool.query(
                `UPDATE partners SET status = $1 WHERE id = $2 RETURNING id, status`,
                [status, partnerId]
            );
            if (rows.length === 0) {
                return reply.code(404).send({ error: "Partner not found" });
            }
            return reply.send(rows[0]);
        }
    );

    app.post<{ Body: { code: string } }>("/referrals/click", async (request, reply) => {
        const code = request.body.code?.trim().toUpperCase();
        if (!code) return reply.code(400).send({ error: "code is required" });

        const { rows } = await pool.query(
            `SELECT id FROM partners WHERE code = $1 AND status = 'active'`,
            [code]
        );
        const partner = rows[0];
        if (!partner) {
            return reply.code(404).send({ error: "Invalid or inactive code" });
        }

        await pool.query(
            `INSERT INTO events (name, props) VALUES ('referral_click', $1)`,
            [JSON.stringify({ partner_id: String(partner.id), code })]
        );

        return reply.send({ ok: true });
    });
}
