// "Likely to sell" owner signals derived from data the county roll already
// carries -- ownership tenure (from last_sale_date) and Texas exemption codes.
// These power Reverse Prospecting filters/badges (SIGNALS_ROADMAP.md families
// 2/3, the "rides existing pipelines" set). All derivable from ONE snapshot;
// the change-over-time versions (homestead DROPPED, etc.) come later when we
// have multiple captures to diff.

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export interface OwnerSignals {
    /** Whole years since the last recorded sale/deed date, or null if unknown. */
    tenure_years: number | null;
    /** Texas OV65 / OV65-surviving-spouse exemption -> senior owner (downsizing
     *  horizon). false also means "unknown" (county exemptions not captured). */
    senior_owner: boolean;
    /** Texas HS (homestead) exemption -> owner-occupied primary residence. */
    homestead: boolean;
}

export function deriveOwnerSignals(exemptions: unknown, lastSaleDate: unknown): OwnerSignals {
    const codes = Array.isArray(exemptions)
        ? exemptions.filter((e): e is string => typeof e === "string").map((e) => e.toUpperCase())
        : [];

    let tenure: number | null = null;
    if (lastSaleDate) {
        const d = lastSaleDate instanceof Date ? lastSaleDate : new Date(String(lastSaleDate));
        const t = d.getTime();
        if (Number.isFinite(t)) {
            const yrs = Math.floor((Date.now() - t) / YEAR_MS);
            // Guard against bad/placeholder dates (future sales, 1900 fillers).
            if (yrs >= 0 && yrs <= 150) tenure = yrs;
        }
    }

    return {
        tenure_years: tenure,
        senior_owner: codes.includes("OV65") || codes.includes("OV65S"),
        homestead: codes.includes("HS"),
    };
}
