/**
 * Manual outreach: an admin sends the stage-appropriate WhatsApp, SMS or push to
 * one customer, right now, from the dashboard.
 *
 * The content is never typed by the admin. It is the per-stage message already set
 * up in Stage outreach (the same templates the automatic stuck-stage nudges use),
 * so a manual send and an automatic one say the same thing.
 *
 * Why this is a separate sender rather than a call into stallWhatsapp.ts or
 * stallSms.ts: those require a StallRule row (they belong to a rule), and a manual
 * send has none. This file reuses their exported helpers (template lookup,
 * placeholder filling, gateway config) and leaves them untouched, so the automatic
 * nudges cannot regress.
 *
 * Guards, in this order, and enforced HERE on the server, never only in the UI:
 *   1  a phone number exists
 *   2  not do-not-contact (stage lost, or any call ended do_not_call)
 *   3  the number is on the test allowlist (both lists are no-ops when empty)
 *   4  the admin's role may message; overrideHours is super admin only
 *   5  the message for this stage exists and the gateway is connected
 *   6  inside the calling window (a super admin may override)
 *   7  not already sent on this channel recently (24 hours; push 2 hours), unless confirmed
 *   8  fewer than 3 manual sends on this channel to this customer in 24 hours
 * Steps 1 to 5 and 8 have no override. A do-not-contact customer, or a number off
 * the test list, is refused for a super admin too, and even with confirmRepeat.
 *
 * A send is claimed in OutboundRequest BEFORE the provider is called, using the
 * same row kinds the automatic senders use, so their cooldown and lifetime cap see
 * a manual send and a customer is not messaged again straight after. A failure is
 * recorded and never retried here.
 */
import type { Customer } from '@prisma/client';
import { prisma } from './prisma.js';
import { JOURNEY_EVENTS, STAGE_LABELS, recordJourneyEvent } from './journey.js';
import { isOutreachStage } from './stageOutreach.js';
import { buildPlaceholders, directWhatsAppConfig, templateFor, type DirectWhatsApp, type StallTemplate } from './stallWhatsapp.js';
import { directSmsConfig, smsFor, type SmsTemplate } from './stallSms.js';
import { sendWhatsAppTemplate } from './whatsapp.js';
import { sendVoxSms } from './voxSms.js';
import { withinCallingHours } from './leadCaller.js';
import { nudgesDisabled } from '../jobs/tracking.jobs.js';
import { withinTestAllowlist } from './callGate.js';
import { notOnTestList } from './installReminder.js';
import { upshotEventNameForStage } from './integrations.js';
import { nudgeCustomer } from './dispatch.js';
import { contactBlockReason, doNotContactCustomerIds } from './doNotContact.js';
import { APP_LINK_PREVIEW_TEXT, cancelInstallLink, loadInstallDetails, mintInstallLink } from './installContext.js';
import { CAN_WRITE } from '../middleware/adminAuth.js';
import { scoped } from './log.js';

const log = scoped('manual-outreach');

export type OutreachChannel = 'whatsapp' | 'sms' | 'push';

/* ───────────────────────────── stage mapping ───────────────────────────── */

/**
 * Which Stage outreach key (a journey EVENT) holds the message for a customer
 * sitting at a journey STAGE. It is the inverse of EVENT_STAGE in journey.ts: the
 * stage a customer is in is the one the event moved them into, and the message for
 * "stuck here" is keyed by that event. `null` means there is nothing to say at that
 * stage, so no WhatsApp or SMS button is offered and the dashboard says why.
 */
export const STAGE_TO_OUTREACH: Record<string, string | null> = {
  lead_captured: 'lead_captured',
  contacted: 'lead_captured',
  app_installed: 'app_installed',
  registered: 'otp_verified',
  eligibility_checked: 'eligibility_completed',
  offers_viewed: 'offer_viewed',
  offer_selected: 'offer_selected',
  kyc_started: null, // the product has no KYC stage, so there is no stage message for it
  kyc_completed: null,
  application_submitted: null,
  approved: null,
  rejected: null,
  disbursed: null,
  lost: null,
};

/** The Stage outreach key for a journey stage, or null when there is none. */
export function resolveOutreachStage(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const key = STAGE_TO_OUTREACH[stage];
  return key && isOutreachStage(key) ? key : null;
}

