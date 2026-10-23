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

const TM = await import(`${ROOT}/lib/timings.js`);
// Sections S01-S89 test the reminder RULES against the ORIGINAL 20-message schedule (SMS then WhatsApp 30 min later, ten points
// over a week, 3 runs per visitor). That is no longer the default (the default is now 5 messages and 2 runs; see S90+), but it
// exercises every branch, so it is pinned here in memory. S90's first line clears it and the defaults take over.
const LEGACY_ROWS = [0, 240, 480, 1440, 2880, 4320, 5760, 7200, 8640, 10080].flatMap((m) => [{ channel: 'sms', afterMinutes: m }, { channel: 'whatsapp', afterMinutes: m + 30 }]);
TM.setOverrides(new Map<string, unknown>([['install.schedule', LEGACY_ROWS], ['install.maxCycles', 3]]));

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
  await prisma.journeyReminder.updateMany({ where: { userId: a.user.id }, data: { createdAt: new Date(Date.now() - 30 * 86_400_000) } }); // the whole visit is old (it has an "OTP requested" row and the verified one)
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
    for (const id of ids) { const r = await reminderById(id); const last = (r.history as any[]).at(-1); if (last && last.outcome === 'sent') assert.ok(new Date(last.at).getTime() - sched.stepDueAt(r.startAt, sched.stepsFromRows(LEGACY_ROWS)[last.step]).getTime() <= sched.MAX_LATE_MS, 'a stale step was sent'); }
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
    assert.equal(sms[0].body.body, `Dear Charan , your SwiftLoan loan application is incomplete at Basic details. Please open the SwiftLoan app to continue where you left off :${downloads.publicBase}/dl?ref=${w.reminder!.token}. Team SwiftLoan\n-PurpleTalk IPL`);
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
    assert.ok(hitsFor('/sms')[0].body.body.startsWith('At Basic details: '), 'default label for a visitor past PAN');
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
    assert.deepEqual(params, ['Charan', 'Basic details', `${downloads.publicBase}/dl?ref=${w.reminder!.token}`]);
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

/* ───────────── S: admin Timings (every timing and limit that can be changed without a deploy) ───────────── */
const TS = await import(`${ROOT}/lib/timingsStore.js`);
const clearTimings = async () => { await prisma.platformSetting.deleteMany(); TM.setOverrides(new Map()); };
const adminTok = async (role: 'admin' | 'super_admin') => {
  const email = `timings-${role}@example.test`;
  const a = await prisma.adminUser.upsert({ where: { email }, update: { active: true, role, lastActivityAt: new Date() }, create: { email, passwordHash: 'x', name: `Timings ${role}`, role, active: true, lastActivityAt: new Date() } });
  return signAdminAccess({ sub: a.id, email, role });
};
const jsonH = (token?: string) => ({ 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) });
const putTimings = (changes: unknown, token?: string) => j('/api/admin/timings', { method: 'PUT', headers: jsonH(token), body: JSON.stringify({ changes }) });
const delTiming = (key: string, token?: string) => j(`/api/admin/timings/${encodeURIComponent(key)}`, { method: 'DELETE', headers: jsonH(token) });
const getTimings = (token?: string) => get('/api/admin/timings', token);
const itemOf = (res: any, key: string) => res.body.data.items.find((i: any) => i.key === key);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_MS = 60_000;
const loginRaw = async (phone = newPhone()) => {
  const rq = await post('/api/website/auth/otp/request', { phone });
  return { phone, vf: await post('/api/website/auth/otp/verify', { phone, code: rq.body.data.devOtp }) };
};
const jwtLife = (token: string) => { const c = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); return c.exp - c.iat; };
await clearTimings();

await t('S90', 'timings', 'the list needs an admin login and returns every setting with its rules, default, current value and source', async () => {
  const sup = await adminTok('admin');
  assert.equal((await getTimings()).status, 401);
  const r = await getTimings(sup); assert.equal(r.status, 200);
  const d = r.body.data; assert.equal(d.items.length, TM.TIMINGS.length);
  assert.deepEqual(d.groups.map((g: any) => g.key), ['install', 'hours', 'website', 'calls', 'auth', 'tracking']);
  for (const it of d.items) {
    for (const k of ['key', 'group', 'label', 'help', 'kind', 'def', 'effective', 'source']) assert.ok(k in it, `${it.key} lacks ${k}`);
    assert.ok(!('fromEnv' in it), 'no function leaks into the response');
    assert.ok(d.groups.some((g: any) => g.key === it.group), `${it.key} belongs to a listed section`);
  }
  const idle = itemOf(r, 'install.idleMinutes'); assert.equal(idle.min, 1); assert.equal(idle.max, 120); assert.equal(idle.effective, 5); assert.equal(idle.source, 'default');
});

await t('S91', 'timings', 'only a super admin can change or reset a setting; other admins can look but not touch', async () => {
  await clearTimings(); const admin = await adminTok('admin'); const sup = await adminTok('super_admin');
  assert.equal((await putTimings({ 'install.idleMinutes': 9 })).status, 401, 'no login');
  assert.equal((await putTimings({ 'install.idleMinutes': 9 }, admin)).status, 403, 'plain admin');
  assert.equal((await delTiming('install.idleMinutes', admin)).status, 403);
  assert.equal(await prisma.platformSetting.count(), 0, 'the refused calls saved nothing');
  assert.equal((await putTimings({ 'install.idleMinutes': 9 }, sup)).status, 200);
  await clearTimings();
});

await t('S92', 'timings', 'a save is all-or-nothing: one bad value rejects the whole request and names each bad field', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  const r = await putTimings({ 'install.idleMinutes': 9, 'auth.otpValidityMinutes': 99, 'calling.windowStart': 'abc', 'calls.maxPerHour': 2.5 }, sup);
  assert.equal(r.status, 400); const e = r.body.errors;
  assert.ok(e['auth.otpValidityMinutes'] && e['calling.windowStart'] && e['calls.maxPerHour'], JSON.stringify(e));
  assert.ok(!e['install.idleMinutes'], 'the good value is not blamed');
  assert.equal(await prisma.platformSetting.count(), 0, 'nothing was saved, not even the good one');
  assert.equal(itemOf(await getTimings(sup), 'install.idleMinutes').effective, 5);
});

await t('S93', 'timings', 'empty or malformed requests and unknown settings are refused cleanly', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  for (const body of [{}, { changes: [] }, { changes: 'x' }, { changes: {} }]) {
    const r = await j('/api/admin/timings', { method: 'PUT', headers: jsonH(sup), body: JSON.stringify(body) });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  const r = await putTimings({ 'made.up.key': 5 }, sup); assert.equal(r.status, 400); assert.match(r.body.errors['made.up.key'], /Unknown/);
  assert.equal((await delTiming('made.up.key', sup)).status, 404);
  assert.equal(await prisma.platformSetting.count(), 0);
});

await t('S94', 'timings', 'a saved value is stored, shown as an override with who changed it, and text numbers are accepted', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  const r = await putTimings({ 'install.idleMinutes': 9, 'calling.windowStart': '600' }, sup); assert.equal(r.status, 200); assert.deepEqual(r.body.data.saved.sort(), ['calling.windowStart', 'install.idleMinutes']);
  const g = await getTimings(sup); const idle = itemOf(g, 'install.idleMinutes');
  assert.equal(idle.effective, 9); assert.equal(idle.source, 'override'); assert.equal(idle.updatedBy, 'timings-super_admin@example.test'); assert.ok(idle.updatedAt);
  assert.equal(itemOf(g, 'calling.windowStart').effective, 600, 'a number sent as text is stored as a number');
  assert.equal((await prisma.platformSetting.findUniqueOrThrow({ where: { key: 'install.idleMinutes' } })).value, 9);
  assert.equal((await putTimings({ 'install.idleMinutes': 11 }, sup)).status, 200); assert.equal(itemOf(await getTimings(sup), 'install.idleMinutes').effective, 11, 'saving again replaces');
  await clearTimings();
});

await t('S95', 'timings', 'reset puts a setting back to its default and removes the stored row; resetting twice is harmless', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  await putTimings({ 'install.idleMinutes': 9 }, sup);
  assert.equal((await delTiming('install.idleMinutes', sup)).status, 200);
  const idle = itemOf(await getTimings(sup), 'install.idleMinutes'); assert.equal(idle.effective, 5); assert.equal(idle.source, 'default');
  assert.equal(await prisma.platformSetting.count(), 0);
  assert.equal((await delTiming('install.idleMinutes', sup)).status, 200);
});

