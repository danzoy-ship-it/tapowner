// Roofer vertical (#2) signal resolver -- the PURE derivation core.
//
// Given raw rows already fetched from the DB (hail/wind parcel_signals, hail
// swath intersects, roof/solar permits, roof_material, and the distress
// court-record signals), this composes the roofer "signal bundle" for one
// parcel. No DB access lives here so it stays unit-testable exactly like
// lib/ownerSignals.ts -- the DB fetch + wiring lives in roofer/resolver.ts.
//
// Signals covered here (per ROOFER_SIGNALS.md / TAPROOFERS_SIGNALS.md):
//   - Hail (#1): UNION of SPC point-buffer rows and MRMS hail-swath intersects.
//     A parcel is hail-hit if EITHER source fires (MRMS < SPC on ~38% of dates,
//     so we never pick one -- we union). Max hail size + most-recent date +
//     repeat-hit (#3) fall out of the same union.
//   - Wind (#2 high-wind): SPC wind rows (max gust kt + most-recent date).
//   - Permit-derived: last roof-permit date, solar-tell (#14, roof top-of-mind),
//     claim-window (#4, hail 6-20mo ago AND no roof permit since the storm).
//   - roof_material enrichment: composition/wood -> reroof market; metal/tile/
//     slate -> long-life (deprioritise).
//   - Distress court records: code_violation (#21), pre_foreclosure, probate --
//     surfaced as-is to the ROOFER (app user). pre_foreclosure is recency-gated
//     (event_date >= today) exactly like the V1 invariant.
//
// ROOF AGE (#2 aging-out / #5 ACV-cliff / #6 non-renewal) is DELIBERATELY a
// pluggable slot that returns `unknown`/null for now. Roof-age sourcing is
// pending a vendor decision (a pay-per-call satellite/AI roof-age product), so
// we do NOT wire year_built/effective_year_built as the answer yet. The typed
// `RoofAge` shape + `RoofAgeSource` enum are locked so whichever source wins
// (vendor API, permit history, or the free year_built proxy floor) drops in
// later with zero rework -- see resolveRoofAge() below.

export type DateLike = string | Date | null | undefined;

// --- Roof age: the pluggable slot (see module header) ---------------------
// Tier precedence when a source is finally wired (best -> floor):
//   permit history > vendor_api (imagery) > year_built_proxy.
export type RoofAgeSource = "permit" | "vendor_api" | "year_built_proxy" | "unknown";

export interface RoofAge {
    /** Whole years of roof age, or null while the source is unresolved. */
    age_years: number | null;
    /** The base year the age was derived from (reroof year / built year), or null. */
    base_year: number | null;
    /** Which tier produced age_years. `unknown` until a source is wired. */
    source: RoofAgeSource;
    /** UI confidence label for the tier; null while unknown. */
    confidence: "high" | "medium" | "low" | null;
    /** >=15yr ACV cliff. null (not false) while unknown, so the UI can tell
     *  "no cliff" apart from "we don't know the age yet". */
    acv_cliff: boolean | null;
    /** >=20yr non-renewal band. null while unknown. */
    non_renewal_risk: boolean | null;
}

export const UNKNOWN_ROOF_AGE: RoofAge = {
    age_years: null,
    base_year: null,
    source: "unknown",
    confidence: null,
    acv_cliff: null,
    non_renewal_risk: null,
};

export interface HailSignal {
    hit: boolean;
    /** Best-known hail size in inches across SPC + swath, or null. */
    max_hail_in: number | null;
    last_event_date: string | null;
    /** Distinct storm dates seen (union of SPC + swath). */
    event_count: number;
    /** Which sources fired: subset of ["spc", "mrms_swath"]. */
    sources: string[];
    /** #3 repeat-hit: >=2 distinct hail dates = weakened roof. */
    repeat_hit: boolean;
}

export interface WindSignal {
    hit: boolean;
    max_wind_kt: number | null;
    last_event_date: string | null;
    event_count: number;
}

