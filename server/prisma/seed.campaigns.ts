/**
 * Seed outbound-calling campaigns, their contacts, and the calls placed to them.
 *
 * WHY THIS EXISTS
 * ---------------
 * Nothing seeded the campaign tables, so `/campaigns` showed only
 * "No campaigns yet — create one to start calling" and `/campaigns/[id]` was
 * unreachable. That left the entire outbound-calling half of the platform — contact
 * pipeline, per-state breakdown, call outcomes, agent-captured details — invisible in
 * the dashboard and untested.
 *
 * Contacts are attached to real `Customer` rows where the phone number matches, so a
 * campaign contact links through to the same 360 view the rest of the dashboard uses.
 *
 * Run after seed:journey (it needs Customers to exist):
 *   npm run seed:ws4 && npm run seed:journey && npm run seed:campaigns
 */
import { CallOutcome, CallStatus, ContactState, Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
// The same helpers the live call path uses, so a seeded call's briefing is worded
// exactly like a real one rather than approximated with a local lookup table.
import { STAGE_LABELS } from '../src/lib/journey.js';
import { nextActionFor } from '../src/lib/nextAction.js';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed:campaigns] refusing to run with NODE_ENV=production');
  process.exit(1);
}

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(a: T[]): T => a[rand(a.length)];
const daysAgo = (d: number) => new Date(Date.now() - d * 864e5 - rand(864e5));

/** Outcomes weighted so the chart looks like a real call sheet, not a uniform bar. */
const OUTCOMES: CallOutcome[] = [
  'interested', 'interested', 'interested',
  'not_interested', 'not_interested',
  'callback_requested', 'callback_requested',
  'voicemail', 'unreachable', 'wrong_number', 'installed_app', 'do_not_call',
];

const INCOME_RANGES = ['under_25k', '25k_50k', '50k_1l', 'above_1l'];
const EMPLOYMENT = ['salaried', 'self_employed', 'business'];

/** The transcript phrase an inferred outcome was matched from. */
const EVIDENCE: Partial<Record<CallOutcome, string>> = {
  interested: '"yes send me the details"',
  not_interested: '"not right now"',
  callback_requested: '"call me tomorrow"',
  wrong_number: '"you have the wrong number"',
  do_not_call: '"stop calling me"',
  installed_app: '"ok it is downloading"',
};

/**
 * Summaries keyed by outcome.
 *
 * These were originally picked from one flat list independently of the outcome, which
 * produced call records that contradicted themselves — a `wrong_number` call whose
 * summary read "Already applied through the app; wanted a status update." The
 * conversation memory shows the outcome and the recap side by side, so they have to agree.
 */
const SUMMARIES: Record<CallOutcome, string[]> = {
  interested: [
    'Asked about interest rate and tenure; wants the app link on WhatsApp.',
    'Keen to proceed — will complete KYC this evening.',
    'Comparing us with their bank; asked for the processing fee in writing.',
  ],
  not_interested: [
    'Not looking for a loan currently; asked not to be called for 3 months.',
    'Already took a loan elsewhere last month.',
  ],
  callback_requested: [
    'Interested but travelling — requested a callback next week.',
    'Asked us to call back after 7pm on a weekday.',
  ],
  wrong_number: [
    'Number belongs to someone else; they had not enquired with us.',
  ],
  voicemail: [
    'Went to voicemail; left a short message with the callback number.',
  ],
  unreachable: [
    'Rang out twice with no answer.',
  ],
  do_not_call: [
    'Asked to be removed from all calling lists. Marked do-not-call.',
  ],
  installed_app: [
    'Walked them through the install on the call; app opened before we hung up.',
  ],
  other: [
    'Brief call — customer asked to be sent details and hung up.',
  ],
};

