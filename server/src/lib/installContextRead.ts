/**
 * Read side of the install context (admin "App Downloads" page).
 *
 * AppDownload has no foreign keys. The only thing that ties an install back to
 * a person is `referrer`, which is the `ref` of the /dl link the person clicked.
 * Every sender builds that link from a token, so this module resolves a token
 * against the places that could have minted it, in a fixed order:
 *
 *   1. an admin-pushed install link (OutboundRequest kind 'install_link')
 *   2. an automatic journey reminder (JourneyReminder.token)
 *   3. a lender-application nudge (LenderNudge.token)
 *   4. a lead (Lead.token), from the website form, widget, a call or a campaign
 *   5. a friend referral code (ReferralCode.code)
 *   6. otherwise a campaign link, or an organic install with nothing known
 *
 * Everything here is pure (no database, no clock) so the rules can be unit
 * tested. The route in modules/adminInstalls.routes.ts does the batched reads.
 *
 * Units: Lead.amount is in PAISE; LoanApplication.amount and the install_link
 * payload amount are in whole RUPEES. Everything leaving this module is rupees.
 */

export type Confidence = 'confirmed' | 'probable' | 'none';
export type SentVia = 'whatsapp' | 'sms' | 'call' | 'push' | 'website';
export type SentByType = 'admin' | 'reminder' | 'lender_reminder' | 'website' | 'campaign' | 'referral' | 'organic' | 'unknown';
export type ContextOrigin = 'install_link' | 'journey_reminder' | 'lender_nudge' | 'lead' | 'campaign' | 'referral';

export const SENT_BY_TYPES: SentByType[] = ['admin', 'reminder', 'lender_reminder', 'website', 'campaign', 'referral', 'organic', 'unknown'];
export const SENT_VIA_VALUES: SentVia[] = ['whatsapp', 'sms', 'call', 'push', 'website'];
/** Filterable channels: how the link reached the customer. */
export const CHANNEL_FILTER_VALUES = ['whatsapp', 'sms', 'call', 'push'] as const;

/** Origins that name a specific person, as opposed to a generic campaign or referral link. */
const PERSONAL_ORIGINS: ContextOrigin[] = ['install_link', 'journey_reminder', 'lender_nudge', 'lead'];

/* ───────────────────────────── small helpers ───────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const finiteNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function isoOrNull(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * A link `ref` as stored in AppDownload.referrer, made safe to look up.
 * Tokens and referral codes are upper-case letters and digits; anything with
 * other characters, or nothing at all, cannot be one of ours.
 */
export function normaliseRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const t = ref.trim().toUpperCase();
  if (!t || t.length > 64) return null;
  return /^[A-Z0-9_-]+$/.test(t) ? t : null;
}

/**
 * The exact strings to look up for one stored ref. Senders store tokens in
 * upper case, but a campaign slug is stored as typed, so try the trimmed value
 * as well as the upper-cased one.
 */
export function refLookupVariants(ref: unknown): string[] {
  const n = normaliseRef(ref);
  if (!n) return [];
  const raw = (ref as string).trim();
  return raw === n ? [n] : [n, raw];
}

/** play_referrer and clipboard carry the click token, so they are exact. ip_window is a guess on a shared address. */
export function classifyConfidence(matchMethod: string | null | undefined): Confidence {
  if (matchMethod === 'play_referrer' || matchMethod === 'clipboard') return 'confirmed';
  if (matchMethod === 'ip_window') return 'probable';
  return 'none';
}

/** "personal" -> "Personal loan"; text that already says "loan" is only tidied. */
export function productLabel(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  const words = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const titled = words.replace(/(^|\s)(\w)/g, (_m, a: string, b: string) => a + b.toUpperCase());
  if (/loan/i.test(words)) return titled;
  return ['personal', 'business', 'home', 'education', 'vehicle'].includes(words) ? `${titled} Loan` : titled;
}

