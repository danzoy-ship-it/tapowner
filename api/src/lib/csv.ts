// RFC-4180 CSV cell: quote when the value contains a comma, quote, or newline,
// and double any embedded quotes.
export function csvCell(value: unknown): string {
    const s = value == null ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
