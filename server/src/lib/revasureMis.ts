/**
 * Revasure MIS status parsing — pure, no DB, no I/O beyond reading the uploaded
 * spreadsheet buffer.
 *
 * Revasure has NO API to report an applicant's status back, so the admin uploads
 * their periodic "MIS" sheet (Excel/CSV). We parse it here into normalised rows;
 * the route (adminRevasureMis.routes.ts) matches each row to a RevasureLead by
 * the applicant's MOBILE NUMBER against the SwiftLoan customer database and writes
 * the status/amounts onto the lead. A row is only ever applied when its mobile
 * resolves to exactly one customer who has a Revasure lead — never guessed.
 *
 * Sheet columns (header names are matched case/spacing-insensitively, with
 * aliases): Date, Name, Mobile Number, Loan Amt, Salary Mode, Status, Remark,
 * Approved Amt, Disbursed Amt, Disbursement Date.
 */
import * as XLSX from 'xlsx';
import { normalisePhone } from './dialer.js';

/** Canonicalise a header cell: lowercase, strip all non-alphanumerics. */
export function canonHeader(h: string): string {
  return String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Header alias → our field name. Keyed by canonHeader() output.
const COLUMN_ALIASES: Record<string, string> = {
  date: 'date',
  name: 'name',
  customername: 'name',
  applicantname: 'name',
  mobilenumber: 'mobile',
  mobile: 'mobile',
  mobileno: 'mobile',
  phone: 'mobile',
  phonenumber: 'mobile',
  contact: 'mobile',
  contactnumber: 'mobile',
  loanamt: 'loanAmount',
  loanamount: 'loanAmount',
  amount: 'loanAmount',
  salarymode: 'salaryMode',
  status: 'status',
  remark: 'remark',
  remarks: 'remark',
  approvedamt: 'approvedAmount',
  approvedamount: 'approvedAmount',
  sanctionedamt: 'approvedAmount',
  sanctionedamount: 'approvedAmount',
  disbursedamt: 'disbursedAmount',
  disbursedamount: 'disbursedAmount',
  disbursementdate: 'disbursementDate',
  disbursedate: 'disbursementDate',
  disbursaldate: 'disbursementDate',
};

// Known status synonyms → a canonical, display-friendly label. Anything not
// listed is passed through trimmed (so no data is lost), with `known: false`.
const STATUS_CANON: Record<string, string> = {
  disbursed: 'Disbursed',
  disbursal: 'Disbursed',
  disburse: 'Disbursed',
  approved: 'Approved',
  sanctioned: 'Approved',
  sanction: 'Approved',
  rejected: 'Rejected',
  reject: 'Rejected',
  declined: 'Rejected',
  decline: 'Rejected',
  pending: 'Pending',
  inprocess: 'In Process',
  processing: 'In Process',
  underprocess: 'In Process',
  underreview: 'In Process',
  login: 'Login',
  logged: 'Login',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  withdrawn: 'Cancelled',
  duplicate: 'Duplicate',
  ineligible: 'Ineligible',
  noteligible: 'Ineligible',
  hold: 'On Hold',
  onhold: 'On Hold',
};

export interface MisStatus {
  /** Display label (canonical when recognised, otherwise the trimmed original). */
  label: string;
  /** Whether it matched a known synonym (unknown statuses are still kept). */
  known: boolean;
}

/** Normalise a raw status cell. Returns null for an empty cell. */
export function normalizeMisStatus(raw: unknown): MisStatus | null {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const canon = STATUS_CANON[canonHeader(s)];
  return canon ? { label: canon, known: true } : { label: s, known: false };
}

/** Parse an amount cell to a whole-rupee integer, or null. Tolerates ₹, commas, decimals. */
export function parseMisAmount(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Excel serial date (days since 1899-12-30) → Date (UTC midnight), or null. */
function fromExcelSerial(n: number): Date | null {
  if (!Number.isFinite(n) || n <= 0 || n > 2958465) return null; // 2958465 = 9999-12-31
  // MIS dates are date-only; round to a whole day so sub-day serial noise can't
  // shift the result off UTC midnight. 25569 = days between 1899-12-30 and epoch.
  const ms = (Math.round(n) - 25569) * 86400 * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parse a date cell. Handles:
 *  - "24-Oct-26" / "24-Oct-2026" / "24 Oct 26" (day-month-year, the MIS format)
 *  - "2026-10-24" / "24/10/2026" / "24-10-2026" (dd/mm/yyyy, India convention)
 *  - a JS Date (xlsx cellDates) or an Excel serial number.
 * Two-digit years map to 2000-2099. Returns a UTC-midnight Date, or null.
 */
export function parseMisDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return fromExcelSerial(v);

  const s = String(v).trim();
  if (!s) return null;

  // DD-Mon-YY / DD Mon YYYY
  const named = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,})[\s\-/](\d{2,4})$/);
  if (named) {
    const day = Number(named[1]);
    const mon = MONTHS[named[2].slice(0, 3).toLowerCase()];
    let year = Number(named[3]);
    if (mon == null) return null;
    if (year < 100) year += 2000;
    return mkUtc(year, mon, day);
  }

  // YYYY-MM-DD (ISO-ish)
  const iso = s.match(/^(\d{4})[\-/](\d{1,2})[\-/](\d{1,2})/);
  if (iso) return mkUtc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  // DD/MM/YY(YY) or DD-MM-YY(YY) — India convention (day first)
  const dmy = s.match(/^(\d{1,2})[\-/](\d{1,2})[\-/](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    return mkUtc(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }
  return null;
}

function mkUtc(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month, day));
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface MisRow {
  /** 1-based row number in the sheet (header = row 1), for error reporting. */
  rowNumber: number;
  rawName: string | null;
  /** Normalised 10-digit mobile, or null if missing/invalid. */
  mobile: string | null;
  loanAmount: number | null;
  salaryMode: string | null;
  status: MisStatus | null;
  remark: string | null;
  approvedAmount: number | null;
  disbursedAmount: number | null;
  disbursementDate: Date | null;
}