export interface ClaimWindow {
    /** #4: a hail event 6-20mo ago with NO roof permit filed since it. */
    open: boolean;
    hail_event_date: string | null;
    months_since: number | null;
}

export interface PermitSignals {
    last_roof_permit_date: string | null;
    last_solar_permit_date: string | null;
    /** #14 solar-tell: a solar permit within the last 24 months. */
    solar_recent: boolean;
    claim_window: ClaimWindow;
}

export type RoofMarket = "reroof" | "long_life" | null;

export interface RoofMaterialSignal {
    value: string | null;
    market: RoofMarket;
}

export type DistressType = "code_violation" | "pre_foreclosure" | "probate";

export interface DistressEvent {
    signal_type: DistressType;
    subtype: string | null;
    source: string | null;
    event_date: string | null;
    status: string | null;
}

export interface DistressSignals {
    code_violation: DistressEvent[];
    /** Recency-gated: only notices whose sale date is still ahead (>= today). */
    pre_foreclosure: DistressEvent[];
    probate: DistressEvent[];
}

export interface RooferSignalBundle {
    hail: HailSignal;
    wind: WindSignal;
    roof_age: RoofAge;
    permits: PermitSignals;
    roof_material: RoofMaterialSignal;
    distress: DistressSignals;
    /** Flat list of which signals fired -- the filter/badge vocabulary the
     *  area endpoint filters on. */
    signal_types: string[];
}

// --- Raw input (as fetched from the DB, before derivation) ----------------
export interface HailSpcRow {
    event_date: DateLike;
    hail_size_in: number | null;
}
export interface HailSwathRow {
    event_date: DateLike;
    min_hail_in: number | null;
}
export interface WindRow {
    event_date: DateLike;
    wind_speed_kt: number | null;
}
export interface PermitRow {
    issued_date: DateLike;
}
export interface DistressRow {
    signal_type: string;
    subtype: string | null;
    source: string | null;
    event_date: DateLike;
    status?: string | null;
}

