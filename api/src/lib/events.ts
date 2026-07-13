import { pool } from "../db.js";

/**
 * Append to the events table (build doc §9). Never throws -- metrics must
 * not break the request that generated them.
 */
export async function logEvent(
    userId: string | number | null,
    name: string,
    props: Record<string, unknown> = {}
): Promise<void> {
    try {
        await pool.query(`INSERT INTO events (user_id, name, props) VALUES ($1, $2, $3)`, [
            userId,
            name,
            JSON.stringify(props),
        ]);
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error("logEvent failed", name, err);
    }
}
