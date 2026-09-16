/**
 * Admin-facing WhatsApp routes. Mounted at /api/admin/whatsapp behind
 * requireAdmin, mirroring calls.routes.ts — sending a WhatsApp message to a real
 * customer is the same class of action as ringing them, so it gets the same
 * guards and the same audit trail.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, fail } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { resolveCustomer } from '../lib/journey.js';
import { normalisePhone } from '../lib/dialer.js';
import { sendWhatsAppTemplate, sendWhatsAppText, whatsappConfigured } from '../lib/whatsapp.js';
import { recordConversation } from '../lib/conversations.js';
import { scoped } from '../lib/log.js';

const log = scoped('whatsapp');

export const whatsappRouter = Router();
whatsappRouter.use(requireAdmin);
whatsappRouter.use(requireActiveAdmin);
whatsappRouter.use(auditAdmin);

// GET /api/admin/whatsapp/status — lets the UI disable the button with a reason
// instead of offering an action that cannot work.
whatsappRouter.get('/status', ah(async (_req, res) => {
  return ok(res, { configured: await whatsappConfigured() }, 'WhatsApp status');
}));

/**
 * POST /api/admin/whatsapp/send
 *
 * Either `templateName` (+ placeholders) for a business-initiated message, or
 * `text` for a reply inside the 24-hour window. Defaults to the configured
 * template when neither is given, because an operator clicking "Send WhatsApp"
 * on a customer almost always means the standard outreach template.
 */
whatsappRouter.post('/send', requireRole(...CAN_ADMINISTER),
  validate(z.object({
    customerId: z.string().min(1).optional(),
    phone: z.string().min(6).optional(),
    templateName: z.string().min(1).optional(),
    language: z.string().min(1).optional(),
    placeholders: z.array(z.string()).optional(),
    text: z.string().min(1).max(4096).optional(),
  }).refine((b) => Boolean(b.customerId || b.phone), {
    message: 'customerId or phone is required',
  })),
  ah(async (req, res) => {
    const { customerId, phone, templateName, language, placeholders, text } = req.body as {
      customerId?: string; phone?: string; templateName?: string;
      language?: string; placeholders?: string[]; text?: string;
    };

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

    // A do-not-call refusal covers every channel, not just voice. Someone who
    // asked us to stop must not receive a WhatsApp message instead.
    if (customer.currentStage === 'lost') {
      return fail(res, 409, 'Customer is marked do-not-contact — refusing to send');
    }

    const result = text
      ? await sendWhatsAppText({ phone: target, text })
      : await sendWhatsAppTemplate({ phone: target, templateName, language, placeholders });

    log[result.ok ? 'info' : 'warn']('send', { customerId: customer.id, phone: target, ok: result.ok, error: result.error ?? null });

    // Record it either way: the conversation history is the cross-channel spine,
    // and a failed attempt is part of the story of what we tried.
    await recordConversation({
      phone: target,
      channel: 'whatsapp',
      summary: result.ok
        ? `WhatsApp sent by ${req.admin?.email ?? 'admin'}: ${text ? text.slice(0, 160) : `template "${templateName ?? 'default'}"`}`
        : `WhatsApp send FAILED (${result.error ?? 'unknown'})`,
      customerId: customer.id,
    }).catch((e) => log.error('could not record conversation', { error: String(e) }));

    if (!result.ok) {
      return fail(res, 502, `WhatsApp send failed: ${result.error ?? 'provider error'}`);
    }
    return created(res, {
      messageId: result.messageId,
      providerStatus: result.providerStatus,
      phone: target,
      customerId: customer.id,
    }, 'WhatsApp message queued');
  }));
