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
