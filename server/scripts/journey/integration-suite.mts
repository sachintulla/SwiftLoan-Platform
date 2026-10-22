// Server integration suite for the website drop-off recovery feature (53+ HTTP/DB checks, see docs/JOURNEY_RESUME_TEST_REPORT.md).
// Run it with server/scripts/journey/run.sh, which creates a throwaway database for it.
// Runs ONLY against the throwaway database, with local fake SMS / WhatsApp providers. No real message is sent.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';

const ROOT = decodeURIComponent(new URL('../../src', import.meta.url).pathname); // server/src
const APP_ROOT = decodeURIComponent(new URL('../../../', import.meta.url).pathname); // repo root (the mobile app's src/)
assert.ok(/swiftloan_journey_test/.test(process.env.DATABASE_URL ?? ''), 'refusing to run outside the throwaway DB');
assert.ok(!process.env.SMS_PROVIDER, 'SMS_PROVIDER must be empty for this suite');

const { prisma } = await import(`${ROOT}/lib/prisma.js`);
const { createApp } = await import(`${ROOT}/app.js`);
const rem = await import(`${ROOT}/lib/installReminder.js`);
const sched = await import(`${ROOT}/lib/reminderSchedule.js`);
const { userPanData } = await import(`${ROOT}/lib/storedPan.js`);
const { encryptJson, panHash } = await import(`${ROOT}/lib/pii.js`);
const { upsertProviderConfig } = await import(`${ROOT}/lib/integrations.js`);
const { hashClient } = await import(`${ROOT}/lib/attribution.js`);
const { sendStallSms } = await import(`${ROOT}/lib/stallSms.js`);

type Row = { id: string; area: string; title: string; status: 'PASS' | 'FAIL'; detail?: string; ms: number };
const results: Row[] = [];
async function t(id: string, area: string, title: string, fn: () => Promise<void>) {
  const t0 = Date.now();
  try { await fn(); results.push({ id, area, title, status: 'PASS', ms: Date.now() - t0 }); console.log(`PASS ${id} ${title}`); }
  catch (e) { const detail = (e as Error).message.split('\n').slice(0, 4).join(' | '); results.push({ id, area, title, status: 'FAIL', detail, ms: Date.now() - t0 }); console.log(`FAIL ${id} ${title} :: ${detail}`); }
}

/* ── fake providers ── */
const hits: { path: string; body: any }[] = [];
let smsMode: 'ok' | 'fail' = 'ok';
let waMode: 'ok' | 'reject' = 'ok';
let waSeq = 0;
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    let body: any = null; try { body = JSON.parse(raw); } catch { /* */ }
    hits.push({ path: req.url ?? '', body });
    res.setHeader('content-type', 'application/json');
    if ((req.url ?? '').startsWith('/sms')) {
      if (smsMode === 'fail') return res.end(JSON.stringify({ status: 'Template mismatch', code: 1407 }));
      return res.end(JSON.stringify({ status: 'ok', id: 'sms-1' }));
    }
    if (waMode === 'reject') { res.statusCode = 400; return res.end(JSON.stringify({ status: 'FAILED', message: 'Invalid parameters' })); }
    waSeq += 1;
    return res.end(JSON.stringify({ status: 'Success', code: 200, gtrid: `WG${waSeq}`, id: `WA${waSeq}`, message: 'Message queued for delivery' }));
  });
});
await new Promise<void>((r) => mock.listen(0, r));
const MOCK = `http://localhost:${(mock.address() as { port: number }).port}`;
const hitsFor = (p: string) => hits.filter((h) => h.path.startsWith(p));

const server = createApp().listen(0);
const B = `http://localhost:${(server.address() as { port: number }).port}`;
let ipSeq = 0; // every request gets its own client IP (the app trusts one proxy hop), so the suite never trips its own rate limits
const j = async (path: string, init?: RequestInit) => { const hdrs = { 'x-forwarded-for': `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`, ...((init?.headers as Record<string, string>) ?? {}) }; const r = await fetch(B + path, { redirect: 'manual', ...init, headers: hdrs }); const text = await r.text(); let body: any = {}; try { body = JSON.parse(text); } catch { /* */ } return { status: r.status, body, text, headers: r.headers }; };
const post = (p: string, body: unknown, token?: string) => j(p, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const get = (p: string, token?: string, headers: Record<string, string> = {}) => j(p, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });

let seq = 10;
const newPhone = () => `93${String(1000000 + ++seq).padStart(8, '0')}`; // 9310000011 …
async function webLogin(phone = newPhone()) {
  const rq = await post('/api/website/auth/otp/request', { phone });
  const vf = await post('/api/website/auth/otp/verify', { phone, code: rq.body.data.devOtp });
  assert.equal(vf.status, 200, 'website login');
  await new Promise((r) => setTimeout(r, 400)); // arming is fire-and-forget
  const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
  const reminder = await prisma.journeyReminder.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
  return { phone, token: vf.body.data.accessToken as string, user, reminder };
}
const IST = (h: number, m = 0, d = 20) => new Date(Date.UTC(2026, 9, d, h, m) - 5.5 * 3_600_000); // IST wall clock → Date
const OPEN = IST(11); const QUIET = IST(23);
// Logic tests edit rows directly and tick at made-up times, so make every active row due first; the tests that
// exercise the real due-row selection (S54+) call rem.installReminderTick directly.
// Messages go out only after the visitor has dropped off, so this helper marks them dropped (at their last activity, which is not "returned").
const tickRaw = async (now: Date) => { await prisma.$executeRawUnsafe(`UPDATE "JourneyReminder" SET "nextCheckAt" = to_timestamp(0) WHERE status = 'active'`); return rem.installReminderTick(now); };
const tickAll = async (now: Date) => { await prisma.$executeRawUnsafe(`UPDATE "JourneyReminder" SET "droppedAt" = COALESCE("droppedAt", "lastSeenAt"), "nextCheckAt" = to_timestamp(0) WHERE status = 'active'`); return rem.installReminderTick(now); };
const reminderById = (id: string) => prisma.journeyReminder.findUniqueOrThrow({ where: { id } });
const PAN = 'ABCPE1234F';
async function giveVerifiedPan(userId: string, first = 'PRIYA') {
  await prisma.panRecord.deleteMany({ where: { panHash: panHash(PAN) } });
  await prisma.panRecord.create({ data: { panHash: panHash(PAN), status: 'verified', verified: true, category: 'Individual', aadhaarLinked: true, verifiedAt: new Date(), ownerUserId: userId,
    dataEnc: encryptJson({ prefill: { fullName: `${first} SHARMA`, firstName: first, lastName: 'SHARMA', pincode: '500034', city: 'Hyderabad' } }) } });
  await prisma.user.update({ where: { id: userId }, data: userPanData(PAN) });
}

// clean slate
await prisma.journeyReminder.deleteMany();
await prisma.user.deleteMany({ where: { phone: { startsWith: '93' } } });
await prisma.user.deleteMany({ where: { phone: { startsWith: '95' } } });
await prisma.customer.deleteMany({ where: { phone: { startsWith: '93' } } });
await prisma.appClick.deleteMany({ where: { token: { startsWith: 'TST' } } });
await prisma.referralCode.deleteMany({ where: { code: 'FRIENDK7' } });
await prisma.panRecord.deleteMany({ where: { panHash: panHash(PAN) } });

