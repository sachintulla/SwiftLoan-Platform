/**
 * Welcome WhatsApp right after a WEBSITE visitor verifies their mobile number (Sachin's review RB-01): thanks, what is left, and their own
 * app link (`/dl?ref=<token>`, which opens the app at the step they reached). Sent whether or not they stop, once per number ever.
 * App users are not sent it (Sachin: they get a push / in-app welcome instead, not built). An SMS version is to be added later.
 *
 * Switch `welcome.sendEnabled` (Admin → Timings, off by default: off = nothing is sent and nothing is recorded). It shares the test-number
 * list `install.allowedNumbers`. Never to the review phone, a do-not-contact customer, someone already in the app, or outside calling hours
 * (then it is skipped, not delayed: a welcome hours later is no longer a welcome). The template is the Voxvalley setting `welcomeWhatsapp`
 * ({ template, language, placeholders, category }; tokens {name} and {link}); blank template = skipped.
 */
import { prisma } from './prisma.js';
import { timing } from './timings.js';
import { downloads } from '../config/downloads.js';
import { getProviderConfig } from './integrations.js';
import { sendWhatsAppTemplate, whatsappConfigured } from './whatsapp.js';
import { buildPlaceholders } from './stallWhatsapp.js';
import { isReviewPhone } from './reviewLogin.js';
import { withinCallingHours } from './leadCaller.js';
import { buildInstallLink, renderSmsBody } from './reminderSchedule.js';
import { LINK_SMS, PAN_PENDING_SMS, sendRegisteredSms, type RegisteredSms } from './smsRoute.js';
import { alreadyInApp, notOnTestList } from './installReminder.js';
import { touchAllowed } from './contactPolicy.js';
import { scoped } from './log.js';

const log = scoped('welcome');

/** `welcome:<phone>` (once ever) or, with Admin → Timings `welcome.oncePerNumber` off, `welcome:<phone>:<India date>` (once a day). */
export function welcomeKey(prefix: string, phone: string, now: Date, oncePerNumber: boolean = timing.bool('welcome.oncePerNumber')): string {
  if (oncePerNumber) return `${prefix}:${phone}`;
  const day = new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
  return `${prefix}:${phone}:${day}`;
}

export const WELCOME_KIND = 'welcome';

export interface WelcomeTemplate { template: string; language?: string; placeholders?: string[]; category?: string; headerImageUrl?: string }

/** Shipped default, under whatever the Voxvalley setting `welcomeWhatsapp` saves (saved fields win). */
/** The template has the SwiftLoan logo as its image header, so every send carries the logo's public URL (`headerImageUrl`). */
export const DEFAULT_WELCOME: WelcomeTemplate = {
  template: 'welcome_continue_app', language: 'en', placeholders: ['{name}', '{link}'], category: 'MARKETING', // Meta approved it as MARKETING (submitted as Utility)
  headerImageUrl: 'https://swiftloan.ai/whatsapp-welcome.png',
};

export type WelcomeOutcome = 'sent' | 'failed' | 'skipped' | 'off';

/** The welcome template as configured (shipped default under the Voxvalley setting `welcomeWhatsapp`). Also used by missedCallNote.ts. */
export async function welcomeTemplate(): Promise<WelcomeTemplate> {
  const cfg = await getProviderConfig('voxvalley');
  return { ...DEFAULT_WELCOME, ...((cfg.settings.welcomeWhatsapp as Partial<WelcomeTemplate> | undefined) ?? {}) };
}

export async function sendWelcome(user: { id: string; phone: string }, token: string | null | undefined, now: Date = new Date()): Promise<{ outcome: WelcomeOutcome; reason?: string }> {
  if (!timing.bool('welcome.sendEnabled')) return { outcome: 'off' };
  const skip = (reason: string) => { log.info('skipped', { userId: user.id, reason }); return { outcome: 'skipped' as const, reason }; };
  if (isReviewPhone(user.phone)) return skip('review phone');
  if (notOnTestList(user.phone)) return skip('not on the test-number list');
  const allowed = await touchAllowed(user.phone, 'message', now); // the one contact limit (contactPolicy.ts)
  if (!allowed.ok) return skip(allowed.reason);
  if (!token) return skip('no app link for this visitor');
  if (!withinCallingHours(now)) return skip('outside calling hours');
  const customer = await prisma.customer.findUnique({ where: { phone: user.phone }, select: { id: true, currentStage: true } });
  if (customer?.currentStage === 'lost') return skip('do not contact');
  if (await alreadyInApp(user.phone)) return skip('already in the app');

  const t = await welcomeTemplate();
  if (!t.template?.trim()) return skip('welcome template not configured');
  if (!(await whatsappConfigured())) return skip('whatsapp not configured');
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true } });
  const placeholders = buildPlaceholders(t.placeholders, { name: (u?.firstName ?? '').trim() || 'there', link: buildInstallLink(downloads.publicBase, token) });
  if (!placeholders) return skip('a placeholder has no value');

  // The claim is the idempotency key, taken BEFORE sending: once per number ever, or once per India day when that rule is off.
  const key = welcomeKey('welcome', user.phone, now);
  try {
    await prisma.outboundRequest.create({ data: { customerId: customer?.id ?? null, channel: 'whatsapp', kind: WELCOME_KIND, idempotencyKey: key, status: 'sent', payload: { template: t.template } } });
  } catch {
    return { outcome: 'skipped', reason: 'already welcomed' };
  }
  const res = await sendWhatsAppTemplate({
    phone: user.phone, templateName: t.template, language: t.language, placeholders, category: t.category, referenceId: key,
    ...(t.headerImageUrl?.trim() ? { headerImageUrl: t.headerImageUrl.trim() } : {}),
    track: { kind: WELCOME_KIND, customerId: customer?.id ?? null, trigger: { by: 'Welcome after OTP verified', stage: 'Signed in', since: now.toISOString(), step: 'Welcome' } },
  });
  if (!res.ok) {
    await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: (res.error ?? 'whatsapp failed').slice(0, 200) } }).catch(() => undefined);
    log.warn('failed', { userId: user.id, error: res.error });
    return { outcome: 'failed', reason: res.error };
  }
  log.info('sent', { userId: user.id, template: t.template });
  return { outcome: 'sent' };
}

