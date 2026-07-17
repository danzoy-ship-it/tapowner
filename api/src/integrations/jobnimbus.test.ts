import { test } from "node:test";
import assert from "node:assert/strict";
import {
    mapLeadToContact,
    pushLeadToJobNimbus,
    JobNimbusMappingError,
    type JobNimbusLead,
    type FetchLike,
} from "./jobnimbus.js";

const BASE_LEAD: JobNimbusLead = {
    id: "lead_123",
    ownerName: "SMITH, JOHN A",
    phone: "5125551212",
    email: "john.smith@example.com",
    situsNumber: "207",
    situsStreet: "WATERVIEW",
    situsCity: "KINGSLAND",
    situsState: "TX",
    situsZip: "78639",
    lat: 30.6591,
    lng: -98.4108,
    signalType: "roof_damage",
    signalLabel: "hail 5/28/24 -- 1.75in",
};

test("mapLeadToContact splits a county-roll 'LAST, FIRST' owner name", () => {
    const contact = mapLeadToContact(BASE_LEAD);
    assert.equal(contact.first_name, "John A");
    assert.equal(contact.last_name, "Smith");
    assert.equal(contact.company, undefined);
});

test("mapLeadToContact maps address/geo/contact fields", () => {
    const contact = mapLeadToContact(BASE_LEAD);
    assert.equal(contact.email, "john.smith@example.com");
    assert.equal(contact.phone, "5125551212");
    assert.equal(contact.address_line1, "207 WATERVIEW");
    assert.equal(contact.city, "Kingsland");
    assert.equal(contact.state_text, "TX");
    assert.equal(contact.zip, "78639");
    assert.deepEqual(contact.geo, { lat: 30.6591, lon: -98.4108 });
});

test("mapLeadToContact defaults record_type_name/status_name to Lead/New", () => {
    const contact = mapLeadToContact(BASE_LEAD);
    assert.equal(contact.record_type_name, "Lead");
    assert.equal(contact.status_name, "New");
});

test("mapLeadToContact honors a per-account record_type_name/status_name override", () => {
    const contact = mapLeadToContact(BASE_LEAD, { recordTypeName: "Prospect", statusName: "New Lead" });
    assert.equal(contact.record_type_name, "Prospect");
    assert.equal(contact.status_name, "New Lead");
});

test("mapLeadToContact omits geo when includeGeo is false", () => {
    const contact = mapLeadToContact(BASE_LEAD, { includeGeo: false });
    assert.equal(contact.geo, undefined);
});

test("mapLeadToContact omits geo when lat/lng are missing", () => {
    const contact = mapLeadToContact({ ...BASE_LEAD, lat: null, lng: null });
    assert.equal(contact.geo, undefined);
});

test("mapLeadToContact routes a business-entity owner to `company`, not first/last", () => {
    const contact = mapLeadToContact({ ...BASE_LEAD, ownerName: "RIVER OAKS HOLDINGS LLC" });
    assert.equal(contact.company, "RIVER OAKS HOLDINGS LLC");
    assert.equal(contact.first_name, undefined);
    assert.equal(contact.last_name, undefined);
});

test("mapLeadToContact routes an ESTATE OF owner to `company`", () => {
    const contact = mapLeadToContact({ ...BASE_LEAD, ownerName: "ESTATE OF MARY JONES" });
    assert.equal(contact.company, "ESTATE OF MARY JONES");
});

test("mapLeadToContact handles a plain 'FIRST LAST' name (no comma)", () => {
    const contact = mapLeadToContact({ ...BASE_LEAD, ownerName: "MARIA GARCIA" });
    assert.equal(contact.first_name, "Maria");
    assert.equal(contact.last_name, "Garcia");
});

test("mapLeadToContact throws JobNimbusMappingError when there is no usable name", () => {
    assert.throws(() => mapLeadToContact({ ...BASE_LEAD, ownerName: "" }), JobNimbusMappingError);
    assert.throws(() => mapLeadToContact({ ...BASE_LEAD, ownerName: null }), JobNimbusMappingError);
});

