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
