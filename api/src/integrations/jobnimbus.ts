// JobNimbus lead-export integration (reference implementation).
//
// Reusable module for pushing a TapOwner lead into a roofer's JobNimbus CRM
// as a contact. Built ahead of the roofer app (vertical #2, not built yet --
// see VERTICALS_STRATEGY.md / TAPROOFERS_SIGNALS.md) so it's ready to wire
// into a route (e.g. `POST /leads/:id/export/jobnimbus`) without a redesign.
//
// See JOBNIMBUS_INTEGRATION.md at the repo root for the full design doc:
// field-mapping rationale, the record_type_name/status_name wrinkle, dedup
// strategy, sync model, and rate-limit/retry policy.
//
// NOT WIRED UP: there is no live JobNimbus account or API key to test
// against. `pushLeadToJobNimbus()` must never be called outside a mocked
// `fetchImpl` (see the unit tests) until a real account is available.
//
// No API key is ever hardcoded here -- callers pass the roofer's own key
// (stored encrypted, per-account, per JOBNIMBUS_INTEGRATION.md's "Auth &
// key storage" section).

const JOBNIMBUS_BASE_URL = "https://app.jobnimbus.com/api1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_BACKOFF_MS = 500;

// Account-specific pipeline values (JOBNIMBUS_FACTS: record_type_name /
// status_name are configured per JobNimbus account, so there's no universal
// "correct" value). These are sane out-of-the-box defaults for a fresh
// JobNimbus account; callers should override via PushLeadOptions once the
// roofer has told TapOwner their real pipeline names (see spec doc, section
// "record_type_name / status_name").
export const DEFAULT_RECORD_TYPE_NAME = "Lead";
export const DEFAULT_STATUS_NAME = "New";

// ---------------------------------------------------------------------------
// Input shape: what TapOwner knows about a roofer lead.
// ---------------------------------------------------------------------------

export interface JobNimbusLead {
    /** TapOwner's own lead id. Never sent to JobNimbus -- used for logging
     *  and embedded (as an opaque ref, not a description) in the CRM note so
     *  a failed push can be correlated back to this lead. */
    id: string;
    ownerName: string | null;
    phone: string | null;
    email: string | null;
    situsNumber: string | null;
    situsStreet: string | null;
    situsCity: string | null;
    situsState: string | null;
    situsZip: string | null;
    lat: number | null;
    lng: number | null;
    /** Internal signal_type code, e.g. "roof_damage", "code_violation",
     *  "foreclosure" (parcel_signals.signal_type family -- see
     *  ROOFER_SIGNALS.md / SIGNALS_ROADMAP.md). Used ONLY to pick a generic
     *  outreach-safe bucket label -- never sent to JobNimbus as-is. */
    signalType: string;
    /** Raw, human-readable trigger text, e.g. "hail 5/28/24 -- 1.75in" or
     *  "foreclosure notice filed 2026-06-01". INTERNAL ONLY. Deliberately
     *  NOT read by mapLeadToContact() -- see the ethics guard on
     *  buildDescription() below. Kept on the type so callers/loggers have it
     *  available, but this module must never forward it to a third party. */
    signalLabel: string;
}

// ---------------------------------------------------------------------------
// Output shape: the JobNimbus /contacts POST payload.
// ---------------------------------------------------------------------------

export interface JobNimbusGeo {
    lat: number;
    lon: number;
}

export interface JobNimbusContactPayload {
    first_name?: string;
    last_name?: string;
    company?: string;
    record_type_name: string;
    status_name: string;
    email?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    state_text?: string;
    zip?: string;
    // Best-effort per the verified facts ("geo for lat/lng" exists on the
    // JobNimbus API surface, exact field shape on /contacts unconfirmed --
    // see spec doc "Open questions"). Unrecognized JSON fields are typically
    // ignored by REST APIs rather than rejected, but confirm against a real
    // account before depending on this making it into the record.
    geo?: JobNimbusGeo;
    description?: string;
}

export class JobNimbusMappingError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "JobNimbusMappingError";
    }
}

export interface MapLeadOptions {
    /** Overrides DEFAULT_RECORD_TYPE_NAME. */
    recordTypeName?: string;
    /** Overrides DEFAULT_STATUS_NAME. */
    statusName?: string;
    /** Set false to omit the geo block entirely (e.g. once confirmed the
     *  account's schema doesn't accept it). Default true. */
    includeGeo?: boolean;
}

// Business-entity tokens that mean "send as `company`", not first/last name.
// Texas county rolls are full of these (LLC/LP trusts, ISDs, municipalities,
// churches) mixed in with individual owners.
const ENTITY_TOKENS =
    /\b(LLC|L L C|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LP|LLP|LTD|TRUST|TRUSTEE|ESTATE OF|ESTATE|PARTNERSHIP|HOLDINGS|PROPERTIES|INVESTMENTS|GROUP|BANK|CHURCH|ISD|COUNTY OF|CITY OF)\b/;

function isLikelyBusinessEntity(name: string): boolean {
    return ENTITY_TOKENS.test(name.toUpperCase());
}