test("ethics guard: description carries only the generic bucket label, never the raw signalLabel", () => {
    const sensitiveLead: JobNimbusLead = {
        ...BASE_LEAD,
        signalType: "foreclosure",
        signalLabel: "Foreclosure notice filed 2026-06-01, trustee sale set for 2026-08-04",
    };
    const contact = mapLeadToContact(sensitiveLead);
    assert.ok(contact.description);
    assert.ok(contact.description!.includes("Ownership-status flag"), "should use the generic bucket label");
    assert.ok(!contact.description!.includes("Foreclosure"), "must not leak the raw signalLabel");
    assert.ok(!contact.description!.includes("trustee sale"), "must not leak raw signalLabel details");
});

test("ethics guard: an unrecognized signal_type falls back to a generic label, not a passthrough", () => {
    const contact = mapLeadToContact({ ...BASE_LEAD, signalType: "some_new_signal_nobody_mapped_yet" });
    assert.ok(contact.description!.includes("TapOwner lead flag"));
});

test("description embeds the TapOwner lead id as an opaque ref (for support correlation)", () => {
    const contact = mapLeadToContact(BASE_LEAD);
    assert.ok(contact.description!.includes("lead_123"));
});

// ---------------------------------------------------------------------------
// pushLeadToJobNimbus -- network path, always via a stubbed fetchImpl.
// No live JobNimbus account/key exists; these tests must never hit the
// network.
// ---------------------------------------------------------------------------

function fakeFetch(
    responses: Array<{ ok: boolean; status: number; statusText?: string; body?: unknown; retryAfter?: string }>
): { fetch: FetchLike; calls: number } {
    let calls = 0;
    const fetch: FetchLike = async () => {
        const r = responses[calls] ?? responses[responses.length - 1]!;
        calls++;
        return {
            ok: r.ok,
            status: r.status,
            statusText: r.statusText ?? "",
            headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? r.retryAfter ?? null : null) },
            json: async () => r.body ?? {},
        };
    };
    return { fetch, calls: 0 };
}

test("pushLeadToJobNimbus returns { ok:true, jnid } on a 2xx response", async () => {
    const { fetch } = fakeFetch([{ ok: true, status: 200, body: { jnid: "jn_abc123" } }]);
    const result = await pushLeadToJobNimbus("fake-key", BASE_LEAD, { fetchImpl: fetch, maxRetries: 0 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.jnid, "jn_abc123");
});

test("pushLeadToJobNimbus returns a non-retryable invalid_lead error without calling fetch", async () => {
    let called = false;
    const fetch: FetchLike = async () => {
        called = true;
        throw new Error("should not be called");
    };
    const result = await pushLeadToJobNimbus("fake-key", { ...BASE_LEAD, ownerName: "" }, { fetchImpl: fetch });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.kind, "invalid_lead");
        assert.equal(result.error.retryable, false);
    }
    assert.equal(called, false);
});

test("pushLeadToJobNimbus does not retry a 401 (auth failure)", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
        calls++;
        return { ok: false, status: 401, statusText: "Unauthorized", headers: { get: () => null }, json: async () => ({}) };
    };
    const result = await pushLeadToJobNimbus("bad-key", BASE_LEAD, { fetchImpl: fetch, maxRetries: 2 });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.kind, "auth");
        assert.equal(result.error.retryable, false);
    }
    assert.equal(calls, 1, "auth failures must not be retried");
});

test("pushLeadToJobNimbus retries a 429 then succeeds", async () => {
    const { fetch } = fakeFetch([
        { ok: false, status: 429, statusText: "Too Many Requests", retryAfter: "0" },
        { ok: true, status: 200, body: { jnid: "jn_after_retry" } },
    ]);
    const result = await pushLeadToJobNimbus("fake-key", BASE_LEAD, { fetchImpl: fetch, maxRetries: 2 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.jnid, "jn_after_retry");
});

test("pushLeadToJobNimbus exhausts retries on repeated 5xx and returns a retryable error", async () => {
    let calls = 0;
    const fetch: FetchLike = async () => {
        calls++;
        return { ok: false, status: 503, statusText: "Service Unavailable", headers: { get: () => null }, json: async () => ({}) };
    };
    const result = await pushLeadToJobNimbus("fake-key", BASE_LEAD, { fetchImpl: fetch, maxRetries: 1 });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.kind, "server_error");
        assert.equal(result.error.retryable, true);
    }
    assert.equal(calls, 2, "1 initial attempt + 1 retry = 2 calls");
});
