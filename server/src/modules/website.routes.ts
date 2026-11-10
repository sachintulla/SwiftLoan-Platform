import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { requestPhoneOtp, verifyPhoneOtp } from '../lib/otp.js';
import { normalisePhone } from '../lib/dialer.js';
import { resolveCustomer, recordJourneyEvent, JOURNEY_EVENTS } from '../lib/journey.js';
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

const phoneSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'phone must be a valid 10-digit Indian mobile number')
  .refine(p => !/^(\d)\1{9}$/.test(p), 'phone must be a valid 10-digit Indian mobile number');

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
    // on an earlier visit — verification belongs to THIS session, never a
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

// POST /api/website/lead/amount  { phone, amount }  (rupees)
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

    const inr = '₹' + amount.toLocaleString('en-IN');
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        amount,
        note: lead.productInterest ? `Interested in a ${inr} ${lead.productInterest} — submitted on swiftloan.ai.` : lead.note,
      },
    });

    log.info('lead amount corrected', { phone, amount, leadId: lead.id });
    return ok(res, { updated: true }, 'Amount updated');
  }),
);

