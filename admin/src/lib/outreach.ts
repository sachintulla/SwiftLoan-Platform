// Pure helpers for the "Reach out" buttons (components/SendActions.tsx): labels,
// "12 min ago by Priya" text, what each button should say, and how server errors
// are shown. Nothing here touches React or the network, so it can be unit tested.
//
// The server owns every rule (do-not-contact, test list, calling hours, repeat
// window, daily cap). These helpers only decide how its answers are worded and
// which buttons are drawn as disabled; they never decide whether a send is allowed.

export type MessageChannel = 'whatsapp' | 'sms' | 'push';
export type OutreachChannel = MessageChannel | 'call';

export const CHANNEL_LABEL: Record<OutreachChannel, string> = {
  whatsapp: 'WhatsApp', sms: 'SMS', push: 'Push', call: 'Call',
};

/** What the confirm button says. */
export const CONFIRM_LABEL: Record<OutreachChannel, string> = {
  whatsapp: 'Send WhatsApp', sms: 'Send SMS', push: 'Send push', call: 'Place call',
};

/** The thing being sent, as it reads in "This sends a real ... now". */
const REAL_THING: Record<MessageChannel, string> = {
  whatsapp: 'WhatsApp message', sms: 'SMS', push: 'push notification',
};

/** How a repeat reads in "A WhatsApp for this stage was already sent ...". */
const REPEAT_NAME: Record<MessageChannel, string> = { whatsapp: 'WhatsApp', sms: 'SMS', push: 'push' };

export interface ChannelState {
  available: boolean;
  reason: string | null;
  code: string | null;
  preview:
    | null
    | { kind: 'whatsapp'; template: string; language: string; values: string[] }
    | { kind: 'sms'; text: string; templateId: string }
    | { kind: 'push'; eventName: string; summary: string };
  lastSentAt: string | null;
  lastSentBy: string | null;
  recentlySent: boolean;
  sentToday: number;
}

export interface DeliveryRow {
  id: string;
  channel: 'whatsapp' | 'sms';
  template: string | null;
  kind: string;
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failureReason: string | null;
}

export interface OutreachOptions {
  customer: { id: string; name: string | null; phone: string | null; currentStage: string; stageLabel: string; stageEnteredAt: string | null };
  outreachStage: string | null;
  terminal: boolean;
  doNotContact: { blocked: boolean; reason: 'stage_lost' | 'do_not_call' | null };
  onReminderSchedule: boolean;
  role: { canMessage: boolean; canCall: boolean };
  channels: Record<MessageChannel, ChannelState>;
  recent: DeliveryRow[];
  manualSends: Array<{ channel: string; at: string | null; by: string | null; status: string }>;
  /** App-link bookkeeping rows. They are not messages, so counts on the page subtract them. */
  installLinks?: { total: number; sent: number };
}

/* ───────────────────────────── roles ───────────────────────────── */

export const NEEDS_ADMIN = 'Needs an admin or super admin';
export const NEEDS_SUPER_ADMIN = 'Needs a super admin';
export const FINISHED_NOTE = 'This customer has finished the journey. There is nothing to follow up on.';
export const NO_PHONE = 'No phone number on file';
export const DNC_NOTE = 'This customer asked not to be contacted';

export const canMessageRole = (role: string | null | undefined): boolean => role === 'admin' || role === 'super_admin';
export const canCallRole = (role: string | null | undefined): boolean => role === 'super_admin';

/** Stages where the journey is over. The server decides; this lets the bar draw itself before the answer arrives. */
const FINISHED = ['disbursed', 'rejected', 'lost'];
export const isFinishedStage = (stage: string | null | undefined): boolean => !!stage && FINISHED.includes(stage);

/* ───────────────────────────── wording ───────────────────────────── */