/** Stages where the journey is over, so nothing is offered. */
export const FINISHED_STAGES: readonly string[] = ['disbursed', 'rejected', 'lost'];
export const isFinishedStage = (stage: string | null | undefined): boolean => !!stage && FINISHED_STAGES.includes(stage);

/* ───────────────────────────── limits ───────────────────────────── */

/** Same channel, same customer: ask before sending again inside this many hours. */
export const REPEAT_WINDOW_HOURS: Record<OutreachChannel, number> = { whatsapp: 24, sms: 24, push: 2 };
/** Hard cap on manual sends per channel per customer in any 24 hours. */
export const MANUAL_DAILY_CAP = 3;
const DAY_MS = 24 * 3_600_000;
/** The idempotency key changes every 10 minutes, so a double click can never send twice. */
const BUCKET_MS = 10 * 60_000;

/* ───────────────────────────── message variables ───────────────────────────── */

type Vars = Record<string, string | number | null | undefined>;

/**
 * Values a WhatsApp template can reference. Same values the automatic sender
 * offers (varsFor in stallWhatsapp.ts, which is not exported), plus `appLink`.
 * `appLink` is only the preview text here, so building variables never writes
 * anything; the real link is created at send time (see sendManualWhatsApp).
 */
export async function buildManualVars(
  customer: { name: string | null; userId: string | null },
  siteUrl: string,
): Promise<Vars> {
  const vars: Vars = {
    name: customer.name?.trim().split(/\s+/)[0] || 'there',
    siteUrl,
    appLink: APP_LINK_PREVIEW_TEXT,
  };
  if (customer.userId) {
    const app = await prisma.loanApplication.findFirst({
      where: { userId: customer.userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, ref: true },
    });
    if (app) {
      vars.ref = app.ref;
      vars.offerCount = await prisma.offer.count({ where: { applicationId: app.id } });
    }
  }
  return vars;
}

/** True when any placeholder in the template uses the app link. */
export function usesAppLink(spec: string[] | undefined): boolean {
  return (spec ?? []).some((p) => /\{appLink\}/.test(String(p)));
}

/* ───────────────────────────── recent sends ───────────────────────────── */

export interface RecentRow {
  kind: string;
  channel: string;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
  payload: unknown;
}

export interface RecentFacts {
  lastSentAt: Date | null;
  /** Display name of the admin, or null for an automatic send or an unknown admin. */
  lastSentBy: string | null;
  /** Manual sends on this channel in the last 24 hours (pending ones count, so a send in flight counts). */
  sentToday: number;
}

export const NO_RECENT: RecentFacts = { lastSentAt: null, lastSentBy: null, sentToday: 0 };

function channelOfRow(r: Pick<RecentRow, 'kind' | 'channel'>): OutreachChannel | null {
  if (r.kind === 'whatsapp_template') return 'whatsapp';
  if (r.kind === 'sms_template') return 'sms';
  if (r.kind === 'upshot_event' && r.channel === 'push') return 'push';
  return null;
}

function payloadOf(r: RecentRow): { source?: string; sentById?: string } {
  const p = (r.payload ?? {}) as { source?: unknown; sentBy?: { id?: unknown } };
  return {
    source: typeof p.source === 'string' ? p.source : undefined,
    sentById: p.sentBy && typeof p.sentBy.id === 'string' ? p.sentBy.id : undefined,
  };
}

/**
 * Pure: fold a customer's recent outbound rows into per-channel facts.
 * `names` maps an admin id to the name shown in "Last sent 12 min ago by Priya".
 */
export function summariseRecent(
  rows: RecentRow[],
  now: Date,
  names: Record<string, string> = {},
): Record<OutreachChannel, RecentFacts & { lastSentById: string | null }> {
  const out = {
    whatsapp: { ...NO_RECENT, lastSentById: null as string | null },
    sms: { ...NO_RECENT, lastSentById: null as string | null },
    push: { ...NO_RECENT, lastSentById: null as string | null },
  };
  for (const r of rows) {
    const ch = channelOfRow(r);
    if (!ch || (r.status !== 'sent' && r.status !== 'pending')) continue;
    const at = r.sentAt ?? r.createdAt;
    const { source, sentById } = payloadOf(r);
    const slot = out[ch];
    if (!slot.lastSentAt || at > slot.lastSentAt) {
      slot.lastSentAt = at;
      slot.lastSentById = source === 'admin' ? sentById ?? null : null;
      slot.lastSentBy = source === 'admin' && sentById ? names[sentById] ?? null : null;
    }
    if (source === 'admin' && now.getTime() - r.createdAt.getTime() < DAY_MS) slot.sentToday++;
  }
  return out;
}

