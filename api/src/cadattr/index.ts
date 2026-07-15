import type { FastifyBaseLogger } from "fastify";
import { pool } from "../db.js";
import { logEvent } from "../lib/events.js";
import { TrueProdigyClient } from "./trueprodigy.js";

// Counties whose beds/baths exist ONLY behind a per-property CAD API (no usable
// bulk file), so we fill them lazily: the first time a parcel is viewed with no
// beds, fetch its attributes once and cache them into the parcels row forever.
// Keyed by county_fips. The caller resolves each parcel via its TP pid, which
// for these counties is stored in parcels.apn (Tarrant: TAD Account_Num, loaded
// alongside GIS_Link -> source_property_id). Grow this as the data session
// confirms more True-Prodigy-API-only counties (HANDOFF.md + DATA_HUNTING_PLAYBOOK.md #1).
interface FillSource {
    system: "trueprodigy";
    office: string; // True Prodigy office name (from /trueprodigy/officelookup)
}
const FILL_SOURCES: Record<string, FillSource> = {
    "48439": { system: "trueprodigy", office: "Tarrant" },
};

const trueProdigy = new TrueProdigyClient();

// Per-parcel attempt guard so a null result (commercial/land parcel, an
// unresolved id, or a transient API failure) doesn't re-hit the CAD on every
// tap. Successful fills populate bedrooms, so they never re-enter this path --
// this map only throttles the misses. In-memory, cleared on restart; fine.
const lastAttempt = new Map<number, number>();
const ATTEMPT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

export function isFillEligible(countyFips: string | null | undefined): boolean {
    return typeof countyFips === "string" && countyFips in FILL_SOURCES;
}

/**
 * Fire-and-forget enrichment of one parcel's beds/baths/sqft/year from its CAD
 * API, cached back into the parcels row. Never throws to the caller and never
 * blocks the response -- call it without awaiting. Safe to call on every view:
 * it self-guards on eligibility, a missing source id, and the attempt cooldown.
 */
export function fillParcelAttrsInBackground(
    parcelId: number,
    countyFips: string,
    cadPid: string | null,
    log: FastifyBaseLogger
): void {
    const src = FILL_SOURCES[countyFips];
    if (!src || !cadPid) return;

    const prev = lastAttempt.get(parcelId);
    const now = Date.now();
    if (prev !== undefined && now - prev < ATTEMPT_COOLDOWN_MS) return;
    lastAttempt.set(parcelId, now);

    void (async () => {
        try {
            const attrs = await trueProdigy.fetchAttrs(src.office, cadPid);
            if (!attrs) return;

            // COALESCE so we only ever fill blanks -- never overwrite county data
            // that's already present, and never clobber a concurrent fill.
            const { rowCount } = await pool.query(
                `UPDATE parcels SET
                     bedrooms         = COALESCE(bedrooms, $2),
                     baths_full       = COALESCE(baths_full, $3),
                     baths_half       = COALESCE(baths_half, $4),
                     living_area_sqft = COALESCE(living_area_sqft, $5),
                     year_built       = COALESCE(year_built, $6)
                 WHERE id = $1`,
                [
                    parcelId,
                    attrs.bedrooms,
                    attrs.bathsFull,
                    attrs.bathsHalf,
                    attrs.livingAreaSqft,
                    attrs.yearBuilt,
                ]
            );

            // Raw improvement labels (pool/casita/shed/...) are collected too, but
            // aren't persisted yet -- they land once the data session adds the
            // parcels.improvements column (IMPROVEMENT_TAXONOMY.md). Count only for
            // now, so the event stream shows the fill is producing them.
            void logEvent(null, "cad_attr_filled", {
                parcel_id: parcelId,
                county_fips: countyFips,
                system: src.system,
                got_beds: attrs.bedrooms !== null,
                got_sqft: attrs.livingAreaSqft !== null,
                improvement_labels: attrs.improvements.length,
                updated: rowCount ?? 0,
            });
        } catch (err) {
            log.warn(
                { parcelId, countyFips, err: err instanceof Error ? err.message : String(err) },
                "cad_attr fill failed"
            );
        }
    })();
}
