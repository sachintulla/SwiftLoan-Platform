/**
 * Seed the WS5 customer-journey spine (`Customer` + `JourneyEvent`).
 *
 * WHY THIS EXISTS
 * ---------------
 * `seed.ws4.ts` writes User / LoanApplication / AnonymousLead rows straight into the
 * database, bypassing `lib/journey.ts`. But the journey spine is only ever populated by
 * that module, at runtime, as real events arrive. On a seeded database the result was
 * that every 360 surface in the dashboard was empty:
 *
 *   /customers            → "No customers yet"   (and it is the primary nav entry —
 *                            /leads and /onboarding both redirect into it)
 *   /leads/[id]           → "This lead has never been resolved to a customer…"
 *   /loans/[id]           → "No tracked events for this applicant"
 *
 * So three nav destinations and both detail pages looked broken on a database that
 * actually had 50 users and 30 leads in it.
 *
 * This script derives a plausible journey for each seeded person and replays it
 * through the sanctioned API — `resolveCustomer` + `recordJourneyEvent` — rather than
 * inserting rows directly, so the stage machine, the telemetry mirror and the PII
 * redaction all behave exactly as they do in production.
 *
 * Run after seed.ws4:  npm run seed:ws4 && npm run seed:journey
 */
import { JourneyStage } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { JOURNEY_EVENTS, resolveCustomer, recordJourneyEvent } from '../src/lib/journey.js';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed:journey] refusing to run with NODE_ENV=production');
  process.exit(1);
}

type EventName = string;

/**
 * The app-side journey in order. Each entry is the event to emit and the screen it
 * happened on; the stage each one implies is decided by `journey.ts`, not here.
 *
 * `lead_captured` and `contacted` are deliberately absent: they are
 * CHANNEL_ENTRY_STAGES, true only for someone who actually came in through the
 * website form or an outbound call. Inferring them from "registered" would invent a
 * web enquiry and a phone call that never happened.
 */
const APP_CHAIN: { name: EventName; screen?: string }[] = [
  { name: JOURNEY_EVENTS.APP_INSTALLED },
  { name: JOURNEY_EVENTS.APP_OPENED, screen: 'splash' },
  { name: JOURNEY_EVENTS.LANGUAGE_SELECTED, screen: 'language' },
  { name: JOURNEY_EVENTS.OTP_REQUESTED, screen: 'mobile' },
  { name: JOURNEY_EVENTS.OTP_VERIFIED, screen: 'otp' },
  { name: JOURNEY_EVENTS.ELIGIBILITY_STARTED, screen: 'basic' },
  { name: JOURNEY_EVENTS.ELIGIBILITY_COMPLETED, screen: 'basicpan' },
  { name: JOURNEY_EVENTS.OFFER_VIEWED, screen: 'offers' },
  { name: JOURNEY_EVENTS.OFFER_SELECTED, screen: 'offers' },
  { name: JOURNEY_EVENTS.KYC_STARTED, screen: 'kyc' },
  { name: JOURNEY_EVENTS.KYC_COMPLETED, screen: 'kyc' },
  { name: JOURNEY_EVENTS.APPLICATION_SUBMITTED, screen: 'handoff' },
  { name: JOURNEY_EVENTS.LOAN_APPROVED },
  { name: JOURNEY_EVENTS.LOAN_DISBURSED },
];

/**
 * How far along the app chain a person got, given the furthest state their
 * applications reached. Index is exclusive-end into APP_CHAIN.
 */
const STOP_AFTER: Record<string, number> = {
  // No application at all — they registered and stopped.
  none: 5,
  draft: 6,
  pan_pending: 7,
  prequalifying: 7,
  offers_ready: 8,
  handoff: 9,
  under_review: 12,
  approved: 13,
  disbursed: 14,
  closed: 14,
  rejected: 12, // submitted, then rejected (emitted separately below)
};

