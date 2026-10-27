// Per-stage schedules (lib/stageSchedules.ts): a stage with its own schedule uses it, every other stage keeps the shared one.
// Runs the real drop-off job and the install reminder's rules in a THROWAWAY database. Nothing is sent (sending is off).
// Run with: cd server && bash scripts/journey/run-dropoff.sh
(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { appDropoffTick } = await import(`${S}/appDropoff.js`);
  const { configFor, currentScheduleConfig } = await import(`${S}/installReminder.js`);
  const { saveTimings, resetTiming, refreshTimings } = await import(`${S}/timingsStore.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  // "now": 12:00 IST today (inside calling hours), so only the schedule decides whether a message is due
  const t0 = new Date(); t0.setUTCHours(6, 30, 0, 0);
  const at = (m: number) => new Date(t0.getTime() + m * 60_000);
  const P = { pan: '9000000051', offers: '9000000052' };
  const phones = Object.values(P);
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  const partner = await prisma.lenderPartner.create({ data: { name: `Stage Lender ${Date.now()}`, baseApr: 12 } });

  // both people reached their step 10 minutes ago: the shared first message is at +30 min, so nothing is due yet
  const mkUser = (phone: string, firstName: string) => prisma.user.create({ data: { phone, firstName, panOnFile: true, updatedAt: at(-10) } });
  const uPan = await mkUser(P.pan, 'Priya');                                   // PAN done, no application → "Application started" stage
  const uOff = await mkUser(P.offers, 'Meena');                                // has offers, applied to none → "Offers viewed" stage
  const app = await prisma.loanApplication.create({ data: { ref: `T-${Math.floor(Math.random() * 1e9)}`, userId: uOff.id, amount: 300000, status: 'offers_ready', createdAt: at(-10), updatedAt: at(-10), offersFetchedAt: at(-10) } });
  await prisma.offer.create({ data: { applicationId: app.id, partnerId: partner.id, amount: 300000, apr: 12, emi: 10000, tenureMonths: 36, processingFee: 0 } as any });
  void uPan;

  const rows = (phone: string) => prisma.appDropoff.findMany({ where: { phone } });
  const sent = async (phone: string) => ((await rows(phone))[0]?.history as any[] | undefined)?.filter((h) => h.channel !== 'voice') ?? [];

  // ── shared schedule only: nothing is due after 10 minutes
  await appDropoffTick(t0);
  check('shared schedule: both are armed and neither has a message yet (first is at +30 min)', (await rows(P.pan)).length === 1 && (await rows(P.offers)).length === 1 && (await sent(P.pan)).length === 0 && (await sent(P.offers)).length === 0);

  // ── "Application started" gets its own schedule: WhatsApp at +5 min
  const saved = await saveTimings({ 'dropoff.schedule.eligibility_started': [{ channel: 'whatsapp', afterMinutes: 5 }] }, null);
  await refreshTimings();
  check('a stage schedule can be saved like any timing', saved.ok === true, JSON.stringify(saved));
  // A run that is already waiting keeps its next check time (same as editing the shared schedule), so it notices the change at that check (+30 min
  // under the shared schedule). Tick then: by that time the stage's own +5 min message is overdue by 15 minutes, well inside "skip if too late".
  await appDropoffTick(at(21));
  const pan1 = await sent(P.pan);
  check('that stage uses ITS OWN schedule: the +5 min message is recorded', pan1.length === 1 && pan1[0].label === '+5m whatsapp' && pan1[0].step === 0, JSON.stringify(pan1));
  const off1 = await sent(P.offers);
  check('the other stage still uses the SHARED schedule: its first message is the shared +30 min one', off1.length === 1 && off1[0].label === '+30m whatsapp', JSON.stringify(off1.map((h: any) => h.label)));

  // ── the run ends after its single message (the stage schedule has one row), the shared one has three
  check('the stage\'s run is complete after its one message', (await rows(P.pan))[0]?.status === 'completed', String((await rows(P.pan))[0]?.status));

  // ── remove it: back to the shared schedule for new runs
  await resetTiming('dropoff.schedule.eligibility_started');
  await refreshTimings();
  const cfgAfterReset = (await import(`${S}/appDropoff.js`)).dropoffConfigFor('pan_verified', (await import(`${S}/appDropoff.js`)).dropoffConfig());
  check('after "use the shared schedule" the stage is back on the shared one (3 messages)', cfgAfterReset.steps.length === 3, `${cfgAfterReset.steps.length} steps`);

  // ── the website reminder: one schedule per website step, the shared one otherwise
  const base = currentScheduleConfig();
  const sharedLen = base.steps.length;
  await saveTimings({ 'install.schedule.eligibility_started': [{ channel: 'sms', afterMinutes: 2 }] }, null);
  await refreshTimings();
  const rPan = configFor({ unverified: false, lastStep: 'pan_done' } as any, base);
  const rApp = configFor({ unverified: false, lastStep: 'application_started' } as any, base);
  const rOtp = configFor({ unverified: false, lastStep: 'otp_only' } as any, base);
  const rUnv = configFor({ unverified: true, lastStep: 'otp_requested' } as any, base);
  check('website reminder: "PAN done" and "application started" both use the Application-started schedule', rPan.steps.length === 1 && rPan.steps[0].label === '+2m sms' && rApp.steps.length === 1, `${rPan.steps.map((s: any) => s.label)}`);
  check('website reminder: "signed in" keeps the shared schedule', rOtp.steps.length === sharedLen);
  check('website reminder: "asked for a code" keeps its own existing schedule', rUnv.steps.length !== 1 || rUnv.steps[0].label !== '+2m sms');
  check('the other rules (gap, late, age) stay shared', rPan.minGapMs === base.minGapMs && rPan.maxLateMs === base.maxLateMs);
  await resetTiming('install.schedule.eligibility_started');

  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.$disconnect();
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
