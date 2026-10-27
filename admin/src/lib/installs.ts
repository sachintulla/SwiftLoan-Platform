// Pure helpers for the App Downloads page: periods, query strings, plain-English
// wording and the reasons a row's actions are switched off. No React and no
// network, so every rule here is covered by installs.test.ts.

import { inrRupees } from './format';

/* ───────────────────────────── API shapes ───────────────────────────── */

export type Confidence = 'confirmed' | 'probable' | 'none';
export type SentByType = 'admin' | 'reminder' | 'lender_reminder' | 'website' | 'campaign' | 'referral' | 'organic' | 'unknown';
export type SentVia = 'whatsapp' | 'sms' | 'call' | 'push' | 'website';

export interface InstallContext {
  name: string | null;
  phone: string | null;
  amountRupees: number | null;
  product: string | null;
  stageWhenSent: string | null;
  sentVia: SentVia | null;
  sentAt: string | null;
  sentBy: { type: SentByType; label: string };
  origin: 'install_link' | 'journey_reminder' | 'lender_nudge' | 'lead' | 'campaign' | 'referral' | null;
}

export interface InstallRow {
  id: string;
  installedAt: string;
  platform: string;
  source: string;
  campaignId: string | null;
  matchMethod: string | null;
  confidence: Confidence;
  customer: { id: string; userId: string | null; name: string | null; phone: string | null; stage: string; stageLabel: string } | null;
  context: InstallContext | null;
  signedIn: boolean;
}

export interface InstallsPayload {
  rows: InstallRow[];
  stats: { total: number; withContext: number; withoutContext: number; reachedNextStep: number; notSignedIn: number };
  bySource: { source: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  truncated: boolean;
}

/* ───────────────────────────── periods ───────────────────────────── */

export type InstallPeriod = 'today' | 'yesterday' | '7d' | '30d' | 'custom' | 'all';

export const INSTALL_PERIODS: { key: InstallPeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Date range' },
  { key: 'all', label: 'All time' },
];

/** Most installs happen after the first day, so "Today" left the page empty by morning. */
export const DEFAULT_INSTALL_PERIOD: InstallPeriod = '7d';

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/**
 * The from/to instants for a period, in the viewer's own timezone, so "Today"
 * is the admin's day. `now` is a parameter so the rules can be tested.
 */
export function computeInstallRange(period: InstallPeriod, cFrom = '', cTo = '', now: Date = new Date()): { from?: string; to?: string } {
  if (period === 'all') return {};
  // Open-ended periods send no upper bound, so the query key stays the same while the page is open and a new install shows up on refresh.
  if (period === 'today') return { from: startOfDay(now).toISOString() };
  if (period === 'yesterday') {
    const s = startOfDay(now);
    const y = new Date(s); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: s.toISOString() };
  }
  if (period === '7d' || period === '30d') {
    const f = new Date(now); f.setDate(f.getDate() - (period === '7d' ? 7 : 30));
    return { from: f.toISOString() };
  }
  const out: { from?: string; to?: string } = {};
  if (cFrom) out.from = new Date(`${cFrom}T00:00:00`).toISOString();
  if (cTo) out.to = new Date(`${cTo}T23:59:59.999`).toISOString();
  return out;
}

/** Plain message when the custom range cannot work, otherwise null. Both dates are yyyy-mm-dd. */
export function rangeError(cFrom: string, cTo: string): string | null {
  if (cFrom && cTo && cFrom > cTo) return 'From must be on or before To.';
  return null;
}

/* ───────────────────────────── filters and query ───────────────────────────── */

export interface InstallFilters {
  search: string;
  stage: string;
  sentBy: string;
  channel: string;
  platform: string;
  followUp: boolean;
}

export const EMPTY_INSTALL_FILTERS: InstallFilters = { search: '', stage: '', sentBy: '', channel: '', platform: '', followUp: false };

export function hasActiveFilters(f: InstallFilters): boolean {
  return !!(f.search.trim() || f.stage || f.sentBy || f.channel || f.platform || f.followUp);
}

/** Query string for GET /api/admin/installs. Empty filters are left out. */
export function buildInstallsQuery(
  f: InstallFilters, range: { from?: string; to?: string }, page: number, pageSize = 20,
): string {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (range.from) p.set('from', range.from);
  if (range.to) p.set('to', range.to);
  if (f.search.trim()) p.set('search', f.search.trim());
  if (f.stage) p.set('stage', f.stage);
  if (f.sentBy) p.set('sentBy', f.sentBy);
  if (f.channel) p.set('channel', f.channel);
  if (f.platform) p.set('platform', f.platform);
  if (f.followUp) p.set('followUp', '1');
  return p.toString();
}

export const SENT_BY_LABELS: Record<SentByType, string> = {
  admin: 'An admin',
  reminder: 'Automatic reminder',
  lender_reminder: 'Lender reminder',
  website: 'Website',
  campaign: 'Campaign',
  referral: 'Friend referral',
  organic: 'No link details',
  unknown: 'Not recorded',
};