const CAMPAIGNS = [
  {
    name: 'Diwali Personal Loan Push',
    code: 'camp_diwali',
    status: 'completed' as const,
    note: 'Festive season outreach to warm website leads.',
    startedDaysAgo: 21,
    completed: true,
    contacts: 24,
    calledRatio: 1,
  },
  {
    name: 'New Year Top-Up Offers',
    code: 'camp_newyear',
    status: 'running' as const,
    note: 'Existing customers eligible for a top-up.',
    startedDaysAgo: 4,
    completed: false,
    contacts: 18,
    calledRatio: 0.55,
  },
  {
    name: 'Referral Follow-ups',
    code: 'camp_referral',
    status: 'draft' as const,
    note: 'Uploaded, not yet started — waiting on agent assignment.',
    startedDaysAgo: 0,
    completed: false,
    contacts: 12,
    calledRatio: 0,
  },
];

async function main() {
  console.log('[seed:campaigns] clearing campaigns…');
  // CampaignContact cascades; CallAttempt.campaignId is SetNull, so drop this
  // campaign's calls explicitly rather than orphaning them.
  const existing = await prisma.campaign.findMany({ select: { id: true } });
  if (existing.length) {
    await prisma.callAttempt.deleteMany({ where: { campaignId: { in: existing.map((c) => c.id) } } });
    await prisma.campaign.deleteMany({});
  }

  // Pool of people to call: prefer real customers so contacts deep-link to a journey.
  const customers = await prisma.customer.findMany({
    where: { phone: { not: null } },
    // currentStage + firstSource are needed to brief the call the way the live dialler
    // does — "where were they in the funnel when we rang".
    select: { id: true, phone: true, name: true, city: true, currentStage: true, firstSource: true },
    orderBy: { lastActivityAt: 'desc' },
  });
  if (!customers.length) {
    console.error('[seed:campaigns] no customers with phones — run `npm run seed:journey` first');
    process.exit(1);
  }

  let cursor = 0;
  let totalContacts = 0;
  let totalCalls = 0;

  for (const def of CAMPAIGNS) {
    const startAt = def.startedDaysAgo ? daysAgo(def.startedDaysAgo) : null;

    const campaign = await prisma.campaign.create({
      data: {
        name: def.name,
        code: def.code,
        status: def.status,
        note: def.note,
        concurrency: 2,
        assistantName: 'Ruby (outbound)',
        scheduleType: 'one_time',
        // 09:00–19:00 IST, weekdays only — the shape a compliance-minded operator
        // would actually configure.
        dailyStartMinute: 540,
        dailyEndMinute: 1140,
        daysOfWeek: [1, 2, 3, 4, 5],
        retryStrategy: 'every_n_days',
        maxAttemptsPerContact: 3,
        retryIntervalDays: 2,
        stopOnAnswer: true,
        startAt,
        startedAt: def.status === 'draft' ? null : startAt,
        completedAt: def.completed ? daysAgo(Math.max(1, def.startedDaysAgo - 7)) : null,
        lastRunAt: def.status === 'running' ? new Date(Date.now() - rand(36e5)) : startAt,
        createdBy: 'admin@swiftloan.com',
        createdAt: startAt ?? new Date(),
      },
    });

    const take = Math.min(def.contacts, customers.length);
    let called = 0;
    let failed = 0;
    let pending = 0;

    for (let i = 0; i < take; i++) {
      const person = customers[(cursor + i) % customers.length];
      if (!person.phone) continue;

      const wasCalled = Math.random() < def.calledRatio;
      // A small slice of any real upload is bad data — a dead number or a rejected row.
      const isFailed = wasCalled && Math.random() < 0.12;
      const state: ContactState = !wasCalled ? 'pending' : isFailed ? 'failed' : 'called';

      const attempts = state === 'pending' ? 0 : 1 + rand(2);
      const lastAttemptAt = state === 'pending' ? null : daysAgo(rand(Math.max(1, def.startedDaysAgo)));

      const contact = await prisma.campaignContact.create({
        data: {
          campaignId: campaign.id,
          customerId: person.id,
          name: person.name,
          phone: person.phone,
          city: person.city,
          product: pick(['personal', 'business', 'home', 'vehicle']),
          // CampaignContact.amount is PAISE (see parseAmount in campaigns.routes.ts).
          amount: (50_000 + rand(450_000)) * 100,
          state,
          error: isFailed ? pick(['number unreachable', 'invalid number', 'do-not-call list']) : null,
          attempts,
          lastAttemptAt,
          answered: state === 'called' && Math.random() < 0.7,
          createdAt: campaign.createdAt,
        },
      });
      totalContacts++;

      if (state === 'pending') { pending++; continue; }
      if (state === 'failed') failed++; else called++;

      // One CallAttempt per attempt, so the outcome chart and the call list have data.
      for (let a = 0; a < attempts; a++) {
        const isLast = a === attempts - 1;
        const outcome = isFailed ? null : isLast ? pick(OUTCOMES) : null;
        const status: CallStatus = isFailed
          ? pick<CallStatus>(['failed', 'no_answer', 'busy'])
          : isLast ? 'completed' : pick<CallStatus>(['no_answer', 'busy']);

        const agentReported = outcome != null && Math.random() < 0.6;
        const queuedAt = lastAttemptAt ?? daysAgo(rand(10));

        await prisma.callAttempt.create({
          data: {
            customerId: person.id,
            campaignId: campaign.id,
            phone: person.phone,
            providerCallId: `seedcall_${contact.id.slice(0, 8)}_${a}`,
            status,
            outcome,
            // Distinguishing an agent-reported disposition from a transcript guess is
            // the whole point of outcomeSource — seed both kinds.
            outcomeSource: outcome ? (agentReported ? 'agent' : 'inferred') : (isFailed ? 'status' : null),
            // An inferred outcome shows its evidence, so the quote has to be the kind
            // of phrase that would actually produce that inference.
            outcomeEvidence: outcome && !agentReported ? (EVIDENCE[outcome] ?? null) : null,
            summary: outcome ? pick(SUMMARIES[outcome]) : null,
            incomeRange: agentReported ? pick(INCOME_RANGES) : null,
            employment: agentReported ? pick(EMPLOYMENT) : null,
            preferredChannel: agentReported ? pick(['whatsapp', 'phone', 'email']) : null,
            attempt: a + 1,
            // What the agent was handed before dialling. `placeCall` persists exactly
            // this shape on a real call (see lib/dialer.ts), and the dashboard's
            // "Funnel at time of call" panel reads it — without it every seeded call
            // showed "What the agent knew (none recorded)" and the feature looked
            // missing rather than merely unseeded.
            callContext: {
              agent_purpose: 'campaign_outreach',
              lead_name: person.name ?? 'there',
              lead_city: person.city ?? '',
              lead_phone: person.phone,
              lead_stage: STAGE_LABELS[person.currentStage] ?? String(person.currentStage),
              lead_next_action: nextActionFor(person.currentStage),
              lead_source: person.firstSource,
              lead_product: contact.product ?? '',
              campaign: campaign.name,
              conversation_count: String(a),
              conversation_history: a > 0
                ? 'Called once before on this campaign; no answer.'
                : 'No previous conversations on record.',
            } as Prisma.InputJsonValue,
            queuedAt,
            dialedAt: new Date(queuedAt.getTime() + 5_000),
            completedAt: status === 'completed'
              ? new Date(queuedAt.getTime() + 20_000 + (45 + rand(300)) * 1000)
              : null,
            durationSec: status === 'completed' ? 45 + rand(300) : null,
          },
        });
        totalCalls++;
      }
    }

    cursor += take;

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { totalContacts: take, calledCount: called, failedCount: failed, queuedCount: pending },
    });

    console.log(`[seed:campaigns] ${def.code.padEnd(15)} ${String(def.status).padEnd(10)} contacts=${take} called=${called} failed=${failed} pending=${pending}`);
  }

  console.log(`[seed:campaigns] campaigns: ${CAMPAIGNS.length}, contacts: ${totalContacts}, calls: ${totalCalls}`);
  console.log('[seed:campaigns] done ✓');
}

main()
  .catch((e) => { console.error('[seed:campaigns] failed', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
