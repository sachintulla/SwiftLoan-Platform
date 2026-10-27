/**
 * Drop-off messages for website AND app: the pure rules (no database, no network; tested in dropoffSteps.test.ts).
 *
 * Where someone stopped is read from data we already keep for every channel, so the website and the app agree by
 * construction and no page or screen needs to report anything new:
 *
 *   User.panOnFile                       → step 1 (PAN) is done
 *   LoanApplication exists               → step 2 (details) is done
 *   LoanApplication.status               → how the offers lookup ended (offers_ready / rejected / failed)
 *   Offer + LenderApplication            → got offers / applied
 *
 * The agreed statuses (docs/APP_DROPOFF_PLAN.md §3):
 *   pan_verified        step 1 done, they are on step 2 ("Basic details")
 *   application_filled  step 2 done, moving on ("Finding offers"); step 3 (skip or continue) is deliberately NOT a status
 *   rejected            the offers lookup found none (with a reason)
 *   offers_not_applied  offers came, none applied to
 *   applied             applied to a lender (the "you applied with <lender>" sequence owns this, see lenderNudge.ts)
 *   failed              a technical failure, NOT a decision: retried by the user, never messaged as "no offers"
 */

export type DropoffStatus =
  | 'pan_verified'
  | 'application_filled'
  | 'rejected'
  | 'offers_not_applied'
  | 'applied'
  | 'failed'
  | 'finished';

/** The four messages we author (docs/APP_DROPOFF_PLAN.md §4). `applied` is the lender sequence's, not ours. */
export type DropoffMessageKind = 'continue' | 'no_offers' | 'apply_offers';

export type DropoffStopReason = 'progressed' | 'applied' | 'finished' | 'do_not_contact' | 'review_phone' | 'not_messageable';

export interface DropoffState {
  status: DropoffStatus | null;
  /** When the person reached this status (the schedule's offsets count from here). */
  since: Date | null;
  /** Why the lookup found no offers (rejected only), for the admin. Never shown to the customer. */
  reason: string | null;
}

export interface DropoffSnapshot {
  panOnFile: boolean;
  /** When the PAN was saved (User.updatedAt is the closest we have; it can only be later than the real moment). */
  panSince: Date | null;
  /** The person's most recent application, if any. */
  application: null | {
    status: string;
    createdAt: Date;
    updatedAt: Date;
    offersFetchedAt: Date | null;
    prequalifyReason: string | null;
    offerCount: number;
    appliedToLender: boolean;
  };
}

/** Statuses that start a message sequence. `applied`/`finished` belong to the lender sequence; `failed` is retried, not messaged. */
export const MESSAGEABLE: readonly DropoffStatus[] = ['pan_verified', 'application_filled', 'rejected', 'offers_not_applied'];

const LATER_THAN_OFFERS = new Set(['handoff', 'under_review', 'approved', 'disbursed', 'closed']);
const BEFORE_OFFERS = new Set(['draft', 'pan_pending', 'prequalifying']);

/**
 * Where is this person now? Pure function of what the database says. Returns `status: null` for someone who has not
 * got as far as step 1 (OTP only): the website install reminder owns that case, and the plan sends nothing for it.
 */
export function deriveDropoff(s: DropoffSnapshot): DropoffState {
  const none: DropoffState = { status: null, since: null, reason: null };
  const a = s.application;

  if (!a) {
    return s.panOnFile && s.panSince ? { status: 'pan_verified', since: s.panSince, reason: null } : none;
  }
  if (a.appliedToLender) return { status: 'applied', since: a.updatedAt, reason: null };
  if (LATER_THAN_OFFERS.has(a.status)) return { status: 'finished', since: a.updatedAt, reason: null };

  const offersAt = a.offersFetchedAt ?? a.updatedAt;
  if (a.status === 'rejected') return { status: 'rejected', since: offersAt, reason: a.prequalifyReason };
  // The server records "number already registered" with the lender as `failed` + reason `duplicate` (applications.routes.ts: a duplicate
  // number is not a decline, but the person still gets no offers), so it counts as "no offers". Only a technical fault is truly `failed`.
  if (a.status === 'failed' && a.prequalifyReason === 'duplicate') return { status: 'rejected', since: offersAt, reason: 'duplicate' };
  if (a.status === 'failed') return { status: 'failed', since: a.updatedAt, reason: a.prequalifyReason };
  if (a.status === 'offers_ready') {
    // "offers_ready" with no offers should not happen; treat it as nothing rather than telling someone they have offers.
    return a.offerCount > 0 ? { status: 'offers_not_applied', since: offersAt, reason: null } : none;
  }
  if (BEFORE_OFFERS.has(a.status)) return { status: 'application_filled', since: a.createdAt <= a.updatedAt ? a.updatedAt : a.createdAt, reason: null };
  return none;
}

