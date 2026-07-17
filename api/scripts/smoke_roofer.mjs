#!/usr/bin/env node
// ROOFER (vertical #2) SMOKE TEST -- additive, does NOT touch the V1 smoke.
//
// Proves the roofer signal engine end-to-end against the real DB:
//   1. DARK BY DEFAULT: with the flag OFF, /roofer/* 404s AND V1 /parcels/at
//      still works (proves the routes are additive + inert until enabled).
//   2. ENABLED (ROOFER_ENABLED=true): /roofer/signals/at resolves a known
//      hail-hit parcel (hail.hit=true, size + date populated), a code-violation
//      parcel surfaces its distress signal, and /roofer/signals/within returns
//      leads for a small polygon.
//
// Same boot mechanism + secret handling as scripts/smoke_v1.mjs (boots the
// CURRENT src via tsx on a scratch port against the real Postgres proxy).
// Vendor/mail env is stripped so nothing external is ever called.
//
// USAGE: node scripts/smoke_roofer.mjs   (or: npm run smoke:roofer)
// EXIT: 0 = all green, 1 = any failure.

import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, "..");
const BOOT_TIMEOUT_MS = 25_000;
const TTY = process.stdout.isTTY;
const GREEN = TTY ? "\x1b[32m" : "";
const RED = TTY ? "\x1b[31m" : "";
const RESET = TTY ? "\x1b[0m" : "";

const RAILWAY_KEYS = ["DATABASE_URL", "JWT_SECRET"];

function loadSecrets() {
    try {
        process.loadEnvFile(path.join(API_DIR, ".env"));
    } catch {
        // optional
    }
    const missing = RAILWAY_KEYS.filter((k) => !process.env[k]);
    if (missing.length > 0) {
        const out = execSync("railway variables --service api --kv", {
            cwd: API_DIR,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 15_000,
        });
        for (const line of out.split("\n")) {
            const eq = line.indexOf("=");
            if (eq === -1) continue;
            const key = line.slice(0, eq).trim();
            if (RAILWAY_KEYS.includes(key) && !process.env[key]) {
                process.env[key] = line.slice(eq + 1).trim();
            }
        }
    }
    for (const k of RAILWAY_KEYS) {
        if (!process.env[k]) throw new Error(`${k} not available (api/.env or Railway).`);
    }
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
        "db.railway.internal:5432",
        "tokaido.proxy.rlwy.net:54841"
    );
}

async function api(base, method, urlPath, opts = {}) {
    const headers = {};
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${base}${urlPath}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
        json = text ? JSON.parse(text) : undefined;
    } catch {
        // non-JSON
    }
    return { status: res.status, json, text };
}