// County rolls are typically "LAST, FIRST MIDDLE" or occasionally plain
// "FIRST LAST". Best-effort split -- gets the common cases right; a wrong
// split still lands a legible name in JobNimbus (worst case, first_name is
// empty and everything's in last_name, which JobNimbus accepts).
function splitOwnerName(name: string): { firstName?: string; lastName?: string } {
    const trimmed = name.trim();
    if (trimmed.includes(",")) {
        const [last, rest] = trimmed.split(",", 2).map((s) => s.trim());
        return {
            ...(rest ? { firstName: rest } : {}),
            ...(last ? { lastName: last } : {}),
        };
    }
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return {};
    if (parts.length === 1) return { lastName: parts[0]! };
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1]! };
}

// County data is ALL CAPS. Title-case individual names for a legible CRM
// record; deliberately NOT applied to `company` (would mangle acronyms like
// "LLC" -> "Llc").
function titleCase(value: string): string {
    return value.toLowerCase().replace(/\b\p{L}/gu, (ch) => ch.toUpperCase());
}

function deriveNameFields(
    ownerName: string
): Pick<JobNimbusContactPayload, "first_name" | "last_name" | "company"> {
    if (isLikelyBusinessEntity(ownerName)) {
        return { company: ownerName.trim() };
    }
    const { firstName, lastName } = splitOwnerName(ownerName);
    if (!firstName && !lastName) {
        // Shouldn't happen given the isLikelyBusinessEntity/blank guards
        // above and in mapLeadToContact, but fall back to `company` so we
        // never silently drop a non-empty name.
        return { company: ownerName.trim() };
    }
    return {
        ...(firstName ? { first_name: titleCase(firstName) } : {}),
        ...(lastName ? { last_name: titleCase(lastName) } : {}),
    };
}

function buildAddressLine1(lead: JobNimbusLead): string | undefined {
    const line = [lead.situsNumber, lead.situsStreet]
        .map((v) => (v ?? "").trim())
        .filter(Boolean)
        .join(" ");
    return line || undefined;
}

// Internal signal_type -> outreach-safe generic bucket label. See
// ROOFER_SIGNALS.md ("signal never surfaces in outreach" discipline, same
// rule as probate/foreclosure) -- a signal like foreclosure or a code
// violation must never appear as raw text anywhere a roofer could copy it
// straight into homeowner-facing outreach, including a CRM note field.
const SIGNAL_LABELS: Record<string, string> = {
    roof_damage: "Recent severe-weather area",
    wind_roof_damage: "Recent severe-weather area",
    hail: "Recent severe-weather area",
    roof_age: "Roof-age / insurance-review flag",
    insurance_cliff: "Roof-age / insurance-review flag",
    code_violation: "Property-condition flag",
    foreclosure: "Ownership-status flag",
    probate: "Ownership-status flag",
    tenure: "Likely-to-sell flag",
    senior_owner: "Likely-to-sell flag",
    homestead: "Likely-to-sell flag",
};
const DEFAULT_SIGNAL_LABEL = "TapOwner lead flag";

function genericSignalLabel(signalType: string): string {
    return SIGNAL_LABELS[signalType] ?? DEFAULT_SIGNAL_LABEL;
}

// ETHICS GUARD: this function reads lead.signalType (a code) to pick a
// generic bucket label -- it must NEVER read lead.signalLabel (the raw,
// potentially sensitive human-readable trigger). Do not "helpfully" append
// signalLabel here; that's the exact leak this module exists to prevent.
function buildDescription(lead: JobNimbusLead): string {
    return `Source: TapOwner Reverse Prospecting. Category: ${genericSignalLabel(lead.signalType)}. TapOwner lead ref: ${lead.id}.`;
}

/**
 * Pure mapping from a TapOwner lead to a JobNimbus /contacts POST payload.
 * No network I/O -- unit-testable in isolation. Throws JobNimbusMappingError
 * if the lead has no usable name (JobNimbus requires at least one of
 * first_name / last_name / company).
 */
export function mapLeadToContact(lead: JobNimbusLead, opts: MapLeadOptions = {}): JobNimbusContactPayload {
    const ownerName = (lead.ownerName ?? "").trim();
    if (!ownerName) {
        throw new JobNimbusMappingError(
            `Lead ${lead.id} has no owner name -- JobNimbus requires at least one of first_name/last_name/company`
        );
    }

    const addressLine1 = buildAddressLine1(lead);
    const includeGeo = opts.includeGeo ?? true;
    const hasGeo = includeGeo && typeof lead.lat === "number" && typeof lead.lng === "number";

    return {
        ...deriveNameFields(ownerName),
        record_type_name: opts.recordTypeName ?? DEFAULT_RECORD_TYPE_NAME,
        status_name: opts.statusName ?? DEFAULT_STATUS_NAME,
        ...(lead.email ? { email: lead.email.trim() } : {}),
        ...(lead.phone ? { phone: lead.phone.trim() } : {}),
        ...(addressLine1 ? { address_line1: addressLine1 } : {}),
        ...(lead.situsCity ? { city: titleCase(lead.situsCity.trim()) } : {}),
        ...(lead.situsState ? { state_text: lead.situsState.trim().toUpperCase() } : {}),
        ...(lead.situsZip ? { zip: lead.situsZip.trim() } : {}),
        ...(hasGeo ? { geo: { lat: lead.lat as number, lon: lead.lng as number } } : {}),
        description: buildDescription(lead),
    };
}