/** Lead.amount is paise; whole rupees out. */
export const paiseToRupees = (paise: unknown): number | null => {
  const n = finiteNum(paise);
  return n == null || n <= 0 ? null : Math.round(n / 100);
};
const positiveRupees = (v: unknown): number | null => {
  const n = finiteNum(v);
  return n == null || n <= 0 ? null : Math.round(n);
};

/* ───────────────────────── install_link payload ───────────────────────── */

export interface InstallLinkInfo {
  token: string | null;
  customerId: string | null;
  name: string | null;
  phone: string | null;
  amountRupees: number | null;
  product: string | null;
  stage: string | null;
  channel: SentVia | null;
  sentById: string | null;
  sentByEmail: string | null;
  sentAt: string | null;
}

/**
 * Tolerant reader for the OutboundRequest payload written when an admin sends a
 * WhatsApp that carries an install link. Missing fields become null and wrong
 * types are ignored; it never throws, because the row is written by another
 * code path and this page must keep working if its shape drifts.
 */
export function parseInstallLinkPayload(payload: unknown): InstallLinkInfo {
  const p = isObj(payload) ? payload : {};
  const by = isObj(p.sentBy) ? p.sentBy : {};
  const ch = str(p.channel)?.toLowerCase();
  return {
    token: str(p.token),
    customerId: str(p.customerId),
    name: str(p.name),
    phone: str(p.phone),
    amountRupees: positiveRupees(p.amountRupees),
    product: productLabel(p.product),
    stage: str(p.stage),
    channel: ch && (SENT_VIA_VALUES as string[]).includes(ch) ? (ch as SentVia) : null,
    sentById: str(by.id),
    sentByEmail: str(by.email),
    sentAt: isoOrNull(p.sentAt),
  };
}

/* ───────────────────────── reminder history ───────────────────────── */

/**
 * JourneyReminder.history and LenderNudge.history hold one entry per handled
 * step: { step, channel, at, outcome: logged | sent | failed | skipped }.
 * The link was delivered at the LAST step that was sent (or logged, when the
 * job runs in log-only mode). Returns null when nothing was sent.
 */
export function historyToSend(history: unknown): { channel: SentVia | null; at: string | null } | null {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (!isObj(e)) continue;
    if (e.outcome !== 'sent' && e.outcome !== 'logged') continue;
    const ch = str(e.channel)?.toLowerCase();
    return {
      channel: ch && (SENT_VIA_VALUES as string[]).includes(ch) ? (ch as SentVia) : null,
      at: isoOrNull(e.at),
    };
  }
  return null;
}

/* ───────────────────────── context resolution ───────────────────────── */

export interface ContextSources {
  /** AppDownload.referrer, as stored. */
  ref: string | null;
  /** AppDownload.source: organic | campaign | referral | partner. */
  source: string;
  campaignId: string | null;
  installLink?: (InstallLinkInfo & { adminLabel?: string | null; recordedAt?: string | null }) | null;
  reminder?: { firstName: string | null; phone: string | null; history: unknown; createdAt?: string | null } | null;
  lenderNudge?: { firstName: string | null; phone: string | null; lenderName: string | null; history: unknown; createdAt?: string | null } | null;
  lead?: { name: string | null; phone: string | null; productInterest: string | null; amountPaise: number | null; source: string | null; createdAt: string | null } | null;
  referral?: { ownerName: string | null } | null;
  /** The matched user's latest loan application; used only to fill gaps, never to invent a context. */
  loan?: { amountRupees: number | null; loanType: string | null } | null;
}

export interface InstallContext {
  name: string | null;
  phone: string | null;
  amountRupees: number | null;
  product: string | null;
  stageWhenSent: string | null;
  sentVia: SentVia | null;
  sentAt: string | null;
  sentBy: { type: SentByType; label: string };
  origin: ContextOrigin | null;
}

const EMPTY: Omit<InstallContext, 'sentBy' | 'origin'> = {
  name: null, phone: null, amountRupees: null, product: null, stageWhenSent: null, sentVia: null, sentAt: null,
};

