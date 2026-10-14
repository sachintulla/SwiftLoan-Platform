/**
 * Inbound Yubi (YMPL) referral status webhook — mounted at /api/webhooks/yubi.
 *
 * YMPL posts here when a referral we created (Create Referral →
 * PartnerReferral) moves through its journey, so My Loans / admin reflect the
 * partner's real progress without us polling Get Status.
 *
 *  - Auth: shared secret in YUBI_WEBHOOK_SECRET, sent as x-webhook-secret /
 *    x-api-key / Authorization: Bearer, or an HMAC-SHA256 body signature in
 *    x-yubi-signature (see lib/yubiWebhook.ts). Unset in production → 503, never
 *    an unauthenticated route.
 *  - Match: clientReferralId (ours, unique) → ymplReferralId.
 *  - Never 4xx on a well-authenticated body we can't match: the sender would
 *    retry forever — return 200 { matched:false }.
 *  - Updates PartnerReferral.lastStatus (+ appliedLender when sent). It does not
 *    stamp appliedAt: that is set when the applicant taps Proceed in the app.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { scoped } from '../lib/log.js';
import { yubiAuthOk, parseYubiEvent } from '../lib/yubiWebhook.js';

const log = scoped('yubi-webhook');

export const yubiWebhookRouter = Router();

yubiWebhookRouter.post('/', ah(async (req, res) => {
  const secret = process.env.YUBI_WEBHOOK_SECRET || '';
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      log.error('YUBI_WEBHOOK_SECRET is not set — rejecting post');
      return fail(res, 503, 'Webhook is not configured');
    }
    log.warn('YUBI_WEBHOOK_SECRET is not set — accepting unverified post (dev only)');
  } else {
    const raw: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const headers = Object.fromEntries(
      ['authorization', 'x-webhook-secret', 'x-api-key', 'x-yubi-signature', 'x-signature'].map(h => [h, req.get(h)]),
    );
    if (!yubiAuthOk(secret, headers, raw)) return fail(res, 401, 'Invalid webhook secret');
  }

  const ev = parseYubiEvent(req.body);
  log.info('received', { ...ev });

  if (!ev.clientReferralId && !ev.ymplReferralId) {
    return ok(res, { matched: false }, 'No referral id in payload');
  }

  const referral =
    (ev.clientReferralId && await prisma.partnerReferral.findUnique({ where: { clientReferralId: ev.clientReferralId } })) ||
    (ev.ymplReferralId && await prisma.partnerReferral.findFirst({ where: { ymplReferralId: ev.ymplReferralId, provider: 'ympl' } })) ||
    null;
  if (!referral) {
    log.warn('no matching referral', { ...ev });
    return ok(res, { matched: false }, 'No matching referral');
  }

  await prisma.partnerReferral.update({
    where: { id: referral.id },
    data: {
      ...(ev.status ? { lastStatus: ev.status } : {}),
      ...(ev.lender ? { appliedLender: ev.lender } : {}),
      ...(!referral.ymplReferralId && ev.ymplReferralId ? { ymplReferralId: ev.ymplReferralId } : {}),
    },
  });

  return ok(res, { matched: true, referralId: referral.id, status: ev.status }, 'Received');
}));
