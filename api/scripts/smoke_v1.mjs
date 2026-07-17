#!/usr/bin/env node
// V1 CORE-LOOP SMOKE TEST — answers "did we break V1?" in one command.
//
// Covers: map tap -> owner of record (FREE) -> $0.29 trace unlock -> AI draft
// -> mini-CRM (saved properties/pipeline) -> farm mode (draw area -> owners),
// plus supporting infra: health, config, auth, geocode, tiles, and that every
// core route is actually registered (401-without-auth proves it's alive).
//
// HOW IT RUNS: boots the CURRENT api/src (via `tsx`, same engine as `npm run
// dev`) as a child process on a scratch port, pointed at the real Postgres
// (there is only one DB in this project -- see HANDOFF.md -- so this is the
// same DB `npm run dev` would use). Secrets come from api/.env (Stripe test
// keys) plus a one-time `railway variables --service api --kv` pull for
// anything still missing (DATABASE_URL, JWT_SECRET, etc.) -- never printed.
//
// SAFETY:
//  - TRACE_PROVIDER / BATCHDATA_API_TOKEN / BATCHDATA_SANDBOX_TOKEN /
//    TRACE_PROVIDER_API_KEY are deliberately stripped from the child's env,
//    so the real skip-trace vendor can NEVER be called from this script --
//    the trace-unlock check seeds its own trace_results cache row instead.
//    If that cache-seed ever has a bug, the failure mode is a clean 503
//    ("Trace provider not configured"), never a real vendor charge.
//  - The trace-unlock check only ever exercises the *included-trace* billing
//    path (never metered/Stripe) -- verified by asserting charged_via =
//    'included' in the DB afterward. Stripe's actual network is never called.
//  - RESEND_API_KEY is stripped too, so email falls back to the console
//    provider (api/src/email/console.ts) -- no real mail is ever sent.
//  - All business-logic checks run as a dedicated fixture user
//    (v1-smoke-test@tapowner.com), reset to a known-good state at the start
//    of every run (idempotent) and swept of its transactional rows
//    (traces/saved-properties/notes/events) at the end. The user+subscription
//    row itself persists as a reusable fixture, same pattern as the existing
//    user 5 / user 18 fixtures documented in HANDOFF.md.
//
// USAGE: npm run smoke   (from api/), or: node scripts/smoke_v1.mjs
// EXIT CODE: 0 = all green, 1 = any failure (or a fatal boot/setup error).

import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Pool } from "pg";
import jwt from "jsonwebtoken";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, "..");

const PORT = Number(process.env.SMOKE_PORT ?? 3099);
const BASE = `http://127.0.0.1:${PORT}`;
const BOOT_TIMEOUT_MS = 25_000;
const TEST_EMAIL = "v1-smoke-test@tapowner.com";
const TTY = process.stdout.isTTY;
const GREEN = TTY ? "\x1b[32m" : "";
const RED = TTY ? "\x1b[31m" : "";
const DIM = TTY ? "\x1b[2m" : "";
const RESET = TTY ? "\x1b[0m" : "";

// ---------------------------------------------------------------------------
// 1. Secrets: api/.env first, then fill gaps from Railway (one call, values
//    captured into env vars only -- never echoed to stdout).
// ---------------------------------------------------------------------------
const RAILWAY_KEYS = [
    "DATABASE_URL", "JWT_SECRET", "STRIPE_SECRET_KEY", "ANTHROPIC_API_KEY",
    "GOOGLE_PLACES_API_KEY", "DEMO_EMAIL", "DEMO_OTP_CODE",
];

function loadLocalEnvFile() {
    try {
        process.loadEnvFile(path.join(API_DIR, ".env"));
    } catch {
        // api/.env is optional -- Railway fill-in below covers everything.
    }
}

function fetchMissingFromRailway() {
    const missing = RAILWAY_KEYS.filter((k) => !process.env[k]);
    if (missing.length === 0) return;
    let out;
    try {
        out = execSync("railway variables --service api --kv", {
            cwd: API_DIR,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 15_000,
        });
    } catch (err) {
        throw new Error(
            `Need ${missing.join(", ")} but couldn't read them from api/.env or Railway ` +
                `(railway variables --service api --kv failed: ${err.message}). ` +
                `Run "railway login" or export these env vars yourself, then retry.`
        );
    }
    for (const line of out.split("\n")) {
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (RAILWAY_KEYS.includes(key) && !process.env[key]) {
            process.env[key] = line.slice(eq + 1).trim();
        }
    }
}