const str = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim();
  return s || null;
};

/** Is every mapped field of this raw row empty? (blank padding rows in the sheet) */
function isBlank(mapped: Record<string, unknown>): boolean {
  return ['date', 'name', 'mobile', 'loanAmount', 'status', 'remark', 'approvedAmount', 'disbursedAmount', 'disbursementDate']
    .every((k) => mapped[k] == null || String(mapped[k]).trim() === '');
}

export interface ParsedMis {
  rows: MisRow[];
  /** Fatal parse problem (bad file, no sheet, no recognisable headers). */
  error?: string;
}

/**
 * Parse an uploaded MIS spreadsheet buffer (xlsx/xls/csv) into normalised rows.
 * Blank padding rows are dropped. Does NOT touch the database.
 */
export function parseMisBuffer(buffer: Buffer): ParsedMis {
  let raw: Record<string, unknown>[];
  try {
    // No cellDates: date cells arrive as strings (CSV) or Excel serials (xlsx),
    // both handled UTC-safely by parseMisDate — cellDates would convert to a
    // LOCAL-midnight Date and shift the day in non-UTC timezones.
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return { rows: [], error: 'Spreadsheet has no sheets' };
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
  } catch (e: any) {
    return { rows: [], error: `Could not parse the spreadsheet: ${e?.message ?? e}` };
  }

  // Confirm at least the columns we rely on are present.
  const headerKeys = raw.length ? Object.keys(raw[0]).map((h) => COLUMN_ALIASES[canonHeader(h)]).filter(Boolean) : [];
  if (!headerKeys.includes('mobile') || !headerKeys.includes('status')) {
    return { rows: [], error: 'The sheet must have a "Mobile Number" and a "Status" column.' };
  }

  const rows: MisRow[] = [];
  raw.forEach((row, i) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const target = COLUMN_ALIASES[canonHeader(key)];
      if (target && mapped[target] == null) mapped[target] = value;
    }
    if (isBlank(mapped)) return;
    rows.push({
      rowNumber: i + 2, // +1 for header, +1 for 1-based
      rawName: str(mapped.name),
      mobile: normalisePhone(mapped.mobile),
      loanAmount: parseMisAmount(mapped.loanAmount),
      salaryMode: str(mapped.salaryMode),
      status: normalizeMisStatus(mapped.status),
      remark: str(mapped.remark),
      approvedAmount: parseMisAmount(mapped.approvedAmount),
      disbursedAmount: parseMisAmount(mapped.disbursedAmount),
      disbursementDate: parseMisDate(mapped.disbursementDate),
    });
  });

  return { rows };
}

/** Why a parsed row could not be applied (before any DB match is attempted). */
export type MisRowIssue = 'missing_mobile' | 'invalid_mobile' | 'missing_status';

/** Pure, DB-free validation of a single parsed row. Returns null when the row is usable. */
export function misRowIssue(row: MisRow, rawMobilePresent: boolean): MisRowIssue | null {
  if (!row.mobile) return rawMobilePresent ? 'invalid_mobile' : 'missing_mobile';
  if (!row.status) return 'missing_status';
  return null;
}
