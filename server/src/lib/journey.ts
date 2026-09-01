/**
 * WS5 — the customer-journey spine.
 *
 * Every channel (website, voice, app, campaign, admin) resolves a person to one
 * `Customer` row through here, and records what happened through
 * `recordJourneyEvent`. Nothing else should create a Customer or write a
 * JourneyEvent directly — going through this module is what keeps the stage
 * machine, the telemetry mirror and the PII redaction consistent.
 */
import { JourneyStage, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/* ─────────────────────────── stage machine ─────────────────────────── */

/**
 * Forward order of the funnel. `advanceStage` only ever moves a customer
 * rightwards along this list, so a late/out-of-order event (a webhook arriving
 * after the user already progressed, say) cannot pull them backwards.
 */
export const STAGE_ORDER: JourneyStage[] = [
  'lead_captured',
  'contacted',
  'app_installed',
  'registered',
  'eligibility_checked',
  'offers_viewed',
  'offer_selected',
  'kyc_started',
  'kyc_completed',
  'application_submitted',
  'approved',
  'disbursed',
];

/** Stages that end the journey; never advanced away from automatically. */
export const TERMINAL_STAGES: JourneyStage[] = ['rejected', 'disbursed', 'lost'];

/**
 * Stages that depend on HOW the customer arrived and must never be inferred
 * from a later stage.
 *
 * The funnel is not a strict chain: someone who installs the app directly never
 * submits a website lead and never takes an outreach call, so inferring those
 * from "registered" would show a website enquiry and a phone call that never
 * happened. Everything else on the main path is a genuine prerequisite — you
 * cannot verify an OTP without having installed the app — and is safe to infer.
 */
export const CHANNEL_ENTRY_STAGES: JourneyStage[] = ['lead_captured', 'contacted'];

export function stageRank(stage: JourneyStage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? -1 : i;
}

/**
 * True when `next` is strictly further along than `current`. `rejected` and
 * `lost` are off the main line: they may always be entered (a customer can be
 * rejected at any point) but never left by an automatic advance.
 */
export function isForwardStage(current: JourneyStage, next: JourneyStage): boolean {
  if (current === next) return false;
  if (TERMINAL_STAGES.includes(current)) return false;
  if (next === 'rejected' || next === 'lost') return true;
  return stageRank(next) > stageRank(current);
}

/* ─────────────────────── canonical event names ─────────────────────── */

/**
 * The complete event vocabulary. Free-text event names are what made the
 * existing ActivityEvent stream un-queryable, so every producer must use a
 * constant from here.
 */
export const JOURNEY_EVENTS = {
  // website
  WEBSITE_VISIT: 'website_visit',
  WEBSITE_FORM_STARTED: 'website_form_started',
  LEAD_CAPTURED: 'lead_captured',
  // voice / outbound
  CALL_QUEUED: 'call_queued',
  CALL_STARTED: 'call_started',
  CALL_COMPLETED: 'call_completed',
  CALL_FAILED: 'call_failed',
  // app lifecycle
  APP_INSTALLED: 'app_installed',
  APP_OPENED: 'app_opened',
  LANGUAGE_SELECTED: 'language_selected',
  OTP_REQUESTED: 'otp_requested',
  OTP_VERIFIED: 'otp_verified',
  // website — phone verification & callback consent (not app login: no stage
  // mapping, since verifying a phone on the marketing site is not "registered")
  PHONE_VERIFIED: 'phone_verified',
  CALLBACK_REQUESTED: 'callback_requested',
  CALLBACK_DECLINED: 'callback_declined',
  // funnel
  ELIGIBILITY_STARTED: 'eligibility_started',
  ELIGIBILITY_COMPLETED: 'eligibility_completed',
  OFFER_VIEWED: 'offer_viewed',
  OFFER_SELECTED: 'offer_selected',
  KYC_STARTED: 'kyc_started',
  KYC_COMPLETED: 'kyc_completed',
  APPLICATION_SUBMITTED: 'application_submitted',
  LOAN_APPROVED: 'loan_approved',
  LOAN_REJECTED: 'loan_rejected',
  LOAN_DISBURSED: 'loan_disbursed',
  // system
  STAGE_STALLED: 'stage_stalled',
  NUDGE_SENT: 'nudge_sent',
} as const;

export type JourneyEventName = (typeof JOURNEY_EVENTS)[keyof typeof JOURNEY_EVENTS];

/** Which stage (if any) an event moves the customer into. */
const EVENT_STAGE: Partial<Record<string, JourneyStage>> = {
  [JOURNEY_EVENTS.LEAD_CAPTURED]: 'lead_captured',
  [JOURNEY_EVENTS.CALL_COMPLETED]: 'contacted',
  [JOURNEY_EVENTS.APP_INSTALLED]: 'app_installed',
  [JOURNEY_EVENTS.OTP_VERIFIED]: 'registered',
  [JOURNEY_EVENTS.ELIGIBILITY_COMPLETED]: 'eligibility_checked',
  [JOURNEY_EVENTS.OFFER_VIEWED]: 'offers_viewed',
  [JOURNEY_EVENTS.OFFER_SELECTED]: 'offer_selected',
  [JOURNEY_EVENTS.KYC_STARTED]: 'kyc_started',
  [JOURNEY_EVENTS.KYC_COMPLETED]: 'kyc_completed',
  [JOURNEY_EVENTS.APPLICATION_SUBMITTED]: 'application_submitted',
  [JOURNEY_EVENTS.LOAN_APPROVED]: 'approved',
  [JOURNEY_EVENTS.LOAN_REJECTED]: 'rejected',
  [JOURNEY_EVENTS.LOAN_DISBURSED]: 'disbursed',
};

export function stageForEvent(name: string): JourneyStage | null {
  return EVENT_STAGE[name] ?? null;
}

/** Human labels for the dashboard timeline. */
export const STAGE_LABELS: Record<JourneyStage, string> = {
  lead_captured: 'Lead submitted',
  contacted: 'Contacted by agent',
  app_installed: 'App installed',
  registered: 'OTP verified',
  eligibility_checked: 'Eligibility checked',
  offers_viewed: 'Offers viewed',
  offer_selected: 'Offer selected',
  kyc_started: 'KYC started',
  kyc_completed: 'KYC completed',
  application_submitted: 'Application submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  disbursed: 'Disbursed',
  lost: 'Lost',
};

/* ─────────────────────────── PII redaction ─────────────────────────── */

const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
const AADHAAR_RE = /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
/** Keys we never persist in event metadata, whatever their value looks like. */
const BLOCKED_KEYS = new Set([
  'pan', 'pannumber', 'pan_number',
  'aadhaar', 'aadhaarnumber', 'aadhaar_number', 'aadhar',
  'otp', 'code', 'password', 'passwordhash', 'token',
  'accesstoken', 'refreshtoken', 'cvv', 'pin',
]);

function redactString(s: string): string {
  return s.replace(PAN_RE, '[PAN_REDACTED]').replace(AADHAAR_RE, '[AADHAAR_REDACTED]');
}

/**
 * Strip identity numbers and secrets out of anything headed for
 * JourneyEvent.metadata. The core schema is careful to keep only
 * `aadhaarLast4`; event metadata is the easiest place to undo that by accident,
 * so every write goes through here.
 */
export function redactMetadata(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null) return value ?? null;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactMetadata(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (BLOCKED_KEYS.has(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = redactMetadata(v, depth + 1);
    }
    return out;
  }
  return null;
}

/* ───────────────────────── customer resolution ───────────────────────── */

export interface ResolveCustomerInput {
  phone?: string | null;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  city?: string | null;
  source?: string;
  campaignId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
}

function cleanPhone(phone?: string | null): string | null {
  if (!phone) return null;
  // Both producers already emit bare 10-digit numbers; tolerate +91/spaces
  // defensively so a spreadsheet upload cannot fork a customer's identity.
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits || null;
}

/**
 * Find-or-create the one Customer row for this person, and link a userId onto
 * it the first time we learn one. This is the join that makes pre-login website
 * activity and post-login app activity land on a single record.
 */
export async function resolveCustomer(input: ResolveCustomerInput) {
  let phone = cleanPhone(input.phone);
  const { userId } = input;

  // A userId always belongs to an authenticated app User, who by definition has
  // a verified phone — yet most of the post-login funnel (applications.routes.ts,
  // kyc.routes.ts, the Aurix webhook) calls trackJourney with only { userId },
  // never the phone. Without this, a userId lookup that misses (a stale link,
  // a User row recreated after a dev reset) has nothing to fall back to and
  // silently creates a second, permanently phone-less Customer for someone
  // whose phone was one query away. Look it up whenever it's missing, before
  // any matching or creation happens below.
  if (!phone && userId) {
    const linkedUser = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } }).catch(() => null);
    if (linkedUser?.phone) phone = cleanPhone(linkedUser.phone);
  }

  if (!phone && !userId) return null;

  // Phone is the strong identity everywhere else in this codebase (see
  // customers.routes.ts's 360 view) — a Customer.userId can go stale (the
  // User it pointed at was replaced or deleted) while its phone never
  // changes. Matching userId first let a stale link silently attribute real
  // activity to a different, phone-less "ghost" Customer row that happened
  // to hold the same (now-wrong) userId. Phone first avoids that class of
  // mis-attribution; userId is only the fallback for phone-less identity
  // (e.g. a website visitor who hasn't given a number yet).
  let customer =
    (phone ? await prisma.customer.findUnique({ where: { phone } }) : null) ??
    (userId ? await prisma.customer.findUnique({ where: { userId } }) : null);

  // Customer.phone is required at the schema level — every identity in the
  // system, app or website, must resolve to a real number. Every current
  // caller already supplies one (directly, or backfilled from User above),
  // so this is a hard guarantee for future call sites, not a live path today.
  if (!customer && !phone) return null;

  if (!customer) {
    try {
      customer = await prisma.customer.create({
        data: {
          phone: phone as string,
          userId: userId ?? null,
          name: input.name ?? null,
          email: input.email ?? null,
          city: input.city ?? null,
          firstSource: input.source ?? 'website',
          campaignId: input.campaignId ?? null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          referrer: input.referrer ?? null,
        },
      });
      return customer;
    } catch (e) {
      // Unique race on phone/userId: another request created it first.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      customer =
        (phone ? await prisma.customer.findUnique({ where: { phone } }) : null) ??
        (userId ? await prisma.customer.findUnique({ where: { userId } }) : null);
      if (!customer) throw e;
    }
  }

  // Backfill anything we have learned since, but never overwrite firstSource
  // (that is the "where did they originally come from" answer) and never
  // reassign an existing userId.
  const patch: Prisma.CustomerUpdateInput = {};
  if (userId && !customer.userId) patch.userId = userId;
  if (phone && !customer.phone) patch.phone = phone;
  if (input.name && !customer.name) patch.name = input.name;
  if (input.email && !customer.email) patch.email = input.email;
  if (input.city && !customer.city) patch.city = input.city;
  if (input.campaignId && !customer.campaignId) patch.campaignId = input.campaignId;
  if (input.utmSource && !customer.utmSource) patch.utmSource = input.utmSource;
  if (input.utmMedium && !customer.utmMedium) patch.utmMedium = input.utmMedium;
  if (input.utmCampaign && !customer.utmCampaign) patch.utmCampaign = input.utmCampaign;
  if (input.referrer && !customer.referrer) patch.referrer = input.referrer;

  // Never backfill `phone` onto this record if another customer already owns it
  // — `phone` is unique, and a prior website lead may hold the same number.
  // Overwriting it here would throw P2002 and abort the whole journey promotion.
  if (patch.phone && phone) {
    const clash = await prisma.customer.findUnique({ where: { phone } });
    if (clash && clash.id !== customer.id) delete (patch as { phone?: string }).phone;
  }

  if (Object.keys(patch).length) {
    try {
      customer = await prisma.customer.update({ where: { id: customer.id }, data: patch });
    } catch (e) {
      // Backstop for a unique field (phone/userId) held by another record or a
      // race: skip the backfill rather than failing journey promotion outright.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return customer;
      throw e;
    }
  }
  return customer;
}

