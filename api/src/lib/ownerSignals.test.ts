import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveOwnerSignals } from "./ownerSignals.js";

const yearsAgo = (n: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d.toISOString().slice(0, 10);
};

test("exemption codes -> senior/homestead", () => {
    assert.deepEqual(deriveOwnerSignals(["HS"], null), {
        tenure_years: null,
        senior_owner: false,
        homestead: true,
    });
    assert.equal(deriveOwnerSignals(["OV65"], null).senior_owner, true);
    assert.equal(deriveOwnerSignals(["OV65S"], null).senior_owner, true, "surviving-spouse counts");
    const both = deriveOwnerSignals(["HS", "OV65"], null);
    assert.ok(both.senior_owner && both.homestead);
});

test("codes are case-insensitive and unrelated codes ignored", () => {
    assert.equal(deriveOwnerSignals(["ov65"], null).senior_owner, true);
    const dv = deriveOwnerSignals(["DV4", "EX"], null);
    assert.ok(!dv.senior_owner && !dv.homestead);
});

test("tenure = whole years since sale", () => {
    assert.equal(deriveOwnerSignals(null, yearsAgo(21)).tenure_years, 21);
    assert.equal(deriveOwnerSignals(null, yearsAgo(0)).tenure_years, 0);
});

test("placeholder + junk dates -> null tenure", () => {
    assert.equal(deriveOwnerSignals(null, "1900-01-01").tenure_years, null, "1900 filler rejected");
    assert.equal(deriveOwnerSignals(null, yearsAgo(-2)).tenure_years, null, "future sale rejected");
    assert.equal(deriveOwnerSignals(null, "not-a-date").tenure_years, null);
    assert.equal(deriveOwnerSignals(null, null).tenure_years, null);
    // boundary: a genuine ~60yr tenure still passes (real 1960s sales exist)
    assert.equal(deriveOwnerSignals(null, yearsAgo(60)).tenure_years, 60);
});

test("null / junk exemptions are safe", () => {
    assert.deepEqual(deriveOwnerSignals(null, null), {
        tenure_years: null,
        senior_owner: false,
        homestead: false,
    });
    assert.equal(deriveOwnerSignals("HS", null).senior_owner, false, "string, not array");
    assert.equal(deriveOwnerSignals([null, 42, "HS"], null).homestead, true, "junk entries skipped");
});
