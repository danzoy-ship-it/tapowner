import { test } from "node:test";
import assert from "node:assert/strict";
import {
    composeRooferSignals,
    deriveHail,
    deriveWind,
    derivePermits,
    classifyRoofMaterial,
    deriveDistress,
    resolveRoofAge,
    toISODate,
    UNKNOWN_ROOF_AGE,
} from "./rooferSignals.js";

const NOW = new Date("2026-07-17T12:00:00Z");

const monthsAgo = (n: number): string => {
    // ~n months back from NOW, returned as YYYY-MM-DD (day-precision is enough
    // for the 6-20mo claim window; land mid-month to avoid boundary flapping).
    const d = new Date(NOW.getTime());
    d.setUTCMonth(d.getUTCMonth() - n);
    d.setUTCDate(15);
    return d.toISOString().slice(0, 10);
};

test("toISODate normalises pg Date, ISO string, junk", () => {
    assert.equal(toISODate("2026-05-28"), "2026-05-28");
    assert.equal(toISODate("2026-05-28T00:00:00.000Z"), "2026-05-28");
    assert.equal(toISODate(new Date("2026-05-28T12:00:00Z")), "2026-05-28");
    assert.equal(toISODate(null), null);
    assert.equal(toISODate("not-a-date"), null);
    assert.equal(toISODate(undefined), null);
});

test("hail: UNION of SPC + swath, max size + most-recent date", () => {
    const h = deriveHail(
        [{ event_date: "2025-03-25", hail_size_in: 1.5 }],
        [{ event_date: "2026-05-28", min_hail_in: 1.0 }]
    );
    assert.equal(h.hit, true);
    assert.equal(h.max_hail_in, 1.5, "max across both sources");
    assert.equal(h.last_event_date, "2026-05-28", "most recent across both");
    assert.deepEqual(h.sources.sort(), ["mrms_swath", "spc"]);
    assert.equal(h.event_count, 2);
    assert.equal(h.repeat_hit, true, "two distinct dates = repeat hit");
});

test("hail: swath-only still fires (SPC miss on ~38% of dates)", () => {
    const h = deriveHail([], [{ event_date: "2026-05-28", min_hail_in: 2.0 }]);
    assert.equal(h.hit, true);
    assert.equal(h.max_hail_in, 2.0);
    assert.deepEqual(h.sources, ["mrms_swath"]);
    assert.equal(h.repeat_hit, false);
});

test("hail: same date from both sources counts once", () => {
    const h = deriveHail(
        [{ event_date: "2026-05-28", hail_size_in: 1.0 }],
        [{ event_date: "2026-05-28", min_hail_in: 1.5 }]
    );
    assert.equal(h.event_count, 1, "dedup by date");
    assert.equal(h.repeat_hit, false);
    assert.equal(h.max_hail_in, 1.5);
});

test("hail: no rows -> no hit", () => {
    const h = deriveHail([], []);
    assert.equal(h.hit, false);
    assert.equal(h.max_hail_in, null);
    assert.equal(h.last_event_date, null);
    assert.deepEqual(h.sources, []);
});

test("wind: max gust + most-recent, dedup dates", () => {
    const w = deriveWind([
        { event_date: "2026-05-26", wind_speed_kt: 79 },
        { event_date: "2026-05-26", wind_speed_kt: 60 },
        { event_date: "2025-11-01", wind_speed_kt: 55 },
    ]);
    assert.equal(w.hit, true);
    assert.equal(w.max_wind_kt, 79);
    assert.equal(w.last_event_date, "2026-05-26");
    assert.equal(w.event_count, 2);
});

test("roof age: pluggable slot returns UNKNOWN for now (vendor-pending)", () => {
    const ra = resolveRoofAge({ now: NOW });
    assert.deepEqual(ra, UNKNOWN_ROOF_AGE);
    assert.equal(ra.source, "unknown");
    assert.equal(ra.age_years, null);
    assert.equal(ra.acv_cliff, null, "null (not false) so UI distinguishes unknown from no-cliff");
    assert.equal(ra.non_renewal_risk, null);
});

test("roof age: bundle never derives age from year_built (invariant)", () => {
    // Even with roof permits present, roof_age stays unknown -- roof-age
    // sourcing is deferred to the vendor decision. (The roof-permit DATE still
    // surfaces under permits; it just isn't turned into an age here.)
    const b = composeRooferSignals({
        now: NOW,
        roof_permits: [{ issued_date: "2005-06-01" }],
    });
    assert.equal(b.roof_age.source, "unknown");
    assert.equal(b.roof_age.acv_cliff, null);
    assert.equal(b.permits.last_roof_permit_date, "2005-06-01", "permit date still surfaced");
});

test("claim window: hail 8mo ago, no roof permit since -> OPEN", () => {
    const p = derivePermits([], [], [monthsAgo(8)], NOW);
    assert.equal(p.claim_window.open, true);
    assert.equal(p.claim_window.hail_event_date, monthsAgo(8));
    assert.ok(
        p.claim_window.months_since !== null &&
            p.claim_window.months_since >= 6 &&
            p.claim_window.months_since <= 20
    );
});

