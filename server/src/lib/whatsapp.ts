/**
 * WhatsApp Business sender with two interchangeable backends:
 *
 *   - Meta Cloud API (`meta_whatsapp` integration) — direct to Meta. Used when enabled.
 *     https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 *   - Voxvalley / VOX DIGITALS CPaaS (`voxvalley` integration) — used otherwise.
 *     https://cpaas.voxdigitals.com/docs/api-docs/whatsapp/send-message
 *
 * The one rule that shapes this whole file: **WhatsApp does not let a business
 * send free-form text to someone who has not messaged it in the last 24 hours.**
 * Outside that window only a pre-approved *template* may be sent. So:
 *
 *   - anything WE initiate (a nudge, a drop-off follow-up) -> sendTemplate()
 *   - a reply inside a live conversation                   -> sendText()
 *
 * A 200 only means the message was QUEUED/ACCEPTED, never delivered; delivery
 * arrives later on a webhook. Neither backend is told about that webhook here.
 */
import { getProviderConfig } from './integrations.js';
import { defaultCallbackUrl } from './messageCallback.js';
import { recordSend, type TriggerInfo } from './messageDelivery.js';

export interface WhatsAppResult {
  ok: boolean;
  status: number;
  /** Provider's message id (Voxvalley `id`, Meta `messages[0].id`). */
  messageId?: string;
  /** Voxvalley's `status` field, e.g. "Success" / "FAILED". */
  providerStatus?: string;
  error?: string;
  body?: any;
}

/** Digits only with a country code; a bare 10-digit number is treated as Indian. */
function toMsisdn(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 10 ? digits : `91${digits.slice(-10)}`;
}

type Backend =
  | { kind: 'voxvalley'; base: string; token: string; settings: Record<string, any> }
  | { kind: 'meta'; base: string; token: string; settings: Record<string, any> };

async function ready(): Promise<Backend | string> {
  // Meta wins when it is switched on, so turning it on is the whole cut-over.
  const meta = await getProviderConfig('meta_whatsapp');
  if (meta.enabled) {
    const base = String(meta.settings.baseUrl || '').replace(/\/+$/, '');
    if (!base) return 'Meta WhatsApp baseUrl is not configured';
    const token = String((meta.secrets as any).accessToken ?? (meta.secrets as any).apiKey ?? '');
    if (!token) return 'Meta WhatsApp accessToken is not configured';
    if (!meta.settings.phoneNumberId) return 'Meta WhatsApp phoneNumberId is not configured';
    return { kind: 'meta', base, token, settings: meta.settings };
  }

  const cfg = await getProviderConfig('voxvalley');
  if (!cfg.enabled) return 'No WhatsApp provider is enabled';
  const base = String(cfg.settings.baseUrl || '').replace(/\/+$/, '');
  if (!base) return 'Voxvalley baseUrl is not configured';
  const token = String((cfg.secrets as any).authToken ?? (cfg.secrets as any).apiKey ?? '');
  if (!token) return 'Voxvalley authToken is not configured';
  if (!cfg.settings.projectId) return 'Voxvalley projectId is not configured';
  if (!cfg.settings.sender) return 'Voxvalley WhatsApp sender number is not configured';
  return { kind: 'voxvalley', base, token, settings: cfg.settings };
}

/* ───────────────────────────── request builders ───────────────────────────── */

/** Voxvalley fields every send needs, whatever the content type. */
/** The only categories Meta knows. Anything else is ignored rather than sent. */
export const WHATSAPP_CATEGORIES = ['UTILITY', 'MARKETING', 'AUTHENTICATION'] as const;
export type WhatsappCategory = (typeof WHATSAPP_CATEGORIES)[number];
export function cleanCategory(v: unknown): WhatsappCategory | undefined {
  const u = String(v ?? '').trim().toUpperCase();
  return (WHATSAPP_CATEGORIES as readonly string[]).includes(u) ? (u as WhatsappCategory) : undefined;
}

function voxEnvelope(r: Backend, phone: string, referenceId?: string, category?: string) {
  const messageCategory = cleanCategory(category) ?? cleanCategory(r.settings.messageCategory);
  return {
    projectid: String(r.settings.projectId),
    from: toMsisdn(String(r.settings.sender)),
    // Recipient goes out as +91XXXXXXXXXX, matching the working Vox request. The
    // docs' examples omit the '+', so `recipientPlus: false` restores that form.
    // The admin form saves plain fields as text, so "false" must count as false too.
    to: `${r.settings.recipientPlus === false || String(r.settings.recipientPlus).trim().toLowerCase() === 'false' ? '' : '+'}${toMsisdn(phone)}`,
    // The template's own category wins; the card's category is only the fallback for templates that have none.
    ...(messageCategory ? { messageCategory } : {}),
    ...(((r.settings.callbackUrl as string) || defaultCallbackUrl()) ? { callbackUrl: String((r.settings.callbackUrl as string) || defaultCallbackUrl()) } : {}),
    ...(referenceId ? { referenceId } : {}),
  };
}

function metaEnvelope(phone: string, referenceId?: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toMsisdn(phone),
    // Echoed back on the delivery webhook so a status can be matched to our row.
    ...(referenceId ? { biz_opaque_callback_data: referenceId } : {}),
  };
}

function sendUrl(r: Backend): string {
  if (r.kind === 'meta') {
    return `${r.base}/${String(r.settings.apiVersion || 'v21.0')}/${String(r.settings.phoneNumberId)}/messages`;
  }
  return `${r.base}${String(r.settings.sendPath || '/api/v1/whatsapp/send')}`;
}

/* ──────────────────────────────── transport ──────────────────────────────── */

