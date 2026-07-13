import type { FastifyBaseLogger } from "fastify";
import { pool } from "../db.js";
import { getProductConfig } from "../lib/config.js";
import type { EmailProvider } from "../email/index.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Day-27 trial reminder (build doc Phase 9). Email half only -- the push half
// needs expo-notifications (a native module) + an APNs key, deferred until the
// next scheduled EAS build. Dedupe via a trial_reminder_sent event keyed to the
// subscription, so a 6-hourly sweep can never double-send.
export async function runTrialReminderSweep(
    emailProvider: EmailProvider,
    log: FastifyBaseLogger
): Promise<void> {
    const config = await getProductConfig();
    const daysBefore = config.trial_reminder_days_before ?? 3;

    const { rows } = await pool.query(
        `SELECT s.id AS subscription_id, s.user_id, s.trial_ends_at, u.email
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE s.status = 'trialing'
           AND s.trial_ends_at IS NOT NULL
           AND s.trial_ends_at > now()
           AND s.trial_ends_at <= now() + ($1 || ' days')::interval
           AND NOT EXISTS (
               SELECT 1 FROM events e
               WHERE e.user_id = s.user_id
                 AND e.name = 'trial_reminder_sent'
                 AND e.props->>'subscription_id' = s.id::text
           )`,
        [String(daysBefore)]
    );

    for (const row of rows) {
        const endsAt = new Date(row.trial_ends_at).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
        });
        try {
            await emailProvider.sendEmail(
                row.email,
                "Your TapOwner trial ends soon",
                `<p>Your TapOwner trial ends on <strong>${endsAt}</strong>.</p>
                 <p>After that, your plan continues automatically on the card you signed up with.
                 To review or change your plan, visit tapowner.com.</p>`
            );
            await pool.query(
                `INSERT INTO events (user_id, name, props) VALUES ($1, 'trial_reminder_sent', $2)`,
                [row.user_id, JSON.stringify({ subscription_id: String(row.subscription_id) })]
            );
            log.info({ userId: row.user_id }, "trial reminder sent");
        } catch (err) {
            log.error({ userId: row.user_id, err }, "trial reminder failed");
        }
    }
}

export function startTrialReminderJob(emailProvider: EmailProvider, log: FastifyBaseLogger): void {
    const tick = () =>
        runTrialReminderSweep(emailProvider, log).catch((err) =>
            log.error({ err }, "trial reminder sweep crashed")
        );
    setTimeout(tick, 30_000);
    setInterval(tick, CHECK_INTERVAL_MS);
}