/* ───────────── S: arming and pings ───────────── */
await t('S01', 'arming', 'website OTP verify arms a reminder (cycle 1, 8-char token, otp_only)', async () => {
  const w = await webLogin(); const r = w.reminder!;
  assert.equal(r.cycle, 1); assert.equal(r.token.length, 8); assert.match(r.token, /^[A-Z0-9]+$/); assert.equal(r.lastStep, 'otp_only'); assert.equal(r.status, 'active'); assert.equal(r.phone, w.phone);
});
await t('S02', 'arming', 'logging in twice does not create a second active reminder', async () => {
  const w = await webLogin(); const rq = await post('/api/website/auth/otp/request', { phone: w.phone });
  await post('/api/website/auth/otp/verify', { phone: w.phone, code: rq.body.data.devOtp }); await new Promise((r) => setTimeout(r, 400));
  assert.equal(await prisma.journeyReminder.count({ where: { userId: w.user.id, status: 'active' } }), 1);
});
await t('S03', 'arming', 'the app-store reviewer account (fixed OTP) logs in on the website but is never armed', async () => {
  const phone = process.env.REVIEW_LOGIN_PHONE!; assert.ok(phone && process.env.REVIEW_LOGIN_OTP, 'suite must run with REVIEW_LOGIN_PHONE/OTP set');
  await post('/api/website/auth/otp/request', { phone });
  const vf = await post('/api/website/auth/otp/verify', { phone, code: process.env.REVIEW_LOGIN_OTP });
  assert.equal(vf.status, 200, 'reviewer login itself still works'); await new Promise((r) => setTimeout(r, 400));
  const u = await prisma.user.findUniqueOrThrow({ where: { phone } });
  assert.equal(await prisma.journeyReminder.count({ where: { userId: u.id } }), 0);
});
await t('S04', 'arming', 'a visitor who is already an app user is not armed', async () => {
  const phone = newPhone(); const u = await prisma.user.create({ data: { phone, phoneVerified: true } });
  const c = await prisma.customer.create({ data: { phone, userId: u.id } });
  await prisma.journeyEvent.create({ data: { customerId: c.id, channel: 'app', name: 'otp_verified' } });
  assert.equal(await rem.armInstallReminder(u), null);
});
await t('S05', 'arming', 'a finished schedule or an installed visitor is not armed again', async () => {
  const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { status: 'stopped', stopReason: 'installed' } });
  assert.equal(await rem.armInstallReminder(w.user), null);
  const w2 = await webLogin(); await prisma.journeyReminder.update({ where: { id: w2.reminder!.id }, data: { status: 'completed' } });
  assert.equal(await rem.armInstallReminder(w2.user), null);
});
await t('S06', 'arming', 'a returning visitor gets at most 3 cycles', async () => {
  const w = await webLogin(); let r = w.reminder!;
  for (let c = 1; c <= 3; c++) {
    await prisma.journeyReminder.update({ where: { id: r.id }, data: { droppedAt: new Date() } });
    const next = await rem.armInstallReminder(w.user);
    if (c < 3) { assert.ok(next && next.cycle === c + 1, `cycle ${c + 1} should start`); r = next!; } else assert.equal(next, null, 'no 4th cycle');
  }
});
await t('S07', 'ping', 'POST /api/website/activity with a session updates lastSeenAt', async () => {
  const w = await webLogin(); const before = (await reminderById(w.reminder!.id)).lastSeenAt;
  await new Promise((r) => setTimeout(r, 30)); const res = await post('/api/website/activity', {}, w.token);
  assert.equal(res.status, 200); assert.ok((await reminderById(w.reminder!.id)).lastSeenAt > before);
});
await t('S08', 'ping', 'the ping needs a valid bearer token (401 without, 401 with garbage)', async () => {
  assert.equal((await post('/api/website/activity', {})).status, 401);
  assert.equal((await post('/api/website/activity', {}, 'garbage')).status, 401);
});
await t('S09', 'ping', '60 pings in a row are never rate-limited and do not use up the login limit', async () => {
  const w = await webLogin(); let limited = 0; const same = { 'x-forwarded-for': '10.77.0.1' };
  const pingSame = () => j('/api/website/activity', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${w.token}`, ...same }, body: '{}' });
  for (let i = 0; i < 60; i++) if ((await pingSame()).status === 429) limited++;
  assert.equal(limited, 0, `${limited} pings were rate-limited`);
  const rq = await j('/api/website/auth/otp/request', { method: 'POST', headers: { 'content-type': 'application/json', ...same }, body: JSON.stringify({ phone: newPhone() }) });
  assert.equal(rq.status, 200, 'login still allowed from the same IP after 60 pings');
});
await t('S10', 'ping', 'a ping from a user with no reminder is a harmless 200', async () => {
  const phone = newPhone(); const u = await prisma.user.create({ data: { phone, phoneVerified: true } });
  const { signAccess } = await import(`${ROOT}/lib/jwt.js`);
  assert.equal((await post('/api/website/activity', {}, signAccess({ sub: u.id, phone }))).status, 200);
});

/* ───────────── S: drop-off detection ───────────── */
await t('S11', 'idle', 'idle 5+ minutes saves droppedAt; before 5 minutes it does not', async () => {
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { lastSeenAt: new Date(OPEN.getTime() - 4 * 60_000) } });
  await tickRaw(OPEN); assert.equal((await reminderById(id)).droppedAt, null);
  await prisma.journeyReminder.update({ where: { id }, data: { lastSeenAt: new Date(OPEN.getTime() - 5 * 60_000) } });
  await tickRaw(OPEN); assert.ok((await reminderById(id)).droppedAt);
});
await t('S12', 'idle', 'last step is derived: otp_only → pan_done (PAN on file) → application_started', async () => {
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { lastSeenAt: new Date(OPEN.getTime() - 10 * 60_000), startAt: new Date(OPEN.getTime() + 24 * 3_600_000) } });
  await tickAll(OPEN); assert.equal((await reminderById(id)).lastStep, 'otp_only');
  await giveVerifiedPan(w.user.id); await tickAll(OPEN); assert.equal((await reminderById(id)).lastStep, 'pan_done');
  await prisma.loanApplication.create({ data: { userId: w.user.id, ref: `SL-${Date.now()}`, amount: 100000, status: 'draft' } });
  await tickAll(OPEN); assert.equal((await reminderById(id)).lastStep, 'application_started');
});

/* ───────────── S: schedule through the job (log-only) ───────────── */
await t('S13', 'schedule', 'a full simulated week logs exactly 20 steps in the right order, SMS/WhatsApp alternating', async () => {
  hits.length = 0;
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
  for (let m = 0; m <= 8 * 24 * 60; m += 15) await tickAll(new Date(OPEN.getTime() + m * 60_000));
  const r = await reminderById(id); const h = r.history as any[];
  assert.equal(r.status, 'completed'); assert.equal(h.length, 20);
  assert.deepEqual(h.map((x) => x.step), [...Array(20).keys()]);
  assert.deepEqual(h.map((x) => x.channel), Array.from({ length: 20 }, (_, i) => (i % 2 ? 'whatsapp' : 'sms')));
  assert.ok(h.every((x) => x.outcome === 'logged' || x.outcome === 'skipped'));
  assert.equal(hits.length, 0, 'log-only mode must not contact any provider');
});
await t('S14', 'schedule', 'no two logged messages are closer than 30 minutes, and none outside 09:00-21:00 IST', async () => {
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: IST(19, 30) } }); // starts in the evening so the night matters
  for (let m = 0; m <= 8 * 24 * 60; m += 5) await tickAll(new Date(IST(19, 30).getTime() + m * 60_000));
  const h = (await reminderById(id)).history as any[]; const sent = h.filter((x) => x.outcome === 'logged');
  assert.ok(sent.length >= 10, `only ${sent.length} logged`);
  for (let i = 1; i < sent.length; i++) assert.ok(new Date(sent[i].at).getTime() - new Date(sent[i - 1].at).getTime() >= 30 * 60_000 - 1, `gap too small at ${i}`);
  for (const x of sent) { const ist = new Date(new Date(x.at).getTime() + 5.5 * 3_600_000); const min = ist.getUTCHours() * 60 + ist.getUTCMinutes(); assert.ok(min >= 540 && min < 1260, `sent at IST minute ${min}`); }
});
await t('S15', 'schedule', 'a step due at night waits for 09:00 and then goes out (not skipped)', async () => {
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: IST(22, 0), stepsSent: 0 } });
  await tickAll(IST(22, 5)); assert.equal((await reminderById(id)).stepsSent, 0, 'held in quiet hours');
  await tickAll(IST(8, 59, 21)); assert.equal((await reminderById(id)).stepsSent, 0, 'still held at 08:59');
  await tickAll(IST(9, 1, 21)); const r = await reminderById(id);
  assert.equal(r.stepsSent, 1); assert.equal((r.history as any[])[0].outcome, 'logged');
});
await t('S16', 'schedule', 'a step more than 14h late is skipped, not sent', async () => {
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: new Date(OPEN.getTime() - 15 * 3_600_000), stepsSent: 0 } });
  await tickAll(OPEN); const h = (await reminderById(id)).history as any[];
  assert.equal(h[0].outcome, 'skipped'); assert.equal(h[0].reason, 'too_late');
});
await t('S17', 'schedule', 'two workers ticking at once handle each step exactly once', async () => {
  const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
  await Promise.all([tickAll(OPEN), tickAll(OPEN), tickAll(OPEN)]);
  const r = await reminderById(id); assert.equal(r.stepsSent, 1); assert.equal((r.history as any[]).length, 1);
});

/* ───────────── S: stop rules ───────────── */
const stopCase = async (id: string, title: string, arrange: (w: Awaited<ReturnType<typeof webLogin>>) => Promise<void>, reason: string) =>
  t(id, 'stop', title, async () => {
    const w = await webLogin(); await arrange(w); await tickAll(OPEN);
    const r = await reminderById(w.reminder!.id); assert.equal(r.status, 'stopped'); assert.equal(r.stopReason, reason); assert.equal(r.stepsSent, 0, 'nothing is sent once stopped');
  });
await stopCase('S18', 'install matched through the link stops it', async (w) => { await prisma.appClick.create({ data: { token: 'TSTCLICK001', ref: w.reminder!.token, kind: 'campaign', platform: 'ios', ipHash: 'x', uaHash: 'y', status: 'matched', matchedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } }); }, 'installed');
await stopCase('S19', 'logging in to the app stops it', async (w) => { const c = await prisma.customer.upsert({ where: { phone: w.phone }, update: {}, create: { phone: w.phone, userId: w.user.id } }); await prisma.journeyEvent.create({ data: { customerId: c.id, channel: 'app', name: 'otp_verified', occurredAt: new Date(OPEN.getTime() - 1000) } }); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { createdAt: new Date(OPEN.getTime() - 3_600_000) } }); }, 'app_login');
await stopCase('S20', 'an application that reached the lender stops it', async (w) => { await prisma.loanApplication.create({ data: { userId: w.user.id, ref: `SL-${Date.now()}`, amount: 100000, status: 'handoff' } }); }, 'application_finished');
await stopCase('S21', 'a do-not-contact customer stops it', async (w) => { await prisma.customer.upsert({ where: { phone: w.phone }, update: { currentStage: 'lost' }, create: { phone: w.phone, userId: w.user.id, currentStage: 'lost' } }); }, 'do_not_contact');
await t('S22', 'stop', 'an application that is only a draft does NOT stop it', async () => {
  const w = await webLogin(); await prisma.loanApplication.create({ data: { userId: w.user.id, ref: `SL-${Date.now()}`, amount: 100000, status: 'offers_ready' } });
  await tickAll(OPEN); assert.equal((await reminderById(w.reminder!.id)).status, 'active');
});
await t('S23', 'stop', 'returning after being dropped ends the run and starts cycle 2 five minutes after the return', async () => {
  const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { droppedAt: new Date(OPEN.getTime() - 60_000), stepsSent: 2 } });
  await rem.pingInstallReminder(w.user, OPEN);
  const old = await reminderById(w.reminder!.id); assert.equal(old.stopReason, 'returned');
  const next = await prisma.journeyReminder.findFirstOrThrow({ where: { userId: w.user.id, status: 'active' } });
  assert.equal(next.cycle, 2); assert.equal(next.startAt.getTime(), OPEN.getTime() + 5 * 60_000); assert.equal(next.stepsSent, 0);
});

/* ───────────── S: real-send path against fake providers ───────────── */
await upsertProviderConfig('voxvalley', { enabled: true, settings: {
  smsUrl: `${MOCK}/sms`, projectId: 'PRJTEST', smsSender: 'PTSLA', smsTemplateId: '111', smsBody: 'unused',
  installSmsTemplateId: '999', installSmsBody: 'Continue your SwiftLoan application: {link} -PurpleTalk',
  installWhatsapp: { template: 'install_link', language: 'en', placeholders: ['{name}', '{link}'] },
  baseUrl: MOCK, sendPath: '/api/v1/whatsapp/send', sender: '919999999999',
}, secrets: { authToken: 'tok' } });
const isolate = async () => { await prisma.journeyReminder.deleteMany(); hits.length = 0; };
const sendMode = (on: boolean) => { if (on) process.env.INSTALL_REMINDER_SEND = 'true'; else delete process.env.INSTALL_REMINDER_SEND; };
await t('S24', 'send', 'send mode: SMS carries the DLT template id and the /dl?ref= link; WhatsApp carries name + link', async () => {
  sendMode(true); hits.length = 0; smsMode = 'ok';
  await isolate();
  try {
    const w = await webLogin(); await giveVerifiedPan(w.user.id, 'PRIYA'); await rem.markPanVerified(w.user.id, 'PRIYA');
    const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * 60_000));
    const sms = hitsFor('/sms'); const wa = hitsFor('/api/v1/whatsapp');
    assert.equal(sms.length, 1); assert.equal(wa.length, 1);
    assert.equal(sms[0].body.template_id, '999'); assert.equal(sms[0].body.from, 'PTSLA');
    assert.ok(sms[0].body.body.includes(`/dl?ref=${w.reminder!.token}`), 'SMS link'); assert.ok(!sms[0].body.body.includes('{link}'));
    assert.equal(sms[0].body.to, `+91${w.phone}`);
    const comps = JSON.stringify(wa[0].body); assert.ok(comps.includes('Priya'), 'first name is title-cased for the greeting'); assert.ok(comps.includes(`/dl?ref=${w.reminder!.token}`)); assert.ok(comps.includes('install_link'));
    const h = (await reminderById(id)).history as any[]; assert.deepEqual(h.map((x) => x.outcome), ['sent', 'sent']);
  } finally { sendMode(false); }
});
await t('S25', 'send', 'a provider failure is recorded as failed and never retried', async () => {
  sendMode(true); hits.length = 0; smsMode = 'fail';
  await isolate();
  try {
    const w = await webLogin(); const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    for (let i = 0; i < 4; i++) await tickAll(new Date(OPEN.getTime() + i * 60_000));
    assert.equal(hitsFor('/sms').length, 1, 'exactly one attempt');
    const r = await reminderById(id); assert.equal((r.history as any[])[0].outcome, 'failed'); assert.equal(r.stepsSent, 1); assert.equal(r.lastSentAt, null, 'a failed send must not count as sent');
  } finally { sendMode(false); smsMode = 'ok'; }
});
await t('S26', 'send', 'a missing template is skipped with a reason, nothing is sent', async () => {
  sendMode(true); hits.length = 0;
  await isolate();
  try {
    await upsertProviderConfig('voxvalley', { settings: { installSmsTemplateId: '' } });
    const w = await webLogin(); const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    await tickAll(OPEN); assert.equal(hitsFor('/sms').length, 0);
    const e = ((await reminderById(id)).history as any[])[0]; assert.equal(e.outcome, 'skipped'); assert.match(e.reason, /template/);
  } finally { sendMode(false); await upsertProviderConfig('voxvalley', { settings: { installSmsTemplateId: '999' } }); }
});
await t('S27', 'send', 'send mode with the integration disabled sends nothing and skips cleanly', async () => {
  sendMode(true); hits.length = 0;
  await isolate();
  try {
    await upsertProviderConfig('voxvalley', { enabled: false });
    const w = await webLogin(); const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * 60_000));
    assert.equal(hits.length, 0); assert.ok(((await reminderById(id)).history as any[]).every((x) => x.outcome === 'skipped'));
  } finally { sendMode(false); await upsertProviderConfig('voxvalley', { enabled: true }); }
});
await t('S28', 'send', 'the WhatsApp step is skipped (not sent blank) when the first name is unknown only if the template needs it', async () => {
  sendMode(true); hits.length = 0;
  await isolate();
  try {
    const w = await webLogin(); const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * 60_000));
    const wa = hitsFor('/api/v1/whatsapp'); assert.equal(wa.length, 1);
    assert.ok(JSON.stringify(wa[0].body).includes('there'), 'falls back to a neutral greeting, never "undefined"'); assert.ok(!JSON.stringify(wa[0].body).includes('undefined'));
  } finally { sendMode(false); }
});
await t('S29', 'overlap', 'the stuck-stage SMS stands down while a reminder is active, and resumes after it stops', async () => {
  hits.length = 0; sendMode(false);
  const w = await webLogin(); const c = await prisma.customer.upsert({ where: { phone: w.phone }, update: {}, create: { phone: w.phone, userId: w.user.id } });
  const rule: any = { name: 'test', triggerEvent: 'otp_verified', expectedEvent: 'eligibility_started' };
  const tpl = { templateId: '111', body: 'stall text' };
  const a = await sendStallSms(rule, { id: c.id, phone: w.phone, currentStage: c.currentStage }, tpl, 30, `stall:test:${c.id}:1`, OPEN);
  assert.equal(a, false); assert.equal(hitsFor('/sms').length, 0);
  await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { status: 'stopped', stopReason: 'installed' } });
  const b = await sendStallSms(rule, { id: c.id, phone: w.phone, currentStage: c.currentStage }, tpl, 30, `stall:test:${c.id}:2`, OPEN);
  assert.equal(b, true); assert.equal(hitsFor('/sms').length, 1);
});

/* ───────────── S: link, claim, resume ───────────── */
await t('S30', 'link', '/dl?ref=TOKEN logs an AppClick with the ref; iOS gets the clipboard token page, Android a redirect', async () => {
  const w = await webLogin(); const tok = w.reminder!.token;
  const ios = await get(`/dl?ref=${tok}`, undefined, { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  assert.equal(ios.status, 200); const m = ios.text.match(/swiftloan-ref:([A-Z0-9]{12})/); assert.ok(m, 'clipboard token in the iOS page');
  const click = await prisma.appClick.findUnique({ where: { token: m![1] } }); assert.equal(click?.ref, tok); assert.equal(click?.platform, 'ios');
  const and = await get(`/dl?ref=${tok}`, undefined, { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/120 Mobile' });
  assert.ok([301, 302, 307].includes(and.status)); assert.ok(and.headers.get('location'));
});
await t('S31', 'claim', 'a clipboard-matched install returns the resume block with name, phone and last step', async () => {
  const w = await webLogin(); await giveVerifiedPan(w.user.id, 'PRIYA'); await rem.markPanVerified(w.user.id, 'PRIYA');
  await prisma.appClick.create({ data: { token: 'TSTCLICK002', ref: w.reminder!.token, kind: 'campaign', platform: 'ios', ipHash: 'a', uaHash: 'b', expiresAt: new Date(Date.now() + 3_600_000) } });
  const c = await post('/api/attribution/claim', { platform: 'ios', clipboard: 'swiftloan-ref:TSTCLICK002' });
  assert.equal(c.body.data.matched, true); assert.deepEqual(c.body.data.resume, { token: w.reminder!.token, first_name: 'Priya', phone: w.phone, last_step: 'pan_done' });
});
await t('S32', 'claim', 'the Play-referrer path (Android) also returns the resume block', async () => {
  const w = await webLogin(); await prisma.appClick.create({ data: { token: 'TSTCLICK003', ref: w.reminder!.token, kind: 'campaign', platform: 'android', ipHash: 'a', uaHash: 'b', expiresAt: new Date(Date.now() + 3_600_000) } });
  const c = await post('/api/attribution/claim', { platform: 'android', install_referrer: 'click_id=TSTCLICK003&ref=' + w.reminder!.token });
  assert.equal(c.body.data.method, 'play_referrer'); assert.equal(c.body.data.resume.phone, w.phone); assert.equal(c.body.data.resume.last_step, 'otp_only');
});
await t('S33', 'claim', 'a click can be claimed once; the second claim gets no resume block', async () => {
  const w = await webLogin(); await prisma.appClick.create({ data: { token: 'TSTCLICK004', ref: w.reminder!.token, kind: 'campaign', platform: 'ios', ipHash: 'a', uaHash: 'b', expiresAt: new Date(Date.now() + 3_600_000) } });
  await post('/api/attribution/claim', { platform: 'ios', clipboard: 'swiftloan-ref:TSTCLICK004' });
  const c = await post('/api/attribution/claim', { platform: 'ios', clipboard: 'swiftloan-ref:TSTCLICK004' }); assert.equal(c.body.data.matched, false); assert.equal(c.body.data.resume ?? null, null);
});
await t('S34', 'claim', 'a same-IP guess is attributed but never carries a phone or a name', async () => {
  const w = await webLogin(); const ip = '10.55.1.9';
  await prisma.appClick.create({ data: { token: 'TSTCLICK005', ref: w.reminder!.token, kind: 'campaign', platform: 'android', ipHash: hashClient(ip), uaHash: 'b', osVersion: '14', expiresAt: new Date(Date.now() + 3_600_000) } });
  const c = await j('/api/attribution/claim', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ platform: 'android', os_version: '14' }) });
  assert.equal(c.body.data.matched, true, 'the IP match must actually happen so the rule is exercised'); assert.equal(c.body.data.method, 'ip_window');
  assert.equal(c.body.data.resume ?? null, null); assert.ok(!JSON.stringify(c.body).includes(w.phone));
});
await t('S35', 'claim', 'unknown or malformed tokens and refs are ignored (no resume, no error)', async () => {
  for (const clip of ['swiftloan-ref:NOSUCHCLICK', 'hello', 'swiftloan-ref:x', '']) { const c = await post('/api/attribution/claim', { platform: 'ios', clipboard: clip }); assert.equal(c.status, 200); assert.equal(c.body.data.resume ?? null, null); }
  await prisma.appClick.create({ data: { token: 'TSTCLICK006', ref: "'; DROP TABLE x;--", kind: 'campaign', platform: 'ios', ipHash: 'a', uaHash: 'b', expiresAt: new Date(Date.now() + 3_600_000) } });
  const c = await post('/api/attribution/claim', { platform: 'ios', clipboard: 'swiftloan-ref:TSTCLICK006' }); assert.equal(c.status, 200); assert.equal(c.body.data.resume ?? null, null);
  assert.equal((await post('/api/attribution/claim', { platform: 'windows' })).status, 400);
});
await t('S36', 'claim', 'a referral-code link (friend referral) still works and carries no resume block', async () => {
  const w = await webLogin(); const owner = w.user;
  await prisma.referralCode.deleteMany({ where: { OR: [{ code: 'FRIENDK7' }, { userId: owner.id }] } });
  await prisma.referralCode.create({ data: { userId: owner.id, code: 'FRIENDK7' } });
  await prisma.appClick.create({ data: { token: 'TSTCLICK007', ref: 'FRIENDK7', kind: 'referral', platform: 'ios', ipHash: 'a', uaHash: 'b', expiresAt: new Date(Date.now() + 3_600_000) } });
  const c = await post('/api/attribution/claim', { platform: 'ios', clipboard: 'swiftloan-ref:TSTCLICK007' });
  assert.equal(c.body.data.referral.code, 'FRIENDK7'); assert.equal(c.body.data.resume ?? null, null);
});
await t('S37', 'resume', 'GET /api/journey/resume: needs auth, returns only the caller\'s own visit, and nothing when stale', async () => {
  assert.equal((await get('/api/journey/resume')).status, 401);
  const a = await webLogin(); const b = await webLogin();
  const ra = await get('/api/journey/resume', a.token); const rb = await get('/api/journey/resume', b.token);
  assert.equal(ra.body.data.resume.phone, a.phone); assert.equal(rb.body.data.resume.phone, b.phone); assert.notEqual(ra.body.data.resume.token, rb.body.data.resume.token);
  await prisma.journeyReminder.update({ where: { id: a.reminder!.id }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } });
  assert.equal((await get('/api/journey/resume', a.token)).body.data.resume, null);
  const none = await prisma.user.create({ data: { phone: newPhone(), phoneVerified: true } }); const { signAccess } = await import(`${ROOT}/lib/jwt.js`);
  assert.equal((await get('/api/journey/resume', signAccess({ sub: none.id, phone: none.phone }))).body.data.resume, null);
});
await t('S38', 'resume', 'the resume payload never contains a PAN, even with a PAN on file', async () => {
  const w = await webLogin(); await giveVerifiedPan(w.user.id); const r = await get('/api/journey/resume', w.token);
  assert.equal(r.body.data.resume.last_step, 'pan_done'); assert.ok(!r.text.includes(PAN));
});

/* ───────────── S: PAN on file ───────────── */
await t('S39', 'pan', '/kyc/pan/on-file: not on file → onFile false; verified → masked PAN + prefill; the PAN is never in the body', async () => {
  assert.equal((await get('/api/kyc/pan/on-file')).status, 401);
  const w = await webLogin(); assert.equal((await get('/api/kyc/pan/on-file', w.token)).body.data.onFile, false);
  await giveVerifiedPan(w.user.id, 'ASHA'); const r = await get('/api/kyc/pan/on-file', w.token);
  assert.equal(r.body.data.onFile, true); assert.equal(r.body.data.maskedPan, 'XXXXXX' + PAN.slice(6)); assert.match(r.body.data.maskedPan, /^X{6}\d{3}[A-Z]$/);
  assert.equal(r.body.data.prefill.firstName, 'ASHA'); assert.equal(r.body.data.aadhaarLinked, true); assert.ok(!r.text.includes(PAN)); assert.ok(!r.text.includes(PAN.slice(0, 6)));
});
await t('S40', 'pan', 'a stored PAN without a verified record (cache gone) → onFile false, so the app falls back to step 1', async () => {
  const w = await webLogin(); await prisma.user.update({ where: { id: w.user.id }, data: userPanData('ZZZPZ9999Z') });
  assert.equal((await get('/api/kyc/pan/on-file', w.token)).body.data.onFile, false);
});
await t('S41', 'pan', 'user B cannot read user A\'s PAN details', async () => {
  const a = await webLogin(); await giveVerifiedPan(a.user.id); const b = await webLogin();
  assert.equal((await get('/api/kyc/pan/on-file', b.token)).body.data.onFile, false);
});
await t('S42', 'pan', 'PATCH /applications/:id {usePanOnFile:true} attaches the encrypted PAN and moves it to pan_pending', async () => {
  const w = await webLogin(); await giveVerifiedPan(w.user.id);
  const created = await post('/api/applications', { amount: 100000, tenureMonths: 12, loanType: 'personal' }, w.token); assert.equal(created.status, 201);
  const id = created.body.application.id;
  const patched = await j(`/api/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${w.token}` }, body: JSON.stringify({ usePanOnFile: true }) });
  assert.equal(patched.status, 200); assert.equal(patched.body.application.status, 'pan_pending'); assert.ok(!patched.text.includes(PAN));
  const row = await prisma.loanApplication.findUnique({ where: { id }, select: { panEnc: true } }); assert.ok(row?.panEnc, 'encrypted PAN stored'); assert.ok(!row!.panEnc!.includes(PAN));
});
await t('S43', 'pan', 'usePanOnFile with no PAN on file attaches nothing (no crash, status unchanged)', async () => {
  const w = await webLogin(); const created = await post('/api/applications', { amount: 100000, tenureMonths: 12, loanType: 'personal' }, w.token);
  const id = created.body.application.id;
  const patched = await j(`/api/applications/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${w.token}` }, body: JSON.stringify({ usePanOnFile: true }) });
  assert.equal(patched.status, 200); assert.equal(patched.body.application.status, 'draft');
});

/* ───────────── S: privacy and housekeeping ───────────── */
await t('S44', 'privacy', 'deleting the account removes the reminder row (and its phone / name)', async () => {
  const w = await webLogin(); await rem.markPanVerified(w.user.id, 'MEERA');
  const del = await j('/api/users/me', { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${w.token}` }, body: JSON.stringify({ reason: 'privacy', source: 'website' }) });
  assert.equal(del.status, 200, del.text.slice(0, 120));
  assert.equal(await prisma.journeyReminder.count({ where: { OR: [{ userId: w.user.id }, { phone: w.phone }] } }), 0);
});
await t('S45', 'privacy', 'reminder history, firstName and logs never hold a PAN', async () => {
  const rows = await prisma.journeyReminder.findMany(); const blob = JSON.stringify(rows);
  assert.ok(!blob.includes(PAN)); assert.ok(!/[A-Z]{5}\d{4}[A-Z]/.test(blob.replace(/SL-\d+/g, '')), 'no PAN-shaped string in any reminder row');
});
await t('S46', 'privacy', 'markPanVerified trims and caps the name, and ignores blanks', async () => {
  const w = await webLogin(); await rem.markPanVerified(w.user.id, '   '); assert.equal((await reminderById(w.reminder!.id)).firstName, null);
  await rem.markPanVerified(w.user.id, 'X'.repeat(200)); assert.equal((await reminderById(w.reminder!.id)).firstName!.length, 60);
});
await t('S47', 'job', 'the scan survives one bad row (a corrupt history) and still handles the others', async () => {
  hits.length = 0; const bad = await webLogin(); const good = await webLogin();
  await prisma.journeyReminder.updateMany({ where: { id: { in: [bad.reminder!.id, good.reminder!.id] } }, data: { startAt: OPEN } });
  await prisma.$executeRawUnsafe(`UPDATE "JourneyReminder" SET history='"not-an-array"'::jsonb WHERE id='${bad.reminder!.id}'`);
  await tickAll(OPEN); assert.equal((await reminderById(good.reminder!.id)).stepsSent, 1);
});
await t('S48', 'job', 'the install-reminder job is registered, and is switched off by NUDGES_DISABLED', async () => {
  const src = fs.readFileSync(`${ROOT}/jobs/tracking.jobs.ts`, 'utf8');
  assert.ok(/name: 'install-reminder'/.test(src)); assert.ok(/NUDGE_JOBS = new Set\([^)]*'install-reminder'/.test(src));
});
await t('S49', 'schema', 'the migration SQL and the Prisma model agree (no drift for JourneyReminder)', async () => {
  const cols: any[] = await prisma.$queryRawUnsafe(`select column_name from information_schema.columns where table_name='JourneyReminder'`);
  const have = new Set(cols.map((c) => c.column_name));
  const dir = `${ROOT}/../prisma/migrations`;
  const mig = fs.readdirSync(dir).filter((d: string) => /journey_reminder/.test(d)).map((d: string) => fs.readFileSync(`${dir}/${d}/migration.sql`, 'utf8')).join('\n');
  for (const c of have) assert.ok(mig.includes(`"${c}"`), `migration is missing column ${c}`);
  assert.ok(have.size >= 18);
});