async function post(r: Backend, payload: unknown): Promise<WhatsAppResult> {
  let res: Response;
  try {
    res = await fetch(sendUrl(r), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${r.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    // Network/TLS failure. Behind a TLS-inspecting proxy this surfaces as
    // SELF_SIGNED_CERT_IN_CHAIN — see the note in sms.ts.
    return { ok: false, status: 0, error: (e as Error).message };
  }

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }

  const providerStatus: string | undefined = json?.status != null ? String(json.status) : undefined;
  // Voxvalley errors look like { status: "FAILED", message }, Meta's like
  // { error: { message, code } }. An HTTP 200 carrying either is still a failure.
  const failed = !res.ok || json?.error != null || String(providerStatus ?? '').toUpperCase() === 'FAILED';

  if (failed) {
    const error: string =
      json?.error?.error_user_msg ?? json?.error?.message ?? json?.message ?? (text.slice(0, 300) || `HTTP ${res.status}`);
    console.error(`[whatsapp] send failed via ${r.kind} http=${res.status} ${error}`);
    return { ok: false, status: res.status, providerStatus, error, body: json };
  }

  const messageId = json?.messages?.[0]?.id ?? json?.id ?? json?.gtrid;
  console.log(`[whatsapp] accepted via ${r.kind} id=${messageId ?? '-'} status=${providerStatus ?? '-'}`);
  return { ok: true, status: res.status, messageId, providerStatus, body: json };
}

/** What a send is for, so the delivery list can say why a message went out. */
export interface SendTrack {
  /** install_reminder | app_dropoff | applied_nudge | stall | admin | test | other */
  kind?: string;
  customerId?: string | null;
  /** What fired this message (shown in Admin → WhatsApp → Sent messages). */
  trigger?: TriggerInfo;
}

/** Remember the send (accepted or refused) so its delivery status can be followed. Never changes the result. */
async function tracked(
  result: WhatsAppResult,
  info: { phone: string; template?: string | null; referenceId?: string; track?: SendTrack; language?: string; category?: string | null; placeholders?: string[] },
): Promise<WhatsAppResult> {
  await recordSend({
    channel: 'whatsapp',
    providerRef: result.ok ? result.messageId ?? null : null,
    gtrid: result.ok ? (result.body?.gtrid ?? null) : null,
    referenceId: info.referenceId ?? null,
    phone: info.phone,
    template: info.template ?? null,
    kind: info.track?.kind ?? 'other',
    customerId: info.track?.customerId ?? null,
    ok: result.ok,
    error: result.error ?? null,
    meta: {
      ...(info.language ? { language: info.language } : {}),
      ...(info.category !== undefined ? { category: info.category } : {}),
      ...(info.placeholders ? { placeholders: info.placeholders } : {}),
      ...(info.track?.trigger ? { trigger: info.track.trigger } : {}),
    },
  });
  return result;
}

/* ───────────────────────────────── public API ───────────────────────────────── */

/**
 * Business-initiated message. `placeholders` fill the template body's {{1}},
 * {{2}}… in order — their count and order must match the approved template
 * exactly or WhatsApp rejects the message.
 */
export async function sendWhatsAppTemplate(opts: {
  phone: string;
  templateName?: string;
  language?: string;
  placeholders?: string[];
  /** Client correlation id, echoed back on the delivery callback. */
  referenceId?: string;
  /** What this send is for (delivery tracking). */
  track?: SendTrack;
  /** UTILITY | MARKETING | AUTHENTICATION for THIS template; falls back to the card's category. */
  category?: string;
}): Promise<WhatsAppResult> {
  const r = await ready();
  if (typeof r === 'string') return { ok: false, status: 0, error: r };

  const templateName = opts.templateName || String(r.settings.defaultTemplate || '');
  if (!templateName) return { ok: false, status: 0, error: 'No WhatsApp template name configured' };

  const placeholders = opts.placeholders ?? [];
  const template = {
    name: templateName,
    language: { code: opts.language || String(r.settings.defaultLanguage || 'en') },
    // A template with no variables must omit `components` entirely.
    ...(placeholders.length
      ? { components: [{ type: 'body', parameters: placeholders.map((text) => ({ type: 'text', text })) }] }
      : {}),
  };

  const envelope = r.kind === 'meta' ? metaEnvelope(opts.phone, opts.referenceId) : voxEnvelope(r, opts.phone, opts.referenceId, opts.category);
  return tracked(await post(r, { ...envelope, type: 'template', template }), {
    phone: opts.phone, template: templateName, referenceId: opts.referenceId, track: opts.track,
    language: template.language.code,
    category: r.kind === 'meta' ? null : (cleanCategory(opts.category) ?? cleanCategory(r.settings.messageCategory) ?? null),
    placeholders,
  });
}

/**
 * Free-form text. ONLY valid inside the 24-hour customer service window; use
 * sendWhatsAppTemplate for anything we initiate.
 */
export async function sendWhatsAppText(opts: { phone: string; text: string; referenceId?: string; track?: SendTrack }): Promise<WhatsAppResult> {
  const r = await ready();
  if (typeof r === 'string') return { ok: false, status: 0, error: r };

  const envelope = r.kind === 'meta' ? metaEnvelope(opts.phone, opts.referenceId) : voxEnvelope(r, opts.phone, opts.referenceId);
  return tracked(await post(r, { ...envelope, type: 'text', text: { body: opts.text } }), { phone: opts.phone, template: null, referenceId: opts.referenceId, track: opts.track });
}

/** True when a provider is configured well enough to attempt a send. */
export async function whatsappConfigured(): Promise<boolean> {
  return typeof (await ready()) !== 'string';
}
