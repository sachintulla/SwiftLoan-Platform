// Pluggable OTP SMS sender.
//
// The "real OTP system": when an SMS provider is configured via env, OTPs are
// delivered by SMS and NEVER surfaced to the client. When nothing is configured
// (local dev / demo), sending is a no-op and the caller falls back to the dev
// OTP so the app still works. Choose the provider with SMS_PROVIDER:
//
//   msg91  — India (DLT). Env: MSG91_AUTHKEY, MSG91_SENDER (6-char header),
//            MSG91_TEMPLATE_ID (DLT-approved), optional MSG91_ROUTE (default 4).
//   twilio — Global.       Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
//            TWILIO_FROM (E.164 sender number).
//   vox    — Vox Digitals CPaaS (India, DLT). Supports both the v1 legacy
//            form-data API and the v2 JSON API; the transport is picked from the
//            URL (see sendViaVox) or forced with VOX_API_VERSION=v1|v2.
//            Env: VOX_AUTH_TOKEN + VOX_PROJECT_ID (both required — the
//            credential is a pair), VOX_SENDER (DLT header, e.g. GMPE),
//            VOX_TEMPLATE_ID (DLT template), optional VOX_BASE_URL,
//            VOX_API_VERSION, VOX_DLR_URL (delivery receipts),
//            VOX_EXPIRY_MINUTES (v1 only).
//   none / unset — no SMS sent (dev/demo).
//
// Phone numbers arrive as bare 10-digit Indian numbers; we prepend +91 for the
// international providers. Adjust DEFAULT_CC if you launch in another country.

const DEFAULT_CC = process.env.SMS_DEFAULT_CC ?? '91';

export type SmsProvider = 'msg91' | 'twilio' | 'vox' | 'none';

export function smsProvider(): SmsProvider {
  const p = (process.env.SMS_PROVIDER ?? '').toLowerCase();
  if (p === 'msg91' || p === 'twilio' || p === 'vox') return p;
  return 'none';
}

/** True when a real SMS provider is configured (so OTPs must not be surfaced). */
export function smsConfigured(): boolean {
  const p = smsProvider();
  if (p === 'msg91') return !!process.env.MSG91_AUTHKEY;
  if (p === 'twilio') return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
  // Both halves of the credential, or the gateway 1401s on every OTP.
  if (p === 'vox') return !!(process.env.VOX_AUTH_TOKEN && process.env.VOX_PROJECT_ID);
  return false;
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return '+' + digits;
  if (digits.length > 10) return '+' + digits; // already has a country code
  return `+${DEFAULT_CC}${digits}`;
}

const OTP_TEXT = (code: string) => `${code} is your SwiftLoan verification code. It is valid for 5 minutes. Do not share it with anyone.`;

async function sendViaMsg91(phone: string, code: string): Promise<boolean> {
  const authkey = process.env.MSG91_AUTHKEY!;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const mobile = `${DEFAULT_CC}${phone.replace(/\D/g, '').slice(-10)}`;
  // Prefer MSG91's OTP endpoint with a DLT template when available; otherwise
  // fall back to the generic flow SMS endpoint.
  const url = templateId
    ? `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=${mobile}&otp=${code}&authkey=${encodeURIComponent(authkey)}`
    : `https://control.msg91.com/api/v5/otp?mobile=${mobile}&otp=${code}&authkey=${encodeURIComponent(authkey)}`;
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' } });
  const json: any = await res.json().catch(() => ({}));
  const okFlag = res.ok && (json?.type === 'success' || json?.type == null);
  if (!okFlag) console.error('[sms] msg91 send failed', res.status, json);
  return okFlag;
}

async function sendViaTwilio(phone: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM!;
  const body = new URLSearchParams({ To: toE164(phone), From: from, Body: OTP_TEXT(code) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    },
    body: body.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) console.error('[sms] twilio send failed', res.status, json?.message ?? json);
  return res.ok;
}

/**
 * Vox Digitals CPaaS — v1 legacy form-urlencoded API.
 *
 * Two behaviours of this provider are verified against the live endpoint and are
 * the reason this is not a two-line function:
 *
 * 1. It answers **HTTP 200 even on failure**. A bad credential comes back as
 *    `200 {"status":"Invalid Credentials: Invalid Credentials","code":1401,...}`.
 *    So `res.ok` means nothing here — success is judged on `code`, and treating
 *    200 as sent would silently report every undelivered OTP as delivered.
 * 2. It rejects `application/json` with HTTP 415. Form-encoded only.
 *
 * Local-dev gotcha: behind a TLS-inspecting firewall (Sophos here) Node rejects
 * the intercepted chain with SELF_SIGNED_CERT_IN_CHAIN and every send fails,
 * while the same URL works fine from PowerShell/browsers because Windows trusts
 * the corporate root and Node does not. It looks exactly like a broken
 * integration and is not one. Fix it by pointing Node at the corporate root:
 *   NODE_EXTRA_CA_CERTS=C:\path\to\sophos-root.crt
 * Never disable TLS verification to work around it outside a throwaway test.
 *
 * The credential is a PAIR — `authtoken` + `projectid`. Sending the token alone
 * returns exactly the same 1401 as sending nothing at all, so a missing
 * projectid is indistinguishable from a bad token in their response. Both are
 * therefore required up front by smsConfigured(), rather than discovered at the
 * first failed OTP.
 */