export interface RooferSignalInput {
    /** Injectable clock for deterministic tests; defaults to now. */
    now?: Date;
    roof_material?: string | null;
    hail_spc?: HailSpcRow[];
    hail_swath?: HailSwathRow[];
    wind?: WindRow[];
    roof_permits?: PermitRow[];
    solar_permits?: PermitRow[];
    distress?: DistressRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const AVG_DAYS_PER_MONTH = 30.4375;
const CLAIM_WINDOW_MIN_MONTHS = 6;
const CLAIM_WINDOW_MAX_MONTHS = 20;
const SOLAR_RECENT_MONTHS = 24;

/** Normalise a pg date / ISO string / Date to a 'YYYY-MM-DD' string, or null. */
export function toISODate(d: DateLike): string | null {
    if (d == null) return null;
    if (typeof d === "string") {
        const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return m[0];
        const parsed = new Date(d);
        return Number.isFinite(parsed.getTime()) ? fmtLocal(parsed) : null;
    }
    if (d instanceof Date) {
        return Number.isFinite(d.getTime()) ? fmtLocal(d) : null;
    }
    return null;
}

function fmtLocal(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Parse an already-normalised 'YYYY-MM-DD' to a UTC-noon Date (DST-safe). */
function parseISO(iso: string): Date {
    return new Date(`${iso}T12:00:00Z`);
}

/** Whole months between an ISO date and `now` (approx, calendar-agnostic). */
function monthsSince(iso: string, now: Date): number {
    const days = (now.getTime() - parseISO(iso).getTime()) / DAY_MS;
    return Math.floor(days / AVG_DAYS_PER_MONTH);
}

/** Max of the finite numbers in the list, or null if none are finite. */
function maxFinite(nums: Array<number | null | undefined>): number | null {
    let best: number | null = null;
    for (const n of nums) {
        if (typeof n === "number" && Number.isFinite(n)) {
            best = best === null ? n : Math.max(best, n);
        }
    }
    return best;
}

/** Most recent (max) ISO date in the list, or null. */
function latestISO(dates: Array<string | null>): string | null {
    let best: string | null = null;
    for (const d of dates) {
        if (d && (best === null || d > best)) best = d;
    }
    return best;
}

export function deriveHail(spc: HailSpcRow[], swath: HailSwathRow[]): HailSignal {
    const spcDates = spc.map((r) => toISODate(r.event_date)).filter((d): d is string => d !== null);
    const swathDates = swath
        .map((r) => toISODate(r.event_date))
        .filter((d): d is string => d !== null);

    const sources: string[] = [];
    if (spcDates.length > 0) sources.push("spc");
    if (swathDates.length > 0) sources.push("mrms_swath");

    const distinctDates = new Set([...spcDates, ...swathDates]);
    const maxSize = maxFinite([
        ...spc.map((r) => r.hail_size_in),
        ...swath.map((r) => r.min_hail_in),
    ]);

    return {
        hit: distinctDates.size > 0,
        max_hail_in: maxSize,
        last_event_date: latestISO([...distinctDates]),
        event_count: distinctDates.size,
        sources,
        repeat_hit: distinctDates.size >= 2,
    };
}

export function deriveWind(wind: WindRow[]): WindSignal {
    const dates = wind.map((r) => toISODate(r.event_date)).filter((d): d is string => d !== null);
    const distinct = new Set(dates);
    return {
        hit: distinct.size > 0,
        max_wind_kt: maxFinite(wind.map((r) => r.wind_speed_kt)),
        last_event_date: latestISO([...distinct]),
        event_count: distinct.size,
    };
}

/**
 * ROOF AGE -- pluggable slot. Returns `unknown` for now (roof-age sourcing is
 * pending a vendor decision; see the module header). When a source is chosen,
 * compute age here from the highest-available tier and return the real shape --
 * callers already consume `RoofAge`, so nothing downstream changes. The wiring
 * point is intentionally isolated to this one function.
 */
export function resolveRoofAge(_input: RooferSignalInput): RoofAge {
    // Wiring point (do NOT enable until the vendor/roof-age decision lands):
    //   1. permit history   -> latest roof-permit issued year, confidence:"high"
    //   2. vendor_api        -> imagery roof-age lookup,       confidence:"high"
    //   3. year_built_proxy  -> COALESCE(effective_year_built, year_built),
    //                           confidence:"low", labelled "original roof assumed"
    //   acv_cliff = age >= 15; non_renewal_risk = age >= 20 (a reroof permit
    //   date ALWAYS overrides year_built -- carriers get sued for that error).
    return { ...UNKNOWN_ROOF_AGE };
}

export function derivePermits(
    roofPermits: PermitRow[],
    solarPermits: PermitRow[],
    hailDates: string[],
    now: Date
): PermitSignals {
    const lastRoof = latestISO(
        roofPermits.map((p) => toISODate(p.issued_date))
    );
    const lastSolar = latestISO(
        solarPermits.map((p) => toISODate(p.issued_date))
    );

    const solarRecent =
        lastSolar !== null && monthsSince(lastSolar, now) <= SOLAR_RECENT_MONTHS;

    // Claim window (#4): the most-recent hail event that is 6-20 months old AND
    // has NO roof permit filed since it (i.e. the owner hasn't re-roofed).
    let claim: ClaimWindow = { open: false, hail_event_date: null, months_since: null };
    const inWindow = hailDates
        .map((d) => ({ d, m: monthsSince(d, now) }))
        .filter(({ m }) => m >= CLAIM_WINDOW_MIN_MONTHS && m <= CLAIM_WINDOW_MAX_MONTHS)
        .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)); // most recent first

    const candidate = inWindow[0];
    if (candidate) {
        const reroofedSince = lastRoof !== null && lastRoof >= candidate.d;
        claim = {
            open: !reroofedSince,
            hail_event_date: candidate.d,
            months_since: candidate.m,
        };
    }

