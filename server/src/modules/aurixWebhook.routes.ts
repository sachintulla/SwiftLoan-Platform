/**
 * Inbound Aurix (Knight Fintech) status webhook — mounted at
 * /api/webhooks/aurix. Aurix calls this to push status updates for an applied
 * loan (submitted → under review → approved/rejected → disbursed), so My Loans
 * reflects the lender's real progress without the app polling.
 *
 * Design mirrors webhooks.routes.ts:
 *  - Verify a shared secret (AURIX_WEBHOOK_SECRET) when configured.
 *  - Never 4xx for a body we simply can't match to an application — Aurix would
 *    retry forever; return 200 { matched: false } instead.
 *  - Log the verbatim body so a payload-shape change is debuggable.
 */
import { Router } from 'express';
import type { ApplicationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import { scoped } from '../lib/log.js';

const log = scoped('aurix-webhook');

export const aurixWebhookRouter = Router();

/** When AURIX_WEBHOOK_SECRET is set, require it (either header name). */
function secretOk(req: any): boolean {
  const expected = process.env.AURIX_WEBHOOK_SECRET || '';
  if (!expected) return true; // not configured (dev) — accept, but the call is logged
  const got = req.get('x-aurix-webhook-secret') || req.get('x-api-key') || '';
  return got === expected;
}

/** Map any Aurix status string onto our ApplicationStatus enum. */
function mapStatus(raw: unknown): ApplicationStatus | null {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return null;
  if (/disburs/.test(s)) return 'disbursed';
  if (/approv|sanction/.test(s)) return 'approved';
  if (/reject|declin|denied|cancel/.test(s)) return 'rejected';
  if (/review|progress|submit|pending|process|initiat/.test(s)) return 'under_review';
  if (/close|complet/.test(s)) return 'closed';
  return null;
}

/** Map the journey audit event for a status. */
function journeyName(status: ApplicationStatus): string {
  if (status === 'approved') return JOURNEY_EVENTS.LOAN_APPROVED;
  if (status === 'rejected') return JOURNEY_EVENTS.LOAN_REJECTED;
  if (status === 'disbursed') return JOURNEY_EVENTS.LOAN_DISBURSED;
  return JOURNEY_EVENTS.APPLICATION_SUBMITTED;
}

aurixWebhookRouter.post('/', ah(async (req, res) => {
  if (!secretOk(req)) return fail(res, 401, 'Invalid webhook secret');

  const body: any = req.body ?? {};
  // Aurix field names aren't finalised — accept the common casings.
  const offerCode = body.OfferCode ?? body.offerCode ?? body.offer_code ?? null;
  const partnerCustomerId = body.PartnerCustomerId ?? body.partnerCustomerId ?? body.partner_customer_id ?? null;
  const rawStatus = body.Status ?? body.status ?? body.LoanStatus ?? body.ApplicationStatus ?? body.Meta?.Status ?? null;
  log.info('received', { offerCode, partnerCustomerId, status: rawStatus, body });

  // Locate the application: prefer the exact offer, else the user's latest.
  let application: { id: string; userId: string; status: ApplicationStatus } | null = null;
  if (offerCode) {
    const offer = await prisma.offer.findFirst({
      where: { offerCode: String(offerCode) },
      include: { application: true },
    });
    if (offer?.application) application = offer.application as any;
  }
  if (!application && partnerCustomerId) {
    application = (await prisma.loanApplication.findFirst({
      where: { userId: String(partnerCustomerId) },
      orderBy: { updatedAt: 'desc' },
    })) as any;
  }
  if (!application) {
    log.warn('no matching application', { offerCode, partnerCustomerId });
    return ok(res, { matched: false }, 'No matching application');
  }

  const mapped = mapStatus(rawStatus);
  if (!mapped) {
    log.warn('status not recognised', { applicationId: application.id, rawStatus });
    return ok(res, { matched: true, applicationId: application.id, statusUnchanged: true }, 'Status not recognised');
  }

  await prisma.loanApplication.update({ where: { id: application.id }, data: { status: mapped } });

  // Keep the Loan row (if any) in step so My Loans + Repay screens agree.
  if (mapped === 'disbursed' || mapped === 'closed') {
    const loan = await prisma.loan.findFirst({ where: { applicationId: application.id } });
    if (loan) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { status: mapped === 'closed' ? 'closed' : 'active' },
      });
    }
  }

  // Audit trail on the customer timeline (fire-and-forget).
  trackJourney(
    { userId: application.userId },
    { channel: 'system', name: journeyName(mapped), metadata: { applicationId: application.id, offerCode, aurixStatus: rawStatus } },
  ).catch(() => {});

  log.info('status updated', { applicationId: application.id, status: mapped });
  return ok(res, { matched: true, applicationId: application.id, status: mapped }, 'Status updated');
}));
