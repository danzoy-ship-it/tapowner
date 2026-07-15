import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveTags, tagsForParcel, tagLabel } from "./improvementTags.js";

// Regression fence for the crosswalk-driven feature tags. The label fixtures
// are REAL raw improvement codes observed in the DB (Bexar's terse codes,
// PACS word labels). Semantics under test include Frederick's UX calls:
// generic garage is never emitted; boat_dock implies waterfront.

const sorted = (a: string[]) => [...a].sort();

test("Bexar terse codes (Frederick's house: 2807 Stokely Hl)", () => {
    const tags = deriveTags(["LA", "LA2", "AG", "OP", "OP", "RSW", "SPA", "WDD"], {});
    assert.ok(tags.includes("pool"), "RSW is the Bexar pool code");
    assert.ok(tags.includes("spa"), "SPA");
    assert.ok(!tags.includes("garage"), "generic garage never emitted (AG is attached)");
    assert.ok(!tags.includes("garage_detached"), "AG must NOT read as detached");
    assert.ok(!tags.includes("boat_dock"), "WDD is a wood deck, not a dock");
});

test("Bexar detached garage (the neighbor: 2803 Stokely Hl)", () => {
    const tags = deriveTags(["LA", "OP", "LA2", "PA", "GAR", "DCK", "TCT"], {});
    assert.ok(tags.includes("garage_detached"), "GAR = detached garage (BCAD legend)");
    assert.ok(!tags.includes("garage"), "generic garage stripped");
    assert.ok(!tags.includes("boat_dock"), "DCK (deck) must not match \\bdock\\b");
});

test("carport bare codes (v3)", () => {
    assert.ok(deriveTags(["CP"], {}).includes("carport"));
    assert.ok(deriveTags(["CPT"], {}).includes("carport"));
});

test("casita from DLA prefix", () => {
    assert.ok(deriveTags(["DLA"], {}).includes("casita"));
});

test("boat_dock implies waterfront; loading dock excluded", () => {
    const tags = deriveTags(["BOAT DOCK"], {});
    assert.ok(tags.includes("boat_dock"));
    assert.ok(tags.includes("waterfront"));
    assert.ok(!deriveTags(["LOADING DOCK"], {}).includes("boat_dock"));
});

test("pool excludes (heater/spa words don't create pool)", () => {
    assert.ok(!deriveTags(["POOL HEATER"], {}).includes("pool"));
    assert.ok(!deriveTags(["HOT TUB"], {}).includes("pool"));
    assert.ok(deriveTags(["HOT TUB"], {}).includes("spa"));
});

test("boolean flags union in (roll-flag counties with no labels)", () => {
    assert.deepEqual(sorted(deriveTags(null, { pool: true, casita: true, shed: true })), [
        "casita",
        "pool",
        "shed_workshop",
    ]);
    assert.deepEqual(deriveTags(null, { pool: false }), []);
});

test("tagsForParcel prefers the materialized column", () => {
    const tags = tagsForParcel(["fireplace", "garage", "carport"], ["RSW"], {});
    assert.ok(tags.includes("fireplace"), "column tags win");
    assert.ok(tags.includes("carport"));
    assert.ok(!tags.includes("pool"), "raw labels ignored when column present");
    assert.ok(!tags.includes("garage"), "generic garage stripped from column too");
});

test("tagsForParcel falls back to derivation when column empty", () => {
    const tags = tagsForParcel([], ["RSW", "GAR"], {});
    assert.ok(tags.includes("pool"));
    assert.ok(tags.includes("garage_detached"));
});

test("tagsForParcel always unions boolean flags over the column", () => {
    // e.g. Tarrant: has_pool=true from TAD's Y/N flag, labels/column poolless
    const tags = tagsForParcel(["fireplace"], null, { pool: true });
    assert.ok(tags.includes("pool"));
    assert.ok(tags.includes("fireplace"));
});

test("junk inputs are safe", () => {
    assert.deepEqual(deriveTags(undefined, {}), []);
    assert.deepEqual(deriveTags("not-an-array", {}), []);
    assert.deepEqual(deriveTags([null, 42, ""], {} as never), []);
});

test("tagLabel falls back readably", () => {
    assert.equal(tagLabel("garage_detached"), "Detached garage");
    assert.equal(tagLabel("pool"), "Pool");
    assert.equal(tagLabel("brand_new_tag"), "brand_new_tag");
});
