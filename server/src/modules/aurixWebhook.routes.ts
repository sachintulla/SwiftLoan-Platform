/**
 * Inbound Knight Fintech (Aurix) "Status & Journey Data Push" webhook —
 * mounted at /api/webhooks/aurix (and /api/webhooks/kft).
 *
 * Implements the KFT "Status & Journey Data Push API Contract [PL+BL] v1.3":
 * KFT posts a common envelope at each journey trigger —
 *   { journey: { state, status, reason, lead_id, partner_customer_id }, data: {…} }
 * — and we map the journey state/status onto our ApplicationStatus so the app's
 * "My Loans" list reflects the lender's real, live progress without polling the
 * lender ourselves.
 *
 *  - Signature: X-KF-Signature = base64(sha256(shared_secret + raw_body)),
 *    verified against KFT_WEBHOOK_SECRET when configured (dev accepts + logs).
 *  - Idempotent on X-KF-Request-ID (best-effort in-memory dedupe).
 *  - Forward-only status transitions — an out-of-order webhook never regresses
 *    a further/terminal status.
 *  - Never 4xx on a body we can't match (KFT would retry forever) — return
 *    200 { matched:false }. Backward-compatible with the older flat payload.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import type { ApplicationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { trackJourney, JOURNEY_EVENTS } from '../lib/journey.js';
import { scoped } from '../lib/log.js';

const log = scoped('aurix-webhook');

export const aurixWebhookRouter = Router();

/** Verify KFT's X-KF-Signature, or the legacy shared-secret header. */
function signatureOk(req: any): boolean {
  const secret = process.env.KFT_WEBHOOK_SECRET || process.env.AURIX_WEBHOOK_SECRET || '';
  if (!secret) return true; // not configured (dev) — accept, but the call is logged
  const sig = req.get('x-kf-signature') || '';
  if (sig) {
    const raw: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const computed = crypto
      .createHash('sha256')
      .update(Buffer.concat([Buffer.from(secret, 'utf8'), raw]))
      .digest('base64');
    const a = Buffer.from(computed);
    const b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  // Legacy header fallback (pre-v1.2 shared-secret header).
  const got = req.get('x-aurix-webhook-secret') || req.get('x-api-key') || '';
  return got === secret;
}

// Best-effort idempotency on X-KF-Request-ID (bounded in-memory set).
const seenIds = new Set<string>();
const seenOrder: string[] = [];
function alreadyProcessed(id: string | undefined): boolean {
  if (!id) return false;
  if (seenIds.has(id)) return true;
  seenIds.add(id);
  seenOrder.push(id);
  if (seenOrder.length > 5000) {
    const old = seenOrder.shift()!;
    seenIds.delete(old);
  }
  return false;
}

// Progression rank so a status update only moves forward (or to a terminal).
const RANK: Record<string, number> = {
  draft: 0, pan_pending: 1, prequalifying: 2, offers_ready: 3, handoff: 4,
  under_review: 5, approved: 6, disbursed: 7, closed: 8, rejected: 8, failed: 8,
};
const TERMINAL = new Set<ApplicationStatus>(['approved', 'disbursed', 'rejected', 'closed', 'failed']);

/** Map a KFT journey (state, status, reason) onto our ApplicationStatus. */
function mapJourney(state: string, status: string, reason: string): ApplicationStatus | null {
  const st = state.toLowerCase().replace(/[^a-z_]/g, '');
  const success = status.toLowerCase() !== 'failure';
  const r = reason.toLowerCase();

  // Explicit terminal outcomes sometimes arrive in the reason text or (v1.3) in
  // data.post_lender_status ("Disbursed"/"Approved"/"Rejected"), which the caller
  // folds into `reason` before calling us.
  if (/disburs/.test(r)) return 'disbursed';
  if (/sanction|approv/.test(r)) return 'approved';
  if (/reject|declin|denied/.test(r)) return 'rejected';

  if (!success) {
    // A failure at an eligibility/lender step is a rejection; earlier-step
    // failures are transient and don't change the tracked status.
    if (['eligibility_check', 'bureau_soft_pull', 'lender_selection', 'lender_api_journey',
      'application_submitted', 'post_lender_redirection_journey'].includes(st)) return 'rejected';
    return null;
  }

  switch (st) {
    case 'lead_created':
    case 'loan_ask':
    case 'pan_comprehensive':
    case 'personal_details':
    case 'address_details':
    case 'business_details':
    case 'business_financials':
      return 'prequalifying';
    case 'bureau_soft_pull':
      return 'under_review';
    case 'eligibility_check':
      return 'offers_ready';
    case 'lender_selection':
    case 'lender_api_journey':
      return 'handoff';
    case 'application_submitted':
    case 'kyc_completed':
    case 'post_lender_redirection_journey':
      return 'under_review';
    default:
      return null;
  }
}

/** Legacy flat-payload status mapping (pre-journey contract). */
function mapFlatStatus(raw: string): ApplicationStatus | null {
  const s = raw.toLowerCase();
  if (!s) return null;
  if (/disburs/.test(s)) return 'disbursed';
  if (/approv|sanction/.test(s)) return 'approved';
  if (/reject|declin|denied|cancel/.test(s)) return 'rejected';
  if (/review|progress|submit|pending|process|initiat/.test(s)) return 'under_review';
  if (/close|complet/.test(s)) return 'closed';
  return null;
}

function journeyName(status: ApplicationStatus): string {
  if (status === 'approved') return JOURNEY_EVENTS.LOAN_APPROVED;
  if (status === 'rejected') return JOURNEY_EVENTS.LOAN_REJECTED;
  if (status === 'disbursed') return JOURNEY_EVENTS.LOAN_DISBURSED;
  return JOURNEY_EVENTS.APPLICATION_SUBMITTED;
}

aurixWebhookRouter.post('/', ah(async (req, res) => {
  if (!signatureOk(req)) return fail(res, 401, 'Invalid webhook signature');
  const requestId = req.get('x-kf-request-id') || undefined;
  if (alreadyProcessed(requestId)) return ok(res, { duplicate: true }, 'Already processed');

  const body: any = req.body ?? {};
  const j = body.journey ?? {};
  const state = String(j.state ?? '');
  const jStatus = String(j.status ?? '');
  const reason = String(j.reason ?? '');
  const data: any = body.data ?? {};
  // lead_id: journey.lead_id is present on most events, but the lender_api_journey
  // and post_lender_redirection_journey payloads (v1.3 §2.8/§2.10) omit it from
  // the journey block entirely and only carry it in data.lead_id — so fall back
  // there, or we'd fail to match those (incl. the disbursal signal).
  const leadId =
    j.lead_id != null ? String(j.lead_id)
      : body.lead_id != null ? String(body.lead_id)
        : data.lead_id != null ? String(data.lead_id) : null;
  const partnerCustomerId =
    j.partner_customer_id ?? body.PartnerCustomerId ?? body.partnerCustomerId ?? body.partner_customer_id ?? null;
  const offerCode = body.OfferCode ?? body.offerCode ?? body.offer_code ?? null;
  // v1.3: post-redirection journey carries the terminal outcome here.
  const postLenderStatus = data.post_lender_status != null ? String(data.post_lender_status) : '';
  // v1.3: bureau soft-pull now includes the real bureau score.
  const bureauScore = Number(data.bureau_score);

  log.info('received', { requestId, state, status: jStatus, leadId, partnerCustomerId, offerCode });

  // Locate the application: leadId (most precise) → offerCode → user's latest.
  let application: { id: string; userId: string; status: ApplicationStatus; leadId: string | null } | null = null;
  if (leadId) {
    application = (await prisma.loanApplication.findFirst({ where: { leadId } })) as any;
  }
  if (!application && offerCode) {
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

  // Learn the KFT lead id so future journey webhooks match precisely.
  if (leadId && application.leadId !== leadId) {
    await prisma.loanApplication.update({ where: { id: application.id }, data: { leadId } }).catch(() => {});
  }

  // v1.3: the bureau soft-pull event now carries the customer's real bureau
  // score — persist it so the app shows the actual CIBIL/CRIF value instead of
  // the default. (Independent of the status mapping below.)
  if (Number.isFinite(bureauScore) && bureauScore >= 300 && bureauScore <= 900) {
    await prisma.user.update({
      where: { id: application.userId },
      data: { creditScore: Math.round(bureauScore) },
    }).catch(() => {});
  }

  const mapped = state
    // Fold data.post_lender_status into `reason` so a "Disbursed"/"Approved"/
    // "Rejected" post-redirection outcome maps to the right terminal status.
    ? mapJourney(state, jStatus, `${reason} ${postLenderStatus}`)
    : mapFlatStatus(String(body.Status ?? body.status ?? ''));

  if (!mapped) {
    return ok(res, { matched: true, applicationId: application.id, statusUnchanged: true }, 'No status change for this event');
  }

  // Forward-only helper: allow advancing to a further status, or the one legal
  // terminal step (approved → disbursed); never regress.
  const advances = (from: ApplicationStatus | null, to: ApplicationStatus): boolean => {
    const f = RANK[from ?? 'draft'] ?? 0;
    const t = RANK[to] ?? 0;
    const regress = !TERMINAL.has(to) && t <= f;
    const backTerminal = !!from && TERMINAL.has(from) && !(to === 'disbursed' && from === 'approved');
    return !(regress || backTerminal);
  };

  // ── Per-lender application create/update ──
  // The per-lender application (an applied Offer) is CREATED only once the lender
  // confirms the user actually submitted — i.e. after OTP verification on the
  // lender's web page. KFT signals that with application_submitted (and the
  // later kyc/redirection/terminal events). Earlier lender-scoped events
  // (lender_selection, lender_api_journey) are pre-OTP, so they only update an
  // offer that is ALREADY applied — they never create one.
  const CREATE_STATES = new Set(['application_submitted', 'kyc_completed', 'post_lender_redirection_journey']);
  const createsApplication = CREATE_STATES.has(state.toLowerCase().replace(/[^a-z_]/g, '')) || TERMINAL.has(mapped);
  const lenderName = data.lender_name ?? data.lenderName ?? null;
  let offerUpdated: string | null = null;
  if (lenderName) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const want = norm(String(lenderName));
    const offers = await prisma.offer.findMany({ where: { applicationId: application.id } });
    const match = offers.find(o => o.lenderName && (() => {
      const have = norm(o.lenderName);
      return have === want || have.includes(want) || want.includes(have);
    })());
    // Update if the offer is already applied, or CREATE it now if this event is
    // the submission confirmation. Otherwise (pre-OTP event, not yet applied) skip.
    if (match && (match.applied || createsApplication) && advances(match.lenderStatus, mapped)) {
      await prisma.offer.update({
        where: { id: match.id },
        data: {
          lenderStatus: mapped,
          ...(match.applied ? {} : { applied: true, appliedAt: match.appliedAt ?? new Date() }),
          ...(data.application_id != null ? { kftApplicationId: String(data.application_id) } : {}),
          ...(data.ApplicationUrl != null ? { applicationUrl: String(data.ApplicationUrl) } : {}),
        },
      });
      offerUpdated = match.id;
    }
  }

  // ── Parent application status (forward-only) ──
  if (!advances(application.status, mapped)) {
    return ok(
      res,
      { matched: true, applicationId: application.id, statusUnchanged: true, current: application.status, offerUpdated },
      offerUpdated ? 'Lender status updated' : 'Status not advanced',
    );
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
    { channel: 'system', name: journeyName(mapped), metadata: { applicationId: application.id, state, kftStatus: jStatus, reason, leadId } },
  ).catch(() => {});

  log.info('status updated', { applicationId: application.id, status: mapped, offerUpdated });
  return ok(res, { matched: true, applicationId: application.id, status: mapped, offerUpdated }, 'Status updated');
}));
