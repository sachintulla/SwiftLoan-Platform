/**
 * The two registered (DLT) SMS texts used across the outreach scenarios, and ONE way to send them (owner, 2026-11-04):
 *   LINK_SMS        1277179300146510723  "…incomplete at {step}… continue where you left off :{link}"  — every scenario, website and app
 *   PAN_PENDING_SMS 1277179266527595706  "…please verify your PAN in the SwiftLoan app…" (no link)     — an APP user stopped before PAN
 * The bodies are the registered texts character for character (India SMS is DLT-scrubbed); {name} {step} {link} are filled by
 * renderSmsBody. `sendRegisteredSms` honours the Voxvalley setting `installSmsGateway`: "otp" sends through the OTP project (env VOX_*,
 * sender `installSmsSender` || `smsSender`, PTSLA), which is the route that delivers; otherwise the Voxvalley integration's own project.
 */
import { getProviderConfig } from './integrations.js';
import { otpGatewayConfigured, sendSmsViaOtpGateway, sendVoxSms, smsConfigured } from './voxSms.js';

export interface RegisteredSms { templateId: string; body: string }

export const LINK_SMS: RegisteredSms = Object.freeze({
  templateId: '1277179300146510723',
  body: 'Dear {name} , your SwiftLoan loan application is incomplete at {step}. Please open the SwiftLoan app to continue where you left off :{link}. Team SwiftLoan\n-PurpleTalk IPL',
});

export const PAN_PENDING_SMS: RegisteredSms = Object.freeze({
  templateId: '1277179266527595706',
  body: 'Dear {name} , please verify your PAN in the SwiftLoan app to check your loan eligibility and view offers. Team SwiftLoan -PurpleTalk IPL',
});

export async function sendRegisteredSms(opts: {
  phone: string; templateId: string; text: string; track: { kind: string; customerId?: string | null };
}): Promise<{ ok: boolean; error?: string }> {
  const cfg = await getProviderConfig('voxvalley');
  if (String(cfg.settings.installSmsGateway ?? '').trim().toLowerCase() === 'otp') {
    if (!otpGatewayConfigured()) return { ok: false, error: 'sms gateway not configured (OTP gateway env)' };
    const from = String(cfg.settings.installSmsSender || cfg.settings.smsSender || '').trim();
    const r = await sendSmsViaOtpGateway({ phone: opts.phone, body: opts.text, templateId: opts.templateId, from, track: opts.track });
    return { ok: r.ok, error: r.error };
  }
  if (!(await smsConfigured())) return { ok: false, error: 'sms gateway not configured' };
  const r = await sendVoxSms({ phone: opts.phone, body: opts.text, templateId: opts.templateId, track: opts.track });
  return { ok: r.ok, error: r.error };
}