test("claim window: roof permit AFTER the storm -> CLOSED (already re-roofed)", () => {
    const storm = monthsAgo(10);
    const permitAfter = monthsAgo(4); // later date than the storm
    const p = derivePermits([{ issued_date: permitAfter }], [], [storm], NOW);
    assert.equal(p.claim_window.open, false, "a roof permit since the storm closes it");
});

test("claim window: storm too old (25mo) -> not in window", () => {
    const p = derivePermits([], [], [monthsAgo(25)], NOW);
    assert.equal(p.claim_window.open, false);
    assert.equal(p.claim_window.hail_event_date, null);
});

test("claim window: storm too fresh (3mo) -> not yet in window", () => {
    const p = derivePermits([], [], [monthsAgo(3)], NOW);
    assert.equal(p.claim_window.open, false);
    assert.equal(p.claim_window.hail_event_date, null);
});

test("solar-tell: solar permit within 24mo flags recent", () => {
    const recent = derivePermits([], [{ issued_date: monthsAgo(10) }], [], NOW);
    assert.equal(recent.solar_recent, true);
    assert.equal(recent.last_solar_permit_date, monthsAgo(10));

    const old = derivePermits([], [{ issued_date: monthsAgo(30) }], [], NOW);
    assert.equal(old.solar_recent, false, "older than 24mo is not the tell");
});

test("roof_material: reroof vs long-life classification", () => {
    assert.deepEqual(classifyRoofMaterial("composition"), { value: "composition", market: "reroof" });
    assert.equal(classifyRoofMaterial("wood").market, "reroof");
    assert.equal(classifyRoofMaterial("built_up").market, "reroof");
    assert.equal(classifyRoofMaterial("metal").market, "long_life");
    assert.equal(classifyRoofMaterial("tile").market, "long_life");
    assert.equal(classifyRoofMaterial("slate").market, "long_life");
    assert.deepEqual(classifyRoofMaterial(null), { value: null, market: null });
    assert.deepEqual(classifyRoofMaterial(""), { value: null, market: null });
});

test("distress: buckets + pre_foreclosure recency gate", () => {
    const future = "2026-09-01"; // after NOW -> still pending
    const past = "2026-01-01"; // before NOW -> dropped from the label
    const d = deriveDistress(
        [
            { signal_type: "code_violation", subtype: "fire_damaged", source: "arlington_code", event_date: null, status: "O" },
            { signal_type: "probate", subtype: "will", source: "bexar_probate", event_date: "2025-05-22" },
            { signal_type: "pre_foreclosure", subtype: "mortgage", source: "orange_cc", event_date: future },
            { signal_type: "pre_foreclosure", subtype: "mortgage", source: "orange_cc", event_date: past },
        ],
        NOW
    );
    assert.equal(d.code_violation.length, 1);
    assert.equal(d.code_violation[0]?.status, "O");
    assert.equal(d.probate.length, 1);
    assert.equal(d.pre_foreclosure.length, 1, "only the still-pending notice survives the gate");
    assert.equal(d.pre_foreclosure[0]?.event_date, future);
});

test("compose: full bundle + signal_types vocabulary", () => {
    const b = composeRooferSignals({
        now: NOW,
        roof_material: "composition shingle",
        hail_spc: [{ event_date: monthsAgo(8), hail_size_in: 1.75 }],
        hail_swath: [{ event_date: "2024-05-28", min_hail_in: 2.0 }],
        wind: [{ event_date: "2026-05-26", wind_speed_kt: 79 }],
        solar_permits: [{ issued_date: monthsAgo(6) }],
        distress: [
            { signal_type: "code_violation", subtype: "fire_damaged", source: "arlington_code", event_date: null, status: "O" },
        ],
    });
    assert.equal(b.hail.hit, true);
    assert.equal(b.hail.repeat_hit, true, "two hail dates");
    assert.equal(b.hail.max_hail_in, 2.0);
    assert.equal(b.wind.hit, true);
    assert.equal(b.permits.claim_window.open, true, "8mo hail, no roof permit since");
    assert.equal(b.permits.solar_recent, true);
    assert.equal(b.roof_material.market, "reroof");
    assert.equal(b.roof_age.source, "unknown");
    // signal_types should include the fired signals for the area filter
    for (const t of ["hail", "hail_repeat", "wind", "claim_window", "solar_intent", "reroof_material", "code_violation"]) {
        assert.ok(b.signal_types.includes(t), `expected signal_types to include ${t}: ${b.signal_types.join(",")}`);
    }
    assert.ok(!b.signal_types.includes("pre_foreclosure"));
    assert.ok(!b.signal_types.includes("roof_permit"), "no roof permit was supplied");
});

test("compose: empty input -> all signals cold, no throw", () => {
    const b = composeRooferSignals({ now: NOW });
    assert.equal(b.hail.hit, false);
    assert.equal(b.wind.hit, false);
    assert.equal(b.permits.claim_window.open, false);
    assert.equal(b.permits.solar_recent, false);
    assert.equal(b.roof_material.market, null);
    assert.equal(b.roof_age.source, "unknown");
    assert.deepEqual(b.signal_types, []);
    assert.deepEqual(b.distress, { code_violation: [], pre_foreclosure: [], probate: [] });
});