/** "12 min ago", "2 hours ago", "3 days ago". */
export function timeAgoText(iso: string | null | undefined, now: number = Date.now(), long = false): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return long ? `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** "Not sent yet" or "Last sent 12 min ago by Priya". */
export function lastSentText(s: Pick<ChannelState, 'lastSentAt' | 'lastSentBy'>, now: number = Date.now()): string {
  const ago = timeAgoText(s.lastSentAt, now);
  if (!ago) return 'Not sent yet';
  return `Last sent ${ago}${s.lastSentBy ? ` by ${s.lastSentBy}` : ''}`;
}

/** 9876543210 becomes 98765 43210, the form read aloud. */
export function formatPhone(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  const bare = d.length > 10 ? d.slice(-10) : d;
  return bare.length === 10 ? `${bare.slice(0, 5)} ${bare.slice(5)}` : String(phone ?? '');
}

/** 9876543210 becomes 98XXXXXX10, for the line that stays on screen after a send. */
export function maskPhone(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  const bare = d.length > 10 ? d.slice(-10) : d;
  return bare.length === 10 ? `${bare.slice(0, 2)}XXXXXX${bare.slice(8)}` : 'the customer';
}

/** 14:32, in the viewer's own clock. */
export function clockText(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Section label: Reach out about "KYC started". */
export function sectionLabel(stageLabel: string | null | undefined): string {
  return stageLabel ? `Reach out about "${stageLabel}"` : 'Reach out';
}

/* ───────────────────────────── button state ───────────────────────────── */

export interface ButtonState {
  disabled: boolean;
  /** The visible line under the button. Never only a tooltip. */
  note: string;
  tone: 'muted' | 'warn';
}

export interface ButtonContext {
  role: string | null;
  /** Null until the options have loaded. */
  options: OutreachOptions | null;
  optionsError?: boolean;
  /** The customer is at a stage that has finished, or has no follow-up. */
  finished: boolean;
  /** A reason to disable everything, from whoever placed the buttons. */
  disabledReason?: string | null;
  /** The stage has a call opening (STAGE_CALL_STEPS). */
  hasCallSteps: boolean;
  now?: number;
}

/** The state of one of the four buttons. */
export function buttonState(channel: OutreachChannel, c: ButtonContext): ButtonState {
  const off = (note: string): ButtonState => ({ disabled: true, note, tone: 'muted' });
  const now = c.now ?? Date.now();

  if (c.finished) return off('');
  if (c.disabledReason) return off(c.disabledReason);

  if (channel === 'call') {
    if (!canCallRole(c.role)) return off(NEEDS_SUPER_ADMIN);
    if (!c.hasCallSteps) return off('No call is set up for this stage');
    if (c.options?.doNotContact.blocked) return off('This customer asked not to be called');
    if (c.options && !c.options.customer.phone) return off(NO_PHONE);
    if (!c.options) return off(c.optionsError ? 'Could not check this customer' : 'Checking');
    return { disabled: false, note: 'Rings their phone now', tone: 'muted' };
  }

  if (!canMessageRole(c.role)) return off(NEEDS_ADMIN);
  if (!c.options) return off(c.optionsError ? 'Could not check this channel' : 'Checking');
  const s = c.options.channels[channel];
  if (!s.available) return off(s.reason || 'Not available');
  // Available, with a warning worth seeing before pressing: the hours override.
  if (s.code === 'outside_calling_hours' && s.reason) return { disabled: false, note: s.reason, tone: 'warn' };
  return { disabled: false, note: lastSentText(s, now), tone: 'muted' };
}

/* ───────────────────────────── confirmation ───────────────────────────── */

export interface ConfirmCopy {
  title: string;
  confirmLabel: string;
  consequence: string;
  tone: 'brand' | 'red';
}

/** Words for the confirmation dialog. `name` falls back to "this customer". */
export function confirmCopy(
  channel: OutreachChannel,
  o: { name: string | null | undefined; phone: string | null | undefined; stageLabel: string | null | undefined },
): ConfirmCopy {
  const who = o.name?.trim() || 'this customer';
  if (channel === 'call') {
    return {
      title: `Call ${who}?`,
      confirmLabel: CONFIRM_LABEL.call,
      consequence: `This rings ${who} on ${formatPhone(o.phone)} within a few seconds. The voice agent will open with the ${o.stageLabel ?? 'current stage'} follow-up.`,
      tone: 'red',
    };
  }
  return {
    title: `Send ${channel === 'push' ? 'push notification' : CHANNEL_LABEL[channel]} to ${who}?`,
    confirmLabel: CONFIRM_LABEL[channel],
    consequence: channel === 'push'
      ? 'Fires the Upshot event for this stage. Upshot decides which channels it uses. It cannot be recalled.'
      : `This sends a real ${REAL_THING[channel]} now. It cannot be recalled.`,
    tone: 'brand',
  };
}

/** The amber note shown when this channel was already used for the stage. */
export function repeatNote(channel: MessageChannel, lastSentAt: string | null | undefined, now: number = Date.now()): string {
  const ago = timeAgoText(lastSentAt, now, true);
  return ago
    ? `A ${REPEAT_NAME[channel]} for this stage was already sent ${ago}.`
    : `A ${REPEAT_NAME[channel]} for this stage was sent recently.`;
}

/* ───────────────────────────── results and errors ───────────────────────────── */

export interface SendFailure {
  status: number;
  code: string | null;
  message: string;
  lastSentAt: string | null;
}

/** Read the machine code and message out of whatever the API client threw. */
export function parseSendError(e: unknown): SendFailure {
  const err = e as { status?: number; message?: string; body?: { data?: { code?: string; lastSentAt?: string } | null; message?: string; error?: string } };
  const data = err?.body?.data ?? null;
  return {
    status: typeof err?.status === 'number' ? err.status : 0,
    code: typeof data?.code === 'string' ? data.code : null,
    message: String(err?.body?.message || err?.message || 'Something went wrong'),
    lastSentAt: typeof data?.lastSentAt === 'string' ? data.lastSentAt : null,
  };
}

/** requireRole's own text ("This action requires one of: super_admin") is not for a person. */
const ROLE_ERROR = /requires one of/i;

function sentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** The line shown after a failed send or call. The server's reason is kept as it is. */
export function failureText(channel: OutreachChannel, f: Pick<SendFailure, 'status' | 'code' | 'message'>): string {
  if (f.status === 403 && ROLE_ERROR.test(f.message)) {
    return `${CHANNEL_LABEL[channel]} not sent. ${channel === 'call' ? NEEDS_SUPER_ADMIN : NEEDS_ADMIN}.`;
  }
  // The server already words a provider failure completely ("WhatsApp failed: ... Nothing was sent.").
  if (f.code === 'send_failed') return sentence(f.message);
  if (channel === 'call') return sentence(f.message);
  return `${CHANNEL_LABEL[channel]} not sent. ${sentence(f.message)}`;
}

/** The line shown after a send that went through. */
export function successText(channel: OutreachChannel, phone: string | null | undefined, at: Date, status: 'sent' | 'queued' | 'called' = 'sent'): string {
  const to = maskPhone(phone);
  if (channel === 'call') return `Call placed to ${to}. The result appears under the Calls tab.`;
  if (channel === 'push' || status === 'queued') return `Push queued for ${to} at ${clockText(at)}. It is delivered within about a minute.`;
  return `${CHANNEL_LABEL[channel]} sent to ${to} at ${clockText(at)}.`;
}

/* ───────────────────────────── history ───────────────────────────── */

export function deliveryBadge(status: string): { label: string; tone: 'green' | 'blue' | 'amber' | 'red' | 'grey' } {
  switch (status) {
    case 'read': return { label: 'Read', tone: 'green' };
    case 'delivered': return { label: 'Delivered', tone: 'green' };
    case 'sent': return { label: 'Sent', tone: 'blue' };
    case 'queued': return { label: 'Queued', tone: 'grey' };
    case 'failed': return { label: 'Failed', tone: 'red' };
    default: return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown', tone: 'grey' };
  }
}

/** Why a message went out, in words. */
export function kindLabel(kind: string | null | undefined): string {
  switch (kind) {
    case 'admin': return 'Sent from the dashboard';
    case 'stall': return 'Automatic follow-up';
    case 'install_reminder': return 'Install reminder';
    default: return '';
  }
}

/** One line for a past manual send: "Priya sent WhatsApp, 12 min ago". */
export function manualSendLine(m: { channel: string; at: string | null; by: string | null; status: string }, now: number = Date.now()): string {
  const label = (CHANNEL_LABEL as Record<string, string>)[m.channel] ?? m.channel;
  const ago = timeAgoText(m.at, now);
  const state = m.status === 'failed' ? ' (failed)' : m.status === 'pending' ? ' (queued)' : '';
  return `${m.by ?? 'An admin'} sent ${label}${ago ? `, ${ago}` : ''}${state}`;
}

/** Subtract the app-link bookkeeping rows from the server's nudge counts. */
export function withoutInstallLinks<T extends { total: number; delivered: number }>(
  summary: T | undefined,
  links: { total: number; sent: number } | undefined,
): T | undefined {
  if (!summary || !links) return summary;
  return {
    ...summary,
    total: Math.max(0, summary.total - links.total),
    delivered: Math.max(0, summary.delivered - links.sent),
  };
}