export const SENT_BY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Anyone' },
  { value: 'admin', label: SENT_BY_LABELS.admin },
  { value: 'reminder', label: SENT_BY_LABELS.reminder },
  { value: 'lender_reminder', label: SENT_BY_LABELS.lender_reminder },
  { value: 'website', label: SENT_BY_LABELS.website },
  { value: 'campaign', label: SENT_BY_LABELS.campaign },
  { value: 'referral', label: SENT_BY_LABELS.referral },
  { value: 'organic', label: SENT_BY_LABELS.organic },
];

export const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any channel' },
  { value: 'call', label: 'Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'push', label: 'Push notification' },
];

export const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any platform' },
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iPhone' },
];

export function sentByLabel(type: string): string {
  return SENT_BY_LABELS[type as SentByType] ?? 'Not recorded';
}

export function platformLabel(p: string): string {
  return p === 'ios' ? 'iPhone' : p === 'android' ? 'Android' : p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Unknown';
}

export function channelLabel(c: string | null | undefined): string {
  switch (c) {
    case 'whatsapp': return 'WhatsApp';
    case 'sms': return 'SMS';
    case 'call': return 'Call';
    case 'push': return 'Push notification';
    case 'website': return 'Website';
    default: return '';
  }
}

/* ───────────────────────────── row wording ───────────────────────────── */

/** "Asked for ₹5,00,000 Personal Loan", or a plain statement that nothing came with the link. */
export function loanDetailsText(c: InstallContext | null): string {
  if (!c) return 'No details were sent';
  const amount = c.amountRupees != null && c.amountRupees > 0 ? inrRupees(c.amountRupees) : null;
  const product = c.product || null;
  if (amount && product) return `Asked for ${amount} ${product}`;
  if (amount) return `Asked for ${amount}`;
  if (product) return `Interested in ${product}`;
  return 'No details were sent';
}

export const hasLoanDetails = (c: InstallContext | null): boolean => loanDetailsText(c) !== 'No details were sent';

/**
 * Who sent the link and how. `recorded` is false when nothing is known, so the
 * row can say so in one fixed sentence rather than guessing.
 */
export function linkSentText(c: InstallContext | null): { text: string; recorded: boolean } {
  if (!c || c.sentBy.type === 'organic') return { text: 'Link source not recorded', recorded: false };
  const via = channelLabel(c.sentVia);
  const label = c.sentBy.label;
  if (c.sentBy.type === 'unknown' && !via) return { text: 'Link source not recorded', recorded: false };
  if (c.sentBy.type === 'admin') return { text: via ? `${via} by ${label}` : `Sent by ${label}`, recorded: true };
  return { text: via ? `${via} from ${label}` : label, recorded: true };
}

/** The "Was at X when sent" muted line, only when it differs from where they are now. */
export function stageWhenSentNote(c: InstallContext | null, currentStage: string | null | undefined, stageName: (key: string) => string): string | null {
  const was = c?.stageWhenSent;
  if (!was || !currentStage || was === currentStage) return null;
  return `Was at ${stageName(was)} when sent`;
}

/** Plain words for how the install was tied to a link, and so how far to trust it. */
export function matchedByText(matchMethod: string | null | undefined, signedIn: boolean): string {
  switch (matchMethod) {
    case 'play_referrer': return 'Matched by the link the customer tapped (Google Play)';
    case 'clipboard': return 'Matched by the link the customer tapped (iPhone)';
    case 'ip_window': return 'Probable match only: same network shortly after a link was opened';
    default: return signedIn ? 'Matched when the customer signed in. No link click was recorded' : 'Not matched to a link or a customer';
  }
}

/** Stages after which there is nothing left to follow up on. */
export const FINISHED_STAGES = ['disbursed', 'rejected', 'lost'];

/**
 * Why the follow-up buttons are off for this row, or null when they may be used.
 * The server refuses a probable match too; this just says so before the click.
 */
export function followUpDisabledReason(row: Pick<InstallRow, 'customer' | 'confidence'>): string | null {
  if (!row.customer) return 'Not matched to a customer';
  if (row.confidence === 'probable') return 'Probable match only. Confirm the customer before messaging.';
  if (!row.customer.phone) return 'No phone number';
  if (FINISHED_STAGES.includes(row.customer.stage)) return 'Finished the journey';
  return null;
}

/* ───────────────────────────── page states and stats ───────────────────────────── */

export type ListState = 'loading' | 'error' | 'empty_none' | 'empty_filtered' | 'loaded';

/** One state for the list, so the page cannot show "No installs" for a failed request. */
export function listState(args: { loading: boolean; error: unknown; total: number; filtersActive: boolean }): ListState {
  if (args.error) return 'error';
  if (args.loading) return 'loading';
  if (args.total > 0) return 'loaded';
  return args.filtersActive ? 'empty_filtered' : 'empty_none';
}

export function emptyNoneText(period: InstallPeriod): string {
  return `No installs ${period === 'today' ? 'today' : 'in this period'} yet. Try Last 30 days.`;
}

export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Width of a bar, 0 to 100, relative to the biggest row so the top bar fills the track. */
export function barWidth(count: number, max: number): number {
  if (max <= 0 || count <= 0) return 0;
  return Math.max(4, Math.round((count / max) * 100));
}
