/**
 * POST /api/notify — one channel-agnostic endpoint to send a transactional
 * notification (SMS or WhatsApp) to a single customer.
 *
 * It serves two callers with one contract:
 *   - the admin dashboard (admin bearer JWT) — "pick a customer, send a message";
 *   - third parties such as Ello (an `x-api-key` minted in the dashboard, see
 *     apiKeys.routes.ts) — e.g. a post-call summary pushed to the customer.
 *
 * Reuses the existing send plumbing (sendWhatsAppText/Template, sendVoxSms),
 * so every send is recorded in MessageDelivery (Admin → Messages) and respects
 * the same do-not-contact guard as voice/WhatsApp outreach.
 */
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, fail } from '../lib/http.js';
import { verifyAdminAccess } from '../lib/adminJwt.js';
import { verifyApiKey } from '../lib/apiKeys.js';
import { resolveCustomer } from '../lib/journey.js';
import { normalisePhone } from '../lib/dialer.js';
import { sendWhatsAppText, sendWhatsAppTemplate } from '../lib/whatsapp.js';
import { sendVoxSms } from '../lib/voxSms.js';
import { recordConversation } from '../lib/conversations.js';
import { scoped } from '../lib/log.js';

const log = scoped('notify');

/**
 * Dual auth: an admin bearer JWT OR a caller API key (the same keys and env
 * fallback the conversations API accepts, so an existing Ello key works here
 * too). Whichever matched is remembered on the request for the audit summary.
 */
async function requireAdminOrApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (bearer) {
    try {
      req.admin = verifyAdminAccess(bearer);
      return next();
    } catch {
      // Not a valid admin token — fall through and try an API key.
    }
  }

  const key = String(req.headers['x-api-key'] ?? '') || String(req.headers['x-webhook-secret'] ?? '');
  if (key) {
    const match = await verifyApiKey(key);
    if (match) {
      (req as Request & { apiKeyId?: string }).apiKeyId = match.id;
      return next();
    }
    const envKey = process.env.CONVERSATION_API_KEY || process.env.ELLO_WEBHOOK_SECRET || '';
    if (envKey && key === envKey) return next();
  }

  return fail(res, 401, 'Provide an admin bearer token or an x-api-key');
}

export const notifyRouter = Router();
notifyRouter.use(ah(requireAdminOrApiKey));

const sendSchema = z.object({
  customerId: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
  // "auto" tries WhatsApp first, falls back to SMS when WhatsApp can't be sent.
  channel: z.enum(['sms', 'whatsapp', 'auto']).optional(),
  text: z.string().min(1).max(4096).optional(),
  // Template path (required for a business-initiated WhatsApp message, and for
  // DLT-registered SMS the `templateName` is the registered template id).
  templateName: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  placeholders: z.array(z.string()).optional(),
  // Free-text tag surfaced in Admin → Messages (e.g. "post_call_summary").
  kind: z.string().min(1).max(40).optional(),
})
  .refine((b) => Boolean(b.customerId || b.phone), { message: 'customerId or phone is required' })
  .refine((b) => Boolean(b.text || b.templateName), { message: 'text or templateName is required' });

/**
 * POST /api/notify
 *
 * Body: { customerId | phone, channel?, text? | templateName(+language,placeholders)?, kind? }
 * Returns: { success, data: { messageId, channel, status, customerId }, message }
 */
notifyRouter.post('/', validate(sendSchema), ah(async (req, res) => {
  const { customerId, phone, channel = 'auto', text, templateName, language, placeholders, kind } =
    req.body as {
      customerId?: string; phone?: string; channel?: 'sms' | 'whatsapp' | 'auto';
      text?: string; templateName?: string; language?: string; placeholders?: string[]; kind?: string;
    };

  // Resolve the customer — by id, else create/find a lead row by phone (same
  // resolution the admin WhatsApp send uses).
  let customer = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId } })
    : null;
  if (customerId && !customer) return fail(res, 404, 'Customer not found');
  if (!customer) {
    const clean = normalisePhone(phone);
    if (!clean) return fail(res, 400, 'phone must contain a valid 10-digit mobile number');
    customer = await resolveCustomer({ phone: clean, source: 'phone_call' });
    if (!customer) return fail(res, 400, 'Could not resolve a customer for this phone');
  }

  const target = normalisePhone(phone ?? customer.phone);
  if (!target) return fail(res, 400, 'No usable phone number for this customer');

  // A do-not-contact refusal covers every channel. Someone who asked us to stop
  // must not receive a notification on any channel.
  if (customer.currentStage === 'lost') {
    return fail(res, 409, 'Customer is marked do-not-contact — refusing to send');
  }

  const track = { kind: kind || (req.admin ? 'admin' : 'api_notify'), customerId: customer.id };

  const viaWhatsApp = () =>
    text
      ? sendWhatsAppText({ phone: target, text, track })
      : sendWhatsAppTemplate({ phone: target, templateName, language, placeholders, track });
  // India SMS is DLT-regulated: a free-text body only delivers when it matches
  // the template registered under `templateName`; otherwise the carrier drops it.
  const viaSms = () => sendVoxSms({ phone: target, body: text, templateId: templateName, track });

  let used: 'sms' | 'whatsapp' = channel === 'sms' ? 'sms' : 'whatsapp';
  let result: { ok: boolean; messageId?: string; error?: string };

  if (channel === 'sms') {
    result = await viaSms();
  } else if (channel === 'whatsapp') {
    result = await viaWhatsApp();
  } else {
    // auto: prefer WhatsApp, fall back to SMS if WhatsApp couldn't be sent.
    result = await viaWhatsApp();
    used = 'whatsapp';
    if (!result.ok) {
      const sms = await viaSms();
      result = sms;
      used = 'sms';
    }
  }

  const who = req.admin?.email ? `by ${req.admin.email}` : 'via API';
  const what = text ? text.slice(0, 160) : `template "${templateName ?? 'default'}"`;
  await recordConversation({
    phone: target,
    channel: used,
    summary: result.ok ? `${used.toUpperCase()} sent ${who}: ${what}` : `${used.toUpperCase()} send FAILED (${result.error ?? 'unknown'}) ${who}`,
    customerId: customer.id,
  }).catch((e) => log.error('could not record conversation', { error: String(e) }));

  log[result.ok ? 'info' : 'warn']('notify', { customerId: customer.id, phone: target, channel: used, ok: result.ok, error: result.error ?? null });

  const data = {
    messageId: result.messageId ?? null,
    channel: used,
    status: result.ok ? 'sent' : 'failed',
    customerId: customer.id,
  };
  if (!result.ok) {
    return res.status(502).json({ success: false, data, message: result.error || 'Send failed', error: result.error || 'send_failed' });
  }
  return ok(res, data, 'Notification sent');
}));