// ---------------------------------------------------------------------------
// 2. Small HTTP + formatting helpers.
// ---------------------------------------------------------------------------
async function api(method, urlPath, opts = {}) {
    const { token, body, raw } = opts;
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${BASE}${urlPath}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (raw) {
        const buf = Buffer.from(await res.arrayBuffer());
        return { status: res.status, buf, headers: res.headers };
    }
    const text = await res.text();
    let json;
    try {
        json = text ? JSON.parse(text) : undefined;
    } catch {
        // not JSON -- json stays undefined, callers check r.text on failure
    }
    return { status: res.status, json, text, headers: res.headers };
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function waitForHealth(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/health`);
            if (res.ok) return true;
        } catch {
            // not listening yet
        }
        await sleep(250);
    }
    return false;
}

function lonLatToTile(lon, lat, zoom) {
    const n = 2 ** zoom;
    const x = Math.floor(((lon + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y };
}

function squarePolygon(lng, lat, half) {
    return [
        [lng - half, lat - half],
        [lng + half, lat - half],
        [lng + half, lat + half],
        [lng - half, lat + half],
        [lng - half, lat - half],
    ];
}

function mintSession(userId, email) {
    // Exactly api/src/auth/jwt.ts:signSession -- same secret, same payload
    // shape, same algorithm. Not a bypass of auth; it's the real mechanism
    // (this is the "signable dev token" pattern HANDOFF.md documents for E2E
    // auth tests: mint with JWT_SECRET, payload {userId, email}).
    return jwt.sign({ userId, email }, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// ---------------------------------------------------------------------------
// 3. DB fixtures + cleanup.
// ---------------------------------------------------------------------------
async function upsertTestUser(pool) {
    const { rows } = await pool.query(
        `INSERT INTO users (product_id, email, agent_profile)
         VALUES ('tapowner', $1, $2)
         ON CONFLICT (product_id, email) DO UPDATE SET agent_profile = EXCLUDED.agent_profile
         RETURNING id, email`,
        [
            TEST_EMAIL,
            JSON.stringify({ name: "Smoke Test Agent", brokerage: "TapOwner QA", phone: "210-555-0100" }),
        ]
    );
    return rows[0];
}

async function upsertTestSubscription(pool, userId) {
    // Reset to a known-good Closer/trialing state with a full included-trace
    // balance every run, so the trace-unlock check below always takes the
    // included-trace path (never metered -> never touches Stripe's network).
    const { rows: existing } = await pool.query(
        `SELECT id FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
    );
    if (existing[0]) {
        await pool.query(
            `UPDATE subscriptions
             SET tier = 'closer', status = 'trialing',
                 included_traces_remaining = 10, trial_ends_at = now() + interval '30 days'
             WHERE id = $1`,
            [existing[0].id]
        );
        return;
    }
    await pool.query(
        `INSERT INTO subscriptions (user_id, tier, status, included_traces_remaining, trial_ends_at)
         VALUES ($1, 'closer', 'trialing', 10, now() + interval '30 days')`,
        [userId]
    );
}

async function findOwnerLookupFixture(pool) {
    // A real, dense, well-covered county (Bexar -- the most thoroughly
    // verified county in the project, per CURRENT_STATE.md) so this is fast
    // and stable. ST_PointOnSurface guarantees the point resolves back to
    // this same parcel via ST_Contains in /parcels/at.
    const { rows } = await pool.query(`
        SELECT id, owner_name,
               ST_X(ST_PointOnSurface(geom)) AS lng, ST_Y(ST_PointOnSurface(geom)) AS lat
        FROM parcels
        WHERE county_fips = ANY ($1) AND owner_name IS NOT NULL AND is_protected = false
          AND owner_name !~* '^(unknown|confidential|n/?a|none|withheld|protected|tbd)'
          AND living_area_sqft IS NOT NULL
        ORDER BY id ASC LIMIT 1
    `, [["48029", "48113", "48201", "48453", "48439"]]); // Bexar, Dallas, Harris, Travis, Tarrant
    return rows[0] ?? null;
}