export function isMessageable(status: DropoffStatus | null): status is DropoffStatus {
  return status !== null && MESSAGEABLE.includes(status);
}

/** Which of our messages goes with a status. */
export function messageKindFor(status: DropoffStatus): DropoffMessageKind | null {
  switch (status) {
    case 'pan_verified':
    case 'application_filled':
      return 'continue';
    case 'rejected':
      return 'no_offers';
    case 'offers_not_applied':
      return 'apply_offers';
    default:
      return null;
  }
}

/** What the message calls the step they stopped at (the sentence reads "you left at <step>"). Admin can override. */
export const DROPOFF_STEP_LABELS: Readonly<Record<DropoffStatus, string>> = Object.freeze({
  pan_verified: 'Basic details',
  application_filled: 'Finding offers',
  rejected: 'Offers',
  offers_not_applied: 'Choosing an offer',
  applied: 'Your application',
  failed: 'Finding offers',
  finished: 'Your application',
});

/**
 * The agreed link rule: the app link goes to someone who is NOT in the app yet, whichever page they dropped from (so a
 * website drop gets it, an app drop does not, and a website visitor who installed and later stops in the app does not).
 * The "no offers, our team will call you" message never carries it: it is about a phone call, not the app.
 */
export function includeAppLink(kind: DropoffMessageKind, inApp: boolean): boolean {
  if (kind === 'no_offers') return false;
  return !inApp;
}

export interface TemplateRef {
  template?: string;
  language?: string;
  placeholders?: string[];
  /** UTILITY | MARKETING | AUTHENTICATION, as Meta approved this template; blank = the card's category. */
  category?: string;
}
export interface SmsRef {
  templateId?: string;
  body?: string;
}
export interface MessageVariants<T> {
  withLink?: T;
  noLink?: T;
}
export interface MessageConfig {
  whatsapp?: MessageVariants<TemplateRef>;
  sms?: MessageVariants<SmsRef>;
}
export type DropoffMessages = Partial<Record<DropoffMessageKind, MessageConfig>>;

/**
 * The approved WhatsApp templates each message uses out of the box (WhatsApp only). Placeholder COUNT AND ORDER must match the
 * template exactly or WhatsApp rejects the send. Tokens: {name}, {step}, {link}, {ref} (application reference), {offerCount}.
 *
 * Category is not a constraint on us: Meta decides it (see docs/JOURNEY_RESUME_TEMPLATES.md §6); these are the approved ones.
 *
 * `no_offers` is deliberately NOT here: its approved text promises that a team member will call, and nothing places that call
 * yet. Until the Ello follow-up call exists, that step is recorded as "not configured" and nothing is sent. Add it under
 * `dropoffMessages` in Admin → Configs → Voxvalley once the call is in place:
 *   no_offers.whatsapp.noLink = { template: 'dropoff_no_offers_callback', placeholders: ['{name}'] }
 */
export const DEFAULT_DROPOFF_MESSAGES: DropoffMessages = Object.freeze({
  continue: {
    whatsapp: {
      withLink: { template: 'install_app_resume_step', language: 'en', placeholders: ['{name}', '{step}', '{link}'] },
      noLink: { template: 'dropoff_continue_app', language: 'en', placeholders: ['{name}', '{step}'] },
    },
  },
  apply_offers: {
    whatsapp: {
      withLink: { template: 'offers_ready', language: 'en', placeholders: ['{name}', '{offerCount}', '{ref}', '{link}'] },
      noLink: { template: 'dropoff_apply_offers_app', language: 'en', placeholders: ['{name}'] },
    },
  },
}) as DropoffMessages;