function leadSentBy(source: string | null): { type: SentByType; label: string; via: SentVia | null } {
  switch (source) {
    case 'website': return { type: 'website', label: 'Website form', via: 'website' };
    case 'widget': return { type: 'website', label: 'Website chat', via: 'website' };
    case 'call': return { type: 'unknown', label: 'Voice agent call', via: 'call' };
    case 'campaign': return { type: 'campaign', label: 'Campaign', via: null };
    default: return { type: 'unknown', label: 'Link source not recorded', via: null };
  }
}

/**
 * Decide which source explains this install. First match in the documented
 * order wins; later sources are ignored, not merged, so a row never mixes
 * a name from one place with a sender from another.
 *
 * Returns null for an organic install with no ref: there is nothing to show.
 */
export function pickContext(s: ContextSources): InstallContext | null {
  const loan = s.loan ?? null;
  const fill = (c: Omit<InstallContext, 'sentBy' | 'origin'>) => ({
    ...c,
    amountRupees: c.amountRupees ?? positiveRupees(loan?.amountRupees),
    product: c.product ?? productLabel(loan?.loanType),
  });

  if (s.installLink) {
    const l = s.installLink;
    return {
      ...fill({
        name: l.name, phone: l.phone, amountRupees: l.amountRupees, product: l.product, stageWhenSent: l.stage,
        sentVia: l.channel, sentAt: l.sentAt ?? l.recordedAt ?? null,
      }),
      sentBy: { type: 'admin', label: l.adminLabel ?? l.sentByEmail ?? 'An admin' },
      origin: 'install_link',
    };
  }

  if (s.reminder) {
    const r = s.reminder;
    const h = historyToSend(r.history);
    return {
      ...fill({ ...EMPTY, name: r.firstName, phone: r.phone, sentVia: h?.channel ?? null, sentAt: h?.at ?? null }),
      sentBy: { type: 'reminder', label: 'Automatic install reminder' },
      origin: 'journey_reminder',
    };
  }

  if (s.lenderNudge) {
    const n = s.lenderNudge;
    const h = historyToSend(n.history);
    return {
      ...fill({ ...EMPTY, name: n.firstName, phone: n.phone, sentVia: h?.channel ?? null, sentAt: h?.at ?? null }),
      sentBy: { type: 'lender_reminder', label: n.lenderName ? `Lender reminder (${n.lenderName})` : 'Lender application reminder' },
      origin: 'lender_nudge',
    };
  }

  if (s.lead) {
    const l = s.lead;
    const by = leadSentBy(l.source);
    return {
      ...fill({
        ...EMPTY, name: l.name, phone: l.phone, product: productLabel(l.productInterest), amountRupees: paiseToRupees(l.amountPaise),
        stageWhenSent: 'lead_captured', sentVia: by.via, sentAt: l.createdAt,
      }),
      sentBy: { type: by.type, label: by.label },
      origin: 'lead',
    };
  }

  if (s.referral) {
    return {
      ...EMPTY,
      sentBy: { type: 'referral', label: s.referral.ownerName ? `Friend referral from ${s.referral.ownerName}` : 'Friend referral' },
      origin: 'referral',
    };
  }

  if (s.campaignId || s.source === 'campaign' || s.ref) {
    return {
      ...EMPTY,
      sentBy: { type: 'campaign', label: s.campaignId ? `Campaign ${s.campaignId}` : 'Campaign link' },
      origin: 'campaign',
    };
  }
  return null;
}

/** True when the context names a specific person, rather than only a campaign or referral. */
export function hasCustomerDetails(c: InstallContext | null): boolean {
  return !!c && !!c.origin && PERSONAL_ORIGINS.includes(c.origin);
}

/** The sender type used for the "Sent by" filter and chart: organic when nothing is known. */
export function effectiveSentBy(c: InstallContext | null): SentByType {
  return c ? c.sentBy.type : 'organic';
}

/* ───────────────────────── rows, stats and filters ───────────────────────── */