await t('S96', 'timings', 'every change and reset is written to the admin audit log with who did it', async () => {
  await clearTimings(); const sup = await adminTok('super_admin'); await prisma.adminAuditLog.deleteMany({ where: { path: { startsWith: '/api/admin/timings' } } });
  await putTimings({ 'install.maxCycles': 2 }, sup); await delTiming('install.maxCycles', sup); await sleep(600);
  const rows = await prisma.adminAuditLog.findMany({ where: { path: { startsWith: '/api/admin/timings' } }, orderBy: { createdAt: 'asc' } });
  assert.ok(rows.length >= 2, `audit rows: ${rows.length}`);
  assert.ok(rows.every((r: any) => r.adminEmail === 'timings-super_admin@example.test'));
  assert.ok(rows.some((r: any) => r.method === 'PUT' && JSON.stringify(r.metadata).includes('install.maxCycles')), 'the change itself is in the log');
  assert.ok(rows.some((r: any) => r.method === 'DELETE'));
});

await t('S97', 'timings:effect', 'website signal interval: the server tells the open page how often to ping, and a change shows at once', async () => {
  await clearTimings(); const sup = await adminTok('super_admin'); const w = await webLogin();
  const ping = () => j('/api/website/activity', { method: 'POST', headers: jsonH(w.token), body: '{}' });
  assert.equal((await ping()).body.data.pingEverySeconds, 60);
  await putTimings({ 'website.pingEverySeconds': 30 }, sup); assert.equal((await ping()).body.data.pingEverySeconds, 30);
  await delTiming('website.pingEverySeconds', sup); assert.equal((await ping()).body.data.pingEverySeconds, 60);
});

await t('S98', 'timings:effect', 'OTP validity: a new code lives for the configured minutes', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  const life = async () => { const phone = newPhone(); await post('/api/website/auth/otp/request', { phone }); const row = await prisma.otpToken.findFirstOrThrow({ where: { phone }, orderBy: { createdAt: 'desc' } }); return row.expiresAt.getTime() - row.createdAt.getTime(); };
  const near = (ms: number, want: number) => Math.abs(ms - want) < 5_000;
  assert.ok(near(await life(), 5 * MIN_MS), 'default 5 min');
  await putTimings({ 'auth.otpValidityMinutes': 2 }, sup); assert.ok(near(await life(), 2 * MIN_MS), 'now 2 min');
  await putTimings({ 'auth.otpValidityMinutes': 12 }, sup); assert.ok(near(await life(), 12 * MIN_MS), 'now 12 min');
  await clearTimings();
});

await t('S99', 'timings:effect', 'login lifetimes: website session cookie and access token follow the settings; defaults are unchanged', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  const d = await loginRaw(); assert.match(d.vf.headers.get('set-cookie') ?? '', /Max-Age=7200/); assert.equal(d.vf.body.data.expiresIn, 900); assert.equal(jwtLife(d.vf.body.data.accessToken), 900);
  await putTimings({ 'auth.websiteSessionMinutes': 30, 'auth.accessTokenMinutes': 20 }, sup);
  const c = await loginRaw(); assert.match(c.vf.headers.get('set-cookie') ?? '', /Max-Age=1800/); assert.equal(c.vf.body.data.expiresIn, 1200); assert.equal(jwtLife(c.vf.body.data.accessToken), 1200, 'the token itself, not just the number we report');
  await clearTimings();
});

await t('S100', 'timings:effect', 'OTP resend window: how long repeated requests for one number are counted', async () => {
  await clearTimings(); const sup = await adminTok('super_admin'); const { requestPhoneOtp } = await import(`${ROOT}/lib/otp.js`);
  const phone = newPhone(); const old = new Date(Date.now() - 2 * MIN_MS);
  await prisma.otpToken.createMany({ data: [1, 2, 3].map(() => ({ phone, purpose: 'verify_phone', codeHash: 'x', expiresAt: new Date(Date.now() + MIN_MS), createdAt: old })) });
  await assert.rejects(() => requestPhoneOtp(phone), (e: any) => e.status === 429, 'three requests 2 minutes ago still count inside the default 10-minute window');
  await putTimings({ 'auth.otpResendWindowMinutes': 1 }, sup);
  assert.ok((await requestPhoneOtp(phone)).sent !== undefined, 'with a 1-minute window those requests no longer count');
  await clearTimings();
});

await t('S101', 'timings:effect', 'install link click life: the stored expiry follows the setting', async () => {
  await clearTimings(); const sup = await adminTok('super_admin');
  const click = async () => { await get('/dl?ref=TSTTTL01', undefined, { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120 Mobile Safari/537.36' }); const r = await prisma.appClick.findFirstOrThrow({ orderBy: { createdAt: 'desc' } }); return (r.expiresAt.getTime() - r.createdAt.getTime()) / 3_600_000; };
  assert.ok(Math.abs((await click()) - 48) < 0.1, 'default 48 h');
  await putTimings({ 'tracking.clickTtlHours': 1 }, sup); assert.ok(Math.abs((await click()) - 1) < 0.1, 'now 1 h');
  await clearTimings();
});

await t('S102', 'timings:effect', 'how long a saved website visit can resume follows the setting (through the app\'s own lookup)', async () => {
  await clearTimings(); const sup = await adminTok('super_admin'); await isolate();
  const w = await webLogin(); await prisma.$executeRawUnsafe(`UPDATE "JourneyReminder" SET "createdAt" = now() - interval '2 days' WHERE id = '${w.reminder!.id}'`);
  assert.ok((await resumeBy(w.reminder!.token)).body.data.resume, 'a 2-day-old visit resumes by default (14 days)');
  await putTimings({ 'install.resumeMaxAgeDays': 1 }, sup); assert.equal((await resumeBy(w.reminder!.token)).body.data.resume, null, 'with a 1-day limit it is too old');
  await clearTimings();
});

await t('S103', 'timings:effect', 'idle time: with 10 minutes a visitor is not "dropped off" at 6; with the default 5 they are', async () => {
  await isolate();
  const set = async () => { const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN, nextCheckAt: OPEN, lastSeenAt: OPEN } }); return w.reminder!.id; };
  const a = await set(); await TS.saveTimings({ 'install.idleMinutes': 10 }, 't');
  try {
    await tickRaw(new Date(OPEN.getTime() + 6 * MIN_MS)); assert.equal((await reminderById(a)).droppedAt, null);
    await tickRaw(new Date(OPEN.getTime() + 10 * MIN_MS)); assert.ok((await reminderById(a)).droppedAt);
  } finally { await clearTimings(); }
  await isolate(); const b = await set(); await tickRaw(new Date(OPEN.getTime() + 6 * MIN_MS)); assert.ok((await reminderById(b)).droppedAt, 'default 5 min: dropped at 6');
});

await t('S104', 'timings:effect', 'a custom schedule runs exactly as set: WhatsApp at 10 min then SMS at 20 min, counted from the drop-off, then complete', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN, nextCheckAt: OPEN, lastSeenAt: new Date(OPEN.getTime() - 6 * MIN_MS) } });
  await TS.saveTimings({ 'install.schedule': [{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 20 }], 'install.minGapMinutes': 5 }, 't');
  try {
    await tickRaw(OPEN); let r = await reminderById(id); assert.ok(r.droppedAt); assert.equal(r.stepsSent, 0);
    await tickRaw(new Date(OPEN.getTime() + 9 * MIN_MS)); assert.equal((await reminderById(id)).stepsSent, 0, 'not before 10 minutes');
    await tickRaw(new Date(OPEN.getTime() + 10 * MIN_MS)); r = await reminderById(id); assert.equal(r.stepsSent, 1); assert.equal((r.history as any[])[0].channel, 'whatsapp');
    await tickRaw(new Date(OPEN.getTime() + 20 * MIN_MS)); r = await reminderById(id);
    assert.deepEqual((r.history as any[]).map((h) => h.channel), ['whatsapp', 'sms']); assert.equal(r.status, 'completed', 'two messages in the schedule = done after two');
  } finally { await clearTimings(); }
});

