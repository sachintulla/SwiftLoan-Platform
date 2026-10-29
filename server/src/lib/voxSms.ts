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
import { smsCredentials } from './smsCredentials.js';

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
  // Keep the exact text that went out, so the admin can show it (the text comes from settings unless the caller supplied it).
  const text = String(opts.body || (await getProviderConfig('voxvalley').catch(() => null))?.settings?.smsBody || '');
  // Remember it for the Messages list. The SMS gateway gives no delivery callback here, so "sent" means "the gateway accepted it".
  await recordSend({
    channel: 'sms', providerRef: result.ok ? result.messageId ?? null : null, phone: opts.phone, template: opts.templateId ?? null,
    kind: opts.track?.kind ?? 'other', customerId: opts.track?.customerId ?? null, ok: result.ok, status: 'sent', error: result.error ?? null,
    ...(text ? { meta: { text } } : {}),
  });
  return result;
}

async function sendVoxSmsRaw(opts: { phone: string; body?: string; templateId?: string; from?: string }): Promise<SmsResult> {
  const cfg = await getProviderConfig('voxvalley');
  if (!cfg.enabled) return { ok: false, status: 0, error: 'Voxvalley integration is disabled' };

  const url = String(cfg.settings.smsUrl || '');
  const { token, projectId } = smsCredentials(cfg.settings, cfg.secrets as Record<string, unknown>);
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

/* ───────── the OTP gateway: the server's own Vox project (env VOX_*), the one that delivers login codes ───────── */

export interface OtpGatewayRequest { url: string; headers: Record<string, string>; payload: string; version: 'v1' | 'v2' }

/**
 * The request for a template SMS through the env-configured Vox gateway (the one `sms.ts` uses for OTP). Pure, so the
 * transport rules are tested: v2 (JSON) or v1 (form) is picked from the URL like `sms.ts` does, `to` is E.164 with `+`.
 * Returns an error string when the env is not set up well enough to send.
 */
export function buildOtpGatewayRequest(
  env: Record<string, string | undefined>,
  o: { phone: string; body: string; templateId: string; from: string },
): OtpGatewayRequest | { error: string } {
  const url = env.VOX_BASE_URL;
  if (!url) return { error: 'VOX_BASE_URL is not set' };
  if (!env.VOX_AUTH_TOKEN || !env.VOX_PROJECT_ID) return { error: 'VOX_AUTH_TOKEN / VOX_PROJECT_ID are not set' };
  for (const [k, v] of Object.entries({ templateId: o.templateId, sender: o.from, body: o.body })) {
    if (!v) return { error: `SMS ${k} is not configured` };
  }
  const fields: Record<string, string> = {
    authtoken: env.VOX_AUTH_TOKEN, projectid: env.VOX_PROJECT_ID, to: toE164(o.phone), body: o.body, from: o.from, template_id: o.templateId,
  };
  if (env.VOX_DLR_URL) fields.dlr_url = env.VOX_DLR_URL;
  const version = ((env.VOX_API_VERSION ?? (/\/v2\//.test(url) ? 'v2' : 'v1')).toLowerCase() === 'v2' ? 'v2' : 'v1') as 'v1' | 'v2';
  if (version === 'v2') return { url, version, headers: { 'content-type': 'application/json' }, payload: JSON.stringify(fields) };
  const form = new URLSearchParams(fields);
  form.set('expiry', env.VOX_EXPIRY_MINUTES ?? '10');
  return { url, version, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: form.toString() };
}

/** True when the env gateway can be used (same test as the OTP sender: provider `vox` with the credential pair). */
export function otpGatewayConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SMS_PROVIDER ?? '').toLowerCase() === 'vox' && !!(env.VOX_AUTH_TOKEN && env.VOX_PROJECT_ID && env.VOX_BASE_URL);
}

/**
 * Send one DLT template SMS through the OTP gateway. Used when Admin → Configs → Voxvalley `installSmsGateway` is `otp`: the
 * Voxvalley integration's own project has no route for the PTSLA sender ("Error mapping routing strategy"), while the OTP project does.
 * Fails closed like the OTP sender: only an explicit success code counts (the gateway answers HTTP 200 on failure).
 */
export async function sendSmsViaOtpGateway(opts: {
  phone: string; body: string; templateId: string; from: string; track?: { kind?: string; customerId?: string | null };
}): Promise<SmsResult> {
  const req = buildOtpGatewayRequest(process.env, opts);
  if ('error' in req) return { ok: false, status: 0, error: req.error };

  let result: SmsResult;
  try {
    const res = await fetch(req.url, { method: 'POST', headers: req.headers, body: req.payload, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* plain text */ }
    const okCodes = new Set((process.env.VOX_SUCCESS_CODES ?? '200').split(',').map((s) => s.trim()).filter(Boolean));
    const delivered = res.ok && json?.code != null && okCodes.has(String(json.code));
    if (delivered) {
      result = { ok: true, status: res.status, messageId: json?.id ?? json?.gtrid, body: json };
      console.log(`[vox-sms] otp-gateway accepted id=${result.messageId ?? '-'}`);
    } else {
      const error = String(json?.status ?? json?.message ?? text.slice(0, 300) ?? `HTTP ${res.status}`);
      console.error(`[vox-sms] otp-gateway send failed http=${res.status} code=${json?.code ?? '-'} ${error}`);
      result = { ok: false, status: res.status, error, body: json };
    }
  } catch (e) {
    result = { ok: false, status: 0, error: (e as Error).message };
  }
  await recordSend({
    channel: 'sms', providerRef: result.ok ? result.messageId ?? null : null, phone: opts.phone, template: opts.templateId,
    kind: opts.track?.kind ?? 'other', customerId: opts.track?.customerId ?? null, ok: result.ok, status: 'sent', error: result.error ?? null,
  });
  return result;
}

/** True when the SMS gateway is configured well enough to attempt a send. */
export async function smsConfigured(): Promise<boolean> {
  const cfg = await getProviderConfig('voxvalley');
  const { token, projectId } = smsCredentials(cfg.settings, cfg.secrets as Record<string, unknown>);
  return Boolean(cfg.enabled && cfg.settings.smsUrl && projectId && token);
}