await t('S50', 'send', 'flipping log-only → send with a backlog: at most one message per reminder per tick, none for stale steps', async () => {
  sendMode(false); await isolate();
  const mk = async (startOffsetH: number) => { const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: new Date(OPEN.getTime() - startOffsetH * 3_600_000) } }); return w.reminder!.id; };
  const ids = [await mk(0), await mk(2), await mk(5), await mk(30), await mk(100)];
  // log-only ticks run for a while first (as they would for days before sending is enabled)
  for (let m = 0; m <= 60; m += 10) await tickAll(new Date(OPEN.getTime() - 3 * 3_600_000 + m * 60_000));
  hits.length = 0; sendMode(true);
  try {
    await tickAll(OPEN);
    const perPhone = new Map<string, number>(); for (const h of hits) { const to = String(h.body?.to ?? ''); perPhone.set(to, (perPhone.get(to) ?? 0) + 1); }
    for (const [to, n] of perPhone) assert.ok(n <= 1, `${to} got ${n} messages in one tick`);
    for (const id of ids) { const r = await reminderById(id); const last = (r.history as any[]).at(-1); if (last && last.outcome === 'sent') assert.ok(new Date(last.at).getTime() - sched.stepDueAt(r.startAt, sched.SCHEDULE_STEPS[last.step]).getTime() <= sched.MAX_LATE_MS, 'a stale step was sent'); }
  } finally { sendMode(false); }
});
await t('S51', 'send', 'send mode: two workers at the same moment produce one provider call per step', async () => {
  await isolate(); sendMode(true);
  try {
    const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
    await Promise.all([tickAll(OPEN), tickAll(OPEN), tickAll(OPEN)]);
    assert.equal(hitsFor('/sms').length, 1);
  } finally { sendMode(false); }
});
await t('S52', 'send', 'a customer on the schedule gets nothing from a different reminder row (no cross-talk between visitors)', async () => {
  await isolate(); sendMode(true);
  try {
    const a = await webLogin(); const b = await webLogin();
    await prisma.journeyReminder.updateMany({ where: { id: { in: [a.reminder!.id, b.reminder!.id] } }, data: { startAt: OPEN } });
    await prisma.journeyReminder.update({ where: { id: b.reminder!.id }, data: { status: 'stopped', stopReason: 'installed' } });
    await tickAll(OPEN);
    const to = hitsFor('/sms').map((h) => h.body.to); assert.deepEqual(to, [`+91${a.phone}`]);
  } finally { sendMode(false); }
});


