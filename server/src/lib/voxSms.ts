/**
 * Text messages (SMS) through VOX DIGITALS' customer SMS API.
 *
 * Unlike the WhatsApp route (which answers 405 on the documented URL), this
 * gateway is live: POST {smsUrl} with the token IN THE BODY as `authtoken`.
 * India SMS is DLT-regulated: `from` must be a registered sender ID and `body`
 * must match the text registered under `template_id` exactly, or the carrier
 * drops it — so these three come from settings, not from code.
 *
 * Reuses the Voxvalley integration's saved `authToken` + `projectId`.
 */
import { getProviderConfig } from './integrations.js';
import { recordSend } from './messageDelivery.js';

export interface SmsResult {
  ok: boolean;
  status: number;
  messageId?: string;
  error?: string;
  body?: any;
}

function toE164(phone: string): string {
  const digits = String(phone).replace(/\D/g, '');
  return `+${digits.length > 10 ? digits : `91${digits.slice(-10)}`}`;
}

export async function sendVoxSms(opts: { phone: string; body?: string; templateId?: string; from?: string; track?: { kind?: string; customerId?: string | null } }): Promise<SmsResult> {
  const result = await sendVoxSmsRaw(opts);
  // Remember it for the Messages list. The SMS gateway gives no delivery callback here, so "sent" means "the gateway accepted it".
  await recordSend({
    channel: 'sms', providerRef: result.ok ? result.messageId ?? null : null, phone: opts.phone, template: opts.templateId ?? null,
    kind: opts.track?.kind ?? 'other', customerId: opts.track?.customerId ?? null, ok: result.ok, status: 'sent', error: result.error ?? null,
  });
  return result;
}

async function sendVoxSmsRaw(opts: { phone: string; body?: string; templateId?: string; from?: string }): Promise<SmsResult> {
  const cfg = await getProviderConfig('voxvalley');
  if (!cfg.enabled) return { ok: false, status: 0, error: 'Voxvalley integration is disabled' };

  const url = String(cfg.settings.smsUrl || '');
  const token = String((cfg.secrets as any).authToken ?? (cfg.secrets as any).apiKey ?? '');
  const projectId = String(cfg.settings.projectId || '');
  const from = String(opts.from || cfg.settings.smsSender || '');
  const templateId = String(opts.templateId || cfg.settings.smsTemplateId || '');
  const body = String(opts.body || cfg.settings.smsBody || '');
  for (const [k, v] of Object.entries({ smsUrl: url, authToken: token, projectId, smsSender: from, smsTemplateId: templateId, smsBody: body })) {
    if (!v) return { ok: false, status: 0, error: `Voxvalley SMS ${k} is not configured` };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        authtoken: token,
        projectid: projectId,
        from,
        to: toE164(opts.phone),
        template_id: templateId,
        body,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }

  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }

  // The gateway reports failures as { status: "...", code: 14xx, gtrid, id } —
  // treat any numeric code >= 1000 as an error even on HTTP 200.
  const code = typeof json?.code === 'number' ? json.code : undefined;
  const failed = !res.ok || (code !== undefined && code >= 1000);
  if (failed) {
    const error = String(json?.status ?? json?.message ?? text.slice(0, 300) ?? `HTTP ${res.status}`);
    console.error(`[vox-sms] send failed http=${res.status} code=${code ?? '-'} ${error}`);
    return { ok: false, status: res.status, error, body: json };
  }
  const messageId = json?.id ?? json?.gtrid;
  console.log(`[vox-sms] accepted id=${messageId ?? '-'}`);
  return { ok: true, status: res.status, messageId, body: json };
}

/** True when the SMS gateway is configured well enough to attempt a send. */
export async function smsConfigured(): Promise<boolean> {
  const cfg = await getProviderConfig('voxvalley');
  return Boolean(
    cfg.enabled &&
      cfg.settings.smsUrl &&
      cfg.settings.projectId &&
      (((cfg.secrets as any).authToken ?? (cfg.secrets as any).apiKey) as string | undefined),
  );
}
