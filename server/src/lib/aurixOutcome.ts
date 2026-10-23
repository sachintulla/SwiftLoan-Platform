/**
 * What a zero-offer eligible_offers call means for the applicant.
 *
 * Aurix replies HTTP 200 with a Meta block even when it refuses ("not eligible", "PAN verification
 * failed", "This mobile number is already registered." code 409). Those are real answers from the
 * lender, not outages, so they must not be shown as "we couldn't reach our lending partners".
 *
 * Nothing the lender wrote ever reaches the applicant: the outcome carries a REASON CODE (stored in
 * LoanApplication.prequalifyReason) and the website maps it to our own translated copy. The lender's
 * wording is kept in `lenderMessage` for server logs only.
 */
export type PrequalifyReason = 'not_eligible' | 'duplicate' | 'technical';

export type AurixOutcome =
  /** Aurix answered with a business reason — status 'rejected'. */
  | { kind: 'decision'; reason: 'not_eligible'; lenderMessage: string; remember: boolean }
  /** This number already has an Aurix lead — not a decline; status 'failed'. */
  | { kind: 'duplicate'; reason: 'duplicate'; lenderMessage: string }
  /** Nothing usable came back (timeout, 5xx, no Meta) — generic retry prompt. */
  | { kind: 'technical'; reason: 'technical'; lenderMessage: string };

export function classifyAurixOutcome(debug: unknown): AurixOutcome {
  const d = debug as { httpStatus?: number; response?: any } | null | undefined;
  const meta = d?.response?.Result?.Meta ?? d?.response?.Meta;
  if (!meta || typeof meta !== 'object') return { kind: 'technical', reason: 'technical', lenderMessage: '' };

  const lenderMessage = typeof meta.Message === 'string' ? meta.Message.trim() : '';
  if (meta.Success === true) return { kind: 'decision', reason: 'not_eligible', lenderMessage, remember: true };

  const code = String(meta.StatusCode ?? '');
  if (code === '409' || /already registered/i.test(lenderMessage)) return { kind: 'duplicate', reason: 'duplicate', lenderMessage };
  // A server-side fault or a reply with no reason is not a decision.
  if (code.startsWith('5') || !lenderMessage) return { kind: 'technical', reason: 'technical', lenderMessage };
  // Other business refusals ("No data found", "PAN verification failed") may be fixed by the
  // applicant, so they are not remembered — the next attempt asks Aurix again.
  return { kind: 'decision', reason: 'not_eligible', lenderMessage, remember: false };
}
