/**
 * Pull one loan application's live status from the lender (Knight Fintech / Aurix
 * Fetch Lead API) and write any forward-only change back to the DB.
 *
 * This is the single implementation shared by:
 *   • the scheduled poller (jobs/tracking.jobs.ts, 9am–7pm IST every N minutes),
 *   • the admin "Pull latest status" button (POST /api/admin/loans/:id/refresh-status).
 *
 * It mirrors the mobile app's POST /applications/:id/refresh-status handler:
 * best-effort status extraction, forward-only writes (never regresses), and
 * graceful degradation when the lender is unreachable. Always stamps
 * LoanApplication.lastStatusCheckedAt so the poller's throttle is honoured.
 */
import type { ApplicationStatus } from '@prisma/client';
import { prisma } from './prisma.js';
import { fetchAurixLeads, generateAurixTokenFromEnv, aurixProductType } from './lenderOffers.js';
import { mapFlatStatus, advancesStatus, internalStatusFor } from '../modules/aurixWebhook.routes.js';
import { scoped } from './log.js';

const log = scoped('status-refresh');

export interface RefreshResult {
  ok: boolean;
  changed: boolean;
  status: ApplicationStatus | null;
  mappedStatus: ApplicationStatus | null;
  error?: string;
  record?: Record<string, unknown> | null;
  skipped?: 'no_user';
}

export async function refreshApplicationStatus(
  applicationId: string,
  opts?: { offerId?: string; lenderApplicationId?: string },
): Promise<RefreshResult> {
  const full = await prisma.loanApplication.findUnique({
    where: { id: applicationId },
    include: { offers: true, lenderApplications: { orderBy: { appliedAt: 'desc' } } },
  });
  if (!full) return { ok: false, changed: false, status: null, mappedStatus: null, error: 'Application not found' };

  const user = await prisma.user.findUnique({ where: { id: full.userId } });
  if (!user) return { ok: false, changed: false, status: full.status, mappedStatus: null, skipped: 'no_user' };
  // Aurix's Fetch Lead accepts multiple identifiers (partner customer id + offer
  // code), so a missing leadId is NOT a reason to skip — mirror the app's own
  // Refresh button, which always attempts the call with whatever it has.

  // Pick the lender application / offer to also advance (explicit from the
  // caller, else the most recent applied one).
  const la = full.lenderApplications.find((x) => x.id === opts?.lenderApplicationId)
    ?? full.lenderApplications[0]
    ?? null;
  const offer = full.offers.find((o) => o.id === (opts?.offerId ?? la?.offerId))
    ?? full.offers.find((o) => o.applied)
    ?? null;

  let record: Record<string, unknown> | null = null;
  let mappedStatus: ApplicationStatus | null = null;
  let error: string | undefined;
  try {
    let token = user.aurixToken ?? '';
    const expired = !user.aurixTokenExpiresAt || user.aurixTokenExpiresAt.getTime() < Date.now();
    if (!token || expired) {
      token = await generateAurixTokenFromEnv(full.userId, user.phone);
      await prisma.user.update({
        where: { id: user.id },
        data: { aurixToken: token, aurixTokenExpiresAt: new Date(Date.now() + 30 * 60_000) },
      }).catch(() => {});
    }

    const result = await fetchAurixLeads(
      { partnerCustomerId: full.userId, applicationId: full.leadId ?? undefined, offerCode: offer?.offerCode, productType: aurixProductType(full.loanType) },
      token,
    );
    record = result.records[0] ?? null;
    if (record) {
      for (const key of ['status', 'Status', 'applicationStatus', 'ApplicationStatus', 'loanStatus', 'LoanStatus', 'leadStatus', 'LeadStatus']) {
        const v = record[key];
        if (typeof v === 'string' && v.trim()) { mappedStatus = mapFlatStatus(v); if (mappedStatus) break; }
      }
    }
  } catch (e) {
    error = (e as Error)?.message || 'Could not reach the lender right now.';
    log.warn('lender call failed, keeping last known status', { applicationId: full.id, error });
  }

  let changed = false;
  if (mappedStatus && advancesStatus(full.status, mappedStatus)) {
    await prisma.loanApplication.update({ where: { id: full.id }, data: { status: mappedStatus } });
    changed = true;
    if (offer && advancesStatus(offer.lenderStatus, mappedStatus)) {
      await prisma.offer.update({ where: { id: offer.id }, data: { lenderStatus: mappedStatus } });
    }
    if (la && advancesStatus(la.status, mappedStatus)) {
      const internal = la.internalStatus === 'just_applied' ? internalStatusFor(mappedStatus) : null;
      await prisma.lenderApplication.update({ where: { id: la.id }, data: { status: mappedStatus, ...(internal ? { internalStatus: internal } : {}) } });
    }
  }
  // Keep the per-lender badge in step even when the status itself didn't move.
  if (la && la.internalStatus === 'just_applied' && internalStatusFor(la.status) && !(mappedStatus && advancesStatus(la.status, mappedStatus))) {
    await prisma.lenderApplication.update({ where: { id: la.id }, data: { internalStatus: internalStatusFor(la.status)! } });
  }

  // Always stamp the check time so the poller's throttle is honoured even on
  // a lender error (next window retries).
  await prisma.loanApplication.update({ where: { id: full.id }, data: { lastStatusCheckedAt: new Date() } }).catch(() => {});

  const latest = changed ? mappedStatus : full.status;
  log.info('refreshed', { applicationId: full.id, leadId: full.leadId, mappedStatus, changed, error });
  return { ok: !error, changed, status: latest, mappedStatus, error, record };
}
