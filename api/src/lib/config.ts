import { pool } from "../db.js";

export async function getProductConfig(): Promise<Record<string, any>> {
    const { rows } = await pool.query(`SELECT config FROM products WHERE id = 'tapowner'`);
    return rows[0]?.config ?? {};
}
