// "No offers" follow-up CALL, end to end against a FAKE Ello server on localhost, in a THROWAWAY database. Nothing real is dialled.
// Run with: cd server && bash scripts/journey/run-dropoff.sh
import http from 'node:http';

(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { appDropoffTick } = await import(`${S}/appDropoff.js`);
  const { saveTimings, refreshTimings } = await import(`${S}/timingsStore.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  // ── a fake Ello that records every call request
  const calls: Array<{ url: string; key: string | undefined; body: any }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      calls.push({ url: req.url ?? '', key: req.headers['x-api-key'] as string | undefined, body: JSON.parse(raw || '{}') });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { conversation_id: `conv-${calls.length}` } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;

  const elloSettings = { baseUrl: `http://127.0.0.1:${port}`, webhookUrl: 'https://example.test/hook', assistantId: 'agent-test' };
  await prisma.integrationConfig.upsert({
    where: { provider: 'ello' },
    update: { enabled: true, settings: elloSettings, secrets: { apiKey: 'ello-test-key' } },
    create: { provider: 'ello', enabled: true, settings: elloSettings, secrets: { apiKey: 'ello-test-key' } },
  });

  const day = new Date(); day.setUTCHours(0, 0, 0, 0);
  const at = (h: number, m: number, add = 0) => new Date(day.getTime() + h * 3_600_000 + (m + add) * 60_000);
  const T = at(6, 30);                 // 12:00 IST: inside calling hours
  const LATE = at(20, 30);             // 02:00 IST next day: outside calling hours
  const P = { dup: '9000000031', noMatch: '9000000032', early: '9000000033', dnc: '9000000034', late: '9000000035', logged: '9000000036', other: '9000000037' };
  const phones = Object.values(P);
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.customer.deleteMany({ where: { phone: { in: phones } } });

  const noOffers = async (phone: string, name: string, minutesAgo: number, reason: string, now: Date) => {
    const u = await prisma.user.create({ data: { phone, firstName: name, panOnFile: true, updatedAt: new Date(now.getTime() - (minutesAgo + 30) * 60_000) } });
    await prisma.customer.create({ data: { phone, name } });
    const since = new Date(now.getTime() - minutesAgo * 60_000);
    await prisma.loanApplication.create({ data: { ref: `T-${Math.floor(Math.random() * 1e9)}`, userId: u.id, amount: 300000, status: reason === 'duplicate' ? 'failed' : 'rejected', prequalifyReason: reason, offersFetchedAt: since, createdAt: since, updatedAt: since } });
    return u;
  };
  await noOffers(P.dup, 'Zoya', 60, 'duplicate', T);
  await noOffers(P.noMatch, 'Meena', 60, 'not_eligible', T);
  await noOffers(P.early, 'Arun', 20, 'not_eligible', T);
  await noOffers(P.dnc, 'Ravi', 60, 'not_eligible', T);
  await prisma.customer.update({ where: { phone: P.dnc }, data: { currentStage: 'lost' } });
  await noOffers(P.other, 'Tara', 60, 'not_eligible', T);

  const save = async (changes: Record<string, unknown>, label: string) => {
    const res = await saveTimings(changes, null); await refreshTimings();
    check(`setting saved: ${label}`, res.ok === true, res.ok ? '' : JSON.stringify((res as any).errors));
  };
  const hist = async (phone: string) => ((await prisma.appDropoff.findFirst({ where: { phone } }))?.history as any[] ?? []).filter((h) => h.channel === 'voice');
  const tick = async (when: Date) => { const x = await appDropoffTick(when); console.log('  tick', JSON.stringify(x)); return x; };

  // ── PASS A: the master call switch is OFF (the default) → nobody is dialled and nothing is even recorded
  await tick(T);
  check('master call switch off: nobody is dialled', calls.length === 0, `calls ${calls.length}`);
  check('master call switch off: nothing recorded', (await hist(P.dup)).length === 0);
  check('the lookup-found-nothing people were armed as "rejected" runs', (await prisma.appDropoff.count({ where: { dropStatus: 'rejected', phone: { in: [P.dup, P.noMatch, P.early, P.other] } } })) === 4);

  // ── PASS B (16 min later, past the 15-minute quiet gap after the logged WhatsApp): master switch on, the no-offers call switch still OFF → people are only recorded once as "would call"
  // The shipped wait is 2 minutes; this check spaces its passes for a 45-minute wait, so it sets that explicitly.
  await save({ 'calls.nudgeEnabled': true, 'dropoff.noOffersCallDelayMinutes': 45 }, 'master call switch on');
  await tick(new Date(T.getTime() + 16 * 60_000));
  check('no-offers switch off: nobody is dialled', calls.length === 0, `calls ${calls.length}`);
  check('no-offers switch off: due people are recorded once as "would call"', (await hist(P.dup))[0]?.outcome === 'logged' && (await hist(P.noMatch))[0]?.outcome === 'logged');
  check('no-offers switch off: someone still too early is not recorded', (await hist(P.early)).length === 0);
  check('no-offers switch off: do-not-contact is never armed or recorded', (await hist(P.dnc)).length === 0);
  await tick(new Date(T.getTime() + 17 * 60_000));
  check('no-offers switch off: it is not repeated every minute', (await hist(P.dup)).length === 1, `entries ${(await hist(P.dup)).length}`);

  // ── PASS C: both switches on, but a call test-number list that excludes everyone
  await save({ 'dropoff.noOffersCallEnabled': true, 'calls.allowedNumbers': ['9111111111'] }, 'no-offers call on + call test list');
  await tick(new Date(T.getTime() + 18 * 60_000));
  check('call test-number list excludes them: nobody is dialled', calls.length === 0, `calls ${calls.length}`);

  // ── PASS D: list cleared
  await save({ 'calls.allowedNumbers': [] }, 'call test list cleared');
  await tick(new Date(T.getTime() + 19 * 60_000));
  const ph = (i: number) => String(calls[i]?.body?.to_number ?? '').replace(/\D/g, '').slice(-10);
  const dialled = calls.map((_, i) => ph(i)).sort();
  check('switched on: exactly the 3 due people are dialled (not too-early, not do-not-contact)', JSON.stringify(dialled) === JSON.stringify([P.dup, P.noMatch, P.other].sort()), JSON.stringify(dialled));
  check('requests go to the right agent with the API key', calls.every((c) => c.url === '/api/agents/agent-test/calls' && c.key === 'ello-test-key'), calls[0]?.url);

  const ctx = (phone: string) => calls.find((c) => String(c.body.to_number).endsWith(phone))?.body.context_data ?? {};
  const dup = ctx(P.dup), nm = ctx(P.noMatch);
  check('the agent is told this is a no-offers follow-up, with the stall reason and surface', dup.reason === 'no_offers_followup' && dup.agent_purpose === 'no_offers_followup' && /could not find any for your application/.test(dup.stall_reason ?? '') && dup.stall_channel === 'the website', JSON.stringify({ reason: dup.reason, purpose: dup.agent_purpose, ch: dup.stall_channel }));
  check('"already registered" → no_offers_reason already_registered; otherwise no_match', dup.no_offers_reason === 'already_registered' && nm.no_offers_reason === 'no_match');
  check('the lender wording ("duplicate") is NEVER sent to the agent', !JSON.stringify(calls.map((c) => c.body)).toLowerCase().includes('duplicate'));
  check('each call is recorded (CallAttempt) and claimed', (await prisma.callAttempt.count({ where: { phone: { in: [P.dup, P.noMatch, P.other] } } })) === 3 && (await prisma.outboundRequest.count({ where: { kind: 'no_offers_call' } })) === 3);
  check('history shows the call as sent', (await hist(P.dup)).some((h) => h.outcome === 'sent') && (await hist(P.dup)).some((h) => h.outcome === 'logged'));

  // ── PASS E: never twice
  const before = calls.length;
  await tick(new Date(T.getTime() + 20 * 60_000));
  check('a second pass never rings the same people again', calls.length === before, `calls ${calls.length}`);

  // ── PASS F: the person who was too early becomes due once the wait has passed
  await tick(new Date(T.getTime() + 30 * 60_000)); // Arun reached it 20 min before T: 50 min in, past the 45 min wait
  check('once the wait has passed, the person who was too early is dialled', calls.length === before + 1 && ph(calls.length - 1) === P.early, `calls ${calls.length}`);

  // ── PASS G: a day later nobody is rung again; outside calling hours nobody is rung at all
  await tick(new Date(T.getTime() + 24 * 3_600_000));
  const perPhone = calls.map((_, i) => ph(i));
  check('a day later, still one call per person', new Set(perPhone).size === perPhone.length && calls.length === before + 1, JSON.stringify(perPhone));
  await noOffers(P.late, 'Kiran', 60, 'not_eligible', LATE);
  const afterEarly = calls.length;
  await tick(LATE);
  check('outside calling hours (02:00 IST) nobody is dialled', calls.length === afterEarly, `calls ${calls.length}`);

  // ── PASS H: 30 older people already called (their runs stay active for the daily messages) must not hide a new one.
  // Until 5 Nov 2026 the job took the 25 OLDEST active runs, so a newcomer behind them was never rung.
  const { placeNoOffersCalls } = await import(`${S}/noOffersCall.js`);
  const T2 = new Date(T.getTime() + 48 * 3_600_000); // 12:00 IST two days later
  const oldPhones = Array.from({ length: 30 }, (_, i) => `90000006${String(i).padStart(2, '0')}`);
  const NEW = '9000000699';
  await prisma.user.deleteMany({ where: { phone: { in: [...oldPhones, NEW] } } });
  await prisma.customer.deleteMany({ where: { phone: { in: [...oldPhones, NEW] } } });
  for (const [i, phone] of oldPhones.entries()) {
    const u = await prisma.user.create({ data: { phone } });
    const run = await prisma.appDropoff.create({ data: { userId: u.id, phone, dropStatus: 'rejected', status: 'active', startAt: new Date(T2.getTime() - (72 - i) * 3_600_000), nextCheckAt: new Date(T2.getTime() + 3_600_000) } });
    await prisma.outboundRequest.create({ data: { channel: 'voice', kind: 'no_offers_call', idempotencyKey: `noffers:${run.id}`, status: 'sent', payload: {} } });
  }
  const nu = await prisma.user.create({ data: { phone: NEW, firstName: 'Neha' } });
  await prisma.customer.create({ data: { phone: NEW, name: 'Neha' } });
  await prisma.appDropoff.create({ data: { userId: nu.id, phone: NEW, dropStatus: 'rejected', reason: 'not_eligible', status: 'active', startAt: new Date(T2.getTime() - 50 * 60_000), nextCheckAt: new Date(T2.getTime() + 3_600_000) } });
  const beforeH = calls.length;
  await placeNoOffersCalls(T2);
  const newly = calls.slice(beforeH).map((c) => String(c.body?.to_number ?? '').replace(/\D/g, '').slice(-10));
  check('30 older already-called runs do not hide a new no-offers person: the newcomer is dialled', newly.includes(NEW) && !newly.some((p) => oldPhones.includes(p)), JSON.stringify(newly));
  await prisma.user.deleteMany({ where: { phone: { in: [...oldPhones, NEW] } } });
  await prisma.customer.deleteMany({ where: { phone: { in: [...oldPhones, NEW] } } });

  // ── PASS I: no cap. 30 new no-offers people waiting at once are ALL rung in one pass (owner, 6 Nov 2026: no limit).
  const T3 = new Date(T.getTime() + 72 * 3_600_000); // 12:00 IST three days later
  const many = Array.from({ length: 30 }, (_, i) => `90000007${String(i).padStart(2, '0')}`);
  await prisma.user.deleteMany({ where: { phone: { in: many } } });
  await prisma.customer.deleteMany({ where: { phone: { in: many } } });
  for (const phone of many) {
    const u = await prisma.user.create({ data: { phone } });
    await prisma.customer.create({ data: { phone, name: 'Test' } });
    await prisma.appDropoff.create({ data: { userId: u.id, phone, dropStatus: 'rejected', reason: 'not_eligible', status: 'active', startAt: new Date(T3.getTime() - 50 * 60_000), nextCheckAt: new Date(T3.getTime() + 3_600_000) } });
  }
  const beforeI = calls.length;
  await placeNoOffersCalls(T3);
  const rungI = new Set(calls.slice(beforeI).map((c) => String(c.body?.to_number ?? '').replace(/\D/g, '').slice(-10)));
  check('no cap: all 30 waiting no-offers people are rung in one pass', many.every((p) => rungI.has(p)), `rung ${rungI.size}`);
  await prisma.user.deleteMany({ where: { phone: { in: many } } });
  await prisma.customer.deleteMany({ where: { phone: { in: many } } });

  // ── PASS J: straight from the offers lookup. The call goes the moment the result is stored: no minute job, no 45-minute wait.
  const { callNoOffersNow } = await import(`${S}/appDropoff.js`);
  const T4 = new Date(T.getTime() + 96 * 3_600_000); // 12:00 IST four days later
  const NOW1 = '9000000801', NOW2 = '9000000802';
  await prisma.user.deleteMany({ where: { phone: { in: [NOW1, NOW2] } } });
  await prisma.customer.deleteMany({ where: { phone: { in: [NOW1, NOW2] } } });
  const u1 = await noOffers(NOW1, 'Asha', 0, 'not_eligible', T4);
  let beforeJ = calls.length;
  await callNoOffersNow(u1.id, T4);
  check('the lookup itself rings: dialled at the moment of the no-offers result', calls.length === beforeJ + 1 && ph(calls.length - 1) === NOW1, `calls ${calls.length - beforeJ}`);
  beforeJ = calls.length;
  await callNoOffersNow(u1.id, new Date(T4.getTime() + 60_000)); // they press "check again" and still get none
  await tick(new Date(T4.getTime() + 2 * 60_000));
  check('the same no-offers result is never rung twice (lookup again + job)', calls.length === beforeJ, `calls ${calls.length - beforeJ}`);

  // ── PASS K: someone whose earlier no-offers run already ended (they had moved on) gets a NEW call for a new no-offers result,
  // even within the same day (the "once per step per day" rule does not apply to no offers).
  const u2 = await noOffers(NOW2, 'Bala', 0, 'not_eligible', T4);
  await callNoOffersNow(u2.id, T4);
  await prisma.appDropoff.updateMany({ where: { phone: NOW2, status: 'active' }, data: { status: 'stopped', stopReason: 'progressed' } });
  await prisma.loanApplication.updateMany({ where: { userId: u2.id }, data: { offersFetchedAt: new Date(T4.getTime() + 3 * 3_600_000), updatedAt: new Date(T4.getTime() + 3 * 3_600_000) } });
  const beforeK = calls.length;
  await callNoOffersNow(u2.id, new Date(T4.getTime() + 3 * 3_600_000));
  check('a new no-offers result after the earlier run ended is rung again, same day', calls.length === beforeK + 1 && ph(calls.length - 1) === NOW2, `calls ${calls.length - beforeK}`);
  await prisma.user.deleteMany({ where: { phone: { in: [NOW1, NOW2] } } });
  await prisma.customer.deleteMany({ where: { phone: { in: [NOW1, NOW2] } } });

  server.close();
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.customer.deleteMany({ where: { phone: { in: phones } } });
  await prisma.$disconnect();
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