await t('S53', 'contract', 'both resume responses are accepted by the APP\'s own parser and agree with each other (wire contract)', async () => {
  const { parseResume } = await import(`${APP_ROOT}src/utils/resume.ts`);
  const w = await webLogin(); await giveVerifiedPan(w.user.id, 'RIYA'); await rem.markPanVerified(w.user.id, 'RIYA');
  await prisma.appClick.create({ data: { token: 'TSTCLICK053', ref: w.reminder!.token, kind: 'campaign', platform: 'ios', ipHash: 'a', uaHash: 'b', expiresAt: new Date(Date.now() + 3_600_000) } });
  const claim = await post('/api/attribution/claim', { platform: 'ios', clipboard: 'swiftloan-ref:TSTCLICK053' });
  const login = await get('/api/journey/resume', w.token);
  const a = parseResume(claim.body.data.resume, 'link'); const b = parseResume(login.body.data.resume, 'login');
  assert.ok(a, 'claim payload rejected by the app parser'); assert.ok(b, 'login payload rejected by the app parser');
  assert.deepEqual({ ...a, source: 'x' }, { ...b, source: 'x' }); assert.equal(b!.firstName, 'Riya'); assert.equal(b!.lastStep, 'pan_done'); assert.equal(b!.phone, w.phone);
  assert.deepEqual(Object.keys(claim.body.data.resume).sort(), Object.keys(login.body.data.resume).sort());
});