// ---------------------------------------------------------------------------
// Network call.
// ---------------------------------------------------------------------------

export type JobNimbusErrorKind =
    | "invalid_lead"
    | "auth"
    | "rate_limited"
    | "client_error"
    | "server_error"
    | "network_error"
    | "timeout";

export interface JobNimbusError {
    kind: JobNimbusErrorKind;
    message: string;
    status?: number;
    retryable: boolean;
}

export type JobNimbusPushResult =
    | { ok: true; jnid: string; contact: JobNimbusContactPayload }
    | { ok: false; error: JobNimbusError };

// Minimal duck-typed response shape -- only what this module reads. Lets
// tests hand in a plain object instead of a real fetch Response.
interface FetchLikeResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers?: { get(name: string): string | null };
    json(): Promise<unknown>;
}

export type FetchLike = (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }
) => Promise<FetchLikeResponse>;

export interface PushLeadOptions extends MapLeadOptions {
    /** Abort the request after this many ms. Default 15000. */
    timeoutMs?: number;
    /** Retries on retryable errors (429 / 5xx / network / timeout) only.
     *  Default 2 (3 attempts total). */
    maxRetries?: number;
    /** Injectable fetch for tests. Defaults to the global fetch. NEVER call
     *  pushLeadToJobNimbus without stubbing this in a test -- there is no
     *  live JobNimbus account to hit. */
    fetchImpl?: FetchLike;
}

function classifyStatus(status: number): JobNimbusErrorKind {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "server_error";
    return "client_error";
}

function isRetryable(kind: JobNimbusErrorKind): boolean {
    return kind === "rate_limited" || kind === "server_error" || kind === "network_error" || kind === "timeout";
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff w/ jitter, honoring a Retry-After header (seconds) if
// the server sent one on a 429.
function backoffMs(attempt: number, retryAfterHeader?: string | null): number {
    if (retryAfterHeader) {
        const secs = Number(retryAfterHeader);
        if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
    }
    return RETRY_BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

/**
 * Maps `lead` to a JobNimbus contact and POSTs it to /contacts, retrying
 * transient failures (429 / 5xx / network / timeout) with backoff. Never
 * retries auth failures or 4xx validation errors. Never throws -- all
 * outcomes (including the mapping failing) come back as a typed
 * JobNimbusPushResult so a route handler can surface a clean message to the
 * user without a try/catch.
 */
export async function pushLeadToJobNimbus(
    apiKey: string,
    lead: JobNimbusLead,
    opts: PushLeadOptions = {}
): Promise<JobNimbusPushResult> {
    let contact: JobNimbusContactPayload;
    try {
        contact = mapLeadToContact(lead, opts);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, error: { kind: "invalid_lead", message, retryable: false } };
    }

    const fetchFn: FetchLike = opts.fetchImpl ?? (fetch as unknown as FetchLike);
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;

    let lastError: JobNimbusError | undefined;
    // Set from a 429's Retry-After header so the *next* iteration's backoff
    // honors it, instead of sleeping twice (once for Retry-After, again for
    // the generic exponential backoff).
    let retryAfterHeader: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
            await sleep(backoffMs(attempt, retryAfterHeader));
            retryAfterHeader = null;
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchFn(`${JOBNIMBUS_BASE_URL}/contacts`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(contact),
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (res.ok) {
                const body = (await res.json()) as { jnid?: unknown };
                if (typeof body.jnid !== "string") {
                    return {
                        ok: false,
                        error: { kind: "client_error", message: "JobNimbus returned 2xx with no jnid in the body", retryable: false },
                    };
                }
                return { ok: true, jnid: body.jnid, contact };
            }

            const kind = classifyStatus(res.status);
            const retryable = isRetryable(kind);
            lastError = {
                kind,
                message: `JobNimbus request failed: ${res.status} ${res.statusText}`,
                status: res.status,
                retryable,
            };
            if (!retryable || attempt === maxRetries) {
                return { ok: false, error: lastError };
            }
            if (kind === "rate_limited") {
                retryAfterHeader = res.headers?.get("retry-after") ?? null;
            }
        } catch (err) {
            clearTimeout(timer);
            const timedOut = err instanceof Error && err.name === "AbortError";
            lastError = {
                kind: timedOut ? "timeout" : "network_error",
                message: timedOut
                    ? `JobNimbus request timed out after ${timeoutMs}ms`
                    : `JobNimbus request failed: ${err instanceof Error ? err.message : String(err)}`,
                retryable: true,
            };
            if (attempt === maxRetries) {
                return { ok: false, error: lastError };
            }
        }
    }

    // Unreachable in practice (the loop always returns on its last
    // iteration), but keeps the function's return type honest.
    return { ok: false, error: lastError ?? { kind: "network_error", message: "Unknown failure", retryable: true } };
}