/** Plain-English age, for messages the server writes. */
export function agoText(at: Date, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function repeatActive(channel: OutreachChannel, recent: RecentFacts, now: Date): boolean {
  if (!recent.lastSentAt) return false;
  return now.getTime() - recent.lastSentAt.getTime() < REPEAT_WINDOW_HOURS[channel] * 3_600_000;
}

/* ───────────────────────────── guards ───────────────────────────── */

export type BlockCode =
  | 'no_phone' | 'do_not_contact' | 'not_on_test_allowlist' | 'forbidden' | 'forbidden_override'
  | 'not_configured' | 'no_template' | 'missing_value' | 'not_signed_in' | 'not_available_for_stage'
  | 'outside_calling_hours' | 'recently_sent' | 'daily_limit' | 'nudges_disabled';

/** HTTP status for each refusal. */
export const BLOCK_STATUS: Record<BlockCode, number> = {
  no_phone: 400, no_template: 400, not_configured: 400, missing_value: 400, not_signed_in: 400, not_available_for_stage: 400,
  do_not_contact: 403, not_on_test_allowlist: 403, forbidden: 403, forbidden_override: 403,
  outside_calling_hours: 409, recently_sent: 409, daily_limit: 409, nudges_disabled: 409,
};

export const REASON = {
  no_phone: 'No phone number on file',
  do_not_contact: 'This customer asked not to be contacted',
  not_on_test_allowlist: 'This number is not on the test list',
  forbidden: 'Needs an admin or super admin',
  forbidden_override: 'Only a super admin can send outside calling hours',
  no_template: 'No message is set up for this stage. Add one in Stage outreach.',
  missing_value: 'This customer is missing a detail the message needs',
  not_signed_in: 'The customer is not signed in to the app, so a push cannot be delivered',
  not_available_for_stage: 'A push is not sent at this stage',
  nudges_disabled: 'Push is switched off on this server',
} as const;

const CHANNEL_NAME: Record<OutreachChannel, string> = { whatsapp: 'WhatsApp', sms: 'SMS', push: 'push' };

export interface GuardInput {
  customer: { phone: string | null; currentStage: string | null };
  dnc: boolean;
  /** Passes both test-number lists (each is a no-op when empty). */
  allowlisted: boolean;
  role: string;
  inWindow: boolean;
  recent: RecentFacts;
  now: Date;
}

export interface GuardFlags { confirmRepeat?: boolean; overrideHours?: boolean }

/**
 * The first guard a send fails, in the documented order, or null to go ahead.
 * `contentBlock` is guard 5, worked out by the channel (template, gateway, etc).
 * This one function backs both the buttons shown and the real send, so they cannot disagree.
 */
export function firstBlock(
  channel: OutreachChannel,
  g: GuardInput,
  contentBlock: BlockCode | null,
  flags: GuardFlags = {},
): BlockCode | null {
  const contact = contactBlockReason(g.customer, g.dnc);
  if (contact === 'no_phone') return 'no_phone';
  if (contact === 'do_not_contact') return 'do_not_contact';
  if (!g.allowlisted) return 'not_on_test_allowlist';
  if (!CAN_WRITE.includes(g.role)) return 'forbidden';
  if (flags.overrideHours && g.role !== 'super_admin') return 'forbidden_override';
  if (contentBlock) return contentBlock;
  if (!g.inWindow && !flags.overrideHours) return 'outside_calling_hours';
  if (repeatActive(channel, g.recent, g.now) && !flags.confirmRepeat) return 'recently_sent';
  if (g.recent.sentToday >= MANUAL_DAILY_CAP) return 'daily_limit';
  return null;
}

/** The sentence for a refusal. Role aware, because only a super admin can override the hours. */
export function blockMessage(code: BlockCode, channel: OutreachChannel, g: Pick<GuardInput, 'role' | 'recent' | 'now'>): string {
  switch (code) {
    case 'not_configured':
      return channel === 'sms' ? 'SMS is not connected' : channel === 'whatsapp' ? 'WhatsApp is not connected' : 'Push is not connected';
    case 'outside_calling_hours':
      return g.role === 'super_admin'
        ? 'It is outside calling hours. As a super admin you can send anyway.'
        : 'It is outside calling hours. Only a super admin can send now.';
    case 'recently_sent':
      return g.recent.lastSentAt
        ? `A ${CHANNEL_NAME[channel]} for this stage was already sent ${agoText(g.recent.lastSentAt, g.now)}.`
        : `A ${CHANNEL_NAME[channel]} for this stage was sent recently.`;
    case 'daily_limit':
      return `The limit of ${MANUAL_DAILY_CAP} manual ${CHANNEL_NAME[channel]} sends in 24 hours has been reached for this customer`;
    default:
      return REASON[code];
  }
}

/* ───────────────────────────── plans (what the buttons show) ───────────────────────────── */

export type Preview =
  | { kind: 'whatsapp'; template: string; language: string; values: string[] }
  | { kind: 'sms'; text: string; templateId: string }
  | { kind: 'push'; eventName: string; summary: string };

export interface ChannelPlan {
  available: boolean;
  /** Plain English, shown verbatim. Set when unavailable, and for a soft warning on an available channel. */
  reason: string | null;
  code: BlockCode | null;
  preview: Preview | null;
  recentlySent: boolean;
  sentToday: number;
  lastSentAt: Date | null;
  lastSentBy: string | null;
  /** Guard 5 for this channel (gateway, template, values). Server only; never serialised to the client. */
  contentBlock: BlockCode | null;
  /** What the send will use. Server only; never serialised to the client. */
  send?: { whatsapp?: { tpl: StallTemplate; spec: string[] }; sms?: SmsTemplate };
}

/** Work out what a channel's button should say, from the same guards the send uses. */
function planChannel(
  channel: OutreachChannel,
  g: GuardInput,
  contentBlock: BlockCode | null,
  preview: Preview | null,
  send: ChannelPlan['send'],
): ChannelPlan {
  const base = {
    preview,
    recentlySent: repeatActive(channel, g.recent, g.now),
    sentToday: g.recent.sentToday,
    lastSentAt: g.recent.lastSentAt,
    lastSentBy: g.recent.lastSentBy,
    contentBlock,
    send,
  };
  const unavailable = (code: BlockCode): ChannelPlan => ({ ...base, available: false, code, reason: blockMessage(code, channel, g) });

  const block = firstBlock(channel, g, contentBlock);
  if (!block) return { ...base, available: true, code: null, reason: null };

  if (block === 'outside_calling_hours' || block === 'recently_sent') {
    const superAdmin = g.role === 'super_admin';
    // Something no override can fix (the daily cap) wins over a warning that one could.
    const hard = firstBlock(channel, g, contentBlock, { confirmRepeat: true, overrideHours: superAdmin });
    if (hard) return unavailable(hard);
    if (block === 'outside_calling_hours' && !superAdmin) return unavailable(block);
    return { ...base, available: true, code: block, reason: blockMessage(block, channel, g) };
  }
  return unavailable(block);
}

export interface WhatsAppPlanInput extends GuardInput {
  customer: GuardInput['customer'] & { name?: string | null; userId?: string | null };
  stageKey: string | null;
  cfg: DirectWhatsApp | null;
  vars: Vars;
}

export function planWhatsApp(i: WhatsAppPlanInput): ChannelPlan {
  let contentBlock: BlockCode | null = null;
  let preview: Preview | null = null;
  let send: ChannelPlan['send'];
  if (!i.cfg) {
    contentBlock = 'not_configured';
  } else {
    const tpl = i.stageKey ? templateFor(i.cfg.map, i.stageKey) : null;
    if (!tpl) {
      contentBlock = 'no_template';
    } else {
      const values = buildPlaceholders(tpl.placeholders, i.vars);
      if (!values) {
        contentBlock = 'missing_value';
      } else {
        preview = { kind: 'whatsapp', template: tpl.template, language: tpl.language || 'en', values };
        send = { whatsapp: { tpl, spec: tpl.placeholders ?? [] } };
      }
    }
  }
  return planChannel('whatsapp', i, contentBlock, preview, send);
}

export interface SmsPlanInput extends GuardInput {
  stageKey: string | null;
  /** The Voxvalley settings, or null when the SMS gateway is off or incomplete. */
  settings: Record<string, any> | null;
}

export function planSms(i: SmsPlanInput): ChannelPlan {
  let contentBlock: BlockCode | null = null;
  let preview: Preview | null = null;
  let send: ChannelPlan['send'];
  if (!i.settings) {
    contentBlock = 'not_configured';
  } else {
    const tpl = i.stageKey ? smsFor(i.settings, i.stageKey) : null;
    if (!tpl) {
      contentBlock = 'no_template';
    } else {
      preview = { kind: 'sms', text: tpl.body, templateId: tpl.templateId };
      send = { sms: tpl };
    }
  }
  return planChannel('sms', i, contentBlock, preview, send);
}

export interface PushPlanInput extends GuardInput {
  customer: GuardInput['customer'] & { userId: string | null };
  eventName: string;
}

export function planPush(i: PushPlanInput): ChannelPlan {
  const stage = i.customer.currentStage ?? '';
  let contentBlock: BlockCode | null = null;
  // The dispatch worker is off when NUDGES_DISABLED is set, so a queued push would never be delivered.
  if (nudgesDisabled()) contentBlock = 'nudges_disabled';
  else if (isFinishedStage(stage)) contentBlock = 'not_available_for_stage';
  else if (!i.customer.userId) contentBlock = 'not_signed_in';
  const label = STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage;
  const preview: Preview | null = contentBlock
    ? null
    : { kind: 'push', eventName: i.eventName, summary: `Fires the Upshot event "${i.eventName}" for "${label}". Upshot decides which channels it uses.` };
  return planChannel('push', i, contentBlock, preview, undefined);
}

/* ───────────────────────────── loading ───────────────────────────── */

export interface OutreachCustomer {
  id: string;
  name: string | null;
  phone: string | null;
  userId: string | null;
  currentStage: string;
  stageEnteredAt?: Date | null;
}

export interface Actor { id: string; email: string; role: string }

/** Passes both test lists. Each is a no-op when its list is empty, so this is true in production. */
export function phoneAllowed(phone: string | null): boolean {
  if (!phone) return false;
  return withinTestAllowlist(phone) && !notOnTestList(phone);
}

async function loadRecent(customerId: string, now: Date) {
  const rows = await prisma.outboundRequest.findMany({
    where: {
      customerId,
      status: { in: ['sent', 'pending'] },
      OR: [{ kind: 'whatsapp_template' }, { kind: 'sms_template' }, { kind: 'upshot_event', channel: 'push' }],
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { kind: true, channel: true, status: true, createdAt: true, sentAt: true, payload: true },
  });
  const ids = new Set<string>();
  for (const r of rows) {
    const id = payloadOf(r as RecentRow).sentById;
    if (id) ids.add(id);
  }
  const admins = ids.size
    ? await prisma.adminUser.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } })
    : [];
  const names: Record<string, string> = {};
  for (const a of admins) names[a.id] = a.name.trim().split(/\s+/)[0] || a.name;
  return summariseRecent(rows as RecentRow[], now, names);
}