await t('S105', 'timings:effect', 'the minimum gap, the "too late" limit and the run cap follow their settings', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN, nextCheckAt: OPEN, lastSeenAt: new Date(OPEN.getTime() - 6 * MIN_MS) } });
  await TS.saveTimings({ 'install.schedule': [{ channel: 'sms', afterMinutes: 0 }, { channel: 'whatsapp', afterMinutes: 1 }], 'install.minGapMinutes': 20 }, 't');
  try {
    await tickRaw(OPEN); await tickRaw(new Date(OPEN.getTime() + 2 * MIN_MS));
    assert.equal((await reminderById(id)).stepsSent, 1, 'the second message waits for the 20-minute gap');
    await tickRaw(new Date(OPEN.getTime() + 21 * MIN_MS)); assert.equal((await reminderById(id)).stepsSent, 2);
    // too late: shorten the limit so a step a few hours late is skipped, not sent
    const w2 = await webLogin(); const id2 = w2.reminder!.id;
    await TS.saveTimings({ 'install.maxLateHours': 1, 'install.minGapMinutes': 0, 'install.schedule': [{ channel: 'sms', afterMinutes: 0 }] }, 't');
    await prisma.journeyReminder.update({ where: { id: id2 }, data: { startAt: OPEN, droppedAt: OPEN, lastSeenAt: OPEN, nextCheckAt: OPEN } });
    await tickRaw(new Date(OPEN.getTime() + 3 * 3_600_000)); assert.equal(((await reminderById(id2)).history as any[])[0].outcome, 'skipped');
    // run cap: with 1 run allowed a visitor who returns does not start a second one
    await TS.saveTimings({ 'install.maxCycles': 1 }, 't');
    const w3 = await webLogin(); await prisma.journeyReminder.update({ where: { id: w3.reminder!.id }, data: { droppedAt: new Date() } });
    assert.equal(await rem.armInstallReminder(w3.user, OPEN), null, 'no second run when only one is allowed');
  } finally { await clearTimings(); }
});

await t('S106', 'timings:effect', 'the admin on/off switch and the test-number list decide who is messaged (the env variable only sets the starting value)', async () => {
  await isolate(); hits.length = 0; smsMode = 'ok'; delete process.env.INSTALL_REMINDER_SEND;
  const a = await webLogin(); const b = await webLogin();
  for (const w of [a, b]) await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
  await TS.saveTimings({ 'install.sendEnabled': true, 'install.allowedNumbers': [a.phone], 'install.schedule': [{ channel: 'sms', afterMinutes: 0 }, { channel: 'whatsapp', afterMinutes: 30 }] }, 't');
  try {
    await tickAll(OPEN); await tickAll(new Date(OPEN.getTime() + 31 * MIN_MS));
    const ha = (await reminderById(a.reminder!.id)).history as any[]; const hb = (await reminderById(b.reminder!.id)).history as any[];
    assert.deepEqual(ha.map((h) => h.outcome), ['sent', 'sent'], 'the listed number is messaged');
    assert.deepEqual(hb.map((h) => h.outcome), ['skipped', 'skipped']); assert.equal(hb[0].reason, 'not on the test-number list');
    assert.equal(hitsFor('/sms').length, 1); assert.equal(hitsFor('/api/v1/whatsapp').length, 1);
    assert.ok(!hits.some((h) => JSON.stringify(h.body).includes(b.phone)), 'nothing was sent to the number that is not on the list');
    // switch off in the admin while the env variable says on: off wins, and the job only logs
    process.env.INSTALL_REMINDER_SEND = 'true'; await TS.saveTimings({ 'install.sendEnabled': false, 'install.allowedNumbers': [] }, 't'); hits.length = 0;
    await isolate(); const c = await webLogin(); await prisma.journeyReminder.update({ where: { id: c.reminder!.id }, data: { startAt: OPEN } });
    await tickAll(OPEN); assert.equal(((await reminderById(c.reminder!.id)).history as any[])[0].outcome, 'logged'); assert.equal(hits.length, 0, 'switched off = nothing leaves the building');
  } finally { delete process.env.INSTALL_REMINDER_SEND; await clearTimings(); }
});

await t('S107', 'timings:effect', 'calling hours: a normal window, a changed window and an overnight window', async () => {
  await clearTimings(); const { withinCallingHours } = await import(`${ROOT}/lib/leadCaller.js`);
  assert.equal(withinCallingHours(IST(10)), true); assert.equal(withinCallingHours(IST(22)), false); assert.equal(withinCallingHours(IST(8, 59)), false); assert.equal(withinCallingHours(IST(20, 59)), true);
  await TS.saveTimings({ 'calling.windowStart': 720, 'calling.windowEnd': 780 }, 't');
  assert.equal(withinCallingHours(IST(12, 30)), true); assert.equal(withinCallingHours(IST(10)), false); assert.equal(withinCallingHours(IST(13, 0)), false, 'the end minute is outside');
  await TS.saveTimings({ 'calling.windowStart': 1320, 'calling.windowEnd': 360 }, 't');
  assert.equal(withinCallingHours(IST(23)), true); assert.equal(withinCallingHours(IST(3)), true); assert.equal(withinCallingHours(IST(12)), false, 'overnight window wraps past midnight');
  await TS.saveTimings({ 'calling.windowStart': 0, 'calling.windowEnd': 1439 }, 't'); assert.equal(withinCallingHours(IST(3)), true, '00:00 to 23:59 turns the window off');
  await clearTimings();
});

await t('S108', 'timings:effect', 'lead-call timings and the other limits are read live from the settings', async () => {
  await clearTimings(); const ic = await import(`${ROOT}/lib/immediateCallback.js`); const { isIdleExpired } = await import(`${ROOT}/lib/adminSecurity.js`);
  const { reuseWindowMs } = await import(`${ROOT}/lib/offersReuse.js`); const { referralEligibleDays } = await import(`${ROOT}/lib/referral.js`); const at = await import(`${ROOT}/lib/attribution.js`);
  assert.deepEqual([ic.firstAttemptDelaySeconds(), ic.retryIntervalMinutes(), ic.maxAttempts()], [20, 60, 3]);
  assert.equal(isIdleExpired(new Date(Date.now() - 6 * MIN_MS)), false, 'admin idle default 30 min'); assert.equal(reuseWindowMs(), 24 * 3_600_000);
  assert.deepEqual([referralEligibleDays(), at.clickTtlHours(), at.ipWindowMinutes()], [7, 48, 30]);
  await TS.saveTimings({ 'calls.firstDelaySeconds': 45, 'calls.retryMinutes': 90, 'calls.maxAttempts': 5, 'auth.adminIdleMinutes': 5, 'offers.reuseHours': 48, 'referral.eligibleDays': 14, 'tracking.clickTtlHours': 72, 'tracking.ipWindowMinutes': 60 }, 't');
  try {
    assert.deepEqual([ic.firstAttemptDelaySeconds(), ic.retryIntervalMinutes(), ic.maxAttempts()], [45, 90, 5]);
    assert.equal(isIdleExpired(new Date(Date.now() - 6 * MIN_MS)), true, 'admin idle now 5 min'); assert.equal(reuseWindowMs(), 48 * 3_600_000);
    assert.deepEqual([referralEligibleDays(), at.clickTtlHours(), at.ipWindowMinutes()], [14, 72, 60]);
  } finally { await clearTimings(); }
});

await t('S109', 'timings:effect', 'the job runs no more often than "Reminder job runs every" says (the scheduler itself ticks every minute)', async () => {
  await clearTimings(); const T = Date.now();
  rem.resetInstallReminderThrottle(); assert.ok(await rem.installReminderTickThrottled(T), 'the first call runs');
  assert.equal(await rem.installReminderTickThrottled(T + 30_000), null, 'too soon'); assert.ok(await rem.installReminderTickThrottled(T + 61_000), 'a minute later it runs again');
  await TS.saveTimings({ 'install.jobEveryMinutes': 5 }, 't'); rem.resetInstallReminderThrottle();
  try { await rem.installReminderTickThrottled(T); assert.equal(await rem.installReminderTickThrottled(T + 4 * MIN_MS), null); assert.ok(await rem.installReminderTickThrottled(T + 5 * MIN_MS)); }
  finally { await clearTimings(); rem.resetInstallReminderThrottle(); }
});