    return {
        last_roof_permit_date: lastRoof,
        last_solar_permit_date: lastSolar,
        solar_recent: solarRecent,
        claim_window: claim,
    };
}

const LONG_LIFE_TOKENS = ["metal", "tile", "slate", "clay", "concrete"];
const REROOF_TOKENS = ["composition", "comp", "shingle", "asphalt", "wood", "shake", "built_up", "built-up", "membrane", "tar", "gravel"];

export function classifyRoofMaterial(value: string | null | undefined): RoofMaterialSignal {
    if (value == null || value.trim() === "") return { value: null, market: null };
    const v = value.toLowerCase();
    // Long-life first: a "metal tile" reads as metal. Deprioritise these.
    if (LONG_LIFE_TOKENS.some((t) => v.includes(t))) return { value, market: "long_life" };
    if (REROOF_TOKENS.some((t) => v.includes(t))) return { value, market: "reroof" };
    return { value, market: null };
}

export function deriveDistress(rows: DistressRow[], now: Date): DistressSignals {
    const out: DistressSignals = { code_violation: [], pre_foreclosure: [], probate: [] };
    const todayISO = fmtLocal(now);

    for (const r of rows) {
        const type = r.signal_type;
        if (type !== "code_violation" && type !== "pre_foreclosure" && type !== "probate") {
            continue;
        }
        const event: DistressEvent = {
            signal_type: type,
            subtype: r.subtype ?? null,
            source: r.source ?? null,
            event_date: toISODate(r.event_date),
            status: r.status ?? null,
        };
        // pre_foreclosure recency gate (V1 invariant): a notice is only "pre"
        // while the auction date is still ahead. A missing date is dropped from
        // the label (can't prove it's still pending), same as the V1 farm rule.
        if (type === "pre_foreclosure") {
            if (event.event_date !== null && event.event_date >= todayISO) {
                out.pre_foreclosure.push(event);
            }
            continue;
        }
        out[type].push(event);
    }
    return out;
}

function buildSignalTypes(bundle: Omit<RooferSignalBundle, "signal_types">): string[] {
    const types: string[] = [];
    if (bundle.hail.hit) types.push("hail");
    if (bundle.hail.repeat_hit) types.push("hail_repeat");
    if (bundle.wind.hit) types.push("wind");
    if (bundle.permits.claim_window.open) types.push("claim_window");
    if (bundle.permits.solar_recent) types.push("solar_intent");
    if (bundle.permits.last_roof_permit_date !== null) types.push("roof_permit");
    if (bundle.roof_material.market === "reroof") types.push("reroof_material");
    if (bundle.distress.code_violation.length > 0) types.push("code_violation");
    if (bundle.distress.pre_foreclosure.length > 0) types.push("pre_foreclosure");
    if (bundle.distress.probate.length > 0) types.push("probate");
    return types;
}

/** Compose the full roofer signal bundle from raw fetched rows. Pure. */
export function composeRooferSignals(input: RooferSignalInput): RooferSignalBundle {
    const now = input.now ?? new Date();
    const hail = deriveHail(input.hail_spc ?? [], input.hail_swath ?? []);
    const wind = deriveWind(input.wind ?? []);
    const roof_age = resolveRoofAge(input);

    // Claim window unions SPC + swath hail dates (the same union as `hail`).
    const hailDates = [
        ...(input.hail_spc ?? []).map((r) => toISODate(r.event_date)),
        ...(input.hail_swath ?? []).map((r) => toISODate(r.event_date)),
    ].filter((d): d is string => d !== null);

    const permits = derivePermits(
        input.roof_permits ?? [],
        input.solar_permits ?? [],
        hailDates,
        now
    );
    const roof_material = classifyRoofMaterial(input.roof_material);
    const distress = deriveDistress(input.distress ?? [], now);

    const partial = { hail, wind, roof_age, permits, roof_material, distress };
    return { ...partial, signal_types: buildSignalTypes(partial) };
}