/* ───────────── S: scale and scheduling of the job itself ───────────── */
const bulk = async (n: number, nextCheckAt: Date, startAt: Date = OPEN) => {
  const phones = Array.from({ length: n }, (_, i) => `95${String(10000000 + i)}`.slice(0, 10));
  await prisma.user.deleteMany({ where: { phone: { startsWith: '95' } } });
  await prisma.user.createMany({ data: phones.map((phone) => ({ phone, phoneVerified: true })) });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: '95' } }, select: { id: true, phone: true } });
  await prisma.journeyReminder.createMany({ data: users.map((u: any, i: number) => ({ userId: u.id, phone: u.phone, token: `BULK${String(i).padStart(4, '0')}`, startAt, nextCheckAt, lastSeenAt: new Date(OPEN.getTime() - 60_000), droppedAt: new Date(OPEN.getTime() - 60_000) })) });
  return users.length;
};
await t('S54', 'scale', '450 due reminders are ALL handled in one tick (none starved behind the first 200)', async () => {
  await isolate(); const n = await bulk(450, new Date(OPEN.getTime() - 1000));
  const t0 = Date.now(); const res = await rem.installReminderTick(OPEN); const ms = Date.now() - t0;
  const untouched = await prisma.journeyReminder.count({ where: { token: { startsWith: 'BULK' }, stepsSent: 0 } });
  assert.equal(res.handled, n, `handled ${res.handled} of ${n}`); assert.equal(untouched, 0, `${untouched} reminders were never reached`);
  console.log(`   (450 reminders in ${ms} ms)`); assert.ok(ms < 120_000, 'one tick of 450 should finish well inside a minute-scale budget');
});
await t('S55', 'scale', 'rows that are not due are not even read (cost follows the work, not the number of active visitors)', async () => {
  await isolate(); await bulk(300, new Date(OPEN.getTime() + 3_600_000));
  const res = await rem.installReminderTick(OPEN); assert.equal(res.scanned, 0); assert.equal(res.handled, 0);
});
await t('S56', 'scale', 'after a step, the next check is the earlier of the next step and the idle check; after the drop it is the next step; quiet hours re-check in 15 min', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN, nextCheckAt: OPEN, lastSeenAt: OPEN } });
  await rem.installReminderTick(OPEN); let r = await reminderById(id);
  assert.equal(r.stepsSent, 0, 'still on the site: nothing is sent yet'); assert.equal(r.nextCheckAt.getTime(), OPEN.getTime() + 5 * 60_000, 'the only thing to check is the idle moment, lastSeen + 5 min');
  await rem.installReminderTick(new Date(OPEN.getTime() + 5 * 60_000)); r = await reminderById(id);
  assert.ok(r.droppedAt); assert.equal(r.stepsSent, 1, 'dropped off: the first message goes out now');
  assert.equal(r.nextCheckAt.getTime(), OPEN.getTime() + 35 * 60_000, 'next check is the WhatsApp step, 30 min after the drop');
  // a step due at night is held, and re-checked soon (not every minute)
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: IST(22, 0), stepsSent: 0, lastSentAt: null, nextCheckAt: IST(22, 0), droppedAt: IST(21, 50) } }); // dropped in SIMULATED time (before lastSeen), or it would look like a return
  await rem.installReminderTick(IST(22, 5)); r = await reminderById(id);
  assert.equal(r.stepsSent, 0); assert.equal(r.nextCheckAt.getTime(), IST(22, 5).getTime() + 15 * 60_000);
});
await t('S57', 'scale', 'a visitor who pings is not re-read every minute: the idle check moves out with their last activity', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN, nextCheckAt: OPEN, lastSeenAt: OPEN } });
  await rem.installReminderTick(OPEN);
  await prisma.journeyReminder.update({ where: { id }, data: { lastSeenAt: new Date(OPEN.getTime() + 4 * 60_000) } }); // visitor still active
  const res = await rem.installReminderTick(new Date(OPEN.getTime() + 5 * 60_000)); // idle check was due at +5 min
  assert.equal(res.scanned, 1); const r = await reminderById(id);
  assert.equal(r.droppedAt, null, 'still active: not dropped'); assert.equal(r.nextCheckAt.getTime(), OPEN.getTime() + 9 * 60_000, 'checks again 5 min after the LAST activity');
});
await t('S58', 'scale', 'a row that throws is pushed 5 minutes out and the tick still finishes (no repeat within the same tick)', async () => {
  await isolate(); const bad = await webLogin(); const good = await webLogin();
  await prisma.journeyReminder.updateMany({ where: { id: { in: [bad.reminder!.id, good.reminder!.id] } }, data: { startAt: OPEN, nextCheckAt: new Date(OPEN.getTime() - 1000), lastSeenAt: new Date(OPEN.getTime() - 60_000), droppedAt: new Date(OPEN.getTime() - 60_000) } });
  await prisma.$executeRawUnsafe(`UPDATE "JourneyReminder" SET history='"not-an-array"'::jsonb WHERE id='${bad.reminder!.id}'`);
  const t0 = Date.now(); const res = await rem.installReminderTick(OPEN); assert.ok(Date.now() - t0 < 15_000);
  assert.equal(res.scanned, 2); assert.equal((await reminderById(good.reminder!.id)).stepsSent, 1);
  const b = await reminderById(bad.reminder!.id); assert.ok(b.nextCheckAt.getTime() >= OPEN.getTime(), 'bad row is not left due');
});
await t('S59', 'arming', 'a new reminder is due immediately (cycle 1) or at its start time (later cycles)', async () => {
  await isolate(); const w = await webLogin(); const r1 = w.reminder!; assert.ok(r1.nextCheckAt.getTime() <= Date.now() + 1000);
  await prisma.journeyReminder.update({ where: { id: r1.id }, data: { droppedAt: new Date() } });
  const next = await rem.armInstallReminder(w.user, OPEN); assert.equal(next!.cycle, 2); assert.equal(next!.nextCheckAt.getTime(), next!.startAt.getTime());
});

