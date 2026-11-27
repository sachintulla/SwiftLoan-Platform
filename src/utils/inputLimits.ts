/**
 * Shared character caps for free-text inputs across the application funnel
 * (basic.tsx, moredetails.tsx, aboutyou.tsx, profile.tsx). These are the UX
 * layer only — a `maxLength` here stops normal typing/pasting from running
 * away, but a caller that skips the app entirely and hits the API directly
 * isn't bound by anything client-side, so the *same* limits are also
 * enforced server-side (server/src/modules/users.routes.ts's `profilePatch`
 * and context.routes.ts's `contextSaveFields` — keep both sides in sync if
 * these ever change).
 *
 * Sizes: 60 for name-shaped fields, 100 for company/city/state/qualification-
 * shaped ones, 300 for free-form address lines, 254 for email (RFC 5321's
 * own cap). MONEY_DIGITS bounds a plain-digit-string amount field (income,
 * obligations) — 9 digits is up to ~99.99 crore, comfortably above any real
 * value this app ever asks for, while still rejecting pathological input.
 */
export const NAME_MAX = 60;
export const MID_MAX = 100;
export const ADDR_MAX = 300;
export const EMAIL_MAX = 254;
export const MONEY_DIGITS = 9;

/**
 * Lowest monthly income this app will accept as a real value — well below
 * what any partner lender would actually approve, but enough to reject the
 * "0" / "100" / blank cases that made it look unvalidated. Same number is
 * enforced server-side (users.routes.ts's profilePatch, context.routes.ts's
 * contextSaveFields).
 */
export const MONTHLY_INCOME_MIN = 5000;

/**
 * PAN-card names are always Latin script (English), regardless of the app's
 * own display language — so this charset restriction applies even when
 * Hindi/Telugu is selected. Letters, spaces, and the punctuation real names
 * legitimately use (O'Brien, Anne-Marie, "A. Rahul") — no digits, emoji, or
 * symbols.
 */
const NAME_CHARS = /[^A-Za-z '.-]/g;
/** Strips disallowed characters as the user types — nothing else needed to keep digits/emoji/symbols out. */
export function sanitizeNameInput(v: string): string {
  return v.replace(NAME_CHARS, '');
}
/** Trim + collapse internal whitespace — applied on blur/submit, never mid-keystroke (would block typing a second word). */
export function cleanName(v: string): string {
  return v.trim().replace(/\s+/g, ' ');
}

/** Indian PIN codes are exactly 6 digits and never start with 0 (the first digit is a postal zone, 1–9). */
export const PINCODE_RE = /^[1-9]\d{5}$/;

/**
 * Loan amount range the application accepts (rupees). The server refuses anything outside it
 * (applications.routes.ts: min 25,000, max 15,00,000), and the details screen's slider has the same
 * ends. Every place that SEEDS an amount from elsewhere (a featured offer on Home, an agent/lead
 * context, a saved draft) goes through clampLoanAmount: a ₹1 crore featured offer used to be copied
 * in as-is and the application was refused with a raw error.
 */
export const LOAN_AMOUNT_MIN = 25000;
export const LOAN_AMOUNT_MAX = 1500000;
/** Slider step. It was 25,000 (the same as the minimum), so the slider could only say 25k, 50k, 75k… */
export const LOAN_AMOUNT_STEP = 5000;
/** One-tap amounts under the amount box. The minimum is deliberately not one of them. */
export const LOAN_AMOUNT_QUICK_PICKS = [50000, 100000, 200000, 500000] as const;

/** How the applicant chose the amount (sent with the `loan_amount_chosen` event, to see whether real amounts go up). */
export type LoanAmountSource = 'typed' | 'quick_pick' | 'slider' | 'agent' | 'prefilled';

/** The rupee amount typed into the amount box: digits only, at most 7 of them (15,00,000 has 7). Nothing typed = 0. */
export function parseAmountInput(text: string): number {
  const digits = String(text ?? '').replace(/\D/g, '').slice(0, 7);
  return digits ? Number(digits) : 0;
}

/**
 * What a move of the amount slider chooses, or null when it must be ignored.
 *
 * 46% of applications were exactly 25,000 (prod, Nov 2026): the amount starts empty and is required, and the smallest
 * touch on the slider set it to the minimum, which was enough to continue. While NO amount is chosen yet the slider
 * therefore cannot choose the minimum: the applicant drags to a higher value, types the amount (25,000 included) or
 * taps a quick pick. Once an amount is chosen the slider moves freely, down to the minimum too.
 */
export function sliderAmountChoice(current: number, next: number): number | null {
  const unset = !(current >= LOAN_AMOUNT_MIN);
  if (unset && next <= LOAN_AMOUNT_MIN) return null;
  return next;
}

/** An amount brought into the range above; 0 / missing / not a number stays 0 (= not chosen yet). */
export function clampLoanAmount(n: number | null | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(LOAN_AMOUNT_MAX, Math.max(LOAN_AMOUNT_MIN, Math.round(n)));
}
