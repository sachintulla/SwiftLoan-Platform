/**
 * Meta Conversions API (CAPI) — server-side half of the website's Meta Pixel.
 *
 * The browser Pixel and this sender report the SAME moment with the SAME
 * `event_id`; Meta de-duplicates them, so blocked scripts / ITP no longer lose
 * conversions but nothing is counted twice.
 *
 * Privacy rules (a lending product — keep this list short and enforced here):
 *  - Only the coarse funnel events in `META_EVENTS` are ever sent. No amounts,
 *    PAN, income, address, credit data or loan details are accepted at all.
 *  - Personal identifiers (phone, email, user id) are SHA-256 hashed in memory,
 *    exactly as Meta specifies, and are never stored or logged.
 *  - The caller only sends after the visitor accepted ad measurement on the site;
 *    the route additionally requires `consent: true`.
 *  - `META_CAPI_TOKEN` is env-only (no fallback in source). Unset = disabled, and the
 *    route says so without doing anything.
 *
 * Everything is best-effort: a Meta failure must never break a customer request.
 */
import { createHash } from 'node:crypto';
import { scoped } from './log.js';

const log = scoped('meta-capi');

/** The only events the site may report (standard Meta names where one exists, so Ads Manager can optimise on them). */
export const META_EVENTS = [
  'Lead',
  'CompleteRegistration',
  'ViewContent',
  'IdentityVerified',
  'EligibilityCompleted',
  'OffersReceived',
  'InitiateCheckout',
  'SubmitApplication',
] as const;
export type MetaEventName = (typeof META_EVENTS)[number];

export function isMetaEvent(v: unknown): v is MetaEventName {
  return typeof v === 'string' && (META_EVENTS as readonly string[]).includes(v);
}

export interface MetaCapiConfig {
  enabled: boolean;
  pixelId: string;
  token: string;
  graphVersion: string;
  testEventCode: string;
}

export function metaCapiConfig(env: NodeJS.ProcessEnv = process.env): MetaCapiConfig {
  const pixelId = (env.META_PIXEL_ID || '').trim();
  const token = (env.META_CAPI_TOKEN || '').trim();
  return {
    enabled: env.META_CAPI_ENABLED !== 'false' && !!pixelId && !!token,
    pixelId,
    token,
    graphVersion: (env.META_GRAPH_VERSION || 'v23.0').trim(),
    testEventCode: (env.META_TEST_EVENT_CODE || '').trim(),
  };
}

const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

/** Meta wants lower-cased, trimmed values for hashing. */
export function hashEmail(email?: string | null): string | undefined {
  const e = (email || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? sha256(e) : undefined;
}

/**
 * Meta phone format: digits only WITH country code, no "+" or leading zeros.
 * A bare 10-digit number is an Indian mobile (this product is India-only).
 */
export function hashPhone(phone?: string | null): string | undefined {
  const digits = (phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length < 10) return undefined;
  return sha256(digits.length === 10 ? `91${digits}` : digits);
}

export function hashExternalId(id?: string | null): string | undefined {
  const v = (id || '').trim();
  return v ? sha256(v) : undefined;
}

/** `_fbp` / `_fbc` cookie values are opaque but have a fixed shape; refuse anything else. */
const FB_COOKIE_RE = /^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]{4,200}$/;
export const cleanFbCookie = (v: unknown): string | undefined =>
  typeof v === 'string' && FB_COOKIE_RE.test(v.trim()) ? v.trim() : undefined;

export interface MetaEventInput {
  eventName: MetaEventName;
  /** Same id the Pixel used for this event — required for de-duplication. */
  eventId: string;
  eventSourceUrl?: string;
  fbp?: string;
  fbc?: string;
  userId?: string | null;
  phone?: string | null;
  email?: string | null;
  clientIp?: string;
  userAgent?: string;
  /** Unix seconds; defaults to now. */
  eventTime?: number;
}

/** Build the single-event CAPI request body (without the access token). */
export function buildMetaPayload(input: MetaEventInput, cfg: Pick<MetaCapiConfig, 'testEventCode'>) {
  const userData: Record<string, unknown> = {};
  const em = hashEmail(input.email);
  const ph = hashPhone(input.phone);
  const ext = hashExternalId(input.userId);
  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (ext) userData.external_id = [ext];
  // IP + user agent are sent in the clear on purpose (Meta: client_ip_address must NOT be hashed).
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent.slice(0, 500);
  const fbp = cleanFbCookie(input.fbp);
  const fbc = cleanFbCookie(input.fbc);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: 'website',
        ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl.slice(0, 1000) } : {}),
        user_data: userData,
      },
    ],
    ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
  };
}

/** Sends one event. Never throws; resolves `{ sent: false }` when disabled or Meta refuses. */
export async function sendMetaEvent(
  input: MetaEventInput,
  cfg: MetaCapiConfig = metaCapiConfig(),
  doFetch: typeof fetch = fetch,
): Promise<{ sent: boolean; reason?: string }> {
  if (!cfg.enabled) return { sent: false, reason: 'disabled' };
  try {
    const res = await doFetch(`https://graph.facebook.com/${cfg.graphVersion}/${cfg.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Token in the body, not the URL, so it never lands in an access log.
      body: JSON.stringify({ ...buildMetaPayload(input, cfg), access_token: cfg.token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      // Meta's error body can echo request fields; log the status and its error message only.
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      log.warn(`CAPI ${input.eventName} rejected: ${res.status} ${body?.error?.message ?? ''}`.trim());
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (e) {
    log.warn(`CAPI ${input.eventName} failed: ${(e as Error).message}`);
    return { sent: false, reason: 'network' };
  }
}
