/**
 * Pure rules for the alternative-offers (Yubi / YMPL) facility on the website —
 * kept free of React / fetch so they are unit-tested (src/lib/altOfferLogic.test.ts)
 * and stay identical to the mobile app's behaviour (src/components/AltOfferTile.tsx,
 * src/screens/loans.tsx `yubiStatus`).
 */

export type AltStatusTone = 'approved' | 'rejected' | 'in_progress';

/**
 * Friendly status for a partner (Yubi) application, from the referral's last
 * journeyStatus. Same regexes as the app's loans.tsx `yubiStatus`.
 */
export function altStatusTone(lastStatus: string | null | undefined): AltStatusTone {
  const s = String(lastStatus ?? '').toUpperCase();
  if (/DISBURS|APPROV|COMPLETE|SUCCESS|SANCTION/.test(s)) return 'approved';
  if (/REJECT|FAIL|DECLIN|EXPIR/.test(s)) return 'rejected';
  return 'in_progress'; // NEW_LEAD / mid-journey / unknown
}

/** The tile is only meaningful once there is an application to refer, and only when the server flag is on. */
export function altOfferAvailable(featureEnabled: boolean, applicationId: string | null | undefined): boolean {
  return featureEnabled && !!applicationId;
}

/**
 * The website can't see inside the partner's page (cross-origin, new tab), so it
 * can't detect the "Proceed" tap the app's WebView reports. Instead it asks the
 * visitor when they come back — but only if they were genuinely away for a
 * moment, so a quick tab flick doesn't trigger a question.
 */
export const MIN_AWAY_MS = 10_000;
/** A pending "did you proceed?" question goes stale after this long. */
export const PENDING_TTL_MS = 6 * 60 * 60 * 1000;

export interface PendingAltOffer {
  applicationId: string;
  openedAt: number; // epoch ms
}

export const PENDING_KEY = 'sl_alt_pending';

export function parsePending(raw: string | null): PendingAltOffer | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v.applicationId === 'string' && v.applicationId && Number.isFinite(v.openedAt)) {
      return { applicationId: v.applicationId, openedAt: Number(v.openedAt) };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function shouldPromptAfterReturn(pending: PendingAltOffer | null, now: number, applicationId?: string | null): boolean {
  if (!pending) return false;
  if (applicationId && pending.applicationId !== applicationId) return false;
  const away = now - pending.openedAt;
  return away >= MIN_AWAY_MS && away <= PENDING_TTL_MS;
}

export interface AppliedReferral {
  id: string;
  applicationId: string;
  appliedAt: string | null;
  appliedLender: string | null;
  lastStatus: string | null;
}

/** Referrals the applicant proceeded with — the rows My Applications adds for the partner lender. */
export function appliedReferrals(app: { partnerReferrals?: AppliedReferral[] | null }): AppliedReferral[] {
  return (app.partnerReferrals ?? []).filter((r) => !!r.appliedAt);
}
