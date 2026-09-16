/**
 * WS5 — the "all APIs" configuration page backend.
 *
 * Provider endpoints, paths, field mappings and keys live in the database so an
 * operator can wire Ello/Upshot up (and debug their real request shape) without
 * a redeploy. Secret VALUES are write-only: reads only ever say which keys are
 * set.
 */
import { Router } from 'express';
import { z } from 'zod';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import {
  DEFAULT_SETTINGS,
  getProviderConfig,
  upsertProviderConfig,
  describeSecrets,
  triggerElloCall,
  upshotUserUpsert,
  type ProviderName,
} from '../lib/integrations.js';
import { sendWhatsAppTemplate } from '../lib/whatsapp.js';
import { scoped } from '../lib/log.js';

const log = scoped('integrations');

export const integrationsRouter = Router();
integrationsRouter.use(requireAdmin);
integrationsRouter.use(requireActiveAdmin);
integrationsRouter.use(auditAdmin);



const PROVIDERS: ProviderName[] = ['ello', 'upshot', 'infobip'];

function providerParam(value: string): ProviderName {
  if (!PROVIDERS.includes(value as ProviderName)) throw new HttpError(400, `Unknown provider — expected one of ${PROVIDERS.join(', ')}`);
  return value as ProviderName;
}

/** Never include `secrets` — only the key names. */
async function publicView(provider: ProviderName) {
  const cfg = await getProviderConfig(provider);
  return {
    provider,
    enabled: cfg.enabled,
    settings: cfg.settings,
    secretKeys: describeSecrets(cfg.secrets),
  };
}

// GET /api/admin/integrations
integrationsRouter.get('/', ah(async (_req, res) => {
  const providers = await Promise.all(PROVIDERS.map(publicView));
  return ok(res, { providers }, 'Integrations');
}));

// GET /api/admin/integrations/defaults — expected setting keys, for the form
integrationsRouter.get('/defaults', ah(async (_req, res) =>
  ok(res, { defaults: DEFAULT_SETTINGS }, 'Default settings')));

const putSchema = z.object({
  enabled: z.boolean().optional(),
  settings: z.record(z.string(), z.any()).optional(),
  // '' keeps the stored secret, null deletes it (see upsertProviderConfig).
  secrets: z.record(z.string(), z.union([z.string(), z.null()])).optional(),
});

// PUT /api/admin/integrations/:provider
integrationsRouter.put('/:provider', requireRole(...CAN_ADMINISTER), validate(putSchema), ah(async (req, res) => {
  const provider = providerParam(req.params.provider);
  const body = req.body as z.infer<typeof putSchema>;
  const admin = (req as unknown as { admin?: { id?: string; email?: string } }).admin;
  await upsertProviderConfig(provider, body, admin?.email ?? admin?.id);
  log.info('config saved', {
    provider,
    updatedBy: admin?.email ?? admin?.id ?? null,
    enabled: body.enabled,
    settingsChanged: body.settings ? Object.keys(body.settings) : [],
    // Names only — never values.
    secretsChanged: body.secrets ? Object.keys(body.secrets) : [],
  });
  return ok(res, await publicView(provider), 'Integration saved');
}));

const testSchema = z.object({
  /** Ello only: place a real call to this number. Requires confirm:true. */
  testPhone: z.string().min(6).optional(),
  confirm: z.boolean().optional(),
  testUserId: z.string().min(1).optional(),
});