await t('S79', 'idle', 'nobody is messaged while still on the website: the first message waits for the drop-off', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN, nextCheckAt: OPEN, lastSeenAt: OPEN } });
  for (const m of [0, 1, 3, 4]) { await tickRaw(new Date(OPEN.getTime() + m * 60_000)); const r = await reminderById(id); assert.equal(r.stepsSent, 0, `nothing sent at +${m} min`); assert.equal(r.droppedAt, null); }
  await tickRaw(new Date(OPEN.getTime() + 5 * 60_000)); const d = await reminderById(id);
  assert.ok(d.droppedAt); assert.equal(d.stepsSent, 1, 'sent once they have been idle 5 minutes');
});
await t('S80', 'idle', 'the schedule runs from the drop-off, not from the login: WhatsApp follows 30 minutes after the drop', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  // arrived long ago (login at OPEN-3h) but only left at OPEN
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: new Date(OPEN.getTime() - 3 * 3_600_000), nextCheckAt: OPEN, lastSeenAt: new Date(OPEN.getTime() - 5 * 60_000) } });
  await tickRaw(OPEN); let r = await reminderById(id);
  assert.equal(r.startAt.getTime(), OPEN.getTime(), 'the schedule starts at the drop'); assert.equal(r.stepsSent, 1);
  await tickRaw(new Date(OPEN.getTime() + 10 * 60_000)); r = await reminderById(id); assert.equal(r.stepsSent, 1, 'WhatsApp is not due 10 minutes after the drop');
  await tickRaw(new Date(OPEN.getTime() + 30 * 60_000)); r = await reminderById(id); assert.equal(r.stepsSent, 2, 'WhatsApp goes out 30 minutes after the drop');
});

/* ───────────── S: the installed app opened from the visitor's own link (swiftloan://onboard?token=…) ───────────── */
const resumeBy = (token: string, ip?: string) => j('/api/attribution/resume', { method: 'POST', headers: { 'content-type': 'application/json', ...(ip ? { 'x-forwarded-for': ip } : {}) }, body: JSON.stringify({ token }) });
await t('S81', 'link', 'a link\'s reference ID returns the saved journey, in the shape the app parses (same as the login payload)', async () => {
  const { parseResume } = await import(`${APP_ROOT}src/utils/resume.ts`);
  await isolate(); const w = await webLogin(); await giveVerifiedPan(w.user.id, 'MEERA'); await rem.markPanVerified(w.user.id, 'MEERA');
  const r = await resumeBy(w.reminder!.token); assert.equal(r.status, 200);
  const a = parseResume(r.body.data.resume, 'link'); const b = parseResume((await get('/api/journey/resume', w.token)).body.data.resume, 'login');
  assert.ok(a, 'the app\'s parser rejected the payload'); assert.deepEqual({ ...a, source: 'x' }, { ...b, source: 'x' });
  assert.equal(a!.phone, w.phone); assert.equal(a!.firstName, 'Meera'); assert.equal(a!.lastStep, 'pan_done');
});
await t('S82', 'link', 'a lower-case ID works; an unknown ID looks exactly like "nothing to resume"; a malformed one is refused', async () => {
  await isolate(); const w = await webLogin();
  const lower = await resumeBy(w.reminder!.token.toLowerCase()); assert.ok(lower.body.data.resume, 'lower-case ID should match');
  const unknown = await resumeBy('ZZZZZZZZ'); assert.equal(unknown.status, 200); assert.equal(unknown.body.data.resume, null); assert.equal(unknown.body.success, true);
  assert.ok(!JSON.stringify(unknown.body).includes(w.phone), 'an unknown ID must not leak anything');
  assert.equal((await resumeBy('ab')).status, 400, 'too short'); assert.equal((await resumeBy('A'.repeat(40))).status, 400, 'too long');
  assert.equal((await resumeBy('ab-cd-ef')).body.data.resume, null, 'characters outside A-Z0-9 never match');
});
await t('S83', 'link', 'an old visit (past the freshness window) is not offered', async () => {
  await isolate(); const w = await webLogin();
  await prisma.$executeRawUnsafe(`UPDATE "JourneyReminder" SET "createdAt" = now() - interval '400 days' WHERE id = '${w.reminder!.id}'`);
  const r = await resumeBy(w.reminder!.token); assert.equal(r.status, 200); assert.equal(r.body.data.resume, null);
});
await t('S84', 'link', 'guessing is throttled: after 20 lookups a minute from one address the next is refused (it returns a phone number)', async () => {
  await isolate(); const ip = '10.77.7.7'; let last = 200;
  for (let i = 0; i < 25; i++) { last = (await resumeBy('GUESS00' + (i % 10), ip)).status; if (last === 429) break; }
  assert.equal(last, 429, 'no throttle');
  assert.equal((await resumeBy('GUESS000', '10.77.7.8')).status, 200, 'another address is unaffected');
});
await t('S85', 'link', 'the lookup returns no more than the claim and login already do (no extra personal data)', async () => {
  await isolate(); const w = await webLogin(); await giveVerifiedPan(w.user.id, 'NEHA'); await rem.markPanVerified(w.user.id, 'NEHA');
  const r = await resumeBy(w.reminder!.token); const login = await get('/api/journey/resume', w.token);
  assert.deepEqual(Object.keys(r.body.data.resume).sort(), Object.keys(login.body.data.resume).sort());
  assert.deepEqual(Object.keys(r.body.data), ['resume']);
});

await t('S86', 'send', 'the approved template `install_app_resume` with the exact production setting sends name + link in that order', async () => {
  const { downloads } = await import(`${ROOT}/config/downloads.js`);
  sendMode(true); hits.length = 0; await isolate();
  try {
    await upsertProviderConfig('voxvalley', { enabled: true, settings: { installWhatsapp: JSON.parse('{"template":"install_app_resume","language":"en","placeholders":["{name}","{link}"]}') } });
    const w = await webLogin(); await giveVerifiedPan(w.user.id, 'RIYA'); await rem.markPanVerified(w.user.id, 'RIYA');
    await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * 60_000));
    const wa = hitsFor('/api/v1/whatsapp'); assert.equal(wa.length, 1, 'exactly one WhatsApp call');
    const b = wa[0].body; assert.equal(b.type, 'template'); assert.equal(b.template.name, 'install_app_resume'); assert.equal(b.template.language.code, 'en');
    const params = b.template.components[0].parameters.map((x: any) => x.text);
    assert.equal(params.length, 2, 'the template has exactly two variables'); assert.equal(params[0], 'Riya');
    assert.equal(params[1], `${downloads.publicBase}/dl?ref=${w.reminder!.token}`, 'the second variable is the personal link');
    assert.equal(b.template.components.length, 1, 'body only: the template has no button, so no button component');
  } finally { sendMode(false); await upsertProviderConfig('voxvalley', { settings: { installWhatsapp: { template: 'install_link', language: 'en', placeholders: ['{name}', '{link}'] } } }); }
});

await t('S87', 'send', 'SMS text with name, step and link: the gateway receives the registered wording with all three filled in', async () => {
  const { downloads } = await import(`${ROOT}/config/downloads.js`);
  sendMode(true); hits.length = 0; smsMode = 'ok'; await isolate();
  try {
    await upsertProviderConfig('voxvalley', { enabled: true, settings: {
      installSmsTemplateId: '555',
      installSmsBody: 'Dear {name} , your SwiftLoan loan application is incomplete at {step}. Please open the SwiftLoan app to continue where you left off :{link}. Team SwiftLoan\n-PurpleTalk IPL',
    } });
    const w = await webLogin(); await giveVerifiedPan(w.user.id, 'CHARAN'); await rem.markPanVerified(w.user.id, 'CHARAN');
    await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
    await tickAll(OPEN);
    const sms = hitsFor('/sms'); assert.equal(sms.length, 1);
    assert.equal(sms[0].body.template_id, '555');
    assert.equal(sms[0].body.body, `Dear Charan , your SwiftLoan loan application is incomplete at Pan verification. Please open the SwiftLoan app to continue where you left off :${downloads.publicBase}/dl?ref=${w.reminder!.token}. Team SwiftLoan\n-PurpleTalk IPL`);
    assert.ok(!/[{}]/.test(sms[0].body.body), 'no placeholder left in the text that is sent');
  } finally { sendMode(false); await upsertProviderConfig('voxvalley', { settings: { installSmsTemplateId: '999', installSmsBody: 'Continue your SwiftLoan application: {link} -PurpleTalk' } }); }
});
await t('S88', 'send', 'the step named in the SMS follows where the visitor got to, and an operator can rename the steps', async () => {
  sendMode(true); hits.length = 0; smsMode = 'ok'; await isolate();
  try {
    await upsertProviderConfig('voxvalley', { enabled: true, settings: { installSmsTemplateId: '555', installSmsBody: 'At {step}: {link}', installStepLabels: { otp_only: 'Mobile OTP' } } });
    const w = await webLogin(); // only the OTP was done
    await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
    await tickAll(OPEN);
    assert.ok(hitsFor('/sms')[0].body.body.startsWith('At Mobile OTP: '), 'renamed step is used');
    hits.length = 0; await isolate();
    const w2 = await webLogin(); await giveVerifiedPan(w2.user.id, 'ASHA'); await rem.markPanVerified(w2.user.id, 'ASHA');
    await prisma.journeyReminder.update({ where: { id: w2.reminder!.id }, data: { startAt: OPEN } });
    await tickAll(OPEN);
    assert.ok(hitsFor('/sms')[0].body.body.startsWith('At Pan verification: '), 'default label for a visitor past PAN');
  } finally { sendMode(false); await upsertProviderConfig('voxvalley', { settings: { installSmsTemplateId: '999', installSmsBody: 'Continue your SwiftLoan application: {link} -PurpleTalk', installStepLabels: {} } }); }
});

