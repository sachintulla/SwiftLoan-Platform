/**
 * WhatsApp Business via Infobip.
 *
 * The one rule that shapes this whole file: **WhatsApp does not let a business
 * send free-form text to someone who has not messaged it in the last 24 hours.**
 * Outside that window only a pre-approved *template* may be sent. So:
 *
 *   - anything WE initiate (a nudge, a drop-off follow-up) -> sendTemplate()
 *   - a reply inside a live conversation                   -> sendText()
 *
 * Getting that backwards produces a rejection from WhatsApp, not a silent drop,
 * so it is loud — but it is also the single most common reason a WhatsApp
 * integration "works in testing and fails in production": tests are usually run
 * against a number that just messaged you.
 *
 * Verified against the live India endpoint (jrv2lk.api-in.infobip.com):
 *   - auth is `Authorization: App {apiKey}` — with that scheme an unpermitted
 *     endpoint returns 403, while Bearer/IBSSO/none return 401. 403 means the
 *     key authenticated, so `App` is correct.
 *   - /whatsapp/1/message/{text,template} accept the key (400 on an empty body,
 *     i.e. authorised and validating) even though /account/1/balance and
 *     /whatsapp/2/senders return 403 for it. A key scoped only for sending is
 *     therefore perfectly usable — do not treat a 403 on balance as broken auth.
 */
import { getProviderConfig } from './integrations.js';

export interface WhatsAppResult {
  ok: boolean;
  status: number;
  messageId?: string;
  /** Infobip's own delivery group, e.g. PENDING / REJECTED. */
  providerStatus?: string;
  error?: string;
  body?: any;
}

/** E.164 without the leading '+', which is what Infobip's `to` expects. */
function toMsisdn(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 10 ? digits : `91${digits.slice(-10)}`;
}

interface Ready {
  base: string;
  apiKey: string;
  settings: Record<string, any>;
}

async function ready(): Promise<Ready | string> {
  const cfg = await getProviderConfig('infobip');
  if (!cfg.enabled) return 'Infobip integration is disabled';
  const base = String(cfg.settings.baseUrl || '').replace(/\/+$/, '');
  if (!base) return 'Infobip baseUrl is not configured';
  const apiKey = String((cfg.secrets as any).apiKey ?? (cfg.secrets as any).api_key ?? '');
  if (!apiKey) return 'Infobip apiKey is not configured';
  if (!cfg.settings.sender) return 'Infobip WhatsApp sender number is not configured';
  return { base, apiKey, settings: cfg.settings };
}

async function post(r: Ready, path: string, payload: unknown): Promise<WhatsAppResult> {
  let res: Response;
  try {
    res = await fetch(`${r.base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `App ${r.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Network/TLS failure. Behind a TLS-inspecting proxy this surfaces as
    // SELF_SIGNED_CERT_IN_CHAIN — see the note in sms.ts.
    return { ok: false, status: 0, error: (e as Error).message };
  }

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }

  if (!res.ok) {
    // Infobip nests the useful part at requestError.serviceException.
    const ex = json?.requestError?.serviceException;
    const error = ex ? `${ex.messageId ?? ''} ${ex.text ?? ''}`.trim() : text.slice(0, 300);
    console.error(`[whatsapp] send failed http=${res.status} ${error}`);
    return { ok: false, status: res.status, error: error || `HTTP ${res.status}`, body: json };
  }

  // A 200 does NOT mean delivered — it means Infobip queued it. The real
  // outcome arrives later on the delivery report, so report the provider's own
  // status rather than implying the handset received anything.
  const providerStatus = json?.status?.groupName ?? json?.status?.name;
  const messageId = json?.messageId;
  console.log(`[whatsapp] queued messageId=${messageId ?? '-'} status=${providerStatus ?? '-'}`);

  // REJECTED comes back with HTTP 200 — treat it as the failure it is.
  const rejected = String(providerStatus ?? '').toUpperCase().includes('REJECT');
  return {
    ok: !rejected,
    status: res.status,
    messageId,
    providerStatus,
    error: rejected ? `Rejected by WhatsApp: ${providerStatus}` : undefined,
    body: json,
  };
}

/**
 * Business-initiated message. `placeholders` fill the template's {{1}}, {{2}}…
 * in order — their count and order must match the approved template exactly or
 * WhatsApp rejects the message.
 */
export async function sendWhatsAppTemplate(opts: {
  phone: string;
  templateName?: string;
  language?: string;
  placeholders?: string[];
}): Promise<WhatsAppResult> {
  const r = await ready();
  if (typeof r === 'string') return { ok: false, status: 0, error: r };

  const templateName = opts.templateName || String(r.settings.defaultTemplate || '');
  if (!templateName) return { ok: false, status: 0, error: 'No WhatsApp template name configured' };

  const payload = {
    messages: [
      {
        from: String(r.settings.sender),
        to: toMsisdn(opts.phone),
        content: {
          templateName,
          templateData: { body: { placeholders: opts.placeholders ?? [] } },
          language: opts.language || String(r.settings.defaultLanguage || 'en'),
        },
        ...(r.settings.notifyUrl ? { notifyUrl: String(r.settings.notifyUrl) } : {}),
      },
    ],
  };
  return post(r, String(r.settings.templatePath || '/whatsapp/1/message/template'), payload);
}

/**
 * Free-form text. ONLY valid inside the 24-hour customer service window; use
 * sendWhatsAppTemplate for anything we initiate.
 */
export async function sendWhatsAppText(opts: { phone: string; text: string }): Promise<WhatsAppResult> {
  const r = await ready();
  if (typeof r === 'string') return { ok: false, status: 0, error: r };

  const payload = {
    messages: [
      {
        from: String(r.settings.sender),
        to: toMsisdn(opts.phone),
        content: { text: opts.text },
        ...(r.settings.notifyUrl ? { notifyUrl: String(r.settings.notifyUrl) } : {}),
      },
    ],
  };
  return post(r, String(r.settings.textPath || '/whatsapp/1/message/text'), payload);
}

/** True when Infobip is configured well enough to attempt a send. */
export async function whatsappConfigured(): Promise<boolean> {
  return typeof (await ready()) !== 'string';
}
