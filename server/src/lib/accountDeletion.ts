/**
 * Why an account is being deleted — validation for the reason the person gives.
 *
 * The website makes the reason mandatory (a deletion should be deliberate, and the reason is the
 * only product signal we keep once the account is gone). Builds already in the stores call
 * DELETE /users/me with no body, so for the app the reason stays optional.
 */
export const DELETION_REASONS = [
  'no_longer_needed', // I no longer need a loan
  'privacy',          // Privacy or data concerns
  'too_many_contacts',// Too many calls or messages
  'better_option',    // Found a better option elsewhere
  'poor_experience',  // Poor experience or offers
  'duplicate_account',// I have another account
  'other',
] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

export const DETAILS_MAX = 500;
const DETAILS_MIN_OTHER = 5;

export type DeletionFeedback = { reasonCode: DeletionReason; details: string | null; source: 'app' | 'website' };
export type DeletionFeedbackResult =
  | { ok: true; value: DeletionFeedback | null } // null = app caller that gave no reason
  | { ok: false; message: string };

export function parseDeletionFeedback(body: unknown): DeletionFeedbackResult {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const source = b.source === 'website' ? 'website' : 'app';
  const rawReason = typeof b.reason === 'string' ? b.reason.trim() : '';

  if (!rawReason) {
    return source === 'website' ? { ok: false, message: 'Please tell us why you are deleting your account' } : { ok: true, value: null };
  }
  if (!(DELETION_REASONS as readonly string[]).includes(rawReason)) return { ok: false, message: 'Unknown reason' };

  const details = typeof b.details === 'string' ? b.details.replace(/\s+/g, ' ').trim() : '';
  if (details.length > DETAILS_MAX) return { ok: false, message: `Details must be ${DETAILS_MAX} characters or fewer` };
  if (rawReason === 'other' && details.length < DETAILS_MIN_OTHER) {
    return { ok: false, message: 'Please add a few words about your reason' };
  }
  return { ok: true, value: { reasonCode: rawReason as DeletionReason, details: details || null, source } };
}
