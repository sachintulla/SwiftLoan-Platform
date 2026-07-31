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
//   none / unset — no SMS sent (dev/demo).
//
// Phone numbers arrive as bare 10-digit Indian numbers; we prepend +91 for the
// international providers. Adjust DEFAULT_CC if you launch in another country.

const DEFAULT_CC = process.env.SMS_DEFAULT_CC ?? '91';

export type SmsProvider = 'msg91' | 'twilio' | 'none';

export function smsProvider(): SmsProvider {
  const p = (process.env.SMS_PROVIDER ?? '').toLowerCase();
  if (p === 'msg91' || p === 'twilio') return p;
  return 'none';
}

/** True when a real SMS provider is configured (so OTPs must not be surfaced). */
export function smsConfigured(): boolean {
  const p = smsProvider();
  if (p === 'msg91') return !!process.env.MSG91_AUTHKEY;
  if (p === 'twilio') return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
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
 * Send an OTP SMS. Returns true if a real SMS was dispatched. Never throws —
 * a delivery failure returns false so the auth flow can decide how to degrade.
 */
export async function sendOtpSms(phone: string, code: string): Promise<boolean> {
  const provider = smsProvider();
  if (provider === 'none' || !smsConfigured()) return false;
  try {
    if (provider === 'msg91') return await sendViaMsg91(phone, code);
    if (provider === 'twilio') return await sendViaTwilio(phone, code);
    return false;
  } catch (e) {
    console.error('[sms] send threw', e);
    return false;
  }
}