export interface InstallRowCustomer { id: string; userId: string | null; name: string | null; phone: string | null; stage: string; stageLabel: string }

export interface InstallRow {
  id: string;
  installedAt: string;
  platform: string;
  source: string;
  campaignId: string | null;
  matchMethod: string | null;
  confidence: Confidence;
  customer: InstallRowCustomer | null;
  context: InstallContext | null;
  signedIn: boolean;
}

export interface InstallFilters {
  search?: string | null;
  stage?: string | null;
  sentBy?: string | null;
  channel?: string | null;
  platform?: string | null;
  followUp?: boolean;
}

/** Stages in journey order, up to the end of the funnel; used to say whether an install moved on. */
const STAGE_ORDER = [
  'lead_captured', 'contacted', 'app_installed', 'registered', 'eligibility_checked', 'offers_viewed',
  'offer_selected', 'kyc_started', 'kyc_completed', 'application_submitted', 'approved', 'disbursed',
];

/** True when the customer is past "App installed". Rejected counts: they got as far as applying. */
export function reachedNextStep(stage: string | null | undefined): boolean {
  if (!stage) return false;
  if (stage === 'rejected') return true;
  const i = STAGE_ORDER.indexOf(stage);
  return i > STAGE_ORDER.indexOf('app_installed');
}

/** Installed, but the customer is still where the install put them (or earlier): worth a nudge. */
export function needsFollowUp(row: Pick<InstallRow, 'customer'>): boolean {
  const st = row.customer?.stage;
  return st === 'app_installed' || st === 'lead_captured';
}

const digitsOf = (s: string) => s.replace(/\D/g, '');
/** A typed mobile search without a leading Indian country code (stored numbers have none). */
const searchDigits = (s: string) => {
  const d = digitsOf(s);
  return d.length > 10 && d.startsWith('91') ? d.slice(2) : d;
};

/**
 * Filter rows in memory. AppDownload has no foreign keys, so name, stage and
 * sender cannot be SQL filters; install volumes are small enough for this.
 * Search matches a name (customer or the name sent with the link) or a mobile
 * number (digits only, so "98765 43210" and "+91 98765 43210" both work).
 */
export function applyInstallFilters(rows: InstallRow[], f: InstallFilters): InstallRow[] {
  const q = (f.search ?? '').trim().toLowerCase();
  const qDigits = searchDigits(q);
  return rows.filter((r) => {
    if (f.platform && r.platform !== f.platform) return false;
    if (f.stage && r.customer?.stage !== f.stage) return false;
    if (f.sentBy && effectiveSentBy(r.context) !== f.sentBy) return false;
    if (f.channel && r.context?.sentVia !== f.channel) return false;
    if (f.followUp && !needsFollowUp(r)) return false;
    if (q) {
      const names = [r.customer?.name, r.context?.name].filter(Boolean).map((n) => String(n).toLowerCase());
      const phones = [r.customer?.phone, r.context?.phone].filter(Boolean).map((p) => digitsOf(String(p)));
      const nameHit = names.some((n) => n.includes(q));
      const phoneHit = qDigits.length >= 2 && phones.some((p) => p.includes(qDigits));
      if (!nameHit && !phoneHit) return false;
    }
    return true;
  });
}

export interface InstallStats { total: number; withContext: number; withoutContext: number; reachedNextStep: number; notSignedIn: number }

export function computeInstallStats(rows: InstallRow[]): InstallStats {
  let withContext = 0;
  let reached = 0;
  let notSignedIn = 0;
  for (const r of rows) {
    if (hasCustomerDetails(r.context)) withContext++;
    if (reachedNextStep(r.customer?.stage)) reached++;
    if (!r.signedIn) notSignedIn++;
  }
  return { total: rows.length, withContext, withoutContext: rows.length - withContext, reachedNextStep: reached, notSignedIn };
}

/** Counts per key, biggest first, ties broken alphabetically so the order is stable. */
export function countBy<T>(rows: T[], key: (r: T) => string): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
