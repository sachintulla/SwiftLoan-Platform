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
import { sendWhatsAppTemplate, sendWhatsAppText, whatsappConfigured, cleanCategory } from '../lib/whatsapp.js';
import { DEFAULT_SETTINGS, getProviderConfig } from '../lib/integrations.js';
import { timing } from '../lib/timings.js';
import { itemFor, readCatalog, settingsAfterChange, validateSpec, type Change } from '../lib/whatsappCatalog.js';
import { STARTER_AS_OF, buildTemplateRows, isSeeded, libraryAfterChange, readLibrary, starterLibrary, validateEntry } from '../lib/voxTemplates.js';
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
    /** UTILITY | MARKETING | AUTHENTICATION for this template (a test of how the template's real category behaves). */
    category: z.string().optional(),
    text: z.string().min(1).max(4096).optional(),
  }).refine((b) => Boolean(b.customerId || b.phone), {
    message: 'customerId or phone is required',
  })),
  ah(async (req, res) => {
    const { customerId, phone, templateName, language, placeholders, text, category } = req.body as {
      customerId?: string; phone?: string; templateName?: string;
      language?: string; placeholders?: string[]; text?: string; category?: string;
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
      ? await sendWhatsAppText({ phone: target, text, track: { kind: 'admin', customerId: customer.id } })
      : await sendWhatsAppTemplate({ phone: target, templateName, language, placeholders, category: cleanCategory(category), track: { kind: 'admin', customerId: customer.id, trigger: { by: `Sent by ${req.admin?.email ?? 'an admin'}` } } });

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


/* ───────────────────────── message catalogue ─────────────────────────
 * Every WhatsApp message the system sends, with the template, variables and category in force and whether its group is
 * actually sending. Reads are open to any admin; changes are super-admin only and audited like every other admin write.
 * The rules live in lib/whatsappCatalog.ts.
 */

async function rawVoxSettings(): Promise<Record<string, any>> {
  const row = await prisma.integrationConfig.findUnique({ where: { provider: 'voxvalley' } });
  return ((row?.settings as Record<string, any>) ?? {});
}

/** Replace the settings row (the normal save merges, so it cannot remove an entry). Secrets and the on/off switch are left alone. */
async function writeVoxSettings(settings: Record<string, any>, updatedBy?: string): Promise<void> {
  await prisma.integrationConfig.upsert({
    where: { provider: 'voxvalley' },
    create: { provider: 'voxvalley', enabled: false, settings, secrets: {}, updatedBy },
    update: { settings, updatedBy },
  });
}

// GET /api/admin/whatsapp/catalog
whatsappRouter.get('/catalog', ah(async (_req, res) => {
  const [raw, cfg] = await Promise.all([rawVoxSettings(), getProviderConfig('voxvalley')]);
  const testList = timing.phones('install.allowedNumbers');
  return ok(res, {
    connection: {
      enabled: cfg.enabled,
      projectId: String(cfg.settings.projectId ?? ''),
      sender: String(cfg.settings.sender ?? ''),
      tokenSaved: !!(cfg.secrets.authToken ?? cfg.secrets.apiKey),
      cardCategory: cleanCategory(cfg.settings.messageCategory) ?? '',
      configured: await whatsappConfigured(),
    },
    // Whether each group is really sending. Off = it only records what it would send (log-only); a test-number list narrows it further.
    switches: {
      dropoff: timing.bool('dropoff.sendEnabled'),
      install: timing.bool('install.sendEnabled'),
      applied: timing.bool('applied.sendEnabled'),
      noOffersCall: timing.bool('dropoff.noOffersCallEnabled'),
      testNumbers: testList.length,
    },
    items: readCatalog(raw, DEFAULT_SETTINGS.voxvalley as Record<string, any>),
  }, 'WhatsApp message catalogue');
}));

const changeSchema = z.object({
  /** 'set' (default) saves the fields; 'off' switches the message off; the DELETE route resets it. */
  action: z.enum(['set', 'off']).optional(),
  template: z.string().optional(),
  language: z.string().optional(),
  placeholders: z.array(z.string()).optional(),
  category: z.string().optional(),
});

// PUT /api/admin/whatsapp/catalog/:key
whatsappRouter.put('/catalog/:key', requireRole(...CAN_ADMINISTER), validate(changeSchema), ah(async (req, res) => {
  const key = String(req.params.key);
  const item = itemFor(key);
  if (!item) return fail(res, 404, 'Unknown message');
  const body = req.body as z.infer<typeof changeSchema>;
  const raw = await rawVoxSettings();
  const current = readCatalog(raw, DEFAULT_SETTINGS.voxvalley as Record<string, any>).find((e) => e.key === key);

  let change: Change;
  if (body.action === 'off') {
    if (!current) return fail(res, 404, 'Unknown message');
    change = { kind: 'off', current: current.spec };
  } else {
    const checked = validateSpec(item, body);
    if (!checked.ok) {
      const message = Object.values(checked.errors)[0] ?? 'Invalid message';
      return res.status(400).json({ success: false, data: null, message, error: message, errors: checked.errors });
    }
    change = { kind: 'set', spec: checked.spec };
  }
  await writeVoxSettings(settingsAfterChange(raw, key, change), req.admin?.email);
  log.info('catalogue message changed', { key, action: change.kind, by: req.admin?.email ?? null });
  const fresh = readCatalog(await rawVoxSettings(), DEFAULT_SETTINGS.voxvalley as Record<string, any>).find((e) => e.key === key);
  return ok(res, fresh, 'Message saved');
}));

// DELETE /api/admin/whatsapp/catalog/:key — forget the saved entry; the shipped default (or nothing) applies again
whatsappRouter.delete('/catalog/:key', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const key = String(req.params.key);
  if (!itemFor(key)) return fail(res, 404, 'Unknown message');
  const raw = await rawVoxSettings();
  await writeVoxSettings(settingsAfterChange(raw, key, { kind: 'reset' }), req.admin?.email);
  log.info('catalogue message reset', { key, by: req.admin?.email ?? null });
  const fresh = readCatalog(await rawVoxSettings(), DEFAULT_SETTINGS.voxvalley as Record<string, any>).find((e) => e.key === key);
  return ok(res, fresh, 'Message reset to default');
}));

/* ───────────────────────── template library ─────────────────────────
 * The admin's own record of the templates that exist in Vox / Meta (name, language, category, approval, text, note). Adding one here does NOT
 * create it in Vox. First read fills it from our notes of 27 Oct 2026 so nobody starts empty. Rules: lib/voxTemplates.ts.
 */

/** The stored library, filling it from the starter list the first time (a one-off write, only if it was never saved). */
async function libraryOf(updatedBy?: string): Promise<{ raw: Record<string, any>; entries: ReturnType<typeof readLibrary>; seeded: boolean }> {
  const raw = await rawVoxSettings();
  if (isSeeded(raw.templateLibrary)) return { raw, entries: readLibrary(raw.templateLibrary), seeded: false };
  const next = { ...raw, templateLibrary: starterLibrary() };
  await writeVoxSettings(next, updatedBy);
  return { raw: next, entries: readLibrary(next.templateLibrary), seeded: true };
}

async function templatePayload(updatedBy?: string) {
  const { raw, entries, seeded } = await libraryOf(updatedBy);
  const catalog = readCatalog(raw, DEFAULT_SETTINGS.voxvalley as Record<string, any>);
  // Only real records: templates the team recorded, plus any a message uses that nobody recorded yet. No suggestions from the catalogue.
  return { items: buildTemplateRows(entries, catalog), prefilled: seeded, prefilledFrom: STARTER_AS_OF };
}

// GET /api/admin/whatsapp/templates
whatsappRouter.get('/templates', ah(async (req, res) => ok(res, await templatePayload(req.admin?.email), 'WhatsApp templates')));

const templateSchema = z.object({
  language: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  body: z.string().optional(),
  note: z.string().optional(),
});

// PUT /api/admin/whatsapp/templates/:name — add a template, or change one
whatsappRouter.put('/templates/:name', requireRole(...CAN_ADMINISTER), validate(templateSchema), ah(async (req, res) => {
  const checked = validateEntry({ ...(req.body as object), name: String(req.params.name) });
  if (!checked.ok) {
    const message = Object.values(checked.errors)[0] ?? 'Invalid template';
    return res.status(400).json({ success: false, data: null, message, error: message, errors: checked.errors });
  }
  const { raw } = await libraryOf(req.admin?.email);
  await writeVoxSettings({ ...raw, templateLibrary: libraryAfterChange(raw.templateLibrary, { kind: 'set', entry: checked.entry }) }, req.admin?.email);
  log.info('template saved', { name: checked.entry.name, by: req.admin?.email ?? null });
  return ok(res, await templatePayload(req.admin?.email), 'Template saved');
}));

// DELETE /api/admin/whatsapp/templates/:name — remove a template from the library (a message that still uses it keeps working; it just shows as "not added")
whatsappRouter.delete('/templates/:name', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const name = String(req.params.name);
  const { raw } = await libraryOf(req.admin?.email);
  await writeVoxSettings({ ...raw, templateLibrary: libraryAfterChange(raw.templateLibrary, { kind: 'remove', name }) }, req.admin?.email);
  log.info('template removed', { name, by: req.admin?.email ?? null });
  return ok(res, await templatePayload(req.admin?.email), 'Template removed');
}));