/* ───────────────────────────── welcome SMS ───────────────────────────── */

/**
 * The welcome SMS right after OTP verification (owner's choice, 2026-11-04), one DLT template per side:
 *   app      → `SL_PAN_Pending` (1277179266527595706): "please verify your PAN in the SwiftLoan app…", no link (they are in the app)
 *   website  → the install-reminder text (1277179300146510723): "…incomplete at PAN verification… continue :{link}", their own app link
 * India SMS must match the registered DLT text exactly, so the bodies are the registered texts with {name}/{step}/{link} filled in.
 * Switch `welcome.smsEnabled` (off by default). Same gates as the WhatsApp welcome, once per number ever (`welcomesms:<phone>`).
 * Sent through the same gateway as the install-reminder SMS (Voxvalley `installSmsGateway`: "otp" = the OTP project, sender PTSLA).
 * It is the SMS half of the welcome, so it is not counted as a separate touch (contactPolicy.ts: kind `welcome_sms`).
 */
export const WELCOME_SMS_KIND = 'welcome_sms';

export type WelcomeSms = RegisteredSms;
export const DEFAULT_WELCOME_SMS: Readonly<Record<'app' | 'website', WelcomeSms>> = Object.freeze({ app: PAN_PENDING_SMS, website: LINK_SMS });

export async function sendWelcomeSms(
  user: { id: string; phone: string }, side: 'app' | 'website', token: string | null | undefined, now: Date = new Date(),
): Promise<{ outcome: WelcomeOutcome; reason?: string }> {
  if (!timing.bool('welcome.smsEnabled')) return { outcome: 'off' };
  const skip = (reason: string) => { log.info('sms skipped', { userId: user.id, side, reason }); return { outcome: 'skipped' as const, reason }; };
  if (isReviewPhone(user.phone)) return skip('review phone');
  if (notOnTestList(user.phone)) return skip('not on the test-number list');
  if (!withinCallingHours(now)) return skip('outside calling hours');
  const customer = await prisma.customer.findUnique({ where: { phone: user.phone }, select: { id: true, currentStage: true } });
  if (customer?.currentStage === 'lost') return skip('do not contact');
  if (side === 'website' && !token) return skip('no app link for this visitor');

  const cfg = await getProviderConfig('voxvalley');
  const saved = (cfg.settings.welcomeSms as Partial<Record<'app' | 'website', Partial<WelcomeSms>>> | undefined)?.[side] ?? {};
  const t = { ...DEFAULT_WELCOME_SMS[side], ...saved };
  if (!t.templateId?.trim() || !t.body?.trim()) return skip('welcome sms template not configured');
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { firstName: true } });
  const text = renderSmsBody(t.body, { name: u?.firstName, step: 'PAN verification', link: token ? buildInstallLink(downloads.publicBase, token) : '' });

  const key = welcomeKey('welcomesms', user.phone, now);
  try {
    await prisma.outboundRequest.create({ data: { customerId: customer?.id ?? null, channel: 'sms', kind: WELCOME_SMS_KIND, idempotencyKey: key, status: 'sent', payload: { side, templateId: t.templateId } } });
  } catch {
    return { outcome: 'skipped', reason: 'already welcomed by SMS' };
  }
  const { ok, error } = await sendRegisteredSms({ phone: user.phone, templateId: t.templateId, text, track: { kind: WELCOME_SMS_KIND, customerId: customer?.id ?? null } });
  if (!ok) {
    await prisma.outboundRequest.updateMany({ where: { idempotencyKey: key }, data: { status: 'failed', lastError: (error ?? 'sms failed').slice(0, 200) } }).catch(() => undefined);
    log.warn('sms failed', { userId: user.id, side, error });
    return { outcome: 'failed', reason: error };
  }
  log.info('sms sent', { userId: user.id, side });
  return { outcome: 'sent' };
}
