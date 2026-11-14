// "Came back" for the drop-off job: asking for a login code and never entering it must NOT end a run; entering it must.
// 2026-11-10: a customer asked for codes while the Vox wallet was empty, never got them, and that request counted as a return.
// Run with: cd server && bash scripts/journey/run-dropoff.sh   (THROWAWAY database, log-only, nothing is sent)
(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { appDropoffTick, lastActivityFor } = await import(`${S}/appDropoff.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  const MIN = 60_000;
  const t0 = new Date();
  const at = (m: number) => new Date(t0.getTime() + m * MIN);
  const PHONE = '9000000031';

  // PAN verified 40 minutes ago, then stopped (website user, not in the app)
  const user = await prisma.user.create({ data: { phone: PHONE, firstName: 'Asha', panOnFile: true, updatedAt: at(-40) } });
  const customer = await prisma.customer.create({ data: { phone: PHONE, name: 'Asha' } });
  const run = () => prisma.appDropoff.findFirst({ where: { phone: PHONE }, orderBy: { createdAt: 'asc' } });
  const asked = async (m: number, channel: 'website' | 'app') => {
    await prisma.journeyEvent.create({ data: { customerId: customer.id, channel, name: 'otp_requested', occurredAt: at(m) } });
    await prisma.activityEvent.create({ data: { userId: user.id, eventType: 'funnel', eventName: 'otp_requested', screen: channel === 'app' ? 'mobile' : 'website', ts: at(m) } });
  };

  // tick 1: armed, first WhatsApp (+30 min) handled
  await appDropoffTick(t0);
  const r1 = await run();
  check('armed and the first message handled', r1?.status === 'active' && r1.stepsSent >= 1, `${r1?.status} stepsSent=${r1?.stepsSent}`);

  // asks for a code on the website twice and in the app, never enters one
  await asked(5, 'website');
  await asked(7, 'website');
  await asked(20, 'app');
  const clock = await lastActivityFor(user.id, PHONE, r1!.startAt);
  check('asking for a code does not move the last-action clock', clock.getTime() === r1!.startAt.getTime(), clock.toISOString());

  await appDropoffTick(at(30));
  // tick whenever the run says it is next due (default schedule: the next 7 AM IST WhatsApp, held to calling hours) until a step goes
  let mDue = 30;
  for (let i = 0; i < 20; i++) {
    const cur = (await run())!;
    if (cur.status !== 'active' || cur.stepsSent > r1!.stepsSent) break;
    mDue = Math.ceil((cur.nextCheckAt!.getTime() - t0.getTime()) / MIN) + 1;
    await appDropoffTick(at(mDue));
  }
  const r2 = await run();
  check('run still active after three unentered code requests', r2?.status === 'active' && r2.stopReason == null, `${r2?.status}:${r2?.stopReason ?? '-'}`);
  check('and it kept sending its schedule', (r2?.stepsSent ?? 0) > r1!.stepsSent, `stepsSent ${r1!.stepsSent} → ${r2?.stepsSent}`);

  // now enters the code: that IS coming back
  await prisma.journeyEvent.create({ data: { customerId: customer.id, channel: 'website', name: 'otp_verified', occurredAt: at(mDue + 5) } });
  await appDropoffTick(at(mDue + 15));
  const r3 = await run();
  check('entering the code ends the run as "returned"', r3?.status === 'stopped' && r3.stopReason === 'returned', `${r3?.status}:${r3?.stopReason ?? '-'}`);

  await prisma.appDropoff.deleteMany({ where: { phone: PHONE } });
  await prisma.user.deleteMany({ where: { phone: PHONE } });
  await prisma.customer.deleteMany({ where: { phone: PHONE } });
  await prisma.$disconnect();
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