/* ─────────────────────────── event recording ─────────────────────────── */

export interface RecordEventInput {
  channel: 'website' | 'voice' | 'app' | 'campaign' | 'admin' | 'system';
  name: string;
  screen?: string | null;
  metadata?: unknown;
  /** Explicit stage override; otherwise derived from the event name. */
  stage?: JourneyStage | null;
  occurredAt?: Date;
  /** Also mirror into ActivityEvent so existing dashboards keep working. */
  mirrorTelemetry?: boolean;
}

/**
 * Append to the customer's timeline and advance their stage if the event
 * implies a later one. Also mirrors into ActivityEvent so the existing
 * analytics pages (live feed, charts) keep working from one write path.
 */
export async function recordJourneyEvent(
  customerId: string,
  input: RecordEventInput,
) {
  const stage = input.stage ?? stageForEvent(input.name);
  const occurredAt = input.occurredAt ?? new Date();
  const metadata = input.metadata == null ? undefined : (redactMetadata(input.metadata) as Prisma.InputJsonValue);

  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const advance = stage && isForwardStage(customer.currentStage, stage);

  const [event] = await prisma.$transaction([
    prisma.journeyEvent.create({
      data: {
        customerId,
        channel: input.channel,
        name: input.name,
        stage: stage ?? null,
        screen: input.screen ?? null,
        metadata,
        occurredAt,
      },
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: {
        lastActivityAt: occurredAt,
        ...(advance ? { currentStage: stage, stageEnteredAt: occurredAt } : {}),
        // A fresh forward step clears the nudge cooldown: they are moving again.
        ...(advance ? { lastNudgedAt: null } : {}),
      },
    }),
  ]);

  if (input.mirrorTelemetry !== false && customer.userId) {
    // Best-effort mirror; telemetry must never fail a journey write.
    await prisma.activityEvent
      .create({
        data: {
          userId: customer.userId,
          eventType: 'funnel',
          eventName: input.name,
          screen: input.screen ?? null,
          metadata,
          ts: occurredAt,
        },
      })
      .catch(() => undefined);
  }

  return event;
}

