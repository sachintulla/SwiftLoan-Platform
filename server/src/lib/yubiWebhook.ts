/**
 * Pure helpers for the inbound Yubi (YMPL) status webhook — see
 * modules/yubiWebhook.routes.ts. Kept free of Express/Prisma so the auth and
 * payload-parsing rules are unit-testable.
 *
 * YMPL has not published a webhook contract, so the payload parser is
 * deliberately tolerant: it accepts the field names their Get Status API
 * already uses (clientReferralId / ymplReferralId / journeyStatus) at the top
 * level or under `data`, in camelCase or snake_case.
 */
import crypto from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Accepts either the shared secret itself (x-api-key / x-webhook-secret /
 * Authorization: Bearer) or an HMAC-SHA256 of the raw body (hex or base64) in
 * x-signature / x-yubi-signature, optionally prefixed `sha256=`.
 */
export function yubiAuthOk(
  secret: string,
  headers: Record<string, string | undefined>,
  rawBody: Buffer,
): boolean {
  if (!secret) return false;

  const bearer = (headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
  const direct = headers['x-webhook-secret'] || headers['x-api-key'] || bearer;
  if (direct && safeEqual(direct, secret)) return true;

  const sig = (headers['x-yubi-signature'] || headers['x-signature'] || '').replace(/^sha256=/i, '');
  if (sig) {
    const hex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const b64 = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return safeEqual(hex, sig.toLowerCase()) || safeEqual(b64, sig);
  }
  return false;
}

export interface YubiEvent {
  clientReferralId: string | null;
  ymplReferralId: string | null;
  /** Journey stage, e.g. NEW_LEAD — stored verbatim as PartnerReferral.lastStatus. */
  status: string | null;
  lender: string | null;
  eventId: string | null;
}

function pick(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

export function parseYubiEvent(body: any): YubiEvent {
  const layers = [body, body?.data, body?.referral, body?.data?.referral];
  const first = (keys: string[]) => {
    for (const l of layers) {
      const v = pick(l, keys);
      if (v) return v;
    }
    return null;
  };
  return {
    clientReferralId: first(['clientReferralId', 'client_referral_id']),
    ymplReferralId: first(['ymplReferralId', 'ympl_referral_id', 'referralId', 'referral_id']),
    status: first(['journeyStatus', 'journey_status', 'status', 'event', 'eventType', 'event_type']),
    lender: first(['lender', 'lenderName', 'lender_name']),
    eventId: first(['eventId', 'event_id', 'id']),
  };
}
