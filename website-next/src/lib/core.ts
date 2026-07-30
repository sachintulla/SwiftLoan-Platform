/* =========================================================
   SwiftLoan.ai — Core (pure, testable logic)
   Ported from website/js/core.js — no DOM here.
   ========================================================= */

export function fmtINR(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

/** P: principal, annualPct: annual interest %, months: tenure */
export function emi(P: number, annualPct: number, months: number): number {
  P = +P;
  annualPct = +annualPct;
  months = +months;
  if (!(P > 0) || !(months > 0)) return 0;
  const r = annualPct / 12 / 100;
  if (r === 0) return P / months;
  const pow = Math.pow(1 + r, months);
  return (P * r * pow) / (pow - 1);
}

export interface EmiBreakdown {
  emi: number;
  total: number;
  interest: number;
  principalRatio: number;
}

export function emiBreakdown(P: number, annualPct: number, months: number): EmiBreakdown {
  const e = emi(P, annualPct, months);
  const total = e * months;
  const interest = total - P;
  return {
    emi: e,
    total,
    interest,
    principalRatio: total > 0 ? P / total : 0,
  };
}

export interface AmountBounds {
  min: number;
  max: number;
}

const BOUNDS: Record<string, AmountBounds> = {
  'Personal Loan': { min: 50000, max: 2500000 },
  'Business Loan': { min: 100000, max: 7500000 },
};

export function amountBounds(loanType?: string | null): AmountBounds {
  return (loanType && BOUNDS[loanType]) || { min: 50000, max: 7500000 };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_RE = /^[6-9]\d{9}$/;

export interface ValidateCtx {
  loanType?: string;
}

export function validateField(name: string, value: unknown, ctx: ValidateCtx = {}): string {
  const v = value == null ? '' : String(value);
  switch (name) {
    case 'loanType':
      return v ? '' : 'Please select a loan type.';
    case 'loanAmount': {
      if (!v.trim()) return 'Enter an amount.';
      const n = Number(v);
      if (isNaN(n)) return 'Enter a valid amount.';
      const b = amountBounds(ctx.loanType);
      if (n < b.min) return 'Minimum for ' + (ctx.loanType || 'this loan') + ' is ' + fmtINR(b.min) + '.';
      if (n > b.max) return 'Maximum for ' + (ctx.loanType || 'this loan') + ' is ' + fmtINR(b.max) + '.';
      return '';
    }
    case 'fullName':
      return v.trim().length < 3 ? 'Enter your full name.' : '';
    case 'phone':
      return PHONE_RE.test(v.trim()) ? '' : 'Enter a valid 10-digit mobile number.';
    case 'email':
      return EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email address.';
    default:
      return '';
  }
}

export function normaliseId(id: unknown): string {
  return (id == null ? '' : String(id)).trim().toUpperCase();
}

export interface TrackerStep {
  t: string;
  d: string;
}

export interface TrackedApp {
  type: string;
  amount: string;
  stage: number;
  steps: TrackerStep[];
  footIcon: string;
  foot: string;
}

export function lookupApp(
  id: unknown,
  apps: Record<string, TrackedApp>
): { key: string; app: TrackedApp | null } {
  const key = normaliseId(id);
  return { key, app: (apps && apps[key]) || null };
}

export function makeRefId(rng?: () => number): string {
  const r = typeof rng === 'function' ? rng() : Math.random();
  return 'SL-' + Math.floor(1000 + r * 9000);
}