async function sendViaVox(phone: string, code: string): Promise<boolean> {
  const base = process.env.VOX_BASE_URL ?? 'https://cpaas.voxdigitals.com/sms-customer-apis/sms/v1/send';

  // The body MUST reproduce the DLT-registered template character-for-character,
  // with only the {#var#} placeholders substituted. Indian operators match the
  // text against the registered template and silently drop a mismatch — Vox still
  // answers `200 Success`, so a wrong body looks identical to a working send and
  // no SMS ever arrives. That is exactly what happened here: our generic wording
  // was accepted six times and delivered zero times.
  //
  // Kept separate from OTP_TEXT (used by msg91/twilio) because this string is not
  // ours to word — it is whatever is registered on the DLT portal. Changing the
  // registered template is therefore an env change, not a code change.
  const template =
    process.env.VOX_TEMPLATE_TEXT ??
    '{#var#} is your OTP to register/login to your account. Do not share this with anyone. T&C apply - PTIPL';

  const fields: Record<string, string> = {
    authtoken: process.env.VOX_AUTH_TOKEN!,
    projectid: process.env.VOX_PROJECT_ID!,
    // `to` is E.164 WITH the leading + (their sample: to=+1987654321) — unlike
    // msg91, which wants a bare 91XXXXXXXXXX.
    to: toE164(phone),
    body: template.replace(/\{#var#\}/g, code),
  };
  // DLT: the sender header must be the 6-char ID registered on the DLT portal
  // (`GMPE` here). A header the operator does not recognise is dropped silently
  // while the gateway still answers 200 — the same trap as a template mismatch.
  if (process.env.VOX_SENDER) fields.from = process.env.VOX_SENDER;
  // DLT: the template must be registered with the operator and its text must
  // match OTP_TEXT exactly, or the gateway accepts the request and the operator
  // silently drops the message.
  if (process.env.VOX_TEMPLATE_ID) fields.template_id = process.env.VOX_TEMPLATE_ID;
  // Delivery receipts: without this we only ever know Vox accepted the message,
  // not that the handset received it.
  if (process.env.VOX_DLR_URL) fields.dlr_url = process.env.VOX_DLR_URL;

  // v1 and v2 are the SAME gateway with INCOMPATIBLE transports, and each rejects
  // the other's with HTTP 415 — verified against both live endpoints:
  //   v1  /sms/v1/send  form-urlencoded only; JSON → 415
  //   v2  /sms/v2/send  JSON only;            form → 415 "Content-Type
  //                     'application/x-www-form-urlencoded' is not supported"
  // Inferred from the URL so switching endpoints stays a pure .env change, with
  // VOX_API_VERSION as an override if their paths ever stop carrying the version.
  const version = (process.env.VOX_API_VERSION ?? (/\/v2\//.test(base) ? 'v2' : 'v1')).toLowerCase();

  let headers: Record<string, string>;
  let payload: string;
  if (version === 'v2') {
    headers = { 'content-type': 'application/json' };
    // No `expiry` — v2 rejects unknown fields, and the operator's v2 sample omits it.
    payload = JSON.stringify(fields);
  } else {
    // Minutes. An OTP that arrives after it has expired is worse than none, so
    // cap how long the gateway may keep retrying.
    const form = new URLSearchParams(fields);
    form.set('expiry', process.env.VOX_EXPIRY_MINUTES ?? '10');
    headers = { 'content-type': 'application/x-www-form-urlencoded' };
    payload = form.toString();
  }

  const res = await fetch(base, { method: 'POST', headers, body: payload });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* gateway returned plain text */ }

  // Observed error codes, all in a 14xx band, verified against the live gateway:
  //   1401  Invalid Credentials  — authtoken wrong, OR projectid missing entirely
  //                                (identical response to sending no credential)
  //   1435  Project not found    — authtoken is valid, projectid is not
  //   1447  No Credit            — everything valid; the account has no balance
  // Success is `{"status":"Success","code":200}` — CONFIRMED against a live send
  // (gtrid SCA4118891786358559982467). Note 200 here is the code in the BODY; the
  // HTTP status is 200 on failure too, so it proves nothing on its own.
  //
  // This FAILS CLOSED — only an explicitly known-good code counts as delivered.
  //
  // Getting this backwards is the expensive mistake: because the gateway answers
  // 200 on failure, a permissive check would mark every undelivered OTP as sent
  // and users would sit waiting for an SMS that never left. A false "failed" is
  // merely a retry; a false "sent" is a locked-out user.
  //
  // VOX_SUCCESS_CODES exists so the first real send can correct this from .env
  // rather than needing a redeploy.
  const okCodes = new Set(
    (process.env.VOX_SUCCESS_CODES ?? '200').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const codeNum = Number(json?.code);
  const delivered = res.ok && json?.code != null && okCodes.has(String(json.code));

  // Log every send until the success code is confirmed — a code we do not
  // recognise is reported as a failure, and this is how we find out it was
  // actually a success.
  if (delivered || Number.isFinite(codeNum)) {
    console.log(`[sms] vox ${version} code=${json?.code} status=${json?.status ?? ''} gtrid=${json?.gtrid ?? '-'} delivered=${delivered}`);
  }

  if (!delivered) {
    // gtrid is Vox's trace id — quote it to their support for a specific failure.
    console.error(`[sms] vox send failed http=${res.status} code=${json?.code ?? '?'} status=${json?.status ?? text.slice(0, 120)} gtrid=${json?.gtrid ?? '-'}`);
  }
  return delivered;
}

/**
 * Send an OTP SMS. Returns true if a real SMS was dispatched. Never throws —
 * a delivery failure returns false so the auth flow can decide how to degrade.
 */
export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  const provider = smsProvider();
  if (provider === 'none' || !smsConfigured()) return false;
  try {
    if (provider === 'msg91') return await sendViaMsg91(phone, code);
    if (provider === 'twilio') return await sendViaTwilio(phone, code);
    if (provider === 'vox') return await sendViaVox(phone, code);
    return false;
  } catch (e) {
    console.error('[sms] send threw', e);
    return false;
  }
}
