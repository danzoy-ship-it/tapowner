// Per-property CAD attribute fetch, for counties whose beds/baths live ONLY in a
// live appraisal-district API (no bulk file) -- the "fill-on-blank" path. Mirrors
// the trace/ provider shape.

export interface CadAttrResult {
    bedrooms: number | null;
    bathsFull: number | null;
    bathsHalf: number | null;
    livingAreaSqft: number | null;
    yearBuilt: number | null;
    /** Raw CAD improvement/feature labels, verbatim, for the crosswalk
     *  (data/improvement_crosswalk.json + IMPROVEMENT_TAXONOMY.md). */
    improvements: string[];
}
