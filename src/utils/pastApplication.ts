/**
 * What My Offers should show for an account, read from the applications the server returns
 * (GET /applications, newest first). Nothing here depends on in-memory state, so the answer is
 * the same right after a logout → login as it was before it.
 *
 * Before this rule the screen only looked for an application with offers still open; anyone
 * else (no offers found, or every offer already applied to) was shown the first-time
 * "Apply for a loan" screen, as if they had never applied.
 *
 * Pure so the rule is unit-tested.
 */

/** Statuses whose applications still carry showable offers. */
export const OFFER_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'];

/** Why a finished eligibility check returned nothing (the server's reason code). */
export type PastNoOffersReason = 'not_eligible' | 'duplicate' | 'technical';

interface OfferLike { applied?: boolean | null }
export interface ApplicationLike {
  id: string;
  status?: string | null;
  prequalifyReason?: string | null;
  offers?: OfferLike[] | null;
  lenderApplications?: unknown[] | null;
  partnerReferrals?: unknown[] | null;
  loan?: unknown;
}

export type OffersView<A extends ApplicationLike = ApplicationLike> =
  /** Offers the person has not applied to yet: show them. */
  | { kind: 'offers'; application: A }
  /** The last finished check found no offers: show the reason, Retry and the other lenders. */
  | { kind: 'no_offers'; application: A; reason: PastNoOffersReason }
  /** They applied (to every offer we had, or with a partner lender): point to My Loans. */
  | { kind: 'applied'; application: A }
  /** Never got as far as a result: the first-time "Apply for a loan" screen. */
  | { kind: 'first_time' };

/** The offers on an application that have not been applied to. */
export function unappliedOffers<O extends OfferLike>(app: { offers?: O[] | null } | null | undefined): O[] {
  return (app?.offers ?? []).filter(o => !o.applied);
}

/** The application whose open offers should be shown (a live status wins), if any. */
export function pickOffersApplication<A extends ApplicationLike>(apps: A[]): A | undefined {
  return (
    apps.find(a => unappliedOffers(a).length > 0 && OFFER_STATUSES.includes(a.status ?? '')) ||
    apps.find(a => unappliedOffers(a).length > 0)
  );
}

function hasApplied(app: ApplicationLike): boolean {
  return (
    (app.offers ?? []).some(o => !!o.applied) ||
    (app.lenderApplications?.length ?? 0) > 0 ||
    (app.partnerReferrals?.length ?? 0) > 0 ||
    !!app.loan
  );
}

/** A finished check with nothing to show: 'rejected' (not eligible) or 'failed' (duplicate / technical). */
function noOffersReasonOf(app: ApplicationLike): PastNoOffersReason | null {
  if ((app.offers?.length ?? 0) > 0) return null;
  const reason = app.prequalifyReason;
  if (reason === 'not_eligible' || reason === 'duplicate' || reason === 'technical') return reason;
  if (app.status === 'rejected') return 'not_eligible';
  if (app.status === 'failed') return 'technical';
  return null;
}

/**
 * `apps` must be newest first (as the server returns them). Open offers win; otherwise the
 * newest application that reached an outcome decides. Unfinished drafts are skipped.
 */
export function offersViewFor<A extends ApplicationLike>(apps: A[]): OffersView<A> {
  const withOffers = pickOffersApplication(apps);
  if (withOffers) return { kind: 'offers', application: withOffers };
  for (const app of apps) {
    // Applied wins on the same application: someone who got no offers and then went ahead
    // with a partner lender has an application to track.
    if (hasApplied(app)) return { kind: 'applied', application: app };
    const reason = noOffersReasonOf(app);
    if (reason) return { kind: 'no_offers', application: app, reason };
  }
  return { kind: 'first_time' };
}
