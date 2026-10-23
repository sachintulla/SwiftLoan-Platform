import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok, fail } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { verifyAccess } from '../lib/jwt.js';
import { isMetaEvent, metaCapiConfig, sendMetaEvent } from '../lib/metaCapi.js';

/**
 * POST /api/meta/event — the website's server-side Meta Conversions API relay.
 *
 * Public on purpose (a marketing visitor has no account yet), so it is narrow:
 * a small event allow-list, an explicit `consent: true`, strict shape checks, a
 * per-IP rate limit (mounted in app.ts), and it answers immediately — the Meta
 * call runs after the response and can never slow or break the page.
 *
 * When the caller is signed in (Bearer token) the hashed phone / email / user id
 * come from OUR record, not from the request, so they cannot be spoofed. An anonymous
 * visitor is matched on Meta's own cookies (fbp/fbc), IP and user agent only — the
 * request never carries personal identifiers.
 */
export const metaRouter = Router();

const EVENT_ID_RE = /^[A-Za-z0-9._:-]{8,64}$/;

function softUserId(authorization: unknown): string | null {
  const header = String(authorization || '');
  if (!header.startsWith('Bearer ')) return null;
  try {
    return (verifyAccess(header.slice(7)) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

metaRouter.post('/event', ah(async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (b.consent !== true) return fail(res, 400, 'consent required');
  if (!isMetaEvent(b.eventName)) return fail(res, 400, 'unsupported event');
  if (typeof b.eventId !== 'string' || !EVENT_ID_RE.test(b.eventId)) return fail(res, 400, 'invalid eventId');

  const cfg = metaCapiConfig();
  if (!cfg.enabled) return ok(res, { sent: false, reason: 'disabled' }, 'Meta CAPI disabled');

  const eventName = b.eventName;
  const eventId = b.eventId;
  const userId = softUserId(req.headers['authorization']);
  const eventSourceUrl = typeof b.eventSourceUrl === 'string' ? b.eventSourceUrl : undefined;
  const fbp = typeof b.fbp === 'string' ? b.fbp : undefined;
  const fbc = typeof b.fbc === 'string' ? b.fbc : undefined;
  const clientIp = req.ip || undefined;
  const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;

  // Respond first; deliver in the background.
  ok(res, { queued: true }, 'Queued');

  void (async () => {
    let phone: string | null = null;
    let email: string | null = null;
    if (userId) {
      // `prisma.ts` omits PAN columns by default; phone/email are plain fields.
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, email: true } }).catch(() => null);
      phone = u?.phone ?? null;
      email = u?.email ?? null;
    }
    await sendMetaEvent({ eventName, eventId, eventSourceUrl, fbp, fbc, userId, phone, email, clientIp, userAgent }, cfg);
  })();
}));
