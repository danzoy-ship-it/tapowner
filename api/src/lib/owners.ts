// County records sometimes carry a placeholder string instead of a real owner
// name. These are neither displayable as an owner nor traceable (sending one to
// the skip-trace vendor just burns money on a guaranteed no-match). Detected by
// exact match against known tokens, or any value with no alphanumeric content
// (e.g. "-", "--", "."). Conservative on purpose: better to allow a trace on an
// odd-but-real name than to wrongly block one.
const PLACEHOLDER_OWNERS = new Set([
    "UNKNOWN",
    "UNKNOWN OWNER",
    "OWNER UNKNOWN",
    "CONFIDENTIAL",
    "N/A",
    "NA",
    "NONE",
    "NO OWNER",
    "NOT AVAILABLE",
    "WITHHELD",
    "PROTECTED",
    "TBD",
    "SEE NOTES",
    "REMOVED",
    "NULL",
]);

export function isPlaceholderOwner(name: string | null | undefined): boolean {
    if (!name) return true;
    const trimmed = name.trim();
    if (trimmed === "") return true;
    if (!/[a-z0-9]/i.test(trimmed)) return true; // only punctuation / dashes
    return PLACEHOLDER_OWNERS.has(trimmed.toUpperCase());
}
