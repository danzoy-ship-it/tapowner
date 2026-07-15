import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSitusAddress } from "./address.js";
import { isPlaceholderOwner } from "./owners.js";

test("formatSitusAddress keeps a usable stored value", () => {
    assert.equal(
        formatSitusAddress({ situs_address: "123 MAIN ST, AUSTIN, TX 78701" }),
        "123 MAIN ST, AUSTIN, TX 78701"
    );
});

test("formatSitusAddress rejects the malformed ', , TX' join (historical bug)", () => {
    // No street before the first comma AND no structured parts -> null so the UI
    // shows "Address unavailable" instead of stray punctuation.
    assert.equal(formatSitusAddress({ situs_address: ", , TX" }), null);
    assert.equal(formatSitusAddress({ situs_address: ", , TX 78639" }), null);
});

test("formatSitusAddress rebuilds from parts when stored value has no street", () => {
    assert.equal(
        formatSitusAddress({
            situs_address: ", KINGSLAND, TX",
            situs_number: "207",
            situs_street: "WATERVIEW",
            situs_city: "KINGSLAND",
            situs_state: "TX",
            situs_zip: "78639",
        }),
        "207 WATERVIEW, KINGSLAND, TX 78639"
    );
});

test("formatSitusAddress returns null when there is no street at all", () => {
    assert.equal(formatSitusAddress({ situs_city: "AUSTIN", situs_state: "TX" }), null);
    assert.equal(formatSitusAddress({}), null);
});

test("isPlaceholderOwner catches empties, punctuation, and known tokens", () => {
    for (const junk of [null, undefined, "", "  ", "-", "--", ".", "UNKNOWN OWNER", "confidential", " N/A "]) {
        assert.equal(isPlaceholderOwner(junk), true, `should flag ${JSON.stringify(junk)}`);
    }
});

test("isPlaceholderOwner allows real names (incl. odd-but-real)", () => {
    for (const real of ["SMITH, JOHN", "3M COMPANY", "1101 BROADWAY LP", "O'BRIEN"]) {
        assert.equal(isPlaceholderOwner(real), false, `should allow ${real}`);
    }
});
