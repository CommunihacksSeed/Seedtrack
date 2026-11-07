/** Minimal RFC 4180 CSV writer. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "";
    let s = Array.isArray(v) ? v.join("; ") : String(v);
    // Guard against spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
