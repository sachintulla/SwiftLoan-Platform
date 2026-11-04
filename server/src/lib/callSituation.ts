/**
 * What is TRUE about a signed-in customer right now, for the voice agent's briefing (owner, 2026-11-04: "Ruby was not picking up the
 * context in the right way"). Read from stored data — the same `deriveDropoff` the message scenarios use — never from
 * `Customer.currentStage`, which the app's status screen used to push to "Application submitted" for people who had not even looked at
 * their offers, so the briefing contradicted itself.
 *
 * `describeSituation` is pure (tested); `loadCallSituation` reads the database. The agent gets one plain sentence (`call_situation`) to
 * open from, the truthful stage / done / next, and — when they have offers — the count and the best offer (highest amount).
 */
import { prisma } from './prisma.js';
import { rupeesDigits, rupeesInWords } from './rupees.js';
import { deriveDropoff, type DropoffStatus } from './dropoffSteps.js';

export interface BestOffer { lender: string; amount: number; emi: number; tenureMonths: number }
export interface SituationInput {
  status: DropoffStatus | null;
  offerCount: number;
  best: BestOffer | null;
  /** The lender they applied with, for `applied`. */
  appliedLender?: string | null;
}
export interface Situation {
  call_situation: string;
  lead_stage: string;
  lead_journey_done: string;
  lead_journey_next: string;
  offer_count: string;
  best_offer_lender: string;
  best_offer_amount: string;
  best_offer_amount_words: string;
  best_offer_emi: string;
  best_offer_emi_words: string;
  best_offer_tenure_months: string;
}

const EMPTY_OFFER = { offer_count: '', best_offer_lender: '', best_offer_amount: '', best_offer_amount_words: '', best_offer_emi: '', best_offer_emi_words: '', best_offer_tenure_months: '' };

/** Null for someone we cannot describe this way (no account step yet, or already past the lender's decision): the old journey stays. */
export function describeSituation(i: SituationInput): Situation | null {
  const s = (call_situation: string, lead_stage: string, done: string, next: string): Situation => ({
    call_situation, lead_stage, lead_journey_done: done, lead_journey_next: next, ...EMPTY_OFFER,
  });
  switch (i.status) {
    case 'otp_verified':
      return s('They verified their mobile number but have not verified their PAN yet.', 'Signed in, PAN not verified', 'Mobile number verified', 'Verify their PAN');
    case 'pan_verified':
      return s('They verified their PAN but have not filled in their basic details yet.', 'PAN verified, details not filled', 'Mobile number verified, PAN verified', 'Fill in their basic details');
    case 'application_filled':
      return s('They filled in their details, but their loan offers have not been shown to them yet.', 'Details filled, offers not seen', 'Mobile number verified, PAN verified, details filled', 'See their loan offers');
    case 'rejected':
      return s('They checked for loan offers and none were found for them yet.', 'No offers found', 'Mobile number verified, PAN verified, details filled, offer check done', 'Wait for our update');
    case 'failed':
      return s('Their offer check did not finish because of a technical problem on our side; it was not a decision about them.', 'Offer check did not finish (technical problem)', 'Mobile number verified, PAN verified, details filled', 'Try the offer check again');
    case 'applied':
      return s(`They applied for a loan${i.appliedLender ? ` with ${i.appliedLender}` : ''} through SwiftLoan; the lender's steps are next.`, `Applied${i.appliedLender ? ` with ${i.appliedLender}` : ''}`, 'Mobile number verified, PAN verified, details filled, offer chosen', "Complete the lender's steps");
    case 'offers_not_applied': {
      const n = Math.max(1, i.offerCount);
      const b = i.best;
      const bestLine = b
        ? ` The best one is ${rupeesDigits(b.amount)} from ${b.lender}, EMI about ${rupeesDigits(b.emi)} a month for ${b.tenureMonths} months.`
        : '';
      return {
        call_situation: `They got ${n} loan offer${n === 1 ? '' : 's'} and have not applied yet.${bestLine}`,
        lead_stage: 'Offers ready, not applied',
        lead_journey_done: 'Mobile number verified, PAN verified, details filled, offers received',
        lead_journey_next: 'Choose an offer and apply',
        offer_count: String(n),
        best_offer_lender: b?.lender ?? '',
        best_offer_amount: b ? rupeesDigits(b.amount) : '',
        best_offer_amount_words: b ? rupeesInWords(b.amount) ?? '' : '',
        best_offer_emi: b ? rupeesDigits(b.emi) : '',
        best_offer_emi_words: b ? rupeesInWords(b.emi) ?? '' : '',
        best_offer_tenure_months: b ? String(b.tenureMonths) : '',
      };
    }
    default:
      return null;
  }
}

/** The highest-amount offer (ties: lower EMI first). */
export function pickBestOffer(offers: BestOffer[]): BestOffer | null {
  return [...offers].sort((a, b) => b.amount - a.amount || a.emi - b.emi)[0] ?? null;
}

export async function loadCallSituation(userId: string): Promise<Situation | null> {
  // Imported lazily: appDropoff.ts imports the call-placing modules that import this file.
  const { loadSnapshot } = await import('./appDropoff.js');
  const loaded = await loadSnapshot(userId);
  if (!loaded) return null;
  const state = deriveDropoff(loaded.snapshot);
  let best: BestOffer | null = null;
  let offerCount = 0;
  let appliedLender: string | null = null;
  const app = await prisma.loanApplication.findFirst({
    where: { userId }, orderBy: { updatedAt: 'desc' },
    select: {
      offers: { select: { amount: true, emi: true, tenureMonths: true, partner: { select: { name: true } } } },
      lenderApplications: { orderBy: { appliedAt: 'desc' }, take: 1, select: { lenderName: true } },
    },
  });
  if (app) {
    offerCount = app.offers.length;
    best = pickBestOffer(app.offers.map((o) => ({ lender: (o.partner?.name ?? 'a lender').trim(), amount: o.amount, emi: o.emi, tenureMonths: o.tenureMonths })));
    appliedLender = app.lenderApplications[0]?.lenderName ?? null;
  }
  return describeSituation({ status: state.status, offerCount, best, appliedLender });
}
