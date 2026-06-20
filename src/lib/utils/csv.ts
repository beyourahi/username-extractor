/**
 * Minimal RFC 4180 CSV serialization. Pure + dependency-free so it runs in the
 * Worker and is unit-testable. Used by the leads export endpoint.
 */

/** Quote a single field: wrap in double quotes and escape internal quotes when it contains `,` `"` CR or LF. */
export function csvField(value: unknown): string {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize a header + rows to a CRLF-delimited CSV string. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
    const lines = [header.map(csvField).join(",")];
    for (const row of rows) {
        lines.push(row.map(csvField).join(","));
    }
    return lines.join("\r\n");
}