async function waitForHealth(base, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${base}/health`);
            if (res.ok) return true;
        } catch {
            // not up yet
        }
        await sleep(250);
    }
    return false;
}

function bootChild(port, extraEnv) {
    const childEnv = {
        ...process.env,
        ...extraEnv,
        PORT: String(port),
        HOST: "127.0.0.1",
        NODE_ENV: "development",
    };
    delete childEnv.TRACE_PROVIDER;
    delete childEnv.BATCHDATA_API_TOKEN;
    delete childEnv.BATCHDATA_SANDBOX_TOKEN;
    delete childEnv.TRACE_PROVIDER_API_KEY;
    delete childEnv.RESEND_API_KEY;
    let buf = "";
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
        cwd: API_DIR,
        env: childEnv,
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (buf += d.toString()));
    child.stderr.on("data", (d) => (buf += d.toString()));
    return { child, tail: () => buf.slice(-3000) };
}

const results = [];
async function step(name, fn) {
    const t0 = Date.now();
    try {
        const detail = await fn();
        results.push({ name, ok: true, detail: detail ?? "", ms: Date.now() - t0 });
    } catch (err) {
        results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Date.now() - t0 });
    }
}
function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function main() {
    loadSecrets();
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

    // Fixtures from the real DB.
    const { rows: hailRows } = await pool.query(`
        SELECT ps.parcel_id AS id,
               ST_Y(ST_PointOnSurface(p.geom)) AS lat, ST_X(ST_PointOnSurface(p.geom)) AS lon
        FROM parcel_signals ps JOIN parcels p ON p.id = ps.parcel_id
        WHERE ps.signal_type = 'roof_damage' AND ps.source = 'hail_spc'
          AND p.is_protected = false
        ORDER BY ps.parcel_id ASC LIMIT 1
    `);
    const hailFix = hailRows[0] ?? null;

    const { rows: cvRows } = await pool.query(`
        SELECT ps.parcel_id AS id
        FROM parcel_signals ps JOIN parcels p ON p.id = ps.parcel_id
        WHERE ps.signal_type = 'code_violation' AND ps.parcel_id IS NOT NULL
        ORDER BY ps.parcel_id ASC LIMIT 1
    `);
    const cvFix = cvRows[0] ?? null;

    const { rows: userRows } = await pool.query(
        `SELECT id, email FROM users WHERE product_id = 'tapowner' ORDER BY id ASC LIMIT 1`
    );
    const user = userRows[0];
    assert(user, "no tapowner user to mint a session for");
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, {
        expiresIn: "1d",
    });

    let offChild = null;
    let onChild = null;
    try {
        // ---- Phase 1: DARK BY DEFAULT (flag off) ----
        const OFF_PORT = 3097;
        const offBase = `http://127.0.0.1:${OFF_PORT}`;
        offChild = bootChild(OFF_PORT, {}); // no ROOFER_ENABLED
        assert(await waitForHealth(offBase, BOOT_TIMEOUT_MS), `off-child didn't boot:\n${offChild.tail()}`);

        await step("Dark by default: /roofer/signals/at -> 404", async () => {
            assert(hailFix, "no hail fixture");
            const r = await api(offBase, "GET", `/roofer/signals/at?parcel_id=${hailFix.id}`, { token });
            assert(r.status === 404, `expected 404 when flag off, got ${r.status}: ${r.text}`);
            return "roofer routes inert until enabled";
        });
        await step("Dark by default: V1 /parcels/at still 200 (additive)", async () => {
            assert(hailFix, "no hail fixture");
            const r = await api(offBase, "GET", `/parcels/at?lat=${hailFix.lat}&lng=${hailFix.lon}`, { token });
            assert(r.status === 200, `expected V1 parcels/at 200, got ${r.status}: ${r.text}`);
            assert(r.json?.owner_name !== undefined, "V1 parcel payload missing");
            return `V1 parcel #${r.json.id} unaffected`;
        });
        offChild.child.kill();
        offChild = null;

        // ---- Phase 2: ENABLED (ROOFER_ENABLED=true) ----
        const ON_PORT = 3098;
        const onBase = `http://127.0.0.1:${ON_PORT}`;
        onChild = bootChild(ON_PORT, { ROOFER_ENABLED: "true" });
        assert(await waitForHealth(onBase, BOOT_TIMEOUT_MS), `on-child didn't boot:\n${onChild.tail()}`);

        await step("Auth: /roofer/signals/at rejects anonymous (401)", async () => {
            const r = await api(onBase, "GET", `/roofer/signals/at?parcel_id=${hailFix?.id ?? 1}`);
            assert(r.status === 401, `expected 401 without token, got ${r.status}`);
            return "reuses V1 requireAuth";
        });

        await step("Hail signal by parcel_id -- GET /roofer/signals/at", async () => {
            assert(hailFix, "no hail-hit parcel found in parcel_signals");
            const r = await api(onBase, "GET", `/roofer/signals/at?parcel_id=${hailFix.id}`, { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(r.json?.signals?.hail?.hit === true, `hail.hit not true: ${JSON.stringify(r.json?.signals?.hail)}`);
            assert(r.json.signals.hail.last_event_date, "no hail last_event_date");
            assert(r.json.signals.roof_age?.source === "unknown", `roof_age should be unknown (vendor-pending), got ${r.json.signals.roof_age?.source}`);
            assert(r.json.signals.signal_types.includes("hail"), "signal_types missing 'hail'");
            return `parcel #${r.json.parcel.id}, hail size=${r.json.signals.hail.max_hail_in}in date=${r.json.signals.hail.last_event_date}, sources=${r.json.signals.hail.sources.join("+")}`;
        });

        await step("Hail signal by lat/lon -- GET /roofer/signals/at", async () => {
            assert(hailFix, "no hail fixture");
            const r = await api(onBase, "GET", `/roofer/signals/at?lat=${hailFix.lat}&lng=${hailFix.lon}`, { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(r.json?.signals?.hail?.hit === true, "hail.hit not true via lat/lon");
            return `resolved parcel #${r.json.parcel.id} at ${Number(hailFix.lat).toFixed(4)},${Number(hailFix.lon).toFixed(4)}`;
        });

        await step("Code-violation distress surfaces -- GET /roofer/signals/at", async () => {
            if (!cvFix) return "SKIP (no code_violation parcel tied)";
            const r = await api(onBase, "GET", `/roofer/signals/at?parcel_id=${cvFix.id}`, { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            const cv = r.json?.signals?.distress?.code_violation ?? [];
            assert(cv.length > 0, `no code_violation in distress: ${JSON.stringify(r.json?.signals?.distress)}`);
            assert(r.json.signals.signal_types.includes("code_violation"), "signal_types missing code_violation");
            return `parcel #${r.json.parcel.id}, ${cv.length} code_violation row(s)`;
        });

        await step("Bounded area leads -- POST /roofer/signals/within", async () => {
            assert(hailFix, "no fixture to center the polygon on");
            const half = 0.01; // ~1.1km box; bounded well under the 25km2 cap
            const lng = Number(hailFix.lon);
            const lat = Number(hailFix.lat);
            const polygon = [
                [lng - half, lat - half],
                [lng + half, lat - half],
                [lng + half, lat + half],
                [lng - half, lat + half],
                [lng - half, lat - half],
            ];
            const r = await api(onBase, "POST", "/roofer/signals/within", { token, body: { polygon } });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(Array.isArray(r.json?.leads), "no leads array");
            assert(r.json.leads.length > 0, "expected at least one lead in a hail-hit block");
            const anyHail = r.json.leads.some((l) => l.signals?.hail?.hit);
            assert(anyHail, "expected at least one hail-hit lead in the polygon");
            return `${r.json.count} leads (capped=${r.json.capped}), hail present`;
        });

        await step("Area signal_types filter -- POST /roofer/signals/within", async () => {
            assert(hailFix, "no fixture");
            const half = 0.01;
            const lng = Number(hailFix.lon);
            const lat = Number(hailFix.lat);
            const polygon = [
                [lng - half, lat - half],
                [lng + half, lat - half],
                [lng + half, lat + half],
                [lng - half, lat + half],
                [lng - half, lat - half],
            ];
            const r = await api(onBase, "POST", "/roofer/signals/within", {
                token,
                body: { polygon, signal_types: ["hail"] },
            });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            const allMatch = r.json.leads.every((l) => (l.signals?.signal_types ?? []).includes("hail"));
            assert(allMatch, "filter leaked non-hail leads");
            return `${r.json.count} hail-filtered leads`;
        });
    } finally {
        if (offChild) offChild.child.kill();
        if (onChild) onChild.child.kill();
        await pool.end().catch(() => {});
    }

    // Report.
    const nameW = Math.max(...results.map((r) => r.name.length), 10);
    const line = "-".repeat(nameW + 20);
    console.log(`\n${line}\nROOFER SMOKE TEST — RESULTS\n${line}`);
    for (const r of results) {
        const badge = r.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
        console.log(`${badge}  ${r.name.padEnd(nameW)}  (${r.ms}ms)`);
        if (r.detail) console.log(`      ${r.ok ? "" : RED + "! " + RESET}${r.detail}`);
    }
    console.log(line);
    const passed = results.filter((r) => r.ok).length;
    console.log(`${passed}/${results.length} checks passed`);
    const anyFail = results.some((r) => !r.ok) || results.length === 0;
    console.log(anyFail ? `\n${RED}OVERALL: FAIL${RESET}` : `\n${GREEN}OVERALL: PASS — roofer engine healthy${RESET}`);
    process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
    console.error(`\n${RED}FATAL:${RESET} ${err.message}`);
    process.exit(1);
});
