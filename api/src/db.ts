import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
});

// An idle client emitting 'error' (Railway DB restart, network drop) is an
// unhandled 'error' event that crashes the whole process by default. Log and
// let pg discard the dead client instead.
pool.on("error", (err) => {
    console.error("Unexpected idle-client error on pg pool:", err.message);
});