await t('S110', 'timings:effect', 'a visitor already deep in the old schedule when it is shortened simply finishes (no error, no stuck row)', async () => {
  await isolate(); const w = await webLogin(); const id = w.reminder!.id;
  await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN, stepsSent: 7, droppedAt: new Date(OPEN.getTime() - 3_600_000), lastSeenAt: new Date(OPEN.getTime() - 3_600_000), lastSentAt: null, nextCheckAt: OPEN } });
  await TS.saveTimings({ 'install.schedule': [{ channel: 'sms', afterMinutes: 0 }] }, 't');
  try { await tickRaw(OPEN); assert.equal((await reminderById(id)).status, 'completed'); } finally { await clearTimings(); }
});

await t('S111', 'timings', 'a stored value that breaks its own rules is ignored; a change made by another server is picked up; a removed row falls back', async () => {
  await clearTimings();
  await prisma.platformSetting.create({ data: { key: 'install.idleMinutes', value: 99999 } });
  await TS.refreshTimings(); assert.equal(TM.timing.num('install.idleMinutes'), 5, 'an out-of-range stored value is not trusted');
  await prisma.platformSetting.update({ where: { key: 'install.idleMinutes' }, data: { value: 9 } });
  await prisma.platformSetting.create({ data: { key: 'a.setting.that.no.longer.exists', value: 1 } });
  await TS.refreshTimings(); assert.equal(TM.timing.num('install.idleMinutes'), 9, 'a row edited elsewhere is picked up on the next refresh');
  await prisma.platformSetting.deleteMany(); await TS.refreshTimings(); assert.equal(TM.timing.num('install.idleMinutes'), 5, 'deleting the row goes back to the default');
});

await t('S112', 'timings', 'a visitor already on the schedule is unaffected by saving unrelated settings, and the message steps are not re-sent', async () => {
  await isolate(); hits.length = 0; const sup = await adminTok('super_admin'); const w = await webLogin();
  await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN, droppedAt: OPEN, lastSeenAt: OPEN, stepsSent: 3, lastSentAt: OPEN, nextCheckAt: new Date(OPEN.getTime() + 5 * 3_600_000) } });
  await putTimings({ 'pan.dailyLimit': 7, 'referral.eligibleDays': 9 }, sup);
  const r = await reminderById(w.reminder!.id); assert.equal(r.stepsSent, 3); assert.equal(hits.length, 0); assert.equal(r.status, 'active');
  await clearTimings();
});

/* ── App Config: the three in-app bubble timings ── */
await t('S113', 'appconfig', 'bubble timings: a fresh config has today\'s values, the app endpoint serves them, and a super admin can change them', async () => {
  await prisma.appConfig.deleteMany(); const sup = await adminTok('super_admin');
  const pub = () => get('/api/config/nudges'); const fresh = (await pub()).body.data;
  assert.deepEqual([fresh.nudgeStartMs, fresh.nudgeRotateMs, fresh.nudgeSnoozeMs], [5000, 3000, 600000]);
  const r = await j('/api/admin/config', { method: 'PUT', headers: jsonH(sup), body: JSON.stringify({ nudgeStartMs: 8000, nudgeRotateMs: 4000, nudgeSnoozeMs: 120000 }) }); assert.equal(r.status, 200);
  const now = (await pub()).body.data; assert.deepEqual([now.nudgeStartMs, now.nudgeRotateMs, now.nudgeSnoozeMs], [8000, 4000, 120000]);
  assert.deepEqual([now.nudgeIdleMs, now.nudgeDropoffMs, now.nudgeEligibleMs], [fresh.nudgeIdleMs, fresh.nudgeDropoffMs, fresh.nudgeEligibleMs], 'the other fields are untouched');
});

await t('S114', 'appconfig', 'bubble timings are kept inside safe limits, and only a super admin can change them', async () => {
  const sup = await adminTok('super_admin'); const admin = await adminTok('admin');
  const put = (b: unknown, tok: string) => j('/api/admin/config', { method: 'PUT', headers: jsonH(tok), body: JSON.stringify(b) });
  assert.equal((await put({ nudgeStartMs: 9000 }, admin)).status, 403);
  await put({ nudgeStartMs: 100, nudgeRotateMs: 5, nudgeSnoozeMs: 5000 }, sup); let d = (await get('/api/config/nudges')).body.data;
  assert.deepEqual([d.nudgeStartMs, d.nudgeRotateMs, d.nudgeSnoozeMs], [1000, 1000, 60000], 'too small is raised to the minimum');
  await put({ nudgeStartMs: 9_999_999, nudgeRotateMs: 9_999_999, nudgeSnoozeMs: 999_999_999 }, sup); d = (await get('/api/config/nudges')).body.data;
  assert.deepEqual([d.nudgeStartMs, d.nudgeRotateMs, d.nudgeSnoozeMs], [60000, 30000, 86400000], 'too large is lowered to the maximum');
  await put({ nudgeStartMs: 'soon', nudgeSnoozeMs: null }, sup); d = (await get('/api/config/nudges')).body.data;
  assert.deepEqual([d.nudgeStartMs, d.nudgeSnoozeMs], [60000, 86400000], 'junk or blank leaves the value alone');
  await put({ nudgeStartMs: 5000, nudgeRotateMs: 3000, nudgeSnoozeMs: 600000 }, sup);
});

/* ───────────── S: "you applied with <lender>, install the app to track it" (one sequence per lender) ───────────── */
const ln = await import(`${ROOT}/lib/lenderNudge.js`);
const { hasActiveInstallReminder } = await import(`${ROOT}/lib/installReminderGuard.js`);
const isolateN = async () => { await prisma.lenderNudge.deleteMany(); await prisma.lenderApplication.deleteMany(); await prisma.journeyReminder.deleteMany(); hits.length = 0; await clearTimings(); };
const nudgeTick = async (now: Date) => { await prisma.$executeRawUnsafe(`UPDATE "LenderNudge" SET "nextCheckAt" = to_timestamp(0) WHERE status = 'active'`); return ln.lenderNudgeTick(now); };
const nudgeOf = (id: string) => prisma.lenderNudge.findUniqueOrThrow({ where: { id } });
const nudgesFor = (userId: string) => prisma.lenderNudge.findMany({ where: { userId }, orderBy: { startAt: 'asc' } });
const MINUTES = (n: number, from = OPEN) => new Date(from.getTime() + n * MIN_MS);
let applySeq = 0;
async function applyTo(userId: string, lenderName: string, appliedAt: Date = OPEN, opts: { status?: string; applicationId?: string } = {}) {
  const partner = await prisma.lenderPartner.upsert({ where: { name: lenderName }, update: {}, create: { name: lenderName, baseApr: 12 } });
  const app = opts.applicationId
    ? await prisma.loanApplication.findUniqueOrThrow({ where: { id: opts.applicationId } })
    : await prisma.loanApplication.create({ data: { userId, ref: `SL-N${Date.now()}${++applySeq}`, amount: 100000, status: 'offers_ready' } });
  const offer = await prisma.offer.create({ data: { applicationId: app.id, partnerId: partner.id, amount: 100000, apr: 12, emi: 9000, tenureMonths: 12, processingFee: 0, lenderName } });
  const la = await prisma.lenderApplication.create({ data: { applicationId: app.id, offerId: offer.id, lenderName, amount: 100000, status: (opts.status ?? 'offers_ready') as any, appliedAt } });
  return { app, la, offer };
}
const appliedOn = async (switchOn = true, extra: Record<string, unknown> = {}) => { if (switchOn) await TS.saveTimings({ 'applied.sendEnabled': true, ...extra }, 't'); else if (Object.keys(extra).length) await TS.saveTimings(extra, 't'); };
const waBodies = () => hitsFor('/api/v1/whatsapp').map((h) => JSON.stringify(h.body));

await t('S115', 'applied', 'applying to a lender arms one sequence for that lender, carrying the visitor\'s link and the lender name', async () => {
  await isolateN(); const w = await webLogin(); const { la } = await applyTo(w.user.id, 'IDFC FIRST Bank');
  const r = await nudgeTick(OPEN); assert.equal(r.armed, 1);
  const [n] = await nudgesFor(w.user.id); assert.equal(n.lenderApplicationId, la.id); assert.equal(n.lenderName, 'IDFC FIRST Bank');
  assert.equal(n.token, w.reminder!.token, 'the same reference ID the website visit created, so the app can resume and the install is attributed');
  assert.equal(n.status, 'active'); assert.equal(n.phone, w.phone); assert.equal(n.startAt.getTime(), OPEN.getTime());
});

