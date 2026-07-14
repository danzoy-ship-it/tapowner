import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { getProductConfig } from "../lib/config.js";
import { requireFeature } from "../lib/entitlements.js";
import { formatSitusAddress } from "../lib/address.js";
import {
    DRAFT_TEMPLATES,
    DRAFT_TONES,
    buildDraftPrompt,
    buildFarmDraftPrompt,
    type DraftTone,
} from "../draft/templates.js";

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

interface AnthropicResponse {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
}

interface ParcelRow {
    owner_name: string | null;
    situs_address: string | null;
    year_built: number | null;
    living_area_sqft: string | null;
    bedrooms: number | null;
    baths_full: number | null;
    baths_half: number | null;
    lot_size_sqft: string | null;
    has_pool: boolean | null;
    last_sale_price: string | null;
    last_sale_date: string | null;
}

function formatPropertyDetails(parcel: ParcelRow): string[] {
    const details: string[] = [];
    if (parcel.year_built) details.push(`built ${parcel.year_built}`);
    if (parcel.living_area_sqft) details.push(`${Math.round(Number(parcel.living_area_sqft)).toLocaleString()} sqft`);
    if (parcel.bedrooms) details.push(`${parcel.bedrooms} bed`);
    const baths = (Number(parcel.baths_full) || 0) + (Number(parcel.baths_half) || 0) * 0.5;
    if (baths > 0) details.push(`${baths} bath`);
    if (parcel.lot_size_sqft) details.push(`${Math.round(Number(parcel.lot_size_sqft)).toLocaleString()} sqft lot`);
    if (parcel.has_pool) details.push("has a pool");
    if (parcel.last_sale_price && parcel.last_sale_date) {
        const price = Number(parcel.last_sale_price).toLocaleString();
        const date = new Date(parcel.last_sale_date).toLocaleDateString();
        details.push(`last sold $${price} on ${date}`);
    }
    return details;
}