export interface Snapshot {
  stageKey: string | null;
  dnc: boolean;
  guard: Omit<GuardInput, 'recent'>;
  recent: Awaited<ReturnType<typeof loadRecent>>;
}

/** Everything the guards need, loaded once. */
export async function loadSnapshot(customer: OutreachCustomer, role: string, now: Date): Promise<Snapshot> {
  const [dncSet, recent] = await Promise.all([doNotContactCustomerIds([customer.id]), loadRecent(customer.id, now)]);
  const dnc = dncSet.has(customer.id);
  return {
    stageKey: resolveOutreachStage(customer.currentStage),
    dnc,
    guard: {
      customer: { phone: customer.phone, currentStage: customer.currentStage },
      dnc,
      allowlisted: phoneAllowed(customer.phone),
      role,
      inWindow: withinCallingHours(now),
      now,
    },
    recent,
  };
}

export interface Plans { whatsapp: ChannelPlan; sms: ChannelPlan; push: ChannelPlan; snapshot: Snapshot }

/** The three channel plans for the buttons. */
export async function loadPlans(customer: OutreachCustomer, role: string, now: Date = new Date()): Promise<Plans> {
  const snapshot = await loadSnapshot(customer, role, now);
  const [cfg, smsCfg, eventName] = await Promise.all([
    directWhatsAppConfig(),
    directSmsConfig(),
    upshotEventNameForStage(customer.currentStage).catch(() => 'swiftloan_journey_nudge'),
  ]);
  const vars = await buildManualVars(customer, cfg?.siteUrl ?? '');
  const g = (channel: OutreachChannel): GuardInput => ({ ...snapshot.guard, recent: snapshot.recent[channel] });
  return {
    snapshot,
    whatsapp: planWhatsApp({ ...g('whatsapp'), customer, stageKey: snapshot.stageKey, cfg, vars }),
    sms: planSms({ ...g('sms'), stageKey: snapshot.stageKey, settings: smsCfg?.settings ?? null }),
    push: planPush({ ...g('push'), customer, eventName }),
  };
}