await t('S116', 'applied', 'arming is idempotent: ticking again, or two workers at once, never makes a second sequence for the same application', async () => {
  await isolateN(); const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank');
  await Promise.all([nudgeTick(OPEN), nudgeTick(OPEN), nudgeTick(MINUTES(1))]); await nudgeTick(MINUTES(2));
  assert.equal((await nudgesFor(w.user.id)).length, 1);
});

await t('S117', 'applied', 'switch off (the default): the schedule runs but only LOGS, nothing is sent', async () => {
  await isolateN(); const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank');
  await nudgeTick(OPEN); await nudgeTick(MINUTES(10)); await nudgeTick(MINUTES(24 * 60));
  const [n] = await nudgesFor(w.user.id); assert.deepEqual((n.history as any[]).map((h) => h.channel), ['whatsapp', 'whatsapp']); assert.deepEqual((n.history as any[]).map((h) => h.outcome), ['logged', 'logged']);
  assert.equal(hits.length, 0, 'nothing leaves the building');
});

await t('S118', 'applied', 'WhatsApp goes out at the scheduled time with the person\'s name, the LENDER\'s name and their link', async () => {
  await isolateN(); await appliedOn(); const w = await webLogin(); await giveVerifiedPan(w.user.id, 'PRIYA'); await rem.markPanVerified(w.user.id, 'PRIYA');
  await applyTo(w.user.id, 'IDFC FIRST Bank'); await nudgeTick(OPEN); await nudgeTick(MINUTES(9));
  assert.equal(hits.length, 0, 'not before 10 minutes');
  await nudgeTick(MINUTES(10)); const wa = waBodies(); assert.equal(wa.length, 1);
  assert.ok(wa[0].includes('loan_applied_install_app'), 'the applied template, not the install-reminder one');
  assert.ok(wa[0].includes('Priya') && wa[0].includes('IDFC FIRST Bank') && wa[0].includes(`/dl?ref=${w.reminder!.token}`), wa[0]);
  const m = await prisma.messageDelivery.findFirst({ where: { phone: { not: null }, kind: 'applied_nudge' }, orderBy: { createdAt: 'desc' } });
  assert.ok(m, 'recorded in the admin Messages list under its own kind');
});

await t('S119', 'applied', 'SMS step: skipped with a reason until its template is registered, then carries the template id, name, lender and link', async () => {
  await isolateN(); await appliedOn(true, { 'applied.schedule': [{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 40 }] }); const w = await webLogin(); await applyTo(w.user.id, 'Hero FinCorp');
  await nudgeTick(OPEN); await nudgeTick(MINUTES(10)); await nudgeTick(MINUTES(40));
  let [n] = await nudgesFor(w.user.id); const h = n.history as any[]; assert.equal(h[1].outcome, 'skipped'); assert.equal(h[1].reason, 'sms template not configured'); assert.equal(hitsFor('/sms').length, 0);
  await upsertProviderConfig('voxvalley', { settings: { appliedSmsTemplateId: '777', appliedSmsBody: 'Dear {name} , you applied with {lender}. Track it in the app :{link}. Team SwiftLoan' } });
  try {
    await isolateN(); await appliedOn(true, { 'applied.schedule': [{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 40 }] }); const w2 = await webLogin(); await applyTo(w2.user.id, 'Hero FinCorp');
    await nudgeTick(OPEN); await nudgeTick(MINUTES(10)); await nudgeTick(MINUTES(40));
    const sms = hitsFor('/sms'); assert.equal(sms.length, 1); assert.equal(sms[0].body.template_id, '777'); assert.equal(sms[0].body.to, `+91${w2.phone}`);
    assert.ok(sms[0].body.body.includes('Dear Customer') && sms[0].body.body.includes('Hero FinCorp') && sms[0].body.body.includes(`/dl?ref=${w2.reminder!.token}`), sms[0].body.body);
    assert.ok(!sms[0].body.body.includes('{'), 'no placeholder left unfilled');
  } finally { await upsertProviderConfig('voxvalley', { settings: { appliedSmsTemplateId: '', appliedSmsBody: '' } }); }
});

await t('S120', 'applied', 'two lenders = two separate sequences, each naming its own lender, never back to back (60 minute gap across both)', async () => {
  await isolateN(); await appliedOn(); const w = await webLogin();
  const a = await applyTo(w.user.id, 'IDFC FIRST Bank', OPEN); const b = await applyTo(w.user.id, 'Hero FinCorp', MINUTES(2));
  await nudgeTick(OPEN); assert.equal((await nudgesFor(w.user.id)).length, 2, 'one sequence per lender application');
  await nudgeTick(MINUTES(10)); assert.equal(waBodies().length, 1); assert.ok(waBodies()[0].includes('IDFC FIRST Bank') && !waBodies()[0].includes('Hero FinCorp'));
  await nudgeTick(MINUTES(13)); assert.equal(waBodies().length, 1, 'the second lender is held back by the gap');
  const held = (await nudgesFor(w.user.id)).find((n) => n.lenderApplicationId === b.la.id)!; assert.equal(held.stepsSent, 0);
  assert.equal(held.nextCheckAt.getTime(), MINUTES(70).getTime(), 'it will look again exactly when the gap ends');
  await nudgeTick(MINUTES(69)); assert.equal(waBodies().length, 1);
  await nudgeTick(MINUTES(70)); const wa = waBodies(); assert.equal(wa.length, 2); assert.ok(wa[1].includes('Hero FinCorp') && !wa[1].includes('IDFC FIRST Bank'));
  const sent = (await nudgesFor(w.user.id)).map((n) => n.lastSentAt!.getTime()).sort(); assert.ok(sent[1] - sent[0] >= 60 * MIN_MS, 'at least 60 minutes apart');
  void a;
});

await t('S121', 'applied', 'the gap setting is editable: with 15 minutes the second lender follows sooner', async () => {
  await isolateN(); await appliedOn(true, { 'applied.minGapMinutes': 15 }); const w = await webLogin();
  await applyTo(w.user.id, 'IDFC FIRST Bank', OPEN); await applyTo(w.user.id, 'Hero FinCorp', MINUTES(2));
  await nudgeTick(OPEN); await nudgeTick(MINUTES(10)); await nudgeTick(MINUTES(24)); assert.equal(waBodies().length, 1);
  await nudgeTick(MINUTES(25)); assert.equal(waBodies().length, 2);
});

await t('S122', 'applied', 'a custom schedule is followed exactly, then the sequence completes', async () => {
  await isolateN(); await appliedOn(true, { 'applied.schedule': [{ channel: 'whatsapp', afterMinutes: 5 }, { channel: 'whatsapp', afterMinutes: 120 }], 'applied.minGapMinutes': 0 });
  const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank');
  await nudgeTick(OPEN); await nudgeTick(MINUTES(4)); assert.equal(hits.length, 0);
  await nudgeTick(MINUTES(5)); assert.equal(waBodies().length, 1);
  await nudgeTick(MINUTES(119)); assert.equal(waBodies().length, 1); await nudgeTick(MINUTES(120)); assert.equal(waBodies().length, 2);
  const [n] = await nudgesFor(w.user.id); assert.equal(n.status, 'completed'); await nudgeTick(MINUTES(300)); assert.equal(waBodies().length, 2, 'nothing after it completes');
});

const stopN = async (id: string, title: string, arrange: (w: Awaited<ReturnType<typeof webLogin>>, laId: string) => Promise<void>, reason: string) =>
  t(id, 'applied:stop', title, async () => {
    await isolateN(); await appliedOn(); const w = await webLogin(); const { la } = await applyTo(w.user.id, 'IDFC FIRST Bank'); await nudgeTick(OPEN);
    await arrange(w, la.id); await nudgeTick(MINUTES(10));
    const [n] = await nudgesFor(w.user.id); assert.equal(n.status, 'stopped'); assert.equal(n.stopReason, reason); assert.equal(hits.length, 0, 'nothing is sent once stopped');
  });
