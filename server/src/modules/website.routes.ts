import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { requestPhoneOtp, verifyPhoneOtp } from '../lib/otp.js';
import { normalisePhone } from '../lib/dialer.js';
import { resolveCustomer, recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
import { FIRST_ATTEMPT_DELAY_SECONDS } from '../lib/immediateCallback.js';
import { scoped } from '../lib/log.js';

const log = scoped('website');

/**
 * Public, unauthenticated, phone-scoped actions for the marketing site,
 * separate from context.routes.ts (which owns context-token creation/lookup —
 * a different concern) and from auth.routes.ts's app OTP flow (which creates a
 * User and issues app tokens — the wrong side effect for an anonymous
 * marketing-site visitor). See lib/otp.ts for why the OTP mechanics are their
 * own module.
 */
export const websiteRouter = Router();

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'phone must be a valid 10-digit Indian mobile number');

// POST /api/website/otp/request  { phone }
websiteRouter.post(
  '/otp/request',
  validate(z.object({ phone: phoneSchema })),
  ah(async (req, res) => {
    const phone = normalisePhone(req.body.phone);
    if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');

    // Gated on an existing lead: this endpoint is only ever meant to run right
    // after POST /api/context/create. Without this gate, it would be a public
    // "send an SMS to any number" endpoint with no submission behind it —
    // exactly the kind of thing that gets scripted into an SMS-pumping attack.
    const customer = await prisma.customer.findUnique({ where: { phone } });
    if (!customer) throw new HttpError(404, 'No lead found for this number — submit the form first');

    // Always send a fresh code and require it, even if this phone was verified
    // on an earlier visit — the callback-consent popup must only ever appear
    // right after a real, successful verification in THIS session, never as a
    // silent skip based on stale DB state.
    const result = await requestPhoneOtp(phone);
    log.info('otp requested', { phone, sent: result.sent, hasDevOtp: !!result.devOtp, alreadyVerified: customer.phoneVerified });
    return ok(res, result, 'OTP sent');
  }),
);

// POST /api/website/otp/verify  { phone, code }
websiteRouter.post(
  '/otp/verify',
  validate(z.object({ phone: phoneSchema, code: z.string().length(6) })),
  ah(async (req, res) => {
    const phone = normalisePhone(req.body.phone);
    if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');
    const { code } = req.body;

    const customer = await prisma.customer.findUnique({ where: { phone } });
    if (!customer) throw new HttpError(404, 'No lead found for this number');

    const valid = await verifyPhoneOtp(phone, code);
    if (!valid) {
      log.warn('otp verify rejected', { phone });
      throw new HttpError(400, 'Invalid or expired code');
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: { phoneVerified: true, phoneVerifiedAt: new Date() },
    });
    await recordJourneyEvent(customer.id, { channel: 'website', name: JOURNEY_EVENTS.PHONE_VERIFIED }).catch(() => undefined);

    log.info('otp verified', { phone, customerId: customer.id });
    return ok(res, { verified: true, phoneVerifiedAt: updated.phoneVerifiedAt }, 'Phone verified');
  }),
);

// POST /api/website/lead/amount  { phone, amount }  (paise)
//
// Hero's one-field flow submits the lead via POST /api/context/create with
// AMOUNT_DEFAULT before the visitor has picked a real amount (the slider only
// appears inside the OTP modal, after that save). If they then adjust it, the
// correction must land on the SAME lead — calling /api/context/create again
// would insert an entirely new Lead row, so the admin dashboard shows two
// enquiries (one at the default amount, one at the corrected amount) for a
// single visit. This updates the most recently created row for the phone
// instead of creating another one.
websiteRouter.post(
  '/lead/amount',
  validate(z.object({ phone: phoneSchema, amount: z.number().int().positive() })),
  ah(async (req, res) => {
    const phone = normalisePhone(req.body.phone);
    if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');
    const { amount } = req.body;

    const lead = await prisma.lead.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
    if (!lead) throw new HttpError(404, 'No lead found for this number — submit the form first');

    const inr = '₹' + Math.round(amount / 100).toLocaleString('en-IN');
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        amount,
        note: lead.productInterest ? `Interested in a ${inr} ${lead.productInterest} — submitted on swiftloan.ai.` : lead.note,
      },
    });

    log.info('lead amount corrected', { phone, amountPaise: amount, leadId: lead.id });
    return ok(res, { updated: true }, 'Amount updated');
  }),
);

// POST /api/website/callback  { phone, response: 'yes' | 'no' }
websiteRouter.post(
  '/callback',
  validate(z.object({ phone: phoneSchema, response: z.enum(['yes', 'no']) })),
  ah(async (req, res) => {
    const phone = normalisePhone(req.body.phone);
    if (!phone) return fail(res, 400, 'A valid 10-digit phone number is required');
    const { response } = req.body;

    // resolveCustomer() rather than a plain findUnique: this popup only ever
    // appears after OTP verification, so the row should already exist, but
    // falling back to find-or-create means a client retry after a dropped
    // /otp/verify response can never lose the visitor's answer.
    const customer = await resolveCustomer({ phone, source: 'website' });
    if (!customer) return fail(res, 400, 'Could not resolve a lead for this number');

    if (response === 'yes') {
      if (!customer.phoneVerified) throw new HttpError(400, 'Phone must be verified before requesting a callback');
      // Every "yes" queues its own immediate call — this is an explicit,
      // repeated ask from the visitor, not an automated retry, so it is not
      // throttled the way the passive follow-up job is. The only case that
      // does NOT reset the cycle is 'in_progress': a call for a previous
      // "yes" is being dialled RIGHT NOW, and resetting the status out from
      // under it would make the webhook that reports its outcome a no-op
      // (recordImmediateCallbackAttemptOutcome only acts on 'in_progress').
      if (customer.callbackStatus !== 'in_progress') {
        const nextAttemptAt = new Date(Date.now() + FIRST_ATTEMPT_DELAY_SECONDS * 1_000);
        await prisma.customer.update({
          where: { id: customer.id },
          data: {
            callbackRequestedAt: new Date(),
            callbackStatus: 'requested',
            callbackAttempts: 0,
            // FIRST_ATTEMPT_DELAY_SECONDS defaults to 20 — the next 1-minute
            // tick of the immediate-callback job dials it on the spot.
            callbackNextAttemptAt: nextAttemptAt,
            callbackLastAttemptAt: null,
          },
        });
        await recordJourneyEvent(customer.id, { channel: 'website', name: JOURNEY_EVENTS.CALLBACK_REQUESTED }).catch(() => undefined);
        log.info('callback yes — cycle (re)started', { phone, customerId: customer.id, nextAttemptAt });
      } else {
        log.info('callback yes — ignored, a call is in_progress right now', { phone, customerId: customer.id });
      }
    } else if (!customer.callbackDeclinedAt) {
      await prisma.customer.update({ where: { id: customer.id }, data: { callbackDeclinedAt: new Date() } });
      await recordJourneyEvent(customer.id, { channel: 'website', name: JOURNEY_EVENTS.CALLBACK_DECLINED }).catch(() => undefined);
      log.info('callback no — declined', { phone, customerId: customer.id });
    }

    return ok(res, { recorded: true }, 'Callback preference saved');
  }),
);
