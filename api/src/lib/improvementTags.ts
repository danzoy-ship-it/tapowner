import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { CROSSWALK } from "./crosswalkData.js";

// Canonical property-feature tags for Reverse Prospecting filters (the 16-tag
// vocabulary; spec: IMPROVEMENT_TAXONOMY.md). Tags are derived server-side at
// query time from (a) the boolean columns the loaders set (has_pool/garage/
// casita/shed) and (b) the raw CAD improvement labels in parcels.improvements,
// mapped through data/improvement_crosswalk.json -- the single source of truth
// shared with the data pipeline. Server-side on purpose: the crosswalk grows as
// counties load, and an API deploy is instant while an App Store build is not.
// (When the data session materializes parcels.improvement_tags, this module can
// switch to reading the column -- same output, cheaper.)

interface CrosswalkTag {
    label: string;
    match: string[];
    exclude: string[];
}

interface CompiledTag {
    tag: string;
    match: RegExp[];
    exclude: RegExp[];
}

let compiled: CompiledTag[] = [];
// Labels for the boolean-column tags always exist even if the crosswalk file
// is missing from the deploy image (graceful degradation: column tags only).
let labels: Record<string, string> = {
    pool: "Pool",
    garage: "Garage",
    casita: "Guest house / casita",
    shed_workshop: "Shed / workshop",
    waterfront: "Waterfront",
};

function compile(tags: Record<string, CrosswalkTag>, source: string): void {
    compiled = Object.entries(tags)
        .filter(([, t]) => t.match.length > 0)
        .map(([tag, t]) => ({
            tag,
            match: t.match.map((m) => new RegExp(m, "i")),
            exclude: t.exclude.map((m) => new RegExp(m, "i")),
        }));
    labels = {
        ...labels,
        ...Object.fromEntries(Object.entries(tags).map(([k, t]) => [k, t.label])),
    };
    console.log(`improvement crosswalk loaded: ${compiled.length} tags (${source})`);
}

(function loadCrosswalk() {
    // Filesystem copies win when present (dev tree / CROSSWALK_PATH override) so
    // a crosswalk edit takes effect without regenerating; the embedded snapshot
    // (crosswalkData.ts, synced via `npm run sync:crosswalk`) is the production
    // default because Railway's build context is api/ only -- ../data never ships.
    const here = path.dirname(fileURLToPath(import.meta.url)); // dist/lib at runtime
    const candidates = [
        process.env.CROSSWALK_PATH,
        path.resolve(here, "../../../data/improvement_crosswalk.json"),
        path.resolve(process.cwd(), "data/improvement_crosswalk.json"),
        path.resolve(process.cwd(), "../data/improvement_crosswalk.json"),
    ].filter((p): p is string => typeof p === "string" && p.length > 0);
    for (const p of candidates) {
        try {
            const cw = JSON.parse(readFileSync(p, "utf8")) as {
                version?: number;
                tags: Record<string, CrosswalkTag>;
            };
            if (cw.version !== undefined && cw.version !== CROSSWALK.version) {
                console.warn(
                    `crosswalk drift: file v${cw.version} != embedded v${CROSSWALK.version} -- run \`npm run sync:crosswalk\` before the next deploy`
                );
            }
            compile(cw.tags, p);
            return;
        } catch {
            // try the next candidate
        }
    }
    compile(CROSSWALK.tags as unknown as Record<string, CrosswalkTag>, "embedded snapshot");
})();

/** Display label for a canonical tag (used in CSV exports). */
export function tagLabel(tag: string): string {
    return labels[tag] ?? tag;
}

/**
 * A parcel's canonical feature tags for API responses. Prefers the
 * materialized parcels.improvement_tags column (the data session's batch pass
 * over the same crosswalk -- cheap and canonical) and falls back to deriving
 * from raw labels for parcels the batch hasn't covered yet (e.g. fill-on-blank
 * counties whose labels arrive per-tap). Boolean-column tags (pool/casita/shed)
 * are ALWAYS unioned in: some counties know has_pool from a roll flag without
 * any raw label, so the column alone can under-report them.
 */
export function tagsForParcel(
    columnTags: unknown,
    rawImprovements: unknown,
    flags: {
        pool?: boolean | null;
        casita?: boolean | null;
        shed?: boolean | null;
    }
): string[] {
    const base =
        Array.isArray(columnTags) && columnTags.length > 0
            ? columnTags.filter((t): t is string => typeof t === "string")
            : deriveTags(rawImprovements, {});
    const tags = new Set<string>(base);
    if (flags.pool === true) tags.add("pool");
    if (flags.casita === true) tags.add("casita");
    if (flags.shed === true) tags.add("shed_workshop");
    // Frederick's UX call (2026-07-15): generic garage is not a feature tag.
    tags.delete("garage");
    if (tags.has("boat_dock")) tags.add("waterfront");
    return [...tags];
}

/**
 * Label-derived tags only (crosswalk regexes over raw improvement labels).
 * Used as the fallback inside tagsForParcel; boolean flags are handled there.
 */
export function deriveTags(
    rawImprovements: unknown,
    flags: {
        pool?: boolean | null;
        casita?: boolean | null;
        shed?: boolean | null;
    }
): string[] {
    const tags = new Set<string>();
    if (flags.pool === true) tags.add("pool");
    if (flags.casita === true) tags.add("casita");
    if (flags.shed === true) tags.add("shed_workshop");

    if (Array.isArray(rawImprovements)) {
        for (const raw of rawImprovements) {
            if (typeof raw !== "string" || raw === "") continue;
            for (const t of compiled) {
                if (tags.has(t.tag)) continue;
                if (t.match.some((r) => r.test(raw)) && !t.exclude.some((r) => r.test(raw))) {
                    tags.add(t.tag);
                }
            }
        }
    }

    // Frederick's UX call (2026-07-15): attached garages are near-universal, so a
    // generic "garage" chip filters nothing -- only DETACHED garage is a feature.
    // The card's Garage row reads the has_garage column directly; the tag set
    // carries garage_detached only (from GAR/DG-style labels).
    tags.delete("garage");

    if (tags.has("boat_dock")) tags.add("waterfront");
    return [...tags];
}