async function findPreforeclosureFixture(pool) {
    const { rows } = await pool.query(`
        SELECT p.id, ps.event_date,
               ST_X(ST_PointOnSurface(p.geom)) AS lng, ST_Y(ST_PointOnSurface(p.geom)) AS lat
        FROM parcel_signals ps
        JOIN parcels p ON p.id = ps.parcel_id
        WHERE ps.signal_type = 'pre_foreclosure' AND ps.event_date >= current_date
          AND p.is_protected = false
        ORDER BY p.id ASC LIMIT 1
    `);
    return rows[0] ?? null;
}

async function cleanupTransactionalRows(pool, userId) {
    await pool.query(
        `DELETE FROM notes WHERE saved_property_id IN (SELECT id FROM saved_properties WHERE user_id = $1)`,
        [userId]
    );
    await pool.query(`DELETE FROM saved_properties WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM user_traces WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM trace_results WHERE vendor = 'smoketest'`);
    await pool.query(`DELETE FROM events WHERE user_id = $1`, [userId]);
    // users + subscriptions rows deliberately kept: reused + reset next run.
}

// ---------------------------------------------------------------------------
// 4. Reporting.
// ---------------------------------------------------------------------------
function printTable(results) {
    const nameWidth = Math.max(...results.map((r) => r.name.length), 10);
    const line = "-".repeat(nameWidth + 22);
    console.log(`\n${line}`);
    console.log("V1 SMOKE TEST — RESULTS");
    console.log(line);
    for (const r of results) {
        const badge = r.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
        console.log(`[L${r.level}] ${badge}  ${r.name.padEnd(nameWidth)}  ${DIM}(${r.ms}ms)${RESET}`);
        if (r.detail) {
            const prefix = r.ok ? "      " : `      ${RED}!${RESET} `;
            console.log(`${prefix}${r.detail}`);
        }
    }
    console.log(line);
    const passed = results.filter((r) => r.ok).length;
    console.log(`${passed}/${results.length} checks passed`);
}