await stopN('S123', 'installing the app through their link stops it', async (w) => { await prisma.appClick.create({ data: { token: 'TSTNUDGE001', ref: w.reminder!.token, kind: 'campaign', platform: 'android', ipHash: 'x', uaHash: 'y', status: 'matched', matchedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } }); }, 'installed');
await stopN('S124', 'logging in to the app stops it', async (w) => { const c = await prisma.customer.upsert({ where: { phone: w.phone }, update: {}, create: { phone: w.phone, userId: w.user.id } }); await prisma.journeyEvent.create({ data: { customerId: c.id, channel: 'app', name: 'otp_verified', occurredAt: MINUTES(5) } }); await prisma.lenderNudge.updateMany({ where: { userId: w.user.id }, data: { createdAt: OPEN } }); }, 'app_login');
await stopN('S125', 'a do-not-contact customer stops it', async (w) => { await prisma.customer.upsert({ where: { phone: w.phone }, update: { currentStage: 'lost' }, create: { phone: w.phone, userId: w.user.id, currentStage: 'lost' } }); }, 'do_not_contact');
await stopN('S126', 'the lender application being rejected stops it', async (_w, laId) => { await prisma.lenderApplication.update({ where: { id: laId }, data: { status: 'rejected' } }); }, 'lender_finished');
await stopN('S127', 'the lender application disappearing stops it (never a message about something that is gone)', async (_w, laId) => { await prisma.lenderApplication.delete({ where: { id: laId } }); }, 'lender_finished');

await t('S128', 'applied:stop', 'an application the lender is still reviewing (or has approved) keeps the messages going; only rejected/disbursed/closed stop it', async () => {
  for (const status of ['under_review', 'approved', 'handoff']) {
    await isolateN(); await appliedOn(); const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank', OPEN, { status });
    await nudgeTick(OPEN); await nudgeTick(MINUTES(10)); assert.equal(waBodies().length, 1, status);
  }
});

await t('S129', 'applied:stop', 'stopping one lender\'s sequence leaves the other lender\'s running', async () => {
  await isolateN(); await appliedOn(true, { 'applied.minGapMinutes': 0 }); const w = await webLogin();
  const a = await applyTo(w.user.id, 'IDFC FIRST Bank'); await applyTo(w.user.id, 'Hero FinCorp'); await nudgeTick(OPEN);
  await prisma.lenderApplication.update({ where: { id: a.la.id }, data: { status: 'rejected' } }); await nudgeTick(MINUTES(10));
  const wa = waBodies(); assert.equal(wa.length, 1); assert.ok(wa[0].includes('Hero FinCorp'));
});

await t('S130', 'applied:skip', 'never armed for someone already in the app, someone with no website link, or an old application', async () => {
  await isolateN(); await appliedOn();
  // already in the app
  const inApp = await webLogin(); const c = await prisma.customer.upsert({ where: { phone: inApp.phone }, update: {}, create: { phone: inApp.phone, userId: inApp.user.id } });
  await prisma.journeyEvent.create({ data: { customerId: c.id, channel: 'app', name: 'otp_verified', occurredAt: new Date(OPEN.getTime() - 86_400_000) } });
  await applyTo(inApp.user.id, 'IDFC FIRST Bank');
  // never came through the website, so nothing to carry in a link
  const phone = newPhone(); const noLink = await prisma.user.create({ data: { phone } }); await applyTo(noLink.id, 'IDFC FIRST Bank');
  // applied three days ago
  const old = await webLogin(); await applyTo(old.user.id, 'IDFC FIRST Bank', new Date(OPEN.getTime() - 3 * 86_400_000));
  await nudgeTick(OPEN); await nudgeTick(MINUTES(10)); await nudgeTick(MINUTES(40));
  assert.equal((await nudgesFor(inApp.user.id))[0].stopReason, 'in_app');
  assert.equal((await nudgesFor(noLink.id))[0].stopReason, 'no_link');
  assert.equal((await nudgesFor(old.user.id)).length, 0, 'an old application is never even armed, so enabling this never messages the backlog');
  assert.equal(hits.length, 0);
});

await t('S131', 'applied:skip', 'the application-age window is editable (default 24 h)', async () => {
  await isolateN(); await appliedOn(true, { 'applied.maxAgeHours': 72 }); const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank', new Date(OPEN.getTime() - 3_600_000 * 48));
  await nudgeTick(OPEN); assert.equal((await nudgesFor(w.user.id)).length, 1);
});

await t('S132', 'applied:safety', 'the test-number list applies: others are recorded as skipped and never messaged', async () => {
  await isolateN(); const a = await webLogin(); const b = await webLogin(); await appliedOn(true, { 'install.allowedNumbers': [a.phone] });
  await applyTo(a.user.id, 'IDFC FIRST Bank'); await applyTo(b.user.id, 'IDFC FIRST Bank');
  await nudgeTick(OPEN); await nudgeTick(MINUTES(10));
  const ha = (await nudgesFor(a.user.id))[0].history as any[]; const hb = (await nudgesFor(b.user.id))[0].history as any[];
  assert.equal(ha[0].outcome, 'sent'); assert.equal(hb[0].outcome, 'skipped'); assert.equal(hb[0].reason, 'not on the test-number list');
  assert.equal(waBodies().length, 1); assert.ok(!hits.some((h) => JSON.stringify(h.body).includes(b.phone)));
});

await t('S133', 'applied:safety', 'calling hours: applying at 20:55 holds the first message until 09:00 next morning, then sends it (inside the 12 h limit)', async () => {
  await isolateN(); await appliedOn(true, { 'applied.schedule': [{ channel: 'whatsapp', afterMinutes: 10 }] });
  const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank', IST(20, 55));
  await nudgeTick(IST(20, 55)); await nudgeTick(IST(21, 5)); await nudgeTick(IST(23)); await nudgeTick(IST(8, 59, 21)); assert.equal(hits.length, 0, 'quiet hours');
  await nudgeTick(IST(9, 1, 21)); assert.equal(waBodies().length, 1);
});

await t('S134', 'applied:safety', 'a message more than 12 hours late is skipped, not sent; the limit is editable', async () => {
  await isolateN(); await appliedOn(true, { 'applied.schedule': [{ channel: 'whatsapp', afterMinutes: 10 }] });
  const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank'); await nudgeTick(OPEN);
  await nudgeTick(MINUTES(10 + 13 * 60)); const [n] = await nudgesFor(w.user.id);
  assert.equal((n.history as any[])[0].outcome, 'skipped'); assert.equal((n.history as any[])[0].reason, 'too_late'); assert.equal(hits.length, 0);
});

await t('S135', 'applied:safety', 'a provider failure is recorded as failed, counts for nothing, and is never retried', async () => {
  await isolateN(); await appliedOn(true, { 'applied.minGapMinutes': 0 }); const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank'); await nudgeTick(OPEN);
  waMode = 'reject';
  try { for (let i = 0; i < 4; i++) await nudgeTick(MINUTES(10 + i)); } finally { waMode = 'ok'; }
  assert.equal(hitsFor('/api/v1/whatsapp').length, 1, 'exactly one attempt'); const [n] = await nudgesFor(w.user.id);
  assert.equal((n.history as any[])[0].outcome, 'failed'); assert.equal(n.lastSentAt, null, 'a failed send does not delay the next one');
});

await t('S136', 'applied:safety', 'two workers ticking at once send each step exactly once', async () => {
  await isolateN(); await appliedOn(); const w = await webLogin(); await applyTo(w.user.id, 'IDFC FIRST Bank'); await nudgeTick(OPEN);
  await prisma.$executeRawUnsafe(`UPDATE "LenderNudge" SET "nextCheckAt" = to_timestamp(0) WHERE status = 'active'`);
  await Promise.all([ln.lenderNudgeTick(MINUTES(10)), ln.lenderNudgeTick(MINUTES(10)), ln.lenderNudgeTick(MINUTES(10))]);
  assert.equal(waBodies().length, 1); assert.equal((await nudgesFor(w.user.id))[0].stepsSent, 1);
});

await t('S137', 'applied:handover', 'applying ends the "incomplete" install reminders, so the person never gets both ("incomplete" is wrong once they applied)', async () => {
  await isolateN(); await appliedOn(); const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { startAt: OPEN } });
  await applyTo(w.user.id, 'IDFC FIRST Bank', OPEN); // status stays offers_ready: the lender's own webhook has not (and may never) reported
  await tickAll(MINUTES(1)); const r = await reminderById(w.reminder!.id);
  assert.equal(r.status, 'stopped'); assert.equal(r.stopReason, 'application_finished'); assert.equal(r.stepsSent, 0);
});

