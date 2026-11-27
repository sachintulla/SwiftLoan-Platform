/**
 * Yubi (YMPL) referral statuses in one place: plain words, what each one means for the customer, and the history we
 * keep. Pure (no database); tested in yubiStatus.test.ts.
 *
 * Yubi DOES report the lender's decision (KFT/Aurix does not): on 26 Nov 2026 a referral went NEW_APPLICATION →
 * READY_FOR_UNDERWRITING → APPLICATION_SANCTIONED → SANCTION_GENERATED → SIGNING_INITIATED → AGREEMENT_SIGNED →
 * READY_FOR_DISBURSEMENT → DISBURSED in one evening, and the admin still showed that customer as "No offers found"
 * because only the Aurix application decided the customer's status. This file is what lets the rest of the admin read
 * a Yubi outcome.
 */

/** Plain words for every status Yubi has sent us. An unknown code is shown readable (see yubiStatusLabel). */
export const YUBI_STATUS_LABELS: Record<string, string> = {
  NEW_LEAD: 'New lead',
  LEAD_REJECTED: 'Lead rejected',
  NO_OFFERS: 'No offers',
  OFFER_GENERATED: 'Offer generated',
  NEW_APPLICATION: 'Application started',
  READY_FOR_UNDERWRITING: 'With the lender for a decision',
  APPLICATION_SANCTIONED: 'Sanctioned',
  SANCTION_GENERATED: 'Sanction letter issued',
  SIGNING_INITIATED: 'Agreement sent for signing',
  AGREEMENT_SIGNED: 'Agreement signed',
  READY_FOR_DISBURSEMENT: 'Ready for disbursement',
  APPROVED: 'Approved',
  APPLICATION_REJECTED: 'Application rejected',
  DISBURSED: 'Disbursed',
};

export function yubiStatusLabel(status: string | null | undefined): string {
  const code = String(status ?? '').trim().toUpperCase();
  if (!code) return 'Waiting for Yubi';
  if (YUBI_STATUS_LABELS[code]) return YUBI_STATUS_LABELS[code];
  const words = code.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * What a Yubi status means, in the same words as lib/peopleMetrics.ts:
 *   disbursed   the loan was paid out
 *   approved    the lender said yes (sanctioned, signing, ready to pay out)
 *   in_progress the customer has an application with a lender
 *   rejected    a lender turned down an application the customer made
 *   offer       an offer exists, nothing applied for
 *   no_offers   nothing was offered, or the lead was not taken
 *   lead        Yubi has the lead, nothing more
 * null = no word from Yubi yet, or a code we have never seen.
 */
export type YubiOutcome = 'disbursed' | 'approved' | 'in_progress' | 'rejected' | 'offer' | 'no_offers' | 'lead';

const OUTCOME: Record<string, YubiOutcome> = {
  DISBURSED: 'disbursed',
  APPROVED: 'approved', APPLICATION_SANCTIONED: 'approved', SANCTION_GENERATED: 'approved', SIGNING_INITIATED: 'approved',
  AGREEMENT_SIGNED: 'approved', READY_FOR_DISBURSEMENT: 'approved',
  NEW_APPLICATION: 'in_progress', READY_FOR_UNDERWRITING: 'in_progress',
  APPLICATION_REJECTED: 'rejected',
  OFFER_GENERATED: 'offer',
  NO_OFFERS: 'no_offers', LEAD_REJECTED: 'no_offers',
  NEW_LEAD: 'lead',
};

export function yubiOutcome(status: string | null | undefined): YubiOutcome | null {
  return OUTCOME[String(status ?? '').trim().toUpperCase()] ?? null;
}

/** How far along an outcome is; a later webhook for an EARLIER step must not move a referral backwards. */
const RANK: Record<YubiOutcome, number> = { lead: 1, no_offers: 2, offer: 3, in_progress: 4, rejected: 5, approved: 6, disbursed: 7 };

/**
 * Should `next` replace `current` as the referral's status? Yubi's webhooks and our own poll can arrive out of order
 * (the poll answered NEW_APPLICATION minutes after a webhook had said DISBURSED). A disbursed referral stays disbursed;
 * otherwise the status only moves forward, and an unknown code is accepted (we cannot rank what we do not know).
 */
export function yubiStatusAdvances(current: string | null | undefined, next: string | null | undefined): boolean {
  const n = String(next ?? '').trim();
  if (!n) return false;
  const c = String(current ?? '').trim();
  if (!c) return true;
  if (c.toUpperCase() === n.toUpperCase()) return false;
  const co = yubiOutcome(c);
  const no = yubiOutcome(n);
  if (co === 'disbursed') return false;
  if (!co || !no) return true;
  return RANK[no] >= RANK[co];
}

export interface YubiHistoryEntry { status: string; at: string; source: 'webhook' | 'poll' }

/** The stored history as a clean list (it is a JSON column: anything unreadable is dropped). */
export function readYubiHistory(raw: unknown): YubiHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const o = e as Partial<YubiHistoryEntry> | null;
    if (!o || typeof o.status !== 'string' || !o.status || typeof o.at !== 'string') return [];
    return [{ status: o.status, at: o.at, source: o.source === 'poll' ? 'poll' as const : 'webhook' as const }];
  });
}

/** History with one more step. The same status twice in a row is recorded once; at most the last 50 are kept. */
export function appendYubiHistory(raw: unknown, status: string | null | undefined, at: Date, source: 'webhook' | 'poll'): YubiHistoryEntry[] {
  const list = readYubiHistory(raw);
  const s = String(status ?? '').trim();
  if (!s) return list;
  if (list.some((e) => e.status.toUpperCase() === s.toUpperCase())) return list;
  return [...list, { status: s, at: at.toISOString(), source }].slice(-50);
}

/**
 * The history to store when a status arrives. A referral from before the history existed starts with the status it
 * already had (at the time it was last updated), so the timeline does not begin in the middle. A status that does not
 * move the referral forward (a late or repeated one) adds nothing.
 */
export function nextYubiHistory(
  ref: { statusHistory: unknown; lastStatus: string | null; updatedAt: Date },
  status: string | null | undefined, at: Date, source: 'webhook' | 'poll',
): YubiHistoryEntry[] {
  let list = readYubiHistory(ref.statusHistory);
  if (!list.length && ref.lastStatus) list = [{ status: ref.lastStatus, at: ref.updatedAt.toISOString(), source: 'poll' }];
  return yubiStatusAdvances(ref.lastStatus, status) ? appendYubiHistory(list, status, at, source) : list;
}

/**
 * A Yubi referral as a lender application for the customer's real status (lib/customerStatus.ts), or null when it
 * says nothing about a lender application (a lead, an offer, no offers). `status` uses LenderApplication's words.
 */
export function yubiAsLenderFact(lastStatus: string | null | undefined, appliedLender: string | null | undefined): { status: string; lenderName: string } | null {
  const lender = (appliedLender ?? '').trim();
  const lenderName = lender ? `${lender} (Yubi)` : 'Yubi';
  switch (yubiOutcome(lastStatus)) {
    case 'disbursed': return { status: 'disbursed', lenderName };
    case 'approved': return { status: 'approved', lenderName };
    case 'in_progress': return { status: 'under_review', lenderName };
    case 'rejected': return { status: 'rejected', lenderName };
    default: return null;
  }
}
