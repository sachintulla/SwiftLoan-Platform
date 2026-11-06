// Drop-off messages, REAL SEND PATH against a FAKE Vox WhatsApp server on localhost, in a THROWAWAY database.
// Proves the exact request each message makes (template, placeholder count and order, link or no link). Nothing real is sent.
// Run with: cd server && bash scripts/journey/run-dropoff.sh
import http from 'node:http';

(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { appDropoffTick } = await import(`${S}/appDropoff.js`);
  const { saveTimings, refreshTimings } = await import(`${S}/timingsStore.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  // ── a fake Vox WhatsApp endpoint that records every request it gets
  const received: Array<{ auth: string | undefined; body: any }> = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      received.push({ auth: req.headers.authorization, body: JSON.parse(raw || '{}') });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'Success', code: 200, gtrid: `G${received.length}`, id: `WCA-test-${received.length}`, message: 'queued' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;

  // ── configure the integration and switch drop-off sending ON (only here, in the throwaway database).
  // The card's category is MARKETING; ONE template (the "already in the app, continue" one) has its own category, UTILITY.
  const voxSettings = {
    baseUrl: `http://127.0.0.1:${port}`, projectId: 'PRJTEST', sender: '917842712346', messageCategory: 'MARKETING',
    dropoffMessages: { continue: { whatsapp: { noLink: { template: 'dropoff_continue_app', language: 'en', placeholders: ['{name}', '{step}'], category: 'UTILITY' } } } },
  };
  await prisma.integrationConfig.upsert({
    where: { provider: 'voxvalley' },
    update: { enabled: true, settings: voxSettings, secrets: { authToken: 'test-token' } },
    create: { provider: 'voxvalley', enabled: true, settings: voxSettings, secrets: { authToken: 'test-token' } },
  });
  const saved = await saveTimings({ 'dropoff.sendEnabled': true }, null);
  await refreshTimings();
  check('sending switched on (throwaway database only)', saved.ok === true);

  // "now": 12:00 IST today (06:30 UTC), inside calling hours, so a 30-minute step is due for people who reached their step 40 min ago
  const t0 = new Date(); t0.setUTCHours(6, 30, 0, 0);
  const MIN = 60_000;
  const at = (m: number) => new Date(t0.getTime() + m * MIN);
  const P = { webPan: '9000000021', appFilled: '9000000022', webOffers: '9000000023', appOffers: '9000000024', noOffers: '9000000025', webNoToken: '9000000026' };
  const phones = Object.values(P);
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  const partner = await prisma.lenderPartner.create({ data: { name: `Test Lender ${Date.now()}`, baseApr: 12 } });

  const mk = (phone: string, firstName: string, updatedAt: Date) => prisma.user.create({ data: { phone, firstName, panOnFile: true, updatedAt } });
  const mkApp = (userId: string, status: any, updatedAt: Date, extra: any = {}) =>
    prisma.loanApplication.create({ data: { ref: `T-${Math.floor(Math.random() * 1e9)}`, userId, amount: 300000, status, createdAt: updatedAt, updatedAt, ...extra } });
  const addOffers = async (applicationId: string, n: number) => {
    for (let i = 0; i < n; i++) await prisma.offer.create({ data: { applicationId, partnerId: partner.id, amount: 300000, apr: 12, emi: 10000, tenureMonths: 36, processingFee: 0 } as any });
  };
  const withToken = (userId: string, phone: string, token: string) =>
    prisma.journeyReminder.create({ data: { userId, phone, token, startAt: at(-300), status: 'stopped', stopReason: 'returned' } });
  const inApp = async (phone: string, name: string) => {
    const c = await prisma.customer.create({ data: { phone, name } });
    await prisma.journeyEvent.create({ data: { customerId: c.id, channel: 'app', name: 'otp_verified' } });
  };

  const uWebPan = await mk(P.webPan, 'Priya', at(-40));                       // website user, PAN done, no application
  await withToken(uWebPan.id, P.webPan, 'TOKPAN1');
  const uAppFilled = await mk(P.appFilled, 'Ravi', at(-45));                  // in the app, details filled
  await mkApp(uAppFilled.id, 'draft', at(-40)); await inApp(P.appFilled, 'Ravi');
  const uWebOffers = await mk(P.webOffers, 'Meena', at(-60));                 // website user with 3 offers, none applied
  const aWebOffers = await mkApp(uWebOffers.id, 'offers_ready', at(-40), { offersFetchedAt: at(-40) });
  await addOffers(aWebOffers.id, 3); await withToken(uWebOffers.id, P.webOffers, 'TOKOFF1');
  const uAppOffers = await mk(P.appOffers, 'Arun', at(-60));                  // in the app with offers
  const aAppOffers = await mkApp(uAppOffers.id, 'offers_ready', at(-40), { offersFetchedAt: at(-40) });
  await addOffers(aAppOffers.id, 2); await inApp(P.appOffers, 'Arun');
  const uNoOffers = await mk(P.noOffers, 'Zoya', at(-60));                    // lookup found nothing ("already registered")
  await mkApp(uNoOffers.id, 'failed', at(-40), { prequalifyReason: 'duplicate', offersFetchedAt: at(-40) });
  const uWebNoToken = await mk(P.webNoToken, 'Tara', at(-40));                // website user with NO link to carry
  void uWebNoToken;

  const r = await appDropoffTick(t0);
  console.log('tick', JSON.stringify(r));

  const body = (i: number) => received[i]?.body;
  const params = (b: any) => ((b?.template?.components ?? []).find((c: any) => c.type === 'body')?.parameters ?? []).map((p: any) => p.text);
  const byTo = (phone: string) => received.find((x) => String(x.body?.to ?? '').endsWith(phone))?.body;

  check('exactly 5 messages went out (the four drop-offs plus "no offers"; none for the user with no link)', received.length === 5, `got ${received.length}`);
  check('every request carries the Bearer token and the project id', received.every((x) => x.auth === 'Bearer test-token' && x.body.projectid === 'PRJTEST'));
  check('every request is a template message to a +91 number from the configured sender', received.every((x) => x.body.type === 'template' && /^\+91\d{10}$/.test(x.body.to) && x.body.from === '917842712346'));

  const web = byTo(P.webPan);
  check('website, PAN done → continue_application_link (with its banner) with name, step and the LINK', web?.template?.name === 'continue_application_link' && JSON.stringify(web).includes('whatsapp-continue-link.jpg') && params(web).length === 3 && params(web)[0] === 'Priya' && params(web)[1] === 'Basic details' && /\/dl\?ref=TOKPAN1$/.test(params(web)[2]), JSON.stringify(params(web)));
  const app = byTo(P.appFilled);
  check('already in the app, details filled → dropoff_continue_app with name and step, NO link', app?.template?.name === 'dropoff_continue_app' && params(app).length === 2 && params(app)[0] === 'Ravi' && params(app)[1] === 'Finding offers' && !JSON.stringify(app).includes('/dl?ref='), JSON.stringify(params(app)));
  const wo = byTo(P.webOffers);
  check('website, 3 offers → offers_ready_view_link with name, application ref and the LINK', wo?.template?.name === 'offers_ready_view_link' && params(wo).length === 3 && params(wo)[0] === 'Meena' && /^T-\d+$/.test(params(wo)[1]) && /\/dl\?ref=TOKOFF1$/.test(params(wo)[2]), JSON.stringify(params(wo)));
  const ao = byTo(P.appOffers);
  check('already in the app, 2 offers → offers_ready_open_app with the name and application ref, NO link', ao?.template?.name === 'offers_ready_open_app' && params(ao).length === 2 && params(ao)[0] === 'Arun' && /^T-\d+$/.test(params(ao)[1]) && !JSON.stringify(ao).includes('/dl?ref='), JSON.stringify(params(ao)));

  check('a template with its own category sends THAT category (Utility), not the card default', app?.messageCategory === 'UTILITY', String(app?.messageCategory));
  check('each default goes out with the category Meta approved (continue = Marketing, offers = Utility)', web?.messageCategory === 'MARKETING' && wo?.messageCategory === 'UTILITY' && ao?.messageCategory === 'UTILITY', JSON.stringify([web?.messageCategory, wo?.messageCategory, ao?.messageCategory]));

  const histOf = async (phone: string) => ((await prisma.appDropoff.findMany({ where: { phone } }))[0]?.history as any[]) ?? [];
  const no = await histOf(P.noOffers);
  const nob = byTo(P.noOffers);
  check('"already registered" counts as no offers and gets no_offers_call (with its banner), name only, no link', (await prisma.appDropoff.findFirst({ where: { phone: P.noOffers } }))?.dropStatus === 'rejected' && no[0]?.outcome === 'sent' && nob?.template?.name === 'no_offers_call' && JSON.stringify(nob).includes('whatsapp-no-offers.png') && JSON.stringify(params(nob)) === '["Zoya"]', JSON.stringify(params(nob)));
  const nt = await histOf(P.webNoToken);
  check('website user with no link to carry → skipped, never sent without it', nt.length === 0 || (nt[0]?.outcome === 'skipped'), JSON.stringify(nt[0] ?? 'not armed'));

  // What each sent message records for Admin → WhatsApp → Sent messages: the filled-in values, language, category and what triggered it.
  const rec = await prisma.messageDelivery.findFirst({ where: { kind: 'app_dropoff', phone: P.webPan } });
  const meta = (rec?.meta ?? {}) as any;
  check('a sent message records its values, language and category', JSON.stringify(meta.placeholders) === JSON.stringify(['Priya', 'Basic details', 'http://localhost:4000/dl?ref=TOKPAN1']) && meta.language === 'en' && meta.category === 'MARKETING', JSON.stringify(meta));
  check('it also records what triggered it (job, step reached, since when, which message of the sequence)', meta.trigger?.by === 'Drop-off messages' && meta.trigger?.stage === 'Basic details' && !!meta.trigger?.since && /^Message 1 · /.test(meta.trigger?.step ?? ''), JSON.stringify(meta.trigger));

  const rows = await prisma.messageDelivery.count({ where: { kind: 'app_dropoff' } });
  check('each send is recorded for the Messages page (kind app_dropoff)', rows === 4, `rows ${rows}`);

  server.close();
  await prisma.user.deleteMany({ where: { phone: { in: phones } } });
  await prisma.customer.deleteMany({ where: { phone: { in: phones } } });
  await prisma.$disconnect();
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
