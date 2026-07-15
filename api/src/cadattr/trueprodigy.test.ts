import { test } from "node:test";
import assert from "node:assert/strict";
import { roomCount } from "./trueprodigy.js";

// Every string here was observed LIVE on a Texas CAD's True Prodigy API and at
// some point produced a wrong result. These tests are the regression fence:
// Tarrant writes digits ("Rooms: Bedrooms 3"), Ellis writes words + fractions
// ("Number of Bedrooms: FOUR BEDROOM", "Plumbing: TWO 1/2 BATH") plus junk code
// rows ("Number of Bedrooms: 91"), Denton writes bare "Plumbing: 3".

test("Tarrant digit format", () => {
    assert.equal(roomCount("Rooms: Bedrooms 3", 20), 3);
    assert.equal(roomCount("Rooms: Bathrooms 2", 20), 2);
    assert.equal(roomCount("Rooms: Bathrooms 2.5", 20), 2.5);
});

test("Tarrant fractional segments sum upstream (raw values pass through)", () => {
    assert.equal(roomCount("Rooms: Bedrooms 0.4539", 20), 0.4539);
});

test("Ellis word format", () => {
    assert.equal(roomCount("Number of Bedrooms: THREE BEDROOM", 20), 3);
    assert.equal(roomCount("Number of Bedrooms: FOUR BEDROOM", 20), 4);
    assert.equal(roomCount("Plumbing: TWO BATH", 20), 2);
    assert.equal(roomCount("Plumbing: THREE BATH", 20), 3);
});

test("Ellis word + plus-suffix format", () => {
    assert.equal(roomCount("Number of Bedrooms: FIVE + BEDROOM", 20), 5);
    assert.equal(roomCount("Plumbing: FOUR + BATH", 20), 4);
});

test("Ellis half-bath fraction (Frederick's catch)", () => {
    assert.equal(roomCount("Plumbing: TWO 1/2 BATH", 20), 2.5);
});

test("code values are rejected, not recorded as counts", () => {
    assert.equal(roomCount("Number of Bedrooms: 91", 20), 0);
    assert.equal(roomCount("Number of Bedrooms: 92", 20), 0);
    assert.equal(roomCount("Plumbing: 40", 20), 0);
    assert.equal(roomCount("Plumbing: 42", 20), 0);
});

test("Denton bare Plumbing = baths, fixture guard at 6", () => {
    assert.equal(roomCount("Plumbing: 3", 6), 3);
    // fixture counts (median ~8) must record NOTHING, not 8 baths
    assert.equal(roomCount("Plumbing: 8", 6), 0);
});

test("digit anywhere in the string, not only trailing", () => {
    assert.equal(roomCount("2.5 BATH", 20), 2.5);
});

test("no number at all", () => {
    assert.equal(roomCount("Rooms: Bedrooms", 20), 0);
    assert.equal(roomCount("", 20), 0);
});
