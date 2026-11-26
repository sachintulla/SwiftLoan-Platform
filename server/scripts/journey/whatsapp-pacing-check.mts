// WhatsApp pacing and delivery reports, against a FAKE Vox server on localhost, in a THROWAWAY database. Nothing real is sent.
//   1. Vox says "too fast" (429): the drop-off step is handed back and sent on a later tick, never recorded as failed.
//   2. A batch is worked several at a time (limits.whatsappParallel), not one by one.
//   3. Vox's delivery reports (msgId = WhatsApp's id, sent twice each) are linked to the message we sent, by number and time.
//   4. Never more than limits.whatsappPerMinute sends in a minute: the rest wait.
// Run with: cd server && bash scripts/journey/run-whatsapp-pacing.sh
import http from 'node:http';

(async () => {
  const S = new URL('../../src/lib', import.meta.url).pathname;
  const { prisma } = await import(`${S}/prisma.js`);
  const { appDropoffTick } = await import(`${S}/appDropoff.js`);
  const { saveTimings, refreshTimings } = await import(`${S}/timingsStore.js`);
  const { sendWhatsAppTemplate } = await import(`${S}/whatsapp.js`);
  const { parseStatusPayload } = await import(`${S}/messageStatus.js`);
  const { applyStatusEvents } = await import(`${S}/messageDelivery.js`);

  let fails = 0;
  const check = (name: string, ok: boolean, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`); };

  // ── fake Vox: answers after 40 ms, counts requests in flight, and says "too fast" once for the numbers in `throttleOnce`.
  const received: string[] = [];
  const throttleOnce = new Set<string>();
  let inFlight = 0; let peak = 0; let n = 0;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      inFlight++; peak = Math.max(peak, inFlight);
      const to = String(JSON.parse(raw || '{}').to ?? '');
      setTimeout(() => {
        inFlight--;
        res.setHeader('content-type', 'application/json');
        const key = to.slice(-10);
        if (throttleOnce.has(key)) {
          throttleOnce.delete(key);
          res.statusCode = 429;
          res.end(JSON.stringify({ status: 'FAILED', message: 'Too many requests' }));
          return;
        }
        received.push(to);
        res.end(JSON.stringify({ status: 'Success', code: 200, id: `WCA-${++n}`, message: 'queued' }));
      }, 40);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;

  const voxSettings = { baseUrl: `http://127.0.0.1:${port}`, projectId: 'PRJTEST', sender: '917842712346', messageCategory: 'MARKETING' };
  await prisma.integrationConfig.upsert({
    where: { provider: 'voxvalley' },
    update: { enabled: true, settings: voxSettings, secrets: { authToken: 'test-token' } },
    create: { provider: 'voxvalley', enabled: true, settings: voxSettings, secrets: { authToken: 'test-token' } },
  });
  const saved = await saveTimings({ 'dropoff.sendEnabled': true }, null);
  await refreshTimings();
  check('sending switched on (throwaway database only)', saved.ok === true);

  // 12:00 IST today, inside calling hours. "No offers" runs are armed at once and their first WhatsApp is due 30 minutes on.
  const t0 = new Date(); t0.setUTCHours(6, 30, 0, 0);
  const at = (m: number) => new Date(t0.getTime() + m * 60_000);
  const noOffersPerson = async (phone: string, name: string) => {
    const u = await prisma.user.create({ data: { phone, firstName: name, panOnFile: true, updatedAt: at(-60) } });
    await prisma.loanApplication.create({
      data: { ref: `T-${Math.floor(Math.random() * 1e9)}`, userId: u.id, amount: 300000, status: 'failed', prequalifyReason: 'duplicate', offersFetchedAt: at(-40), createdAt: at(-40), updatedAt: at(-40) } as any,
    });
    return u;
  };

  // ── 1. "too fast" → retried, not failed
  const ASHA = '9000000031';
  await noOffersPerson(ASHA, 'Asha');
  throttleOnce.add(ASHA);
  await appDropoffTick(t0);
  let run = await prisma.appDropoff.findFirst({ where: { phone: ASHA } });
  const rows1 = await prisma.messageDelivery.count({ where: { phone: ASHA } });
  check('Vox says too fast → step handed back (nothing counted as sent), no history entry, no "failed" message recorded',
    run?.stepsSent === 0 && ((run?.history as any[]) ?? []).length === 0 && rows1 === 0, `stepsSent=${run?.stepsSent} history=${((run?.history as any[]) ?? []).length} rows=${rows1}`);
  check('…and it is looked at again in about a minute', !!run && Math.abs(run.nextCheckAt.getTime() - at(1).getTime()) < 5_000, run?.nextCheckAt.toISOString());
  await appDropoffTick(at(2));
  run = await prisma.appDropoff.findFirst({ where: { phone: ASHA } });
  const ashaMsg = await prisma.messageDelivery.findFirst({ where: { phone: ASHA, channel: 'whatsapp' } });
  check('the next tick sends it once, and it is recorded as queued', run?.stepsSent === 1 && (run?.history as any[])?.[0]?.outcome === 'sent' && ashaMsg?.status === 'queued' && /^WCA-/.test(ashaMsg?.providerRef ?? ''),
    `${run?.stepsSent} ${(run?.history as any[])?.[0]?.outcome} ${ashaMsg?.status} ${ashaMsg?.providerRef}`);

  // ── 3. Vox delivery reports: WhatsApp's id, each sent twice, matched by number and time
  const vox = (status: string, msgId: string, phone = ASHA) => ({ from: '917842712346', to: `91${phone}`, status, timestamp: Math.floor(Date.now() / 1000), msgId });
  for (let i = 0; i < 2; i++) await applyStatusEvents(parseStatusPayload(vox('FAILED', 'wamid.ASHA1')));
  let m = await prisma.messageDelivery.findUnique({ where: { id: ashaMsg!.id } });
  check('a FAILED report with WhatsApp\'s id lands on the message we sent (linked by number and time; the id kept for later reports)',
    m?.status === 'failed' && m?.gtrid === 'wamid.ASHA1', `${m?.status} ${m?.gtrid}`);
  check('the second copy of the same report adds nothing', (m?.events as any[]).length === 2, `${(m?.events as any[]).length} events`);
  await applyStatusEvents(parseStatusPayload(vox('DELIVER', 'wamid.ASHA1')));
  m = await prisma.messageDelivery.findUnique({ where: { id: ashaMsg!.id } });
  check('a later DELIVER for the same id matches directly and wins over the failure', m?.status === 'delivered' && !!m?.deliveredAt, m?.status);
  const before = await prisma.messageDelivery.count();
  await applyStatusEvents(parseStatusPayload(vox('FAILED', 'wamid.STRANGER', '9000000099')));
  const stranger = await prisma.messageDelivery.findFirst({ where: { gtrid: null, providerRef: 'wamid.STRANGER' } });
  check('a report for a number we never messaged is still kept (as unknown), never pinned on someone else', (await prisma.messageDelivery.count()) === before + 1 && stranger?.kind === 'unknown', stranger?.kind);

  // ── 2. a batch is worked several at a time
  const batch = Array.from({ length: 30 }, (_, i) => `90000002${String(i).padStart(2, '0')}`);
  for (const p of batch) await noOffersPerson(p, 'Batch');
  peak = 0;
  const startedAt = Date.now();
  await appDropoffTick(at(3));
  const took = Date.now() - startedAt;
  const sentBatch = received.filter((to) => batch.includes(to.slice(-10))).length;
  check('30 due messages all go out in one tick', sentBatch === 30, `${sentBatch}`);
  check('several at once (at most limits.whatsappParallel = 10), not one by one', peak > 1 && peak <= 10, `peak in flight ${peak}, tick took ${took} ms`);

  // ── 5. the REAL webhook route over HTTP: key check, a 7 AM-sized burst is not refused, the report lands on the message
  const { createApp } = await import(new URL('../../src/app.js', import.meta.url).pathname);
  const app = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((r) => app.once('listening', () => r()));
  const apiPort = (app.address() as { port: number }).port;
  const hook = (key: string, body: unknown) => fetch(`http://127.0.0.1:${apiPort}/api/webhooks/whatsapp?key=${key}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  check('a report with the wrong key is refused (401)', (await hook('wrong-key', vox('SENT', 'wamid.X'))).status === 401);
  const RAVI = '9000000041';
  await sendWhatsAppTemplate({ phone: RAVI, templateName: 'no_offers_call', placeholders: ['Ravi'], track: { kind: 'app_dropoff' } });
  const r1 = await hook(process.env.WHATSAPP_WEBHOOK_KEY!, vox('FAILED', 'wamid.RAVI1', RAVI));
  const ravi = await prisma.messageDelivery.findFirst({ where: { phone: RAVI, kind: 'app_dropoff' } });
  check('a real Vox report over HTTP is accepted and marks the right message failed', r1.status === 200 && ravi?.status === 'failed' && ravi?.gtrid === 'wamid.RAVI1', `${r1.status} ${ravi?.status}`);
  // 7 AM on 23 Nov: 596 reports in one minute, 356 refused. Send 1,200 at once (every one twice, like Vox).
  const burst = Array.from({ length: 600 }, (_, i) => vox('FAILED', `wamid.B${i}`, `90000005${String(i % 100).padStart(2, '0')}`));
  const all = [...burst, ...burst];
  const codes: number[] = [];
  const burstStart = Date.now();
  for (let i = 0; i < all.length; i += 100) {
    codes.push(...(await Promise.all(all.slice(i, i + 100).map((b) => hook(process.env.WHATSAPP_WEBHOOK_KEY!, b).then((r) => r.status)))));
  }
  check('…all 1,200 within one minute (so the per-minute limit really was tested)', Date.now() - burstStart < 60_000, `${Date.now() - burstStart} ms`);
  const refused = codes.filter((c) => c === 429).length;
  check('1,200 reports in one burst: none refused (they used to hit 240 a minute, and 600 a minute overall)', refused === 0 && codes.every((c) => c === 200), `${refused} refused, others: ${[...new Set(codes)].join(',')}`);
  app.close();

  // ── 4. the per-minute limit holds: with 5 a minute, the 6th to 8th sends wait
  await saveTimings({ 'limits.whatsappPerMinute': 5 }, null);
  await refreshTimings();
  // The gate counts the sends of the last minute, so start from a clean count: everything above was well over 5.
  const extra = Array.from({ length: 3 }, (_, i) => `90000003${i}0`);
  const countBefore = received.length;
  void Promise.all(extra.map((phone) => sendWhatsAppTemplate({ phone, templateName: 'no_offers_call', placeholders: ['X'] })));
  await new Promise((r) => setTimeout(r, 1500));
  check('over the per-minute limit, further sends wait for a free slot instead of going out', received.length === countBefore, `${received.length - countBefore} went out`);

  server.close();
  await prisma.$disconnect();
  console.log(`\n${fails ? fails + ' FAILED' : 'ALL PASSED'}`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('E2E ERROR', e); process.exit(1); });