// ---------------------------------------------------------------------------
// 5. Main.
// ---------------------------------------------------------------------------
async function main() {
    const results = [];
    let child = null;
    let pool = null;
    let fatalError = null;
    let testUserId = null;
    let childOutputBuf = "";

    const step = async (level, name, fn) => {
        const t0 = Date.now();
        try {
            const detail = await fn();
            results.push({ level, name, ok: true, detail: detail ?? "", ms: Date.now() - t0 });
        } catch (err) {
            results.push({
                level,
                name,
                ok: false,
                detail: err instanceof Error ? err.message : String(err),
                ms: Date.now() - t0,
            });
        }
    };

    try {
        loadLocalEnvFile();
        fetchMissingFromRailway();
        for (const k of ["DATABASE_URL", "JWT_SECRET"]) {
            if (!process.env[k]) {
                throw new Error(`${k} is not available (checked api/.env and Railway). Can't boot the API.`);
            }
        }
        // This machine can't reach Railway's internal hostname directly --
        // swap to the public proxy (documented in HANDOFF.md's DB-access
        // section). No-op if DATABASE_URL is already a public/proxy URL.
        process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
            "db.railway.internal:5432",
            "tokaido.proxy.rlwy.net:54841"
        );

        pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });

        // Boot the CURRENT source tree (not a stale deploy) on a scratch port.
        const childEnv = { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", NODE_ENV: "development" };
        // Safety net (see file header): the smoke server can never spend real
        // vendor money or send real mail, no matter what seeded/ambient env
        // happens to contain.
        delete childEnv.TRACE_PROVIDER;
        delete childEnv.BATCHDATA_API_TOKEN;
        delete childEnv.BATCHDATA_SANDBOX_TOKEN;
        delete childEnv.TRACE_PROVIDER_API_KEY;
        delete childEnv.RESEND_API_KEY;

        child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
            cwd: API_DIR,
            env: childEnv,
            stdio: ["ignore", "pipe", "pipe"],
        });
        child.stdout.on("data", (d) => (childOutputBuf += d.toString()));
        child.stderr.on("data", (d) => (childOutputBuf += d.toString()));

        const bootT0 = Date.now();
        const healthy = await waitForHealth(BOOT_TIMEOUT_MS);
        if (!healthy) {
            throw new Error(
                `API didn't respond on ${BASE}/health within ${BOOT_TIMEOUT_MS}ms.\n` +
                    `--- child process output (tail) ---\n${childOutputBuf.slice(-4000)}`
            );
        }
        results.push({ level: 1, name: "API boots + /health", ok: true, detail: "status=ok", ms: Date.now() - bootT0 });

        // ---- Arrange: dedicated test user + fixtures ----
        const testUser = await upsertTestUser(pool);
        testUserId = testUser.id;
        await upsertTestSubscription(pool, testUserId);
        const token = mintSession(testUser.id, testUser.email);
        const fixture = await findOwnerLookupFixture(pool);
        const pfFixture = await findPreforeclosureFixture(pool);

        // ---- L1: supporting infra ----
        await step(1, "/config shape", async () => {
            const r = await api("GET", "/config");
            assert(r.status === 200, `expected 200, got ${r.status}`);
            assert(r.json?.tiers?.closer && r.json?.tiers?.prospector, "missing tiers.closer/prospector");
            assert(typeof r.json.trace_price_cents === "number", "missing trace_price_cents");
            assert(Array.isArray(r.json?.draft?.templates) && r.json.draft.templates.length > 0, "missing draft.templates");
            return `trace_price_cents=${r.json.trace_price_cents}, ${r.json.draft.templates.length} draft templates`;
        });

        await step(1, "Auth: OTP round-trip (demo account)", async () => {
            if (!process.env.DEMO_EMAIL || !process.env.DEMO_OTP_CODE) {
                throw new Error("DEMO_EMAIL/DEMO_OTP_CODE not available -- can't exercise the real /auth/otp/* routes");
            }
            const reqRes = await api("POST", "/auth/otp/request", { body: { email: process.env.DEMO_EMAIL } });
            assert(reqRes.status === 200, `/auth/otp/request -> ${reqRes.status}: ${reqRes.text}`);
            const verifyRes = await api("POST", "/auth/otp/verify", {
                body: { email: process.env.DEMO_EMAIL, code: process.env.DEMO_OTP_CODE },
            });
            assert(verifyRes.status === 200, `/auth/otp/verify -> ${verifyRes.status}: ${verifyRes.text}`);
            assert(typeof verifyRes.json?.token === "string" && verifyRes.json.token.length > 20, "no session token returned");
            return `demo user id=${verifyRes.json.user?.id}`;
        });

        // ---- L4: every core route is registered + auth-gated (proves alive) ----
        await step(4, "Anonymous access blocked on data/write routes", async () => {
            const lat = fixture?.lat ?? 29.4241, lng = fixture?.lng ?? -98.4936; // San Antonio fallback
            const checks = [
                ["GET", `/parcels/at?lat=${lat}&lng=${lng}`],
                ["GET", `/tiles/16/0/0.mvt`],
                ["GET", `/geocode?address=test`],
                ["POST", `/parcels/within`],
                ["POST", `/trace/1`],
                ["POST", `/draft`],
                ["POST", `/saved-properties`],
                ["GET", `/me`],
            ];
            const bad = [];
            for (const [method, p] of checks) {
                const r = await api(method, p);
                if (r.status !== 401) bad.push(`${method} ${p} -> ${r.status}`);
            }
            assert(bad.length === 0, `expected 401 on all ${checks.length}, but: ${bad.join("; ")}`);
            return `${checks.length}/${checks.length} core routes correctly reject anonymous requests`;
        });

        // ---- L2: core DB-backed reads (authed -- data_auth_required is live) ----
        await step(2, "Owner lookup -- GET /parcels/at", async () => {
            assert(fixture, "no eligible owner-lookup parcel found in the DB (metro counties, non-protected, real owner)");
            const r = await api("GET", `/parcels/at?lat=${fixture.lat}&lng=${fixture.lng}`, { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(r.json?.owner_name, "no owner_name in response");
            assert(
                String(r.json.id) === String(fixture.id) || r.json.owner_name === fixture.owner_name,
                `resolved a different parcel than expected (got #${r.json.id} "${r.json.owner_name}", expected #${fixture.id} "${fixture.owner_name}")`
            );
            return `parcel #${r.json.id}, owner="${r.json.owner_name}"`;
        });

        await step(2, "Pre-foreclosure signal surfaces -- GET /parcels/at", async () => {
            assert(pfFixture, "no live (still-pending) pre_foreclosure-tied parcel found in parcel_signals");
            const r = await api("GET", `/parcels/at?lat=${pfFixture.lat}&lng=${pfFixture.lng}`, { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            const sig = (r.json?.event_signals ?? []).find((s) => s.signal_type === "pre_foreclosure");
            assert(sig, `no pre_foreclosure entry in event_signals: ${JSON.stringify(r.json?.event_signals)}`);
            return `parcel #${r.json.id}, event_date=${sig.event_date}`;
        });

        let farmSeen = 0;
        await step(2, "Farm-area query -- POST /parcels/within", async () => {
            assert(fixture, "no fixture parcel to center the farm polygon on");
            const half = 0.0025; // ~275m box around a known-dense metro block
            const polygon = squarePolygon(Number(fixture.lng), Number(fixture.lat), half);
            const r = await api("POST", "/parcels/within", { token, body: { polygon } });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(Array.isArray(r.json?.parcels), "no parcels array in response");
            assert(r.json.parcels.length > 0, "farm query returned zero owners for a known-dense area");
            assert(r.json.parcels[0].owner_name, "farm result missing owner_name");
            farmSeen = r.json.count;
            return `${r.json.count} owners returned (capped=${r.json.capped})`;
        });

        await step(2, "Vector tile -- GET /tiles/:z/:x/:y.mvt", async () => {
            assert(fixture, "no fixture parcel to compute a tile for");
            const { x, y } = lonLatToTile(Number(fixture.lng), Number(fixture.lat), 16);
            const r = await api("GET", `/tiles/16/${x}/${y}.mvt`, { token, raw: true });
            assert(r.status === 200, `expected a populated tile (200) over a known-dense area, got ${r.status}`);
            assert(
                r.headers.get("content-type") === "application/vnd.mapbox-vector-tile",
                `wrong content-type: ${r.headers.get("content-type")}`
            );
            assert(r.buf.length > 0, "empty tile body");
            return `tile 16/${x}/${y}, ${r.buf.length} bytes`;
        });

        await step(2, "Geocode -- GET /geocode", async () => {
            const q = encodeURIComponent("300 Alamo Plaza, San Antonio, TX");
            const r = await api("GET", `/geocode?address=${q}`, { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(Number.isFinite(r.json?.lat) && Number.isFinite(r.json?.lng), "no lat/lng in response");
            return `"${r.json.formatted_address}" -> ${r.json.lat},${r.json.lng}`;
        });

        await step(2, "/me reflects session + entitlements", async () => {
            const r = await api("GET", "/me", { token });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(r.json?.email === TEST_EMAIL, `wrong user: ${r.json?.email}`);
            assert(r.json?.tier === "closer", `expected tier=closer, got ${r.json?.tier}`);
            return `user #${r.json.id}, tier=${r.json.tier}, status=${r.json.status}`;
        });

        // ---- L3: authed core writes (test-mode, cleaned up) ----
        await step(3, "Trace unlock -- POST /trace/:parcelId (cache-seeded, no vendor/Stripe call)", async () => {
            assert(fixture, "no fixture parcel to trace");
            const ownerHash = crypto.createHash("sha256").update(fixture.owner_name).digest("hex");
            // Force the "new trace" path (not the free-re-view cache) so this
            // genuinely exercises the unlock flow every run.
            await pool.query(`DELETE FROM user_traces WHERE user_id = $1 AND parcel_id = $2`, [testUserId, fixture.id]);
            await pool.query(`DELETE FROM trace_results WHERE parcel_id = $1 AND vendor = 'smoketest'`, [fixture.id]);
            const seedPayload = {
                phones: [{ number: "2105550100", type: "mobile", dnc: false }],
                emails: [{ email: "owner-smoketest@example.com" }],
            };
            await pool.query(
                `INSERT INTO trace_results (parcel_id, owner_name_hash, payload, vendor, match_quality)
                 VALUES ($1, $2, $3, 'smoketest', 'high')`,
                [fixture.id, ownerHash, JSON.stringify(seedPayload)]
            );

            const r = await api("POST", `/trace/${fixture.id}`, { token, body: {} });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(r.json?.matched === true, `expected matched=true: ${r.text}`);
            assert(Array.isArray(r.json?.phones) && r.json.phones.length > 0, "no phones in trace response");
            assert(Array.isArray(r.json?.emails) && r.json.emails.length > 0, "no emails in trace response");

            const { rows: chargeRows } = await pool.query(
                `SELECT charged_via FROM user_traces WHERE user_id = $1 AND parcel_id = $2`,
                [testUserId, fixture.id]
            );
            assert(
                chargeRows[0]?.charged_via === "included",
                `expected charged_via=included (proves the included-trace path fired, not metered/Stripe), got ${chargeRows[0]?.charged_via}`
            );
            return `matched=true, ${r.json.phones.length} phone(s), ${r.json.emails.length} email(s), charged_via=included`;
        });

        await step(3, "AI outreach draft -- POST /draft", async () => {
            assert(fixture, "no fixture parcel to draft for");
            if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not available");
            const r = await api("POST", "/draft", {
                token,
                body: { parcel_id: Number(fixture.id), template_id: "just_sold_farming", tone: "professional" },
            });
            assert(r.status === 200, `expected 200, got ${r.status}: ${r.text}`);
            assert(typeof r.json?.subject === "string" && r.json.subject.length > 0, "empty subject");
            assert(typeof r.json?.body === "string" && r.json.body.length > 20, "empty/too-short body");
            return `"${r.json.subject}" (${r.json.body.length} chars)`;
        });

        await step(3, "Mini-CRM -- save / list / detail / status / note", async () => {
            assert(fixture, "no fixture parcel to save");
            await pool.query(
                `DELETE FROM notes WHERE saved_property_id IN
                    (SELECT id FROM saved_properties WHERE user_id = $1 AND parcel_id = $2)`,
                [testUserId, fixture.id]
            );
            await pool.query(`DELETE FROM saved_properties WHERE user_id = $1 AND parcel_id = $2`, [testUserId, fixture.id]);

            const createRes = await api("POST", "/saved-properties", {
                token,
                body: { parcel_id: Number(fixture.id), note: "smoke test note" },
            });
            assert(createRes.status === 200, `create -> ${createRes.status}: ${createRes.text}`);
            const savedPropertyId = createRes.json.id;

            const listRes = await api("GET", "/saved-properties", { token });
            assert(listRes.status === 200, `list -> ${listRes.status}`);
            assert(listRes.json.some((p) => p.id === savedPropertyId), "saved property missing from list");

            const detailRes = await api("GET", `/saved-properties/${savedPropertyId}`, { token });
            assert(detailRes.status === 200, `detail -> ${detailRes.status}: ${detailRes.text}`);
            assert(detailRes.json.phones?.length > 0, "CRM detail missing the traced phone (join to trace_results)");

            const patchRes = await api("PATCH", `/saved-properties/${savedPropertyId}`, {
                token,
                body: { status: "contacted" },
            });
            assert(patchRes.status === 200 && patchRes.json.status === "contacted", `patch -> ${patchRes.status}: ${patchRes.text}`);

            const noteRes = await api("POST", `/saved-properties/${savedPropertyId}/notes`, {
                token,
                body: { body: "second note" },
            });
            assert(noteRes.status === 200, `note -> ${noteRes.status}: ${noteRes.text}`);

            return `saved #${savedPropertyId}, status->contacted, ${detailRes.json.phones.length} phone(s) on file, note added`;
        });

        void farmSeen; // (kept for readability of the farm step above; not asserted further)
    } catch (err) {
        fatalError = err;
    } finally {
        if (pool && testUserId) {
            try {
                await cleanupTransactionalRows(pool, testUserId);
            } catch (e) {
                console.error(`${RED}cleanup warning:${RESET}`, e instanceof Error ? e.message : e);
            }
        }
        if (child) {
            try {
                child.kill();
            } catch {
                // already dead
            }
        }
        if (pool) {
            await pool.end().catch(() => {});
        }
    }

    if (fatalError) {
        console.error(`\n${RED}FATAL:${RESET} ${fatalError.message}\n`);
    }
    if (results.length > 0) printTable(results);
    const anyFail = Boolean(fatalError) || results.some((r) => !r.ok) || results.length === 0;
    console.log(anyFail ? `\n${RED}OVERALL: FAIL${RESET}` : `\n${GREEN}OVERALL: PASS — V1 core loop is healthy${RESET}`);
    process.exit(anyFail ? 1 : 0);
}

main();
