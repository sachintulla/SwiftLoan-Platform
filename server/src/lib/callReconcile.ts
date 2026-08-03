/**
 * ADM-016 — close out calls that never received a terminal webhook.
 *
 * Ello has no per-conversation status endpoint available to our key
 * (`/api/campaign/:id/call-status` is keyed by *their* campaign id, which we
 * never create because we dial per contact; every per-conversation path 404s).
 * So this is a timeout sweep, not a vendor lookup: we can tell that a call is
 * stuck, but not what happened on it.
 *
 * That distinction matters. A stuck attempt holds a campaign concurrency slot
 * and pins its contact in `queued` forever, so it must be closed — but it is
 * closed as `failed` with an explicit reason and **no `outcome`**, because
 * outcomes drive follow-up messaging and a guess would put a real customer in
 * the wrong journey.
 */
import { prisma } from './prisma.js';

/** How long a call may stay open before we assume its webhook was lost. */
export const CALL_STALE_MINUTES = 30;

export type ReconcileResult = {
  checked: number;
  updated: number;
  contactsReleased: number;
  olderThanMinutes: number;
};

export async function reconcileStaleCalls(olderThanMinutes = CALL_STALE_MINUTES): Promise<ReconcileResult> {
  const minutes = Math.min(Math.max(Math.round(olderThanMinutes), 5), 1440);
  const cutoff = new Date(Date.now() - minutes * 60_000);

  const stale = await prisma.callAttempt.findMany({
    where: { status: { in: ['queued', 'dialing', 'in_progress'] }, queuedAt: { lt: cutoff } },
    orderBy: { queuedAt: 'asc' },
    take: 500,
  });
  if (!stale.length) return { checked: 0, updated: 0, contactsReleased: 0, olderThanMinutes: minutes };

  await prisma.callAttempt.updateMany({
    where: { id: { in: stale.map((c) => c.id) } },
    data: {
      status: 'failed',
      completedAt: new Date(),
      error: `no terminal webhook within ${minutes}m — closed by reconcile`,
    },
  });

  // Release the contacts so the retry cadence can pick them up again. Their
  // `attempts` counter already includes this try, so the per-contact ceiling
  // still holds — this cannot produce an extra dial.
  const pairs = stale
    .filter((c) => c.campaignId)
    .map((c) => ({ campaignId: c.campaignId as string, phone: c.phone }));

  let contactsReleased = 0;
  if (pairs.length) {
    const r = await prisma.campaignContact.updateMany({
      where: { OR: pairs, state: 'queued' },
      data: { state: 'pending', error: 'previous call timed out' },
    });
    contactsReleased = r.count;
  }

  return { checked: stale.length, updated: stale.length, contactsReleased, olderThanMinutes: minutes };
}
