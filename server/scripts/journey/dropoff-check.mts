// Drop-off messages (docs/APP_DROPOFF_PLAN.md): the job run against made-up people in a THROWAWAY database. Nothing is sent.
// Run with: cd server && bash scripts/journey/run-dropoff.sh
(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { appDropoffTick, appDropoffSendEnabled } = await import(`${S}/appDropoff.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };
  check('real sending is off', appDropoffSendEnabled() === false);

  const MIN = 60_000;
  const t0 = new Date();
  const at = (m: number) => new Date(t0.getTime() + m * MIN);
  const P = { pan: '9000000011', filled: '9000000012', none: '9000000013', offers: '9000000014', inapp: '9000000015', applied: '9000000016', web: '9000000017', mover: '9000000018' };
  const phones = Object.values(P);

  const partner = await prisma.lenderPartner.create({ data: { name: `Test Lender ${Date.now()}`, baseApr: 12 } });
  const mk = (phone: string, firstName: string, panOnFile: boolean, updatedAt: Date) => prisma.user.create({ data: { phone, firstName, panOnFile, updatedAt } });
  const mkApp = (userId: string, status: any, updatedAt: Date, extra: any = {}) =>
    prisma.loanApplication.create({ data: { ref: `T-${Math.floor(Math.random() * 1e9)}`, userId, amount: 300000, status, createdAt: updatedAt, updatedAt, ...extra } });
  const mkOffer = (applicationId: string) =>
    prisma.offer.create({ data: { applicationId, partnerId: partner!.id, amount: 300000, apr: 12, emi: 10000, tenureMonths: 36, processingFee: 0 } as any });
  const rowsFor = (phone: string) => prisma.appDropoff.findMany({ where: { phone }, orderBy: { createdAt: 'asc' } });
  const hist = (r: any) => (r.history as any[]).map((h) => `${h.channel}:${h.outcome}:${h.message}:link=${h.withLink}`);

  // everyone has been at their step for 40 minutes
  const u = {
    pan: await mk(P.pan, 'Priya', true, at(-40)),
    filled: await mk(P.filled, 'Ravi', true, at(-45)),
    none: await mk(P.none, 'Meena', true, at(-60)),
    offers: await mk(P.offers, 'Arun', true, at(-60)),
    inapp: await mk(P.inapp, 'Kiran', true, at(-45)),
    applied: await mk(P.applied, 'Zoya', true, at(-60)),
    web: await mk(P.web, 'Tara', true, at(-40)),
    mover: await mk(P.mover, 'Dev', true, at(-45)),
  };
  await mkApp(u.filled.id, 'draft', at(-40));
  await mkApp(u.none.id, 'rejected', at(-40), { prequalifyReason: 'Number already registered', offersFetchedAt: at(-40) });
  const a4 = await mkApp(u.offers.id, 'offers_ready', at(-40), { offersFetchedAt: at(-40) });
  await mkOffer(a4.id);
  await mkApp(u.inapp.id, 'draft', at(-40));
  const c5 = await prisma.customer.create({ data: { phone: P.inapp, name: 'Kiran' } });
  await prisma.journeyEvent.create({ data: { customerId: c5.id, channel: 'app', name: 'otp_verified' } });
  const a6 = await mkApp(u.applied.id, 'offers_ready', at(-40), { offersFetchedAt: at(-40) });
  const o6 = await mkOffer(a6.id);
  // the website reminder is already talking to this person
  await prisma.journeyReminder.create({ data: { userId: u.web.id, phone: P.web, token: `TOK${Date.now()}`, startAt: at(-40) } });
  await mkApp(u.mover.id, 'draft', at(-40));

  // ── tick 1: arm everyone and handle the first (30 min) message
  const r1 = await appDropoffTick(t0);
  console.log('\ntick 1', JSON.stringify(r1));
  const pan = await rowsFor(P.pan), filled = await rowsFor(P.filled), none = await rowsFor(P.none), offers = await rowsFor(P.offers);
  const inapp = await rowsFor(P.inapp), web = await rowsFor(P.web);
  check('PAN only → pan_verified, "continue" WITH the app link (website user, not in the app)', pan[0]?.dropStatus === 'pan_verified' && hist(pan[0])[0] === 'whatsapp:logged:continue:link=true', JSON.stringify(hist(pan[0] ?? {history: []})));
  check('details filled → application_filled, continue with link', filled[0]?.dropStatus === 'application_filled' && hist(filled[0])[0] === 'whatsapp:logged:continue:link=true');
  check('no offers → rejected, reason kept, "no_offers" and NO link', none[0]?.dropStatus === 'rejected' && none[0]?.reason === 'Number already registered' && hist(none[0])[0] === 'whatsapp:logged:no_offers:link=false');
  check('offers, none applied → offers_not_applied, "apply_offers" with link', offers[0]?.dropStatus === 'offers_not_applied' && hist(offers[0])[0] === 'whatsapp:logged:apply_offers:link=true');
  check('already in the app → continue with NO link', inapp[0]?.dropStatus === 'application_filled' && hist(inapp[0])[0] === 'whatsapp:logged:continue:link=false');
  check('website reminder active → NOT armed (never two sequences at once)', web.length === 0);

  // ── apply to a lender, and move one person on, then tick again 2 minutes later
  await prisma.lenderApplication.create({ data: { applicationId: a6.id, offerId: o6.id, lenderName: 'Test Lender', amount: 300000 } as any });
  const r2 = await appDropoffTick(at(2));
  console.log('tick 2', JSON.stringify(r2));
  // before the application finished the lookup nobody had a run for u.applied+mover yet? they were armed in tick 1 too
  const moverRows = await rowsFor(P.mover);
  check('mover: armed at application_filled in tick 1', moverRows[0]?.dropStatus === 'application_filled');
  await prisma.loanApplication.updateMany({ where: { userId: u.mover.id }, data: { status: 'rejected', prequalifyReason: 'No offer', offersFetchedAt: at(3), updatedAt: at(3) } });
  const r3 = await appDropoffTick(at(5));
  console.log('tick 3', JSON.stringify(r3));
  const mover2 = await rowsFor(P.mover);
  check('moved on → old run stopped "progressed" IMMEDIATELY, new rejected run armed', mover2[0]?.status === 'stopped' && mover2[0]?.stopReason === 'progressed' && mover2[1]?.dropStatus === 'rejected' && mover2[1]?.status === 'active', mover2.map((r: any) => `${r.dropStatus}:${r.status}:${r.stopReason ?? '-'}`).join(' → '));
  const applied = await rowsFor(P.applied);
  check('applied to a lender → run stopped "applied" (the lender sequence takes over)', applied[0]?.status === 'stopped' && applied[0]?.stopReason === 'applied', `${applied[0]?.status}:${applied[0]?.stopReason}`);

  // ── a day later: the second message (SMS) is due for the ones still waiting
  const r4 = await appDropoffTick(at(24 * 60 + 5));
  console.log('tick 4 (+1 day)', JSON.stringify(r4));
  const pan2 = await rowsFor(P.pan);
  check('a day later the next message is the SMS', hist(pan2[0]).length === 2 && hist(pan2[0])[1] === 'sms:logged:continue:link=true', JSON.stringify(hist(pan2[0])));

  // ── somebody goes do-not-contact
  await prisma.customer.create({ data: { phone: P.filled, name: 'Ravi', currentStage: 'lost' } });
  const r5 = await appDropoffTick(at(3 * 24 * 60 + 10));
  const filled2 = await rowsFor(P.filled);
  check('do-not-contact → stopped, nothing more', filled2[0]?.status === 'stopped' && filled2[0]?.stopReason === 'do_not_contact', `${filled2[0]?.status}:${filled2[0]?.stopReason}`);

  const anySent = (await prisma.appDropoff.findMany({ where: { phone: { in: phones } } })).some((r: any) => (r.history as any[]).some((h) => h.outcome === 'sent'));
  check('nothing was really sent (log-only)', !anySent);

  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.customer.deleteMany({ where: { phone: { in: phones } } });
  await prisma.$disconnect();
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
