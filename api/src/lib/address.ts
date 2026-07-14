// The county SITUS_ADDR column is sometimes a malformed join of empty parts --
// e.g. ", , TX" for a rural parcel with no street address on record. Prefer the
// stored value when it has a real street line; otherwise rebuild from the
// structured parts; if there's no street at all, return null so the UI shows
// "Address unavailable" instead of stray punctuation.
export interface SitusParts {
    situs_address?: string | null;
    situs_number?: string | null;
    situs_street?: string | null;
    situs_city?: string | null;
    situs_state?: string | null;
    situs_zip?: string | null;
}

export function formatSitusAddress(row: SitusParts): string | null {
    const combined = (row.situs_address ?? "").trim();
    // The street line is the text before the first comma. If it's non-empty the
    // stored value is usable as-is (keeps the county's own formatting/zip).
    if ((combined.split(",")[0] ?? "").trim()) return combined;

    // Otherwise rebuild from structured parts.
    const line1 = [row.situs_number, row.situs_street]
        .map((v) => (v ?? "").trim())
        .filter(Boolean)
        .join(" ");
    // Without a street line, "TX" or "TX 78639" alone isn't a useful address.
    if (!line1) return null;

    const stateZip = [row.situs_state, row.situs_zip]
        .map((v) => (v ?? "").trim())
        .filter(Boolean)
        .join(" ");
    const tail = [(row.situs_city ?? "").trim(), stateZip].filter(Boolean).join(", ");
    return [line1, tail].filter(Boolean).join(", ");
}