/** Application statuses ordered by how far through the funnel they are. */
const STATUS_RANK = [
  'draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff',
  'under_review', 'rejected', 'approved', 'disbursed', 'closed',
];

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rand(a.length)];

/**
 * Walks a cursor forward through time, guaranteeing the whole chain fits before "now".
 *
 * Two bugs this shape avoids:
 *  - Stepping forward blindly from the application's creation date pushed the tail of
 *    a long chain into tomorrow, so the dashboard showed customers whose last
 *    activity was in the future.
 *  - Merely clamping each step at `now` collapsed every event onto the same instant
 *    whenever the anchor was already recent (seed.ws4 creates applications a few
 *    minutes old), producing a "timeline" of five events sharing one timestamp.
 *
 * So the start is pulled back far enough to fit `reserveMins` of journey before the
 * present, and each step is still clamped as a backstop.
 */
function timeCursor(startMs: number, reserveMins: number) {
  const NOW = Date.now();
  const latestStart = NOW - reserveMins * 60_000;
  let t = Math.min(startMs, latestStart);
  return {
    now: () => new Date(t),
    step(mins: number) {
      t = Math.min(t + mins * 60_000, NOW);
      return new Date(t);
    },
  };
}

async function main() {
  console.log('[seed:journey] clearing Customer + JourneyEvent…');
  // JourneyEvent and CallAttempt cascade from Customer; Conversation.customerId is
  // SetNull, so conversations survive with their link cleared.
  await prisma.customer.deleteMany({});

  /* ── 0. Make "converted" mean something ─────────────────────────────────────
   * seed.ws4 invents lead phone numbers and user phone numbers independently, so no
   * lead ever shared a number with a user and `resolveCustomer` never merged anything.
   * A lead marked `converted` is, by definition, someone who went on to become a
   * user — so give those leads the phone number of a real user. That is what makes
   * the website→app join in the 360 view demonstrable instead of theoretical. */
  const convertible = await prisma.anonymousLead.findMany({ where: { status: 'converted' } });
  const candidateUsers = await prisma.user.findMany({
    where: { phone: { not: undefined } },
    select: { id: true, phone: true, fullName: true, city: true },
    take: 50,
  });
  let paired = 0;
  for (let i = 0; i < convertible.length && i < candidateUsers.length; i++) {
    const u = candidateUsers[i];
    if (!u.phone) continue;
    // Another lead may already hold this number; phone is unique on Customer, not on
    // AnonymousLead, so a collision here is harmless but pointless.
    await prisma.anonymousLead.update({
      where: { id: convertible[i].id },
      data: { phone: u.phone, name: convertible[i].name ?? u.fullName, city: convertible[i].city ?? u.city },
    });
    paired++;
  }
  if (paired) console.log(`[seed:journey] paired ${paired} converted lead(s) with real users`);

  /* ── 1. Website / campaign leads ────────────────────────────────────────────
   * These people entered through the marketing site, so their timeline legitimately
   * starts with a visit and a form, and `contacted` is only set for the ones an
   * agent actually reached. */
  const leads = await prisma.anonymousLead.findMany({ orderBy: { createdAt: 'asc' } });
  let leadCustomers = 0;

  for (const lead of leads) {
    // AnonymousLead has no email column — phone is the only identity it carries, and
    // `resolveCustomer` needs a phone or a userId to key on.
    if (!lead.phone) continue;

    const customer = await resolveCustomer({
      phone: lead.phone,
      name: lead.name,
      city: lead.city,
      source: lead.source === 'app' ? 'app' : lead.source === 'campaign' ? 'campaign' : 'website',
      campaignId: lead.campaignId,
      utmSource: lead.source,
    });
    if (!customer) continue;
    leadCustomers++;

    // Walk forward from when the lead was captured. The longest path below (converted)
    // spends at most ~950 minutes, so reserve a day of room.
    const clock = timeCursor(lead.createdAt.getTime(), 1440);
    const step = clock.step;

    // Match the entry events to where the enquiry actually came from. An
    // `AnonymousLead` with `source: 'app'` is an in-app enquiry, so giving it a
    // `website_visit` on the landing page described a website session that never
    // happened — the 360 timeline then contradicted the "app" origin badge beside it.
    const viaApp = lead.source === 'app';
    if (viaApp) {
      await recordJourneyEvent(customer.id, {
        channel: 'app', name: JOURNEY_EVENTS.APP_OPENED, screen: 'home',
        occurredAt: clock.now(),
        metadata: { source: lead.source },
      });
    } else {
      await recordJourneyEvent(customer.id, {
        channel: 'website', name: JOURNEY_EVENTS.WEBSITE_VISIT, screen: 'landing',
        occurredAt: clock.now(),
        metadata: { source: lead.source, campaignId: lead.campaignId ?? undefined },
      });
      await recordJourneyEvent(customer.id, {
        channel: 'website', name: JOURNEY_EVENTS.WEBSITE_FORM_STARTED, screen: 'apply',
        occurredAt: step(1 + rand(4)),
      });
    }
    const capturedAt = step(1 + rand(6));
    await recordJourneyEvent(customer.id, {
      channel: viaApp ? 'app' : 'website', name: JOURNEY_EVENTS.LEAD_CAPTURED, screen: 'apply',
      occurredAt: capturedAt,
      metadata: { productInterest: lead.productInterest ?? undefined, amount: lead.amount ?? undefined },
    });
    // `lead_captured` is the Customer default stage, so recording the event is not a
    // forward move and `recordJourneyEvent` leaves `stageEnteredAt` at row-creation
    // time. Left alone, every un-worked lead reported "in this stage for 1 minute"
    // (i.e. since the seed ran) instead of since they actually enquired.
    await prisma.customer.update({
      where: { id: customer.id },
      data: { stageEnteredAt: capturedAt, lastActivityAt: capturedAt },
    });

    // 'new' leads have not been worked yet — stop here.
    if (lead.status === 'new') continue;

    // Everyone past 'new' was dialled. Only a connected call sets `contacted`.
    await recordJourneyEvent(customer.id, {
      channel: 'voice', name: JOURNEY_EVENTS.CALL_QUEUED,
      occurredAt: step(20 + rand(200)),
    });

    if (lead.status === 'lost') {
      // Dialled repeatedly, never reached.
      await recordJourneyEvent(customer.id, {
        channel: 'voice', name: JOURNEY_EVENTS.CALL_FAILED,
        occurredAt: step(2 + rand(10)),
        metadata: { reason: pick(['no_answer', 'busy', 'switched_off']) },
      });
      continue;
    }

    await recordJourneyEvent(customer.id, {
      channel: 'voice', name: JOURNEY_EVENTS.CALL_STARTED,
      occurredAt: step(2 + rand(10)),
    });
    await recordJourneyEvent(customer.id, {
      channel: 'voice', name: JOURNEY_EVENTS.CALL_COMPLETED,
      occurredAt: step(3 + rand(6)),
      metadata: { durationSec: 60 + rand(240), outcome: 'interested' },
    });

    if (lead.status === 'contacted') continue;

    // 'qualified' — reached, interested, verified their number, asked for a callback.
    const verifiedAt = step(10 + rand(120));
    await recordJourneyEvent(customer.id, {
      channel: 'website', name: JOURNEY_EVENTS.PHONE_VERIFIED,
      occurredAt: verifiedAt,
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: { phoneVerified: true, phoneVerifiedAt: verifiedAt },
    });

    if (lead.status === 'qualified') continue;

    // 'converted' — went on to install the app. The app-side chain below picks them
    // up if their phone matches a seeded user; otherwise record the install here so
    // the conversion is still visible.
    await recordJourneyEvent(customer.id, {
      channel: 'app', name: JOURNEY_EVENTS.APP_INSTALLED,
      occurredAt: step(60 + rand(600)),
    });
  }

  /* ── 2. App users ───────────────────────────────────────────────────────────
   * `resolveCustomer` merges by phone, so a converted lead who also exists as a User
   * lands on the SAME customer row — which is exactly the web→app join the 360 view
   * is meant to show. */
  const users = await prisma.user.findMany({
    include: { applications: { select: { status: true, amount: true, createdAt: true, ref: true } } },
    orderBy: { createdAt: 'asc' },
  });

  let appCustomers = 0;
  let events = 0;

  for (const user of users) {
    const customer = await resolveCustomer({
      phone: user.phone,
      email: user.email,
      name: user.fullName,
      city: user.city,
      userId: user.id,
      source: 'app',
    });
    if (!customer) continue;
    appCustomers++;

    // Furthest status this person's applications reached.
    const best = user.applications
      .map((a) => String(a.status))
      .sort((a, b) => STATUS_RANK.indexOf(b) - STATUS_RANK.indexOf(a))[0] ?? 'none';
    const stop = STOP_AFTER[best] ?? 5;

    // Start the app journey just before their first application (or at signup).
    const firstApp = user.applications
      .map((a) => a.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    // Each chain link advances up to 25 minutes, plus headroom for a trailing
    // rejection, so the whole journey lands strictly in the past.
    const clock = timeCursor(
      (firstApp ?? user.createdAt).getTime() - (30 + rand(90)) * 60_000,
      stop * 25 + 600,
    );
    const step = clock.step;

    for (let i = 0; i < stop && i < APP_CHAIN.length; i++) {
      const link = APP_CHAIN[i];
      await recordJourneyEvent(customer.id, {
        channel: 'app',
        name: link.name,
        screen: link.screen ?? null,
        occurredAt: i === 0 ? clock.now() : step(1 + rand(25)),
        metadata: link.name === JOURNEY_EVENTS.OFFER_VIEWED
          ? { offerCount: 2 + rand(4) }
          : undefined,
      });
      events++;
    }

    // Rejection is off the main line, so it is emitted explicitly rather than being
    // the tail of the chain.
    if (best === 'rejected') {
      await recordJourneyEvent(customer.id, {
        channel: 'system', name: JOURNEY_EVENTS.LOAN_REJECTED,
        occurredAt: step(30 + rand(600)),
        metadata: { reason: pick(['bureau_score', 'income_criteria', 'existing_obligations']) },
      });
      events++;
    }
  }

  /* ── 3. Align firstSeenAt with the timeline ─────────────────────────────────
   * `Customer.firstSeenAt` defaults to now(), i.e. the moment the seed created the
   * row — so every 360 page claimed the customer was "first seen 18 Aug" above a
   * journey that starts on the 17th, and after the "joined 15 Aug" date on their app
   * account. Pull it back to their earliest recorded event. */
  const earliest = await prisma.journeyEvent.groupBy({
    by: ['customerId'],
    _min: { occurredAt: true },
  });
  let aligned = 0;
  for (const row of earliest) {
    if (!row._min.occurredAt) continue;
    await prisma.customer.update({
      where: { id: row.customerId },
      data: { firstSeenAt: row._min.occurredAt },
    });
    aligned++;
  }
  console.log(`[seed:journey] aligned firstSeenAt for ${aligned} customer(s)`);

  const [customers, journeyEvents, byStage] = await Promise.all([
    prisma.customer.count(),
    prisma.journeyEvent.count(),
    prisma.customer.groupBy({ by: ['currentStage'], _count: { _all: true } }),
  ]);

  console.log(`[seed:journey] customers: ${customers}  (from leads: ${leadCustomers}, from users: ${appCustomers}, merged: ${leadCustomers + appCustomers - customers})`);
  console.log(`[seed:journey] journey events: ${journeyEvents}`);
  console.log('[seed:journey] by stage:');
  byStage
    .sort((a, b) => b._count._all - a._count._all)
    .forEach((g) => console.log(`  ${String(g.currentStage).padEnd(22)} ${g._count._all}`));
  console.log('[seed:journey] done ✓');
}

main()
  .catch((e) => { console.error('[seed:journey] failed', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