/* ───────────────────────────── sending ───────────────────────────── */

export interface SendFlags extends GuardFlags { installId?: string }

export type SendOutcome =
  | { ok: true; data: { channel: OutreachChannel; status: 'sent' | 'queued'; outboundRequestId: string; messageId: string | null; sentAt: string | null; installLink?: string } }
  | { ok: false; status: number; code: BlockCode | 'send_failed'; message: string; extra?: Record<string, unknown> };

function refuse(code: BlockCode, channel: OutreachChannel, g: GuardInput): SendOutcome {
  return {
    ok: false,
    status: BLOCK_STATUS[code],
    code,
    message: blockMessage(code, channel, g),
    ...(code === 'recently_sent' && g.recent.lastSentAt ? { extra: { lastSentAt: g.recent.lastSentAt.toISOString() } } : {}),
  };
}

const bucketOf = (now: Date) => Math.floor(now.getTime() / BUCKET_MS);

/**
 * Claim the send in OutboundRequest before the provider is called. A key that is
 * already taken means this exact send was made in the last 10 minutes. The one
 * exception is a claim that FAILED: the admin chose to try again, so it is taken
 * back, atomically, so two clicks still cannot both go ahead.
 */
async function claim(args: {
  customerId: string;
  channel: 'whatsapp' | 'sms';
  kind: 'whatsapp_template' | 'sms_template';
  key: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string } | null> {
  try {
    const row = await prisma.outboundRequest.create({
      data: {
        customerId: args.customerId, channel: args.channel, kind: args.kind,
        idempotencyKey: args.key, status: 'pending', payload: args.payload as object,
      },
    });
    return { id: row.id };
  } catch {
    const existing = await prisma.outboundRequest.findUnique({ where: { idempotencyKey: args.key }, select: { id: true, status: true } });
    if (existing?.status !== 'failed') return null;
    const retaken = await prisma.outboundRequest.updateMany({
      where: { id: existing.id, status: 'failed' },
      data: { status: 'pending', lastError: null, payload: args.payload as object },
    });
    return retaken.count === 1 ? { id: existing.id } : null;
  }
}

function sentTwiceTooSoon(channel: OutreachChannel): SendOutcome {
  return {
    ok: false, status: 409, code: 'recently_sent',
    message: `A ${CHANNEL_NAME[channel]} for this stage was sent a few minutes ago. Wait a little before sending again.`,
  };
}

/** Record what happened to a claim. A failure to write here never changes what the admin is told. */
async function settle(
  id: string,
  result: { ok: boolean; messageId?: string; error?: string; body?: unknown },
  now: Date,
  fallbackError: string,
  extraPayload?: Record<string, unknown>,
) {
  await prisma.outboundRequest
    .update({
      where: { id },
      data: {
        ...(result.ok
          ? { status: 'sent' as const, sentAt: now, attempts: 1, providerRef: result.messageId ?? null }
          : { status: 'failed' as const, attempts: 1, lastError: (result.error ?? fallbackError).slice(0, 500) }),
        ...(result.body != null ? { response: result.body as object } : {}),
        ...(extraPayload ? { payload: extraPayload as object } : {}),
      },
    })
    .catch(() => undefined);
}

async function afterSuccess(customer: OutreachCustomer, actor: Actor, via: string, extra: Record<string, unknown>, now: Date) {
  await prisma.customer.update({ where: { id: customer.id }, data: { lastNudgedAt: now } }).catch(() => undefined);
  await recordJourneyEvent(customer.id, {
    channel: 'system',
    name: JOURNEY_EVENTS.NUDGE_SENT,
    metadata: { via, source: 'admin', sentBy: { id: actor.id, email: actor.email }, ...extra },
    mirrorTelemetry: false,
  }).catch(() => undefined);
}

/** Send the stage's WhatsApp template to one customer. Never throws for a refusal or a provider failure. */
export async function sendManualWhatsApp(
  customer: OutreachCustomer,
  actor: Actor,
  flags: SendFlags = {},
  now: Date = new Date(),
): Promise<SendOutcome> {
  const snapshot = await loadSnapshot(customer, actor.role, now);
  const cfg = await directWhatsAppConfig();
  const vars = await buildManualVars(customer, cfg?.siteUrl ?? '');
  const g: GuardInput = { ...snapshot.guard, recent: snapshot.recent.whatsapp };
  const plan = planWhatsApp({ ...g, customer, stageKey: snapshot.stageKey, cfg, vars });

  const block = firstBlock('whatsapp', g, plan.contentBlock, flags);
  if (block) return refuse(block, 'whatsapp', g);
  const sel = plan.send?.whatsapp;
  if (!sel || !customer.phone) return refuse('no_template', 'whatsapp', g);

  const key = `admin_wa:${customer.id}:${snapshot.stageKey}:${bucketOf(now)}`;
  const basePayload = {
    source: 'admin', sentBy: { id: actor.id, email: actor.email },
    stageKey: snapshot.stageKey, template: sel.tpl.template, channel: 'whatsapp',
  };
  const claimed = await claim({ customerId: customer.id, channel: 'whatsapp', kind: 'whatsapp_template', key, payload: basePayload });
  if (!claimed) return sentTwiceTooSoon('whatsapp');

  // The app link is created only now, only when the message really contains it.
  let installLink: { url: string; outboundRequestId: string; token: string } | null = null;
  let values = buildPlaceholders(sel.spec, vars) ?? [];
  if (usesAppLink(sel.spec)) {
    try {
      const details = await loadInstallDetails(customer);
      installLink = await mintInstallLink({
        customer, stage: customer.currentStage, channel: 'whatsapp',
        admin: { id: actor.id, email: actor.email }, now, ...details,
      });
      values = buildPlaceholders(sel.spec, { ...vars, appLink: installLink.url }) ?? values;
    } catch (e) {
      await settle(claimed.id, { ok: false, error: 'Could not create the app link' }, now, 'Could not create the app link');
      return { ok: false, status: 502, code: 'send_failed', message: `WhatsApp failed: ${(e as Error).message}. Nothing was sent.` };
    }
  }

  const result = await sendWhatsAppTemplate({
    phone: customer.phone,
    templateName: sel.tpl.template,
    language: sel.tpl.language,
    placeholders: values,
    referenceId: claimed.id,
    track: { kind: 'admin', customerId: customer.id },
  });

  await settle(claimed.id, result, now, 'WhatsApp send failed', installLink ? { ...basePayload, appLinkToken: installLink.token } : undefined);

  if (!result.ok) {
    if (installLink) await cancelInstallLink(installLink.outboundRequestId);
    log.warn('manual whatsapp failed', { customerId: customer.id, adminId: actor.id, error: (result.error ?? '').slice(0, 200) });
    return { ok: false, status: 502, code: 'send_failed', message: `WhatsApp failed: ${result.error ?? 'the provider rejected it'}. Nothing was sent.` };
  }

  await afterSuccess(customer, actor, 'whatsapp', { template: sel.tpl.template, stageKey: snapshot.stageKey }, now);
  log.info('manual whatsapp sent', { customerId: customer.id, adminId: actor.id, template: sel.tpl.template });
  return {
    ok: true,
    data: {
      channel: 'whatsapp', status: 'sent', outboundRequestId: claimed.id,
      messageId: result.messageId ?? null, sentAt: now.toISOString(),
      ...(installLink ? { installLink: installLink.url } : {}),
    },
  };
}

/** Send the stage's registered SMS to one customer. Never throws for a refusal or a provider failure. */
export async function sendManualSms(
  customer: OutreachCustomer,
  actor: Actor,
  flags: SendFlags = {},
  now: Date = new Date(),
): Promise<SendOutcome> {
  const snapshot = await loadSnapshot(customer, actor.role, now);
  const smsCfg = await directSmsConfig();
  const g: GuardInput = { ...snapshot.guard, recent: snapshot.recent.sms };
  const plan = planSms({ ...g, stageKey: snapshot.stageKey, settings: smsCfg?.settings ?? null });

  const block = firstBlock('sms', g, plan.contentBlock, flags);
  if (block) return refuse(block, 'sms', g);
  const tpl = plan.send?.sms;
  if (!tpl || !customer.phone) return refuse('no_template', 'sms', g);

  const key = `admin_sms:${customer.id}:${snapshot.stageKey}:${bucketOf(now)}`;
  const claimed = await claim({
    customerId: customer.id, channel: 'sms', kind: 'sms_template', key,
    payload: { source: 'admin', sentBy: { id: actor.id, email: actor.email }, stageKey: snapshot.stageKey, templateId: tpl.templateId, channel: 'sms' },
  });
  if (!claimed) return sentTwiceTooSoon('sms');

  const result = await sendVoxSms({
    phone: customer.phone, body: tpl.body, templateId: tpl.templateId,
    track: { kind: 'admin', customerId: customer.id },
  });

  await settle(claimed.id, result, now, 'SMS send failed');

  if (!result.ok) {
    log.warn('manual sms failed', { customerId: customer.id, adminId: actor.id, error: (result.error ?? '').slice(0, 200) });
    return { ok: false, status: 502, code: 'send_failed', message: `SMS failed: ${result.error ?? 'the gateway rejected it'}. Nothing was sent.` };
  }

  await afterSuccess(customer, actor, 'sms', { templateId: tpl.templateId, stageKey: snapshot.stageKey }, now);
  log.info('manual sms sent', { customerId: customer.id, adminId: actor.id });
  return {
    ok: true,
    data: { channel: 'sms', status: 'sent', outboundRequestId: claimed.id, messageId: result.messageId ?? null, sentAt: now.toISOString() },
  };
}

/**
 * Queue a push for the customer's current stage. The dispatch job delivers it within
 * about a minute, so the answer is `queued`, not `sent`. nudgeCustomer records its own
 * journey event and one-minute duplicate guard; this adds the repeat window and the cap.
 */
export async function sendManualPush(
  customer: Customer,
  actor: Actor,
  flags: SendFlags = {},
  now: Date = new Date(),
): Promise<SendOutcome> {
  const snapshot = await loadSnapshot(customer, actor.role, now);
  const eventName = await upshotEventNameForStage(customer.currentStage).catch(() => 'swiftloan_journey_nudge');
  const g: GuardInput = { ...snapshot.guard, recent: snapshot.recent.push };
  const plan = planPush({ ...g, customer, eventName });

  const block = firstBlock('push', g, plan.contentBlock, flags);
  if (block) return refuse(block, 'push', g);

  const requests = await nudgeCustomer(customer, customer.currentStage);
  const event = requests.find((r) => r.kind === 'upshot_event') ?? requests[requests.length - 1];
  if (!event) return { ok: false, status: 502, code: 'send_failed', message: 'Push failed: nothing was queued. Nothing was sent.' };

  // Tag the queued event so the cap counts it as a manual send and the history shows who sent it.
  await prisma.outboundRequest
    .update({
      where: { id: event.id },
      data: { payload: { ...((event.payload ?? {}) as Record<string, unknown>), source: 'admin', sentBy: { id: actor.id, email: actor.email }, stageKey: customer.currentStage, channel: 'push' } as object },
    })
    .catch(() => undefined);
  await prisma.customer.update({ where: { id: customer.id }, data: { lastNudgedAt: now } }).catch(() => undefined);

  log.info('manual push queued', { customerId: customer.id, adminId: actor.id, stage: customer.currentStage });
  return { ok: true, data: { channel: 'push', status: 'queued', outboundRequestId: event.id, messageId: null, sentAt: null } };
}