/**
 * Shipped defaults underneath whatever the dashboard saved, one link-variant at a time: a saved variant wins (a blank template
 * switches that variant off), and a variant the dashboard never saved keeps the shipped default. The settings form saves a
 * snapshot of every field, so without this a template added in a later release would never reach an environment that had
 * already saved the form once.
 */
export function mergeDropoffMessages(defaults: DropoffMessages, saved: unknown): DropoffMessages {
  const out: DropoffMessages = {};
  const s = (saved && typeof saved === 'object' ? saved : {}) as DropoffMessages;
  for (const kind of new Set([...Object.keys(defaults), ...Object.keys(s)]) as Set<DropoffMessageKind>) {
    const entry: MessageConfig = {};
    for (const channel of ['whatsapp', 'sms'] as const) {
      const d = defaults[kind]?.[channel];
      const v = s[kind]?.[channel];
      if (!d && !v) continue;
      (entry as Record<string, unknown>)[channel] = { ...(d ?? {}), ...(v ?? {}) };
    }
    out[kind] = entry;
  }
  return out;
}

/** Fill `{token}`s in a template's placeholder list. Null if any token has no value: a blank in a message is worse than none. */
export function fillTokens(spec: readonly string[] | undefined, vars: Record<string, string | number | null | undefined>): string[] | null {
  const values: string[] = [];
  for (const entry of spec ?? []) {
    let missing = false;
    const v = String(entry).replace(/\{(\w+)\}/g, (_m, key: string) => {
      const x = vars[key];
      if (x === null || x === undefined || String(x).trim() === '') { missing = true; return ''; }
      return String(x);
    });
    if (missing) return null;
    values.push(v);
  }
  return values;
}

export type ResolvedWhatsapp = { ok: true; template: string; language?: string; placeholders: string[]; category?: string } | { ok: false; reason: string };

/** The template and its filled placeholders for one drop-off message, or why it cannot be sent. Pure. */
export function resolveWhatsappMessage(
  messages: DropoffMessages | undefined,
  kind: DropoffMessageKind,
  withLink: boolean,
  vars: Record<string, string | number | null | undefined>,
): ResolvedWhatsapp {
  const ref = pickWhatsapp(messages, kind, withLink);
  if (!ref) return { ok: false, reason: 'whatsapp template not configured' };
  const placeholders = fillTokens(ref.placeholders, vars);
  if (!placeholders) return { ok: false, reason: 'whatsapp placeholder missing' };
  return { ok: true, template: ref.template!, language: ref.language, placeholders, category: ref.category };
}

/** The configured WhatsApp template for a message, in the right link variant; null when not set up yet. */
export function pickWhatsapp(messages: DropoffMessages | undefined, kind: DropoffMessageKind, withLink: boolean): TemplateRef | null {
  const v = messages?.[kind]?.whatsapp;
  const ref = withLink ? v?.withLink : v?.noLink;
  return ref?.template?.trim() ? ref : null;
}

/** The configured SMS (DLT id + registered text) for a message, in the right link variant; null when not set up yet. */
export function pickSms(messages: DropoffMessages | undefined, kind: DropoffMessageKind, withLink: boolean): SmsRef | null {
  const v = messages?.[kind]?.sms;
  const ref = withLink ? v?.withLink : v?.noLink;
  if (!ref?.templateId?.trim() || !ref.body?.trim()) return null;
  // A with-link text that has no {link} slot would send a message with no link: treat as not configured.
  if (withLink && !ref.body.includes('{link}')) return null;
  return ref;
}

/**
 * Why a running sequence should end, or null to carry on. `statusNow` is a fresh read of where the person is.
 * Moving to a different status ends this run (a new one is armed for the new status); applying to a lender hands over to
 * the "you applied" messages.
 */