await t('S89', 'send', 'WhatsApp with the step: `install_app_resume_step` gets name, step and link in that order', async () => {
  const { downloads } = await import(`${ROOT}/config/downloads.js`);
  sendMode(true); hits.length = 0; await isolate();
  try {
    await upsertProviderConfig('voxvalley', { enabled: true, settings: { installWhatsapp: JSON.parse('{"template":"install_app_resume_step","language":"en","placeholders":["{name}","{step}","{link}"]}') } });
    const w = await webLogin(); await giveVerifiedPan(w.user.id, 'CHARAN'); await rem.markPanVerified(w.user.id, 'CHARAN');
    await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * 60_000));
    const wa = hitsFor('/api/v1/whatsapp'); assert.equal(wa.length, 1);
    const b = wa[0].body; assert.equal(b.template.name, 'install_app_resume_step');
    const params = b.template.components[0].parameters.map((x: any) => x.text);
    assert.deepEqual(params, ['Charan', 'Pan verification', `${downloads.publicBase}/dl?ref=${w.reminder!.token}`]);
  } finally { sendMode(false); await upsertProviderConfig('voxvalley', { settings: { installWhatsapp: { template: 'install_link', language: 'en', placeholders: ['{name}', '{link}'] } } }); }
});


/* ───────────── S: delivery status (webhook, recording, admin) ───────────── */
const { signAdminAccess } = await import(`${ROOT}/lib/adminJwt.js`);
const wa = await import(`${ROOT}/lib/whatsapp.js`);
const { recordSend } = await import(`${ROOT}/lib/messageDelivery.js`);
const { sendVoxSms } = await import(`${ROOT}/lib/voxSms.js`);
const KEY = 'delivery-test-key';
process.env.WHATSAPP_WEBHOOK_KEY = KEY;
const hook = (body: unknown, key: string | null = KEY, via: 'query' | 'header' = 'query') =>
  j(`/api/webhooks/whatsapp${via === 'query' && key !== null ? `?key=${encodeURIComponent(key)}` : ''}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(via === 'header' && key !== null ? { 'x-webhook-secret': key } : {}) }, body: JSON.stringify(body),
  });
const metaCb = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: '919300000001', ...extra }] } }] }],
});
const msgBy = (ref: string) => prisma.messageDelivery.findUnique({ where: { providerRef: ref } });
const sendWa = async (track: { kind?: string } = { kind: 'test' }, referenceId?: string) => {
  const r = await wa.sendWhatsAppTemplate({ phone: '9300000001', templateName: 'marketing_check_rate', language: 'en', placeholders: ['there'], referenceId, track });
  assert.equal(r.ok, true, 'send via fake gateway'); return r;
};
const adminToken = async () => {
  const email = 'delivery-test-admin@example.test';
  const a = await prisma.adminUser.upsert({ where: { email }, update: { active: true, lastActivityAt: new Date() }, create: { email, passwordHash: 'x', name: 'Delivery Test', role: 'admin', active: true, lastActivityAt: new Date() } });
  return signAdminAccess({ sub: a.id, email, role: 'admin' });
};
await prisma.messageDelivery.deleteMany();

await t('S60', 'delivery', 'webhook auth: no key or a wrong key → 401; the right key via ?key= or the header → 200; no key configured → 503', async () => {
  assert.equal((await hook(metaCb('auth-1', 'sent'), null)).status, 401);
  assert.equal((await hook(metaCb('auth-1', 'sent'), 'wrong')).status, 401);
  assert.equal((await hook(metaCb('auth-1', 'sent'), KEY, 'query')).status, 200);
  assert.equal((await hook(metaCb('auth-2', 'sent'), KEY, 'header')).status, 200);
  assert.equal(await prisma.messageDelivery.count({ where: { providerRef: { in: ['auth-1', 'auth-2'] } } }), 2);
  delete process.env.WHATSAPP_WEBHOOK_KEY;
  try { assert.equal((await hook(metaCb('auth-3', 'sent'))).status, 503); assert.equal(await prisma.messageDelivery.count({ where: { providerRef: 'auth-3' } }), 0); }
  finally { process.env.WHATSAPP_WEBHOOK_KEY = KEY; }
});
await t('S61', 'delivery', 'GET verification handshake echoes the challenge only for the right token', async () => {
  const ok = await j(`/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${KEY}&hub.challenge=CH4LL3NG3`); assert.equal(ok.status, 200); assert.equal(ok.text, 'CH4LL3NG3');
  assert.equal((await j('/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=x')).status, 403);
  assert.equal((await j('/api/webhooks/whatsapp')).status, 403);
});
await t('S62', 'delivery', 'every WhatsApp send is recorded as queued with its provider id, template, recipient and purpose', async () => {
  const r = await sendWa({ kind: 'admin' }, 'ref-62'); const row = await msgBy(r.messageId!);
  assert.ok(row); assert.equal(row!.channel, 'whatsapp'); assert.equal(row!.status, 'queued'); assert.equal(row!.kind, 'admin'); assert.equal(row!.phone, '9300000001');
  assert.equal(row!.template, 'marketing_check_rate'); assert.equal(row!.referenceId, 'ref-62'); assert.ok(row!.gtrid);
});
await t('S63', 'delivery', 'the callback URL sent with a message: none for a non-https base, the key-bearing URL for an https base, and an explicit setting wins', async () => {
  const last = () => hitsFor('/api/v1/whatsapp').at(-1)!.body;
  const saved = process.env.PUBLIC_BASE_URL;
  try {
    process.env.PUBLIC_BASE_URL = 'http://localhost:4000'; await sendWa(); assert.equal(last().callbackUrl, undefined, 'no callback for a non-https base');
    process.env.PUBLIC_BASE_URL = 'https://dev-api.example.test/'; await sendWa(); assert.equal(last().callbackUrl, `https://dev-api.example.test/api/webhooks/whatsapp?key=${KEY}`);
    await upsertProviderConfig('voxvalley', { settings: { callbackUrl: 'https://explicit.example.test/cb' } }); await sendWa(); assert.equal(last().callbackUrl, 'https://explicit.example.test/cb');
  } finally { await upsertProviderConfig('voxvalley', { settings: { callbackUrl: '' } }); if (saved === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = saved; }
});
await t('S64', 'delivery', 'a delivered callback moves the message to delivered and stamps the time', async () => {
  const r = await sendWa(); const res = await hook(metaCb(r.messageId!, 'delivered')); assert.equal(res.body.data.matched, 1);
  const row = await msgBy(r.messageId!); assert.equal(row!.status, 'delivered'); assert.ok(row!.deliveredAt); assert.equal((row!.events as any[]).length, 2);
});
await t('S65', 'delivery', 'sent → delivered → read moves forward, and a late older report never moves it back', async () => {
  const r = await sendWa(); const id = r.messageId!;
  await hook(metaCb(id, 'sent')); assert.equal((await msgBy(id))!.status, 'sent');
  await hook(metaCb(id, 'delivered')); assert.equal((await msgBy(id))!.status, 'delivered');
  await hook(metaCb(id, 'sent')); assert.equal((await msgBy(id))!.status, 'delivered', 'late "sent" ignored');
  await hook(metaCb(id, 'read')); const row = await msgBy(id); assert.equal(row!.status, 'read'); assert.ok(row!.readAt);
  await hook(metaCb(id, 'delivered')); assert.equal((await msgBy(id))!.status, 'read', 'late "delivered" ignored');
});
await t('S66', 'delivery', 'a failure keeps the provider\'s code and reason; a later delivery report supersedes it and clears them', async () => {
  const r = await sendWa(); const id = r.messageId!;
  await hook(metaCb(id, 'failed', { errors: [{ code: 131049, title: 'Message not delivered', message: 'engagement', error_data: { details: 'Not delivered to maintain healthy ecosystem engagement.' } }] }));
  let row = await msgBy(id); assert.equal(row!.status, 'failed'); assert.equal(row!.failureCode, '131049'); assert.match(row!.failureReason!, /healthy ecosystem engagement/); assert.ok(row!.failedAt);
  await hook(metaCb(id, 'delivered')); row = await msgBy(id); assert.equal(row!.status, 'delivered'); assert.equal(row!.failureCode, null); assert.equal(row!.failureReason, null);
});
await t('S67', 'delivery', 'a flat gateway-style callback matched by gtrid, with our reference id echoed back', async () => {
  const r = await sendWa({ kind: 'test' }); const row0 = await msgBy(r.messageId!);
  const res = await hook({ gtrid: row0!.gtrid, status: 'DELIVERED', referenceId: 'echo-67', to: '919300000001' });
  assert.equal(res.body.data.matched, 1); const row = await msgBy(r.messageId!); assert.equal(row!.status, 'delivered'); assert.equal(row!.referenceId, 'echo-67');
});
await t('S68', 'delivery', 'a callback for a message we never recorded still gets a row (nothing the provider reports is lost)', async () => {
  const res = await hook(metaCb('wamid.UNKNOWN68', 'failed', { errors: [{ code: 131026, title: 'Receiver is incapable of receiving this message' }] }));
  assert.equal(res.body.data.created, 1); const row = await msgBy('wamid.UNKNOWN68'); assert.equal(row!.kind, 'unknown'); assert.equal(row!.status, 'failed'); assert.equal(row!.failureCode, '131026'); assert.equal(row!.phone, '9300000001');
});
await t('S69', 'delivery', 'a body we cannot read is answered 200 and stored raw (so the real shape can be learned), never a 4xx or a crash', async () => {
  const before = await prisma.messageDelivery.count({ where: { kind: 'unparsed' } });
  for (const body of [{ hello: 'world', nested: { a: 1 } }, [], { statuses: 'oops' }]) { const res = await hook(body); assert.equal(res.status, 200); assert.equal(res.body.data.events, 0); }
  const rows = await prisma.messageDelivery.findMany({ where: { kind: 'unparsed' } }); assert.equal(rows.length - before, 3); assert.ok(JSON.stringify(rows[0].events).includes('hello'));
});
await t('S70', 'delivery', 'the same callback delivered twice is harmless (one row, same status)', async () => {
  const r = await sendWa(); const id = r.messageId!;
  await hook(metaCb(id, 'delivered')); await hook(metaCb(id, 'delivered'));
  assert.equal(await prisma.messageDelivery.count({ where: { providerRef: id } }), 1); assert.equal((await msgBy(id))!.status, 'delivered');
});
await t('S71', 'delivery', 'a callback that arrives BEFORE our record of the send completes the same row instead of duplicating it', async () => {
  await hook(metaCb('race-71', 'delivered'));
  await recordSend({ channel: 'whatsapp', providerRef: 'race-71', phone: '9300000001', template: 'offers_ready', kind: 'install_reminder', ok: true });
  assert.equal(await prisma.messageDelivery.count({ where: { providerRef: 'race-71' } }), 1);
  const row = await msgBy('race-71'); assert.equal(row!.kind, 'install_reminder'); assert.equal(row!.template, 'offers_ready'); assert.equal(row!.status, 'delivered');
});
await t('S72', 'delivery', 'a send the gateway rejects is recorded as failed with its reason', async () => {
  waMode = 'reject';
  try {
    const r = await wa.sendWhatsAppTemplate({ phone: '9300000001', templateName: 'marketing_check_rate', placeholders: ['x'], track: { kind: 'test' }, referenceId: 'rejected-72' });
    assert.equal(r.ok, false);
  } finally { waMode = 'ok'; }
  const row = await prisma.messageDelivery.findFirst({ where: { referenceId: 'rejected-72' } }); assert.ok(row); assert.equal(row!.status, 'failed'); assert.equal(row!.providerRef, null); assert.match(row!.failureReason!, /Invalid parameters/);
});
await t('S73', 'delivery', 'SMS sends are recorded too, as "sent" (no delivery callback), and are never flagged stuck', async () => {
  await upsertProviderConfig('voxvalley', { enabled: true, settings: { smsUrl: `${MOCK}/sms`, smsTemplateId: '111', smsBody: 'x', smsSender: 'PTSLA', projectId: 'PRJTEST' }, secrets: { authToken: 'tok' } });
  smsMode = 'ok'; const r = await sendVoxSms({ phone: '9300000001', track: { kind: 'test' } }); assert.equal(r.ok, true);
  const row = await prisma.messageDelivery.findFirst({ where: { channel: 'sms', providerRef: r.messageId } }); assert.ok(row); assert.equal(row!.status, 'sent'); assert.equal(row!.kind, 'test');
  await prisma.messageDelivery.update({ where: { id: row!.id }, data: { createdAt: new Date(Date.now() - 3 * 3_600_000) } });
  const admin = await adminToken(); const list = await get('/api/admin/messages?channel=sms', admin); assert.equal(list.body.data.find((m: any) => m.id === row!.id).stuck, false);
});
await t('S74', 'delivery', 'admin API: needs an admin token; lists with filters and pagination; flags queued/sent WhatsApp older than 15 minutes as stuck', async () => {
  assert.equal((await get('/api/admin/messages')).status, 401);
  assert.equal((await get('/api/admin/messages', 'garbage')).status, 401);
  const token = await adminToken();
  await prisma.messageDelivery.deleteMany(); const old = await sendWa(); const fresh = await sendWa(); const done = await sendWa();
  await hook(metaCb(done.messageId!, 'delivered'));
  await prisma.messageDelivery.update({ where: { providerRef: old.messageId! }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
  const all = await get('/api/admin/messages?pageSize=2', token); assert.equal(all.status, 200); assert.equal(all.body.data.length, 2); assert.equal(all.body.pagination.total, 3); assert.equal(all.body.pagination.totalPages, 2);
  const stuck = await get('/api/admin/messages?stuck=1', token); assert.deepEqual(stuck.body.data.map((m: any) => m.providerRef), [old.messageId]); assert.equal(stuck.body.data[0].stuck, true);
  const rowsAll = (await get('/api/admin/messages', token)).body.data; assert.equal(rowsAll.find((m: any) => m.providerRef === fresh.messageId).stuck, false); assert.equal(rowsAll.find((m: any) => m.providerRef === done.messageId).stuck, false);
  assert.equal((await get('/api/admin/messages?status=delivered', token)).body.data.length, 1);
  assert.equal((await get('/api/admin/messages?search=9300000001', token)).body.pagination.total, 3);
  assert.equal((await get('/api/admin/messages?status=bogus', token)).body.pagination.total, 3, 'an unknown filter value is ignored, not an error');
});
await t('S75', 'delivery', 'admin API: summary counts last-24h by status and says whether delivery reports can arrive at all', async () => {
  const token = await adminToken(); const saved = process.env.PUBLIC_BASE_URL;
  try {
    delete process.env.PUBLIC_BASE_URL; let s = (await get('/api/admin/messages/summary', token)).body.data;
    assert.equal(s.callbackConfigured, false); assert.equal(s.webhookKeySet, true); assert.equal(s.publicBaseIsHttps, false); assert.equal(s.stuck, 1); assert.equal(s.counts.whatsapp.delivered, 1);
    process.env.PUBLIC_BASE_URL = 'https://dev-api.example.test'; s = (await get('/api/admin/messages/summary', token)).body.data; assert.equal(s.callbackConfigured, true); assert.equal(s.publicBaseIsHttps, true);
  } finally { if (saved === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = saved; }
});
await t('S76', 'delivery', 'admin API: one message with every status report; unknown id → 404', async () => {
  const token = await adminToken(); const r = await sendWa(); await hook(metaCb(r.messageId!, 'sent')); await hook(metaCb(r.messageId!, 'delivered'));
  const row = await msgBy(r.messageId!); const d = await get(`/api/admin/messages/${row!.id}`, token); assert.equal(d.status, 200); assert.deepEqual(d.body.data.events.map((e: any) => e.raw), ['accepted by gateway', 'sent', 'delivered']);
  assert.equal((await get('/api/admin/messages/00000000-0000-0000-0000-000000000000', token)).status, 404);
});
await t('S77', 'delivery', 'install-reminder sends are recorded with their purpose and reference id (so a failed reminder can be traced)', async () => {
  await isolate(); sendMode(true);
  try {
    await upsertProviderConfig('voxvalley', { enabled: true, settings: { installSmsTemplateId: '999', installSmsBody: 'Continue: {link}', installWhatsapp: { template: 'install_link', language: 'en', placeholders: ['{name}', '{link}'] } } });
    const w = await webLogin(); const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    await prisma.messageDelivery.deleteMany(); await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * 60_000));
    const rows = await prisma.messageDelivery.findMany({ where: { kind: 'install_reminder' }, orderBy: { createdAt: 'asc' } });
    assert.deepEqual(rows.map((x: any) => x.channel), ['sms', 'whatsapp']); assert.equal(rows[1].referenceId, `${id}:1`); assert.equal(rows[1].template, 'install_link'); assert.equal(rows[1].phone, w.phone);
  } finally { sendMode(false); }
});
await t('S78', 'privacy', 'deleting an account also deletes that number\'s delivery rows; other numbers\' rows stay; the webhook key is never stored in a row', async () => {
  const w = await webLogin(); const other = await webLogin();
  await recordSend({ channel: 'whatsapp', providerRef: 'del-1', phone: w.phone, kind: 'test', ok: true }); await recordSend({ channel: 'whatsapp', providerRef: 'del-2', phone: other.phone, kind: 'test', ok: true });
  const del = await j('/api/users/me', { method: 'DELETE', headers: { 'content-type': 'application/json', authorization: `Bearer ${w.token}` }, body: JSON.stringify({ reason: 'privacy', source: 'website' }) });
  assert.equal(del.status, 200); assert.equal(await prisma.messageDelivery.count({ where: { phone: w.phone } }), 0); assert.equal(await prisma.messageDelivery.count({ where: { phone: other.phone } }), 1);
  assert.ok(!JSON.stringify(await prisma.messageDelivery.findMany()).includes(KEY), 'the webhook key must never appear in stored data');
});

/* ───────────── report ───────────── */
const pass = results.filter((r) => r.status === 'PASS').length; const fail = results.length - pass;
fs.writeFileSync(process.env.RESULTS_FILE ?? '/tmp/server-suite-results.json', JSON.stringify({ total: results.length, pass, fail, results }, null, 2));
console.log(`\nSERVER SUITE: ${pass}/${results.length} passed, ${fail} failed`);
await prisma.journeyReminder.deleteMany(); await prisma.user.deleteMany({ where: { phone: { startsWith: '93' } } }); await prisma.user.deleteMany({ where: { phone: { startsWith: '95' } } });
server.close(); mock.close(); await prisma.$disconnect(); process.exit(fail ? 1 : 0);