/**
 * Which pre-login ActivityEvent names are worth promoting onto the journey
 * timeline, and what to call them there. Everything else the app emits
 * (`screen_view`, `viewed_*`) is per-screen telemetry — useful for analytics,
 * far too noisy for a human-readable journey.
 */
const CLAIMABLE_APP_EVENTS: Record<string, string> = {
  app_opened: JOURNEY_EVENTS.APP_OPENED,
  language_selected: JOURNEY_EVENTS.LANGUAGE_SELECTED,
  otp_requested: JOURNEY_EVENTS.OTP_REQUESTED,
};

/**
 * Attribute an anonymous app session to a customer, once we finally know who
 * they are (at OTP verify).
 *
 * Before this, everything a user did between opening the app and entering their
 * OTP was recorded with a sessionId and a null userId, and nothing ever joined
 * the two — so the 360 timeline began abruptly at "OTP verified" and the
 * install / language steps the brief asks for were invisible. This walks that
 * session's telemetry and promotes the meaningful steps onto the journey, in
 * their original order and with their original timestamps.
 *
 * Idempotent: re-verifying an OTP will not duplicate entries, because each
 * candidate is checked against what the customer already has.
 */
export async function claimAnonymousSession(
  customerId: string,
  sessionId: string,
  userId: string,
): Promise<number> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) return 0;

  // Bind the session itself, so existing session-based analytics can also see
  // who it belonged to.
  if (!session.userId) {
    await prisma.session.update({ where: { id: sessionId }, data: { userId } }).catch(() => undefined);
  }

  const events = await prisma.activityEvent.findMany({
    where: { sessionId, eventName: { in: Object.keys(CLAIMABLE_APP_EVENTS) } },
    orderBy: { ts: 'asc' },
  });

  // An install is recorded in AppDownload, not ActivityEvent, so it needs its
  // own claim. Take the most recent unclaimed row — on a real device the
  // install that produced this session is the only candidate.
  const download = await prisma.appDownload.findFirst({
    where: { matchedUserId: null },
    orderBy: { installedAt: 'desc' },
  });

  const existing = await prisma.journeyEvent.findMany({
    where: { customerId, channel: 'app' },
    select: { name: true },
  });
  const already = new Set(existing.map((e) => e.name));

  let claimed = 0;

  if (download && !already.has(JOURNEY_EVENTS.APP_INSTALLED)) {
    await prisma.appDownload
      .update({ where: { id: download.id }, data: { matchedUserId: userId } })
      .catch(() => undefined);
    await recordJourneyEvent(customerId, {
      channel: 'app',
      name: JOURNEY_EVENTS.APP_INSTALLED,
      metadata: { platform: download.platform, source: download.source, downloadId: download.id },
      occurredAt: download.installedAt,
      mirrorTelemetry: false, // the AppDownload row already is the telemetry
    });
    claimed++;
    already.add(JOURNEY_EVENTS.APP_INSTALLED);
  }

  for (const e of events) {
    const name = CLAIMABLE_APP_EVENTS[e.eventName];
    if (!name || already.has(name)) continue;
    await recordJourneyEvent(customerId, {
      channel: 'app',
      name,
      screen: e.screen,
      metadata: e.metadata ?? undefined,
      occurredAt: e.ts,
      mirrorTelemetry: false, // it is already an ActivityEvent — don't double-count
    });
    already.add(name);
    claimed++;
  }

  return claimed;
}

/**
 * Convenience for the common "resolve then record" pair used by every producer.
 * Returns null when there is not enough identity to resolve a customer.
 */
export async function trackJourney(
  who: ResolveCustomerInput,
  event: RecordEventInput,
) {
  const customer = await resolveCustomer(who);
  if (!customer) return null;
  await recordJourneyEvent(customer.id, event);
  return customer;
}