// POST /api/admin/integrations/:provider/test
integrationsRouter.post('/:provider/test', requireRole(...CAN_ADMINISTER), validate(testSchema), ah(async (req, res) => {
  const provider = providerParam(req.params.provider);
  const body = req.body as z.infer<typeof testSchema>;
  const cfg = await getProviderConfig(provider);

  const missing: string[] = [];
  if (!cfg.enabled) missing.push('enabled');

  if (provider === 'ello') {
    if (!cfg.settings.baseUrl) missing.push('settings.baseUrl');
    if (!cfg.settings.triggerPath) missing.push('settings.triggerPath');
    if (!cfg.settings.assistantId) missing.push('settings.assistantId');
    if (!(cfg.secrets.apiKey ?? cfg.secrets.api_key)) missing.push('secrets.apiKey');

    // A dry run by default: nobody wants an accidental real phone call from a
    // "test connection" button.
    if (!body.confirm || !body.testPhone) {
      return ok(res, {
        provider,
        performed: 'dry_run',
        ready: missing.length === 0,
        missing,
        note: 'Send { testPhone, confirm: true } to place a real test call.',
      }, missing.length === 0 ? 'Configuration looks complete' : 'Configuration incomplete');
    }

    const result = await triggerElloCall({
      phone: body.testPhone,
      callId: `test-${Date.now()}`,
      metadata: { test: true, source: 'admin_integration_test' },
    });
    log.info('test call placed', { phone: body.testPhone, ok: result.ok, status: result.status, error: result.error ?? null });
    return ok(res, {
      provider,
      performed: 'live_call',
      ready: missing.length === 0,
      missing,
      ok: result.ok,
      status: result.status,
      error: result.error ?? null,
      providerCallId: result.providerCallId ?? null,
      body: result.body,
    }, result.ok ? 'Test call placed' : 'Test call failed');
  }

  if (provider === 'infobip') {
    if (!cfg.settings.baseUrl) missing.push('settings.baseUrl');
    if (!cfg.settings.sender) missing.push('settings.sender');
    if (!cfg.settings.defaultTemplate) missing.push('settings.defaultTemplate');
    if (!(cfg.secrets.apiKey ?? cfg.secrets.api_key)) missing.push('secrets.apiKey');

    // Dry run by default, for the same reason as Ello: a "test connection"
    // button must not message a real customer's WhatsApp without being asked.
    if (!body.confirm || !body.testPhone) {
      return ok(res, {
        provider,
        performed: 'dry_run',
        ready: missing.length === 0,
        missing,
        note: 'Send { testPhone, confirm: true } to send a real test WhatsApp message.',
      }, missing.length === 0 ? 'Configuration looks complete' : 'Configuration incomplete');
    }

    const result = await sendWhatsAppTemplate({ phone: body.testPhone });
    log.info('test whatsapp sent', { phone: body.testPhone, ok: result.ok, status: result.status, error: result.error ?? null });
    return ok(res, {
      provider,
      performed: 'live_message',
      ready: missing.length === 0,
      missing,
      ok: result.ok,
      status: result.status,
      error: result.error ?? null,
      messageId: result.messageId ?? null,
      providerStatus: result.providerStatus ?? null,
      body: result.body,
    }, result.ok ? 'Test WhatsApp message sent' : 'Test WhatsApp message failed');
  }

  // upshot
  if (!cfg.settings.baseUrl) missing.push('settings.baseUrl');
  if (!cfg.settings.userUpsertPath) missing.push('settings.userUpsertPath');
  if (!cfg.settings.eventPath) missing.push('settings.eventPath');
  if (!(cfg.secrets.apiKey ?? cfg.secrets.token ?? cfg.secrets.api_key)) missing.push('secrets.apiKey');

  const testUserId = body.testUserId ?? `swiftloan-admin-test-${Date.now()}`;
  const result = await upshotUserUpsert({
    userId: testUserId,
    name: 'SwiftLoan Integration Test',
    phone: body.testPhone ?? null,
  });

  return ok(res, {
    provider,
    performed: 'user_upsert',
    testUserId,
    ready: missing.length === 0,
    missing,
    ok: result.ok,
    status: result.status,
    error: result.error ?? null,
    // The provider's raw body, so the operator can fix their own field mapping.
    body: result.body,
  }, result.ok ? 'Upshot reachable' : 'Upshot test failed');
}));
