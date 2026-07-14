import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { requireAuth } from "../auth/middleware.js";
import { requireFeature } from "../lib/entitlements.js";
import { formatSitusAddress } from "../lib/address.js";
import { csvCell } from "../lib/csv.js";

const STATUSES = ["new", "contacted", "follow_up", "appointment", "listed", "dead"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_LABELS: Record<string, string> = {
    new: "New",
    contacted: "Contacted",
    follow_up: "Follow-up",
    appointment: "Appointment",
    listed: "Listed",
    dead: "Dead",
};

const PARCEL_FIELDS = `
    p.owner_name, p.situs_address, p.situs_number, p.situs_street,
    p.situs_city, p.situs_state, p.situs_zip,
    p.is_absentee, p.is_protected
`;

async function loadOwnedSavedProperty(userId: string | number, savedPropertyId: number) {
    const { rows } = await pool.query(`SELECT * FROM saved_properties WHERE id = $1 AND user_id = $2`, [
        savedPropertyId,
        userId,
    ]);
    return rows[0];
}

export async function savedPropertiesRoutes(app: FastifyInstance) {
    app.post<{ Body: { parcel_id?: number; note?: string } }>("/saved-properties", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;
        if (!(await requireFeature(session.userId, "crm", reply))) return;

        const parcelId = Number(request.body.parcel_id);
        if (!Number.isInteger(parcelId)) {
            return reply.code(400).send({ error: "parcel_id is required" });
        }

        const { rows: traceRows } = await pool.query(
            `SELECT 1 FROM user_traces WHERE user_id = $1 AND parcel_id = $2`,
            [session.userId, parcelId]
        );
        if (traceRows.length === 0) {
            return reply.code(403).send({ error: "Trace this property before saving it" });
        }

        const { rows } = await pool.query(
            `INSERT INTO saved_properties (user_id, parcel_id)
             VALUES ($1, $2)
             ON CONFLICT (user_id, parcel_id) DO UPDATE SET status = saved_properties.status
             RETURNING id, parcel_id, status, created_at`,
            [session.userId, parcelId]
        );
        const savedProperty = rows[0];

        const note = request.body.note?.trim();
        if (note) {
            await pool.query(`INSERT INTO notes (saved_property_id, body) VALUES ($1, $2)`, [
                savedProperty.id,
                note,
            ]);
        }

        return reply.send(savedProperty);
    });

    // Reading your own saved data is free even without an active plan (a lapsed
    // Closer keeps read-only access to their pipeline as a reactivation hook);
    // only writes below require the crm feature.
    app.get<{ Querystring: { status?: string } }>("/saved-properties", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const status = request.query.status;
        if (status && !STATUSES.includes(status as Status)) {
            return reply.code(400).send({ error: "Invalid status filter" });
        }

        const { rows } = await pool.query(
            `SELECT sp.id, sp.parcel_id, sp.status, sp.created_at, ${PARCEL_FIELDS},
                    (SELECT count(*) FROM notes n WHERE n.saved_property_id = sp.id) AS note_count,
                    (SELECT body FROM notes n WHERE n.saved_property_id = sp.id ORDER BY created_at DESC LIMIT 1) AS latest_note
             FROM saved_properties sp
             JOIN parcels p ON p.id = sp.parcel_id
             WHERE sp.user_id = $1 AND ($2::text IS NULL OR sp.status = $2)
             ORDER BY sp.created_at DESC`,
            [session.userId, status ?? null]
        );

        for (const row of rows) row.situs_address = formatSitusAddress(row);
        return reply.send(rows);
    });

    app.get<{ Params: { id: string } }>("/saved-properties/:id", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const savedPropertyId = Number(request.params.id);
        const savedProperty = await loadOwnedSavedProperty(session.userId, savedPropertyId);
        if (!savedProperty) {
            return reply.code(404).send({ error: "Not found" });
        }

        const { rows: parcelRows } = await pool.query(
            `SELECT ${PARCEL_FIELDS} FROM parcels p WHERE p.id = $1`,
            [savedProperty.parcel_id]
        );
        const { rows: notes } = await pool.query(
            `SELECT id, body, created_at FROM notes WHERE saved_property_id = $1 ORDER BY created_at DESC`,
            [savedPropertyId]
        );

        const merged = { ...savedProperty, ...parcelRows[0], notes };
        merged.situs_address = formatSitusAddress(merged);
        return reply.send(merged);
    });

    // CSV export of the whole pipeline. Auth only (no crm-feature gate) so a
    // read-only / lapsed user can always take their data -- including the
    // contacts they already paid to trace -- with them.
    app.get("/saved-properties/export", async (request, reply) => {
        const session = await requireAuth(request, reply);
        if (!session) return;

        const { rows } = await pool.query(
            `SELECT sp.status, sp.created_at AS saved_at,
                    p.owner_name, p.situs_address, p.situs_number, p.situs_street,
                    p.situs_city, p.situs_state, p.situs_zip, p.mailing_address,
                    tr.payload AS trace_payload,
                    (SELECT string_agg(n.body, ' | ' ORDER BY n.created_at)
                       FROM notes n WHERE n.saved_property_id = sp.id) AS notes
             FROM saved_properties sp
             JOIN parcels p ON p.id = sp.parcel_id
             LEFT JOIN user_traces ut ON ut.user_id = sp.user_id AND ut.parcel_id = sp.parcel_id
             LEFT JOIN trace_results tr ON tr.id = ut.trace_result_id
             WHERE sp.user_id = $1
             ORDER BY sp.created_at DESC`,
            [session.userId]
        );

        const header = [
            "Owner", "Address", "City", "State", "ZIP", "Mailing Address",
            "Status", "Phones", "Emails", "Notes", "Saved",
        ];
        const lines = [header.map(csvCell).join(",")];
        for (const r of rows) {
            const payload = (r.trace_payload ?? {}) as {
                phones?: Array<{ number?: string }>;
                emails?: Array<{ email?: string }>;
            };
            const phones = (payload.phones ?? []).map((p) => p.number).filter(Boolean).join("; ");
            const emails = (payload.emails ?? []).map((e) => e.email).filter(Boolean).join("; ");
            lines.push(
                [
                    r.owner_name ?? "",
                    formatSitusAddress(r) ?? "",
                    r.situs_city ?? "",
                    r.situs_state ?? "",
                    r.situs_zip ?? "",
                    r.mailing_address ?? "",
                    STATUS_LABELS[r.status] ?? r.status ?? "",
                    phones,
                    emails,
                    r.notes ?? "",
                    r.saved_at ? new Date(r.saved_at).toISOString().slice(0, 10) : "",
                ]
                    .map(csvCell)
                    .join(",")
            );
        }

        return reply
            .header("Content-Type", "text/csv; charset=utf-8")
            .header("Content-Disposition", 'attachment; filename="tapowner-crm.csv"')
            .send(lines.join("\r\n"));
    });

    app.patch<{ Params: { id: string }; Body: { status?: string } }>(
        "/saved-properties/:id",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;
            if (!(await requireFeature(session.userId, "crm", reply))) return;

            const savedPropertyId = Number(request.params.id);
            const status = request.body.status;
            if (!status || !STATUSES.includes(status as Status)) {
                return reply.code(400).send({ error: "Invalid status" });
            }

            const savedProperty = await loadOwnedSavedProperty(session.userId, savedPropertyId);
            if (!savedProperty) {
                return reply.code(404).send({ error: "Not found" });
            }

            const { rows } = await pool.query(
                `UPDATE saved_properties SET status = $2 WHERE id = $1 RETURNING id, parcel_id, status, created_at`,
                [savedPropertyId, status]
            );

            return reply.send(rows[0]);
        }
    );

    app.post<{ Params: { id: string }; Body: { body?: string } }>(
        "/saved-properties/:id/notes",
        async (request, reply) => {
            const session = await requireAuth(request, reply);
            if (!session) return;
            if (!(await requireFeature(session.userId, "crm", reply))) return;

            const savedPropertyId = Number(request.params.id);
            const body = request.body.body?.trim();
            if (!body) {
                return reply.code(400).send({ error: "Note body is required" });
            }

            const savedProperty = await loadOwnedSavedProperty(session.userId, savedPropertyId);
            if (!savedProperty) {
                return reply.code(404).send({ error: "Not found" });
            }

            const { rows } = await pool.query(
                `INSERT INTO notes (saved_property_id, body) VALUES ($1, $2) RETURNING id, body, created_at`,
                [savedPropertyId, body]
            );

            return reply.send(rows[0]);
        }
    );
}