export function dropoffStopReason(i: {
  armedStatus: DropoffStatus;
  statusNow: DropoffStatus | null;
  doNotContact: boolean;
}): DropoffStopReason | null {
  if (i.doNotContact) return 'do_not_contact';
  if (i.statusNow === 'applied') return 'applied';
  if (i.statusNow === 'finished') return 'finished';
  if (i.statusNow !== i.armedStatus) return 'progressed';
  return null;
}

/* ─────────────────── the "no offers" follow-up call (rules; the dialling is in noOffersCall.ts) ─────────────────── */

/** Why the offers lookup found none, as the agent needs it. Never the lender's own wording. */
export type NoOffersReason = 'already_registered' | 'no_match';

/** The server stores "number already registered with the lender" as reason `duplicate`; anything else is an ordinary no-match. */
export function noOffersReasonCode(prequalifyReason: string | null | undefined): NoOffersReason {
  return prequalifyReason === 'duplicate' ? 'already_registered' : 'no_match';
}

export interface NoOffersCallBrief {
  /** Grammatical after the word "you": the agent says "I noticed you {reason}". */
  reason: string;
  lastStep: string;
  expectedStep: string;
  channel: string;
  help: string;
  noOffersReason: NoOffersReason;
}

/** What the agent is told about this call. The lender's reason is deliberately reduced to a code, so it can never be read out. */
export function noOffersCallBrief(prequalifyReason: string | null | undefined, inApp: boolean): NoOffersCallBrief {
  const noOffersReason = noOffersReasonCode(prequalifyReason);
  const base =
    'Apologise that we could not find loan offers for them yet, and say you are following up on their application. ' +
    'Do not read out or guess any reason from a lender, and do not promise offers or approval. ' +
    'Ask whether they would like help checking their details, or a callback from the team.';
  return {
    reason: 'asked for loan offers but we could not find any for your application yet',
    lastStep: 'checking for loan offers',
    expectedStep: 'receiving loan offers',
    channel: inApp ? 'the app' : 'the website',
    noOffersReason,
    help:
      noOffersReason === 'already_registered'
        ? `${base} Their number may already have an earlier application: do not state that as fact, just ask whether they applied before.`
        : base,
  };
}

export type NoOffersCallSkip =
  | 'not_no_offers' | 'not_active' | 'do_not_contact' | 'already_called' | 'too_early' | 'after_message' | 'outside_hours' | 'not_allowed';

/**
 * Is this person due the "no offers" call right now? Pure. The order is deliberate: things that are permanent come before things
 * that merely mean "not yet", so the reason reported is the one that matters.
 */
export function noOffersCallDue(i: {
  dropStatus: string;
  runStatus: string;
  startAt: Date;
  lastSentAt: Date | null;
  now: Date;
  delayMs: number;
  /** The quiet gap after any message to this person (calls.quietAfterMessageMinutes). */
  quietAfterMessageMs: number;
  inCallingHours: boolean;
  alreadyCalled: boolean;
  doNotContact: boolean;
  /** Master call switch on AND this number passes the call test-number list. */
  callAllowed: boolean;
}): { due: true } | { due: false; reason: NoOffersCallSkip } {
  if (i.dropStatus !== 'rejected') return { due: false, reason: 'not_no_offers' };
  if (i.runStatus !== 'active') return { due: false, reason: 'not_active' }; // they moved on, applied, or the run ended
  if (i.doNotContact) return { due: false, reason: 'do_not_contact' };
  if (i.alreadyCalled) return { due: false, reason: 'already_called' };
  if (i.now.getTime() - i.startAt.getTime() < i.delayMs) return { due: false, reason: 'too_early' };
  if (i.lastSentAt && i.now.getTime() - i.lastSentAt.getTime() < i.quietAfterMessageMs) return { due: false, reason: 'after_message' };
  if (!i.inCallingHours) return { due: false, reason: 'outside_hours' };
  if (!i.callAllowed) return { due: false, reason: 'not_allowed' };
  return { due: true };
}