await t('S138', 'applied:handover', 'a visitor who has NOT applied to a lender is unaffected (an offers_ready application alone still gets the install reminders)', async () => {
  await isolateN(); const w = await webLogin(); await prisma.loanApplication.create({ data: { userId: w.user.id, ref: `SL-N${Date.now()}`, amount: 100000, status: 'offers_ready' } });
  await tickAll(OPEN); assert.equal((await reminderById(w.reminder!.id)).status, 'active');
});

await t('S139', 'applied:handover', 'the stuck-stage nudges stand down while a lender sequence is active, and resume once it ends', async () => {
  await isolateN(); const w = await webLogin(); await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { status: 'stopped', stopReason: 'installed' } });
  assert.equal(await hasActiveInstallReminder(w.phone), false);
  await applyTo(w.user.id, 'IDFC FIRST Bank'); await nudgeTick(OPEN); assert.equal(await hasActiveInstallReminder(w.phone), true);
  await prisma.lenderNudge.updateMany({ where: { userId: w.user.id }, data: { status: 'completed' } }); assert.equal(await hasActiveInstallReminder(w.phone), false);
});

await t('S140', 'applied:admin', 'the new settings are in the admin Timings list with their defaults, saveable and resettable', async () => {
  await isolateN(); const sup = await adminTok('super_admin'); const g = await getTimings(sup);
  const want: Record<string, unknown> = { 'applied.sendEnabled': false, 'applied.minGapMinutes': 60, 'applied.maxLateHours': 12, 'applied.maxAgeHours': 24 };
  for (const [k, v] of Object.entries(want)) { const it = itemOf(g, k); assert.ok(it, k); assert.equal(it.effective, v, k); assert.equal(it.group, 'install'); }
  assert.deepEqual(itemOf(g, 'applied.schedule').effective, [{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'whatsapp', afterMinutes: 1440 }]);
  assert.equal((await putTimings({ 'applied.minGapMinutes': 30, 'applied.schedule': [{ channel: 'sms', afterMinutes: 5 }] }, sup)).status, 200);
  assert.equal(itemOf(await getTimings(sup), 'applied.minGapMinutes').effective, 30);
  assert.equal((await putTimings({ 'applied.minGapMinutes': 99999 }, sup)).status, 400);
  assert.equal((await putTimings({ 'applied.schedule': [{ channel: 'email', afterMinutes: 5 }] }, sup)).status, 400);
  assert.equal((await delTiming('applied.minGapMinutes', sup)).status, 200); assert.equal(itemOf(await getTimings(sup), 'applied.minGapMinutes').effective, 60);
  await clearTimings();
});

await t('S141', 'applied:job', 'the scheduler job runs no more often than "Reminder job runs every" says', async () => {
  await clearTimings(); const T = Date.now(); ln.resetLenderNudgeThrottle();
  assert.ok(await ln.lenderNudgeTickThrottled(T)); assert.equal(await ln.lenderNudgeTickThrottled(T + 30_000), null); assert.ok(await ln.lenderNudgeTickThrottled(T + 61_000));
  ln.resetLenderNudgeThrottle();
});

/* ───────────── S: asked for an OTP but never entered it (a short sequence), and the lean default schedule ───────────── */
async function otpRequestOnly(phone = newPhone()) {
  const rq = await post('/api/website/auth/otp/request', { phone }); assert.equal(rq.status, 200, 'otp request');
  await sleep(400); // arming is fire-and-forget
  const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
  return { phone, user, devOtp: rq.body.data.devOtp as string };
}
const rowsOf = (userId: string) => prisma.journeyReminder.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
const verifyOtp = async (phone: string, code: string) => { const vf = await post('/api/website/auth/otp/verify', { phone, code }); await sleep(400); return vf; };
const sendOn = (extra: Record<string, unknown> = {}) => TS.saveTimings({ 'install.sendEnabled': true, ...extra }, 't');

await t('S142', 'unverified', 'asking for an OTP arms one short "OTP verification" reminder; asking again, or for a number that already has one, adds nothing', async () => {
  await isolateN(); const o = await otpRequestOnly(); const [r] = await rowsOf(o.user.id);
  assert.ok(r); assert.equal(r.unverified, true); assert.equal(r.lastStep, 'otp_requested'); assert.equal(r.status, 'active'); assert.equal(r.cycle, 1); assert.equal(r.token.length, 8); assert.equal(r.firstName, null);
  await post('/api/website/auth/otp/request', { phone: o.phone }); await sleep(300); assert.equal((await rowsOf(o.user.id)).length, 1, 'a resend does not add a second one');
});

