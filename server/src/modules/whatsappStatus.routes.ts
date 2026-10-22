/**
 * Public webhook the WhatsApp gateway posts delivery-status callbacks to: queued → sent → delivered → read, or failed
 * with the reason. Mounted at /api/webhooks/whatsapp. Public because the provider calls it from its own servers, so
 * it is protected by a key of its own (WHATSAPP_WEBHOOK_KEY: deliberately NOT the Ello secret, because it travels in
 * the URL the provider stores), passed as `?key=` or `x-webhook-secret`.
 *
 * Rules, same as the other provider webhooks: once authenticated, never answer 4xx for a body we could not read (the
 * provider would retry forever), and always keep the raw body when we could not read it.
 */
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { parseStatusPayload } from '../lib/messageStatus.js';
import { applyStatusEvents, recordUnparsed } from '../lib/messageDelivery.js';
import { scoped } from '../lib/log.js';

const log = scoped('whatsapp-status');

export const whatsappWebhookKey = () => (process.env.WHATSAPP_WEBHOOK_KEY ?? '').trim();

function same(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const whatsappStatusRouter = Router();

// Meta-style verification handshake (the provider's "set webhook" step): echo the challenge if the token is ours.
whatsappStatusRouter.get('/', (req, res) => {
  const key = whatsappWebhookKey();
  const q = req.query as Record<string, string | undefined>;
  if (key && q['hub.mode'] === 'subscribe' && same(String(q['hub.verify_token'] ?? ''), key)) {
    return res.status(200).type('text/plain').send(String(q['hub.challenge'] ?? ''));
  }
  return res.status(403).type('text/plain').send('forbidden');
});

whatsappStatusRouter.post('/', ah(async (req, res) => {
  const key = whatsappWebhookKey();
  if (!key) return fail(res, 503, 'WhatsApp status webhook is not configured (set WHATSAPP_WEBHOOK_KEY)');
  const provided = String(req.query.key ?? '') || String(req.headers['x-webhook-secret'] ?? '');
  if (!provided || !same(provided, key)) return fail(res, 401, 'Invalid webhook key');

  const events = parseStatusPayload(req.body);
  if (events.length === 0) {
    await recordUnparsed(req.body);
    log.warn('callback with no readable status events stored raw', { bytes: JSON.stringify(req.body ?? null).length });
    return ok(res, { events: 0, matched: 0, created: 0 }, 'Received (no status events found)');
  }
  const result = await applyStatusEvents(events);
  log.info('status events applied', { ...result, statuses: events.map((e) => e.status ?? e.rawStatus).join(',') });
  return ok(res, result, 'Received');
}));