export async function draftRoutes(app: FastifyInstance) {
    app.post<{ Body: { parcel_id?: number; template_id?: string; tone?: string } }>(
        "/draft",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;

            const parcelId = Number(request.body.parcel_id);
            const tone = (request.body.tone ?? "professional") as DraftTone;

            if (!Number.isInteger(parcelId)) {
                return reply.code(400).send({ error: "parcel_id is required" });
            }
            const template = DRAFT_TEMPLATES.find((t) => t.id === request.body.template_id);
            if (!template) {
                return reply.code(400).send({ error: "Invalid template_id" });
            }
            if (!DRAFT_TONES.includes(tone)) {
                return reply.code(400).send({ error: "Invalid tone" });
            }

            if (!(await requireFeature(session.userId, "draft_email", reply))) return;

            const { rows: traceRows } = await pool.query(
                `SELECT 1 FROM user_traces WHERE user_id = $1 AND parcel_id = $2`,
                [session.userId, parcelId]
            );
            if (traceRows.length === 0) {
                return reply.code(403).send({ error: "Trace this property before drafting an email" });
            }

            const { rows: userRows } = await pool.query(`SELECT agent_profile FROM users WHERE id = $1`, [
                session.userId,
            ]);
            const agentProfile = userRows[0]?.agent_profile ?? {};
            const agentName = typeof agentProfile.name === "string" ? agentProfile.name.trim() : "";
            if (!agentName) {
                return reply.code(400).send({ error: "Complete your agent profile in Settings first" });
            }
            const agentBrokerage = typeof agentProfile.brokerage === "string" ? agentProfile.brokerage : null;
            const agentPhone = typeof agentProfile.phone === "string" ? agentProfile.phone : null;

            const config = await getProductConfig();
            const dailyLimit = config.draft_rate_limit_per_day ?? 30;
            const { rows: countRows } = await pool.query(
                `SELECT count(*) FROM events
                 WHERE user_id = $1 AND name = 'draft_created' AND created_at > now() - interval '1 day'`,
                [session.userId]
            );
            if (Number(countRows[0].count) >= dailyLimit) {
                return reply.code(429).send({ error: "Daily draft limit reached, try again tomorrow" });
            }

            const { rows: parcelRows } = await pool.query(
                `SELECT owner_name, situs_address, year_built, living_area_sqft, bedrooms, baths_full, baths_half,
                        lot_size_sqft, has_pool, last_sale_price, last_sale_date
                 FROM parcels WHERE id = $1`,
                [parcelId]
            );
            const parcel: ParcelRow | undefined = parcelRows[0];
            if (!parcel) {
                return reply.code(404).send({ error: "Parcel not found" });
            }

            const apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                return reply.code(503).send({ error: "AI drafting not configured yet" });
            }

            const prompt = buildDraftPrompt({
                template,
                tone,
                agentName,
                agentBrokerage,
                agentPhone,
                ownerName: parcel.owner_name,
                situsAddress: formatSitusAddress(parcel),
                propertyDetails: formatPropertyDetails(parcel),
            });

            const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    model: ANTHROPIC_MODEL,
                    max_tokens: 600,
                    temperature: 0.7,
                    messages: [{ role: "user", content: prompt }],
                }),
            });

            if (!anthropicRes.ok) {
                const errBody = await anthropicRes.text();
                app.log.error({ status: anthropicRes.status, errBody }, "Anthropic draft call failed");
                return reply.code(502).send({ error: "Draft generation failed, try again" });
            }

            const data = (await anthropicRes.json()) as AnthropicResponse;
            const rawText = data.content?.find((c) => c.type === "text")?.text ?? "";
            const text = rawText
                .trim()
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/```\s*$/, "")
                .trim();

            let subject = "";
            let body = "";
            try {
                const parsed = JSON.parse(text);
                subject = String(parsed.subject ?? "").trim();
                body = String(parsed.body ?? "").trim();
            } catch (err) {
                app.log.error({ rawText, text, err: err instanceof Error ? err.message : err }, "draft JSON parse failed");
                subject = template.label;
                body = text.trim();
            }
            if (!subject || !body) {
                return reply.code(502).send({ error: "Draft generation failed, try again" });
            }

            const signatureLines = [agentName, agentBrokerage, agentPhone].filter((line): line is string => Boolean(line));
            body = `${body}\n\n${signatureLines.join("\n")}`;

            const inputTokens = data.usage?.input_tokens ?? 0;
            const outputTokens = data.usage?.output_tokens ?? 0;
            const inputPrice = config.draft_input_price_per_mtok ?? 1.0;
            const outputPrice = config.draft_output_price_per_mtok ?? 5.0;
            const costUsd = (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;

            await pool.query(`INSERT INTO events (user_id, name, props) VALUES ($1, 'draft_created', $2)`, [
                session.userId,
                JSON.stringify({
                    parcel_id: parcelId,
                    template_id: template.id,
                    tone,
                    input_tokens: inputTokens,
                    output_tokens: outputTokens,
                    cost_usd: Number(costUsd.toFixed(6)),
                }),
            ]);

            app.log.info(
                { userId: session.userId, parcelId, templateId: template.id, costUsd },
                "draft generated"
            );

            return reply.send({ subject, body });
        }
    );

    // Reverse-prospecting letter: ONE letter for every home matching the farm
    // criteria in a drawn area. No parcel/trace requirement -- the letter is
    // generic-by-design (goes to a list via mail merge). Shares the daily
    // draft rate limit and the draft_email feature gate.
    app.post<{
        Body: {
            tone?: string;
            template_id?: string;
            criteria?: {
                min_sqft?: number;
                min_beds?: number;
                min_baths?: number;
                pool?: boolean;
                single_story?: boolean;
            };
        };
    }>("/draft/farm", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const tone = (request.body.tone ?? "professional") as DraftTone;
        if (!DRAFT_TONES.includes(tone)) {
            return reply.code(400).send({ error: "Invalid tone" });
        }
        // Any standard template works on a farm list; the reverse-prospect
        // letter is just buyer_neighborhood_match (the default).
        const template =
            DRAFT_TEMPLATES.find((t) => t.id === (request.body.template_id ?? "buyer_neighborhood_match"));
        if (!template) {
            return reply.code(400).send({ error: "Invalid template_id" });
        }
        const c = request.body.criteria ?? {};
        const criteria = {
            min_sqft: Number.isFinite(Number(c.min_sqft)) && Number(c.min_sqft) > 0 ? Math.floor(Number(c.min_sqft)) : undefined,
            min_beds: Number.isInteger(c.min_beds) && (c.min_beds as number) > 0 ? (c.min_beds as number) : undefined,
            min_baths: Number.isInteger(c.min_baths) && (c.min_baths as number) > 0 ? (c.min_baths as number) : undefined,
            pool: c.pool === true ? true : undefined,
            single_story: c.single_story === true ? true : undefined,
        };

        if (!(await requireFeature(session.userId, "draft_email", reply))) return;

        const { rows: userRows } = await pool.query(`SELECT agent_profile FROM users WHERE id = $1`, [
            session.userId,
        ]);
        const agentProfile = userRows[0]?.agent_profile ?? {};
        const agentName = typeof agentProfile.name === "string" ? agentProfile.name.trim() : "";
        if (!agentName) {
            return reply.code(400).send({ error: "Complete your agent profile in Settings first" });
        }
        const agentBrokerage = typeof agentProfile.brokerage === "string" ? agentProfile.brokerage : null;
        const agentPhone = typeof agentProfile.phone === "string" ? agentProfile.phone : null;

        const config = await getProductConfig();
        const dailyLimit = config.draft_rate_limit_per_day ?? 30;
        const { rows: countRows } = await pool.query(
            `SELECT count(*) FROM events
             WHERE user_id = $1 AND name = 'draft_created' AND created_at > now() - interval '1 day'`,
            [session.userId]
        );
        if (Number(countRows[0].count) >= dailyLimit) {
            return reply.code(429).send({ error: "Daily draft limit reached, try again tomorrow" });
        }

        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return reply.code(503).send({ error: "AI drafting not configured yet" });
        }

        const prompt = buildFarmDraftPrompt({ template, tone, agentName, agentBrokerage, agentPhone, criteria });

        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 600,
                temperature: 0.7,
                messages: [{ role: "user", content: prompt }],
            }),
        });
        if (!anthropicRes.ok) {
            const errBody = await anthropicRes.text();
            app.log.error({ status: anthropicRes.status, errBody }, "Anthropic farm draft failed");
            return reply.code(502).send({ error: "Draft generation failed, try again" });
        }

        const data = (await anthropicRes.json()) as AnthropicResponse;
        const rawText = data.content?.find((cc) => cc.type === "text")?.text ?? "";
        const text = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();

        let subject = "";
        let body = "";
        try {
            const parsed = JSON.parse(text);
            subject = String(parsed.subject ?? "").trim();
            body = String(parsed.body ?? "").trim();
        } catch {
            subject = template.label;
            body = text.trim();
        }
        if (!subject || !body) {
            return reply.code(502).send({ error: "Draft generation failed, try again" });
        }

        const signatureLines = [agentName, agentBrokerage, agentPhone].filter((l): l is string => Boolean(l));
        body = `${body}\n\n${signatureLines.join("\n")}`;

        await pool.query(`INSERT INTO events (user_id, name, props) VALUES ($1, 'draft_created', $2)`, [
            session.userId,
            JSON.stringify({
                farm: true,
                template_id: template.id,
                tone,
                criteria,
                input_tokens: data.usage?.input_tokens ?? 0,
                output_tokens: data.usage?.output_tokens ?? 0,
            }),
        ]);

        return reply.send({ subject, body });
    });
}