await t('S143', 'unverified', 'the default is two messages: WhatsApp 10 min after they stop, SMS a day later, naming "OTP verification" with "there" for the name; nothing after that', async () => {
  await isolateN(); await sendOn(); hits.length = 0; smsMode = 'ok';
  await upsertProviderConfig('voxvalley', { settings: { installWhatsapp: { template: 'install_app_resume_step', language: 'en', placeholders: ['{name}', '{step}', '{link}'] }, installSmsBody: 'At {step}: {link}' } });
  try {
    const o = await otpRequestOnly(); const [r] = await rowsOf(o.user.id); await prisma.journeyReminder.update({ where: { id: r.id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(MINUTES(9)); assert.equal(hits.length, 0, 'not before 10 minutes');
    await tickAll(MINUTES(10)); const wa = hitsFor('/api/v1/whatsapp'); assert.equal(wa.length, 1);
    const params = wa[0].body.template.components[0].parameters.map((x: any) => x.text); assert.deepEqual(params, ['there', 'OTP verification', `${(await import(`${ROOT}/config/downloads.js`)).downloads.publicBase}/dl?ref=${r.token}`]);
    await tickAll(MINUTES(24 * 60 + 5)); const sms = hitsFor('/sms'); assert.equal(sms.length, 1); assert.ok(sms[0].body.body.startsWith('At OTP verification: '), sms[0].body.body);
    await tickAll(MINUTES(5 * 24 * 60)); assert.equal(hits.length, 2, 'only two messages ever'); assert.equal((await rowsOf(o.user.id))[0].status, 'completed');
  } finally { await upsertProviderConfig('voxvalley', { settings: { installWhatsapp: { template: 'install_link', language: 'en', placeholders: ['{name}', '{link}'] }, installSmsBody: 'Continue your SwiftLoan application: {link} -PurpleTalk' } }); await clearTimings(); }
});

await t('S144', 'unverified', 'entering the code afterwards ends the short run and starts the normal one (same run number), with the right step', async () => {
  await isolateN(); const o = await otpRequestOnly(); const vf = await verifyOtp(o.phone, o.devOtp); assert.equal(vf.status, 200);
  const rows = await rowsOf(o.user.id); assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'stopped'); assert.equal(rows[0].stopReason, 'verified'); assert.equal(rows[0].unverified, true);
  assert.equal(rows[1].status, 'active'); assert.equal(rows[1].unverified, false); assert.equal(rows[1].cycle, 1, 'does not use up one of the visitor\'s runs'); assert.equal(rows[1].lastStep, 'otp_only');
});

await t('S145', 'unverified', 'entering the code AFTER the first message went out still hands over cleanly: the normal run starts from zero', async () => {
  await isolateN(); await sendOn(); hits.length = 0;
  try {
    const o = await otpRequestOnly(); const [r] = await rowsOf(o.user.id); await prisma.journeyReminder.update({ where: { id: r.id }, data: { startAt: OPEN } });
    await tickAll(OPEN); await tickAll(MINUTES(10)); assert.equal((await rowsOf(o.user.id))[0].stepsSent, 1);
    await verifyOtp(o.phone, o.devOtp); const rows = await rowsOf(o.user.id);
    assert.equal(rows[0].stopReason, 'verified'); assert.equal(rows[1].stepsSent, 0); assert.equal(rows[1].status, 'active'); assert.equal(rows[1].droppedAt, null, 'they are on the site right now');
  } finally { await clearTimings(); }
});

await t('S146', 'unverified', 'someone whose short run already finished still gets the normal reminders once they verify (the "full week already ran" rule ignores it)', async () => {
  await isolateN(); const o = await otpRequestOnly(); await prisma.journeyReminder.updateMany({ where: { userId: o.user.id }, data: { status: 'completed' } });
  await verifyOtp(o.phone, o.devOtp); const rows = await rowsOf(o.user.id);
  assert.equal(rows.length, 2); assert.equal(rows[1].status, 'active'); assert.equal(rows[1].unverified, false);
});

await t('S147', 'unverified', 'never armed when switched off, for a number that already had a reminder, for someone already in the app, or the review phone', async () => {
  await isolateN();
  await TS.saveTimings({ 'install.unverifiedEnabled': false }, 't'); const off = await otpRequestOnly(); assert.equal((await rowsOf(off.user.id)).length, 0, 'switched off'); await clearTimings();
  const known = await webLogin(); const before = (await rowsOf(known.user.id)).length; await post('/api/website/auth/otp/request', { phone: known.phone }); await sleep(300);
  assert.equal((await rowsOf(known.user.id)).length, before, 'a verified visitor asking for a new code is not "unverified"');
  const inApp = newPhone(); const u = await prisma.user.create({ data: { phone: inApp } }); const c = await prisma.customer.upsert({ where: { phone: inApp }, update: {}, create: { phone: inApp, userId: u.id } });
  await prisma.journeyEvent.create({ data: { customerId: c.id, channel: 'app', name: 'otp_verified', occurredAt: new Date(OPEN.getTime() - 86_400_000) } });
  await post('/api/website/auth/otp/request', { phone: inApp }); await sleep(400); assert.equal((await rowsOf(u.id)).length, 0, 'already in the app');
});

await t('S148', 'unverified', 'it stops when they install the app through the link, or are marked do-not-contact', async () => {
  await isolateN(); await sendOn(); hits.length = 0;
  try {
    const a = await otpRequestOnly(); const [ra] = await rowsOf(a.user.id);
    await prisma.appClick.create({ data: { token: 'TSTUNVER001', ref: ra.token, kind: 'campaign', platform: 'android', ipHash: 'x', uaHash: 'y', status: 'matched', matchedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000) } });
    const b = await otpRequestOnly(); await prisma.customer.upsert({ where: { phone: b.phone }, update: { currentStage: 'lost' }, create: { phone: b.phone, userId: b.user.id, currentStage: 'lost' } });
    for (const x of [a, b]) { const [r] = await rowsOf(x.user.id); await prisma.journeyReminder.update({ where: { id: r.id }, data: { startAt: OPEN } }); }
    await tickAll(OPEN); await tickAll(MINUTES(10));
    assert.equal((await rowsOf(a.user.id))[0].stopReason, 'installed'); assert.equal((await rowsOf(b.user.id))[0].stopReason, 'do_not_contact'); assert.equal(hits.length, 0);
  } finally { await clearTimings(); }
});

await t('S149', 'unverified', 'switch off (the default): only logs; with a test list, others are skipped and never messaged', async () => {
  await isolateN(); hits.length = 0; const a = await otpRequestOnly(); const b = await otpRequestOnly();
  for (const x of [a, b]) { const [r] = await rowsOf(x.user.id); await prisma.journeyReminder.update({ where: { id: r.id }, data: { startAt: OPEN } }); }
  await tickAll(OPEN); await tickAll(MINUTES(10)); assert.equal(hits.length, 0); assert.equal(((await rowsOf(a.user.id))[0].history as any[])[0].outcome, 'logged');
  await prisma.journeyReminder.updateMany({ where: { unverified: true }, data: { stepsSent: 0, history: [] as any, lastSentAt: null, nextCheckAt: new Date(0) } });
  await sendOn({ 'install.allowedNumbers': [a.phone] }); await tickAll(MINUTES(10));
  assert.equal(((await rowsOf(a.user.id))[0].history as any[])[0].outcome, 'sent'); const hb = ((await rowsOf(b.user.id))[0].history as any[])[0];
  assert.equal(hb.outcome, 'skipped'); assert.equal(hb.reason, 'not on the test-number list'); assert.ok(!hits.some((h) => JSON.stringify(h.body).includes(b.phone)));
  await clearTimings();
});

await t('S150', 'unverified', 'the short schedule is editable in Admin → Timings (and validated)', async () => {
  await isolateN(); const sup = await adminTok('super_admin'); const g = await getTimings(sup);
  assert.deepEqual(itemOf(g, 'install.unverifiedSchedule').effective, [{ channel: 'whatsapp', afterMinutes: 10 }, { channel: 'sms', afterMinutes: 1440 }]); assert.equal(itemOf(g, 'install.unverifiedEnabled').effective, true);
  assert.equal((await putTimings({ 'install.unverifiedSchedule': [{ channel: 'whatsapp', afterMinutes: 30 }] }, sup)).status, 200);
  assert.deepEqual(itemOf(await getTimings(sup), 'install.unverifiedSchedule').effective, [{ channel: 'whatsapp', afterMinutes: 30 }]);
  assert.equal((await putTimings({ 'install.unverifiedSchedule': Array.from({ length: 6 }, () => ({ channel: 'sms', afterMinutes: 5 })) }, sup)).status, 400, 'at most 5 messages for an unproven number');
  await clearTimings();
});

await t('S151', 'schedule:default', 'the lean default for a verified drop-off: 5 messages, WhatsApp 10 min, SMS 4 h, WhatsApp 1 day, SMS 3 days, WhatsApp 7 days, then done', async () => {
  await isolateN(); await sendOn();
  await upsertProviderConfig('voxvalley', { settings: { installWhatsapp: { template: 'install_app_resume_step', language: 'en', placeholders: ['{name}', '{step}', '{link}'] } } });
  try {
    const w = await webLogin(); const id = w.reminder!.id; await prisma.journeyReminder.update({ where: { id }, data: { startAt: OPEN } });
    for (const m of [0, 9, 10, 239, 240, 1439, 1440, 4319, 4320, 10079, 10080, 10090]) await tickAll(MINUTES(m));
    const r = await reminderById(id); const h = r.history as any[];
    assert.deepEqual(h.map((x) => x.channel), ['whatsapp', 'sms', 'whatsapp', 'sms', 'whatsapp']); assert.deepEqual(h.map((x) => x.outcome), ['sent', 'sent', 'sent', 'sent', 'sent']);
    assert.deepEqual(h.map((x) => Math.round((new Date(x.at).getTime() - OPEN.getTime()) / MIN_MS)), [10, 240, 1440, 4320, 10080]); assert.equal(r.status, 'completed');
    assert.equal(hitsFor('/api/v1/whatsapp').length, 3); assert.equal(hitsFor('/sms').length, 2);
  } finally { await upsertProviderConfig('voxvalley', { settings: { installWhatsapp: { template: 'install_link', language: 'en', placeholders: ['{name}', '{link}'] } } }); await clearTimings(); }
});

await t('S152', 'schedule:default', 'a visitor gets at most 2 runs by default (not 3)', async () => {
  await isolateN(); const w = await webLogin();
  await prisma.journeyReminder.update({ where: { id: w.reminder!.id }, data: { droppedAt: new Date(OPEN.getTime() - 60_000) } }); await rem.pingInstallReminder(w.user, OPEN);
  const c2 = await prisma.journeyReminder.findFirstOrThrow({ where: { userId: w.user.id, status: 'active' } }); assert.equal(c2.cycle, 2);
  await prisma.journeyReminder.update({ where: { id: c2.id }, data: { droppedAt: new Date(OPEN.getTime() - 60_000) } }); await rem.pingInstallReminder(w.user, OPEN);
  assert.equal(await prisma.journeyReminder.count({ where: { userId: w.user.id, status: 'active' } }), 0, 'no third run');
});

await isolateN(); await prisma.lenderPartner.deleteMany({ where: { name: { in: ['IDFC FIRST Bank', 'Hero FinCorp'] } } }).catch(() => undefined);

/* ───────────── report ───────────── */
const pass = results.filter((r) => r.status === 'PASS').length; const fail = results.length - pass;
fs.writeFileSync(process.env.RESULTS_FILE ?? '/tmp/server-suite-results.json', JSON.stringify({ total: results.length, pass, fail, results }, null, 2));
console.log(`\nSERVER SUITE: ${pass}/${results.length} passed, ${fail} failed`);
await prisma.journeyReminder.deleteMany(); await prisma.user.deleteMany({ where: { phone: { startsWith: '93' } } }); await prisma.user.deleteMany({ where: { phone: { startsWith: '95' } } });
server.close(); mock.close(); await prisma.$disconnect(); process.exit(fail ? 1 : 0);
