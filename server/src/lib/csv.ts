/** RFC 4180 escaping, plus a guard against spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // A cell starting =, +, - or @ is executed as a formula by Excel/Sheets when
  // the file is opened — a lead named "=cmd|..." would run on the operator's
  // machine. Prefixing a quote neutralises it.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
}
