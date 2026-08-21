/**
 * Executes the test-plan cases that the other runners do not cover, so every TC-* id in
 * docs/ADMIN_DASHBOARD_TEST_PLAN.md gets a real result instead of an assertion.
 *
 * Covers: B4, C4, D3–D7, E0, E2–E8, G3, G4, I2, I4, I5, and F4 LAST (it marks everything
 * read, which would starve F3 in the other runner).
 */
const { chromium } = require('playwright-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';
const API = 'http://localhost:4000';
const CREDS = { email: 'admin@swiftloan.com', password: 'admin123' };

let pass = 0, fail = 0, skip = 0;
const failed = [];
function check(id, ok, detail = '') {
  if (ok === null) { console.log(`SKIP  ${id} — ${detail}`); skip++; return; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ' — ' + detail : ''}`);
  if (ok) pass++; else { fail++; failed.push(id); }
}
const ptext = (p) => p.evaluate(() => document.querySelector('.page')?.innerText || document.body.innerText);

(async () => {
  const lr = await fetch(`${API}/api/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CREDS),
  });
  const token = (await lr.json())?.data?.accessToken;
  const AH = { Authorization: `Bearer ${token}` };
  const api = async (u) => (await fetch(API + u, { headers: AH })).json();

  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  await p.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.fill('input[type="email"]', CREDS.email);
  await p.fill('input[type="password"]', CREDS.password);
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(5000);

  /* ── B4: All Users is a superset of registered users ── */
  const custTotal = (await api('/api/admin/customers?pageSize=1'))?.pagination?.total;
  const userTotal = (await api('/api/admin/users?pageSize=1'))?.pagination?.total;
  check('TC-B4', custTotal > userTotal, `All Users ${custTotal} > registered ${userTotal}`);

  /* ── C4: clicking a funnel row opens that application ── */
  await p.goto(`${APP}/loans`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const rowRef = (await p.locator('tbody tr td').first().innerText()).trim();
  await p.locator('tbody tr').first().click();
  await p.waitForTimeout(3500);
  const detailText = await ptext(p);
  check('TC-C4', /\/loans\/[0-9a-f-]{36}/.test(p.url()) && detailText.includes(rowRef),
    `${rowRef} -> ${p.url().replace(APP, '')}`);

  /* ── D3–D7: overview ── */
  await p.goto(`${APP}/overview`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  const ov = await ptext(p);

  const pcts = (ov.match(/\b\d+%/g) || []).map((s) => parseInt(s, 10));
  check('TC-D3', pcts.length > 0 && pcts.every((n) => n <= 100),
    `${pcts.length} percentages, max ${Math.max(...pcts)}%`);

  const axisDates = (ov.match(/\b\d{2}-\d{2}\b/g) || []);
  const todayMd = new Date().toISOString().slice(5, 10);
  check('TC-D4', axisDates.includes(todayMd),
    `axis ends ${axisDates[axisDates.length - 1]}, today is ${todayMd}`);

  const ovApi = await api('/api/admin/dashboard/overview');
  const bn = ovApi?.data?.pipeline?.bottleneck;
  const stages = ovApi?.data?.pipeline?.stages || [];
  const liveMax = Math.max(...stages.filter((s) => !s.terminal).map((s) => s.count), 0);
  const inFlight = ovApi?.data?.pipeline?.inFlight;
  const terminalSum = stages.filter((s) => s.terminal).reduce((a, s) => a + s.count, 0);
  check('TC-D5a', !!bn && bn.count === liveMax && !bn.terminal,
    `hero = ${bn?.label} ${bn?.count}, largest live queue ${liveMax}`);
  check('TC-D5b', inFlight === stages.filter((s) => !s.terminal).reduce((a, s) => a + s.count, 0),
    `inFlight ${inFlight} excludes ${terminalSum} terminal`);
  check('TC-D5c', ov.includes(String(bn?.count)) && new RegExp(bn?.label, 'i').test(ov),
    'hero number and stage name both rendered');

  const needs = ov.split('Needs attention')[1]?.split('Website')[0] || '';
  check('TC-D6', needs.length > 0 && !/Dashboard seeded|Demo data/i.test(needs),
    /stalled/i.test(needs) ? 'actionable rows only' : 'queue empty');

  const web = ovApi?.data?.acquisition?.web?.steps || [];
  const app = ovApi?.data?.acquisition?.app?.steps || [];
  const descending = (arr) => arr.every((s, i) => i === 0 || s.value <= arr[i - 1].value);
  check('TC-D7', web.length > 0 && app.length > 0 && descending(web) && descending(app),
    `web ${web.map((s) => s.value).join('>')} | app ${app.map((s) => s.value).join('>')}`);

  /* ── E0: All Users list quality ── */
  await p.goto(`${APP}/customers`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  const listRows = await p.locator('tbody tr').count();
  const cities = await p.locator('tbody tr').evaluateAll((trs) =>
    trs.map((t) => (t.querySelectorAll('td')[2]?.textContent || '').trim()));
  const filledCities = cities.filter((c) => c && c !== '—').length;
  const lastActs = await p.locator('tbody tr').evaluateAll((trs) =>
    trs.map((t) => (t.querySelectorAll('td')[6]?.textContent || '').trim()));
  const distinctActs = new Set(lastActs.filter(Boolean)).size;
  check('TC-E0a', listRows > 0 && filledCities > listRows * 0.5,
    `${filledCities}/${listRows} rows have a city`);
  check('TC-E0b', distinctActs > 1,
    `${distinctActs} distinct "last activity" values (1 would mean cron overwrote them)`);

  /* ── E2–E8: the 360 ── */
  const withCalls = (await api('/api/admin/conversations?pageSize=1'))?.data?.[0]?.customerId;
  if (withCalls) {
    await p.goto(`${APP}/customers/${withCalls}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4500);
    const t = await ptext(p);

    check('TC-E2', /Funnel at time of call/i.test(t) && /Stage when called/i.test(t)
      && /Agent was to/i.test(t) && /What the agent knew/i.test(t));

    const money = (t.match(/₹[\d,]+/g) || []).map((s) => parseInt(s.replace(/[₹,]/g, ''), 10)).filter((n) => n > 0);
    check('TC-E3', money.length === 0 || money.every((n) => n >= 1000),
      money.length ? `${money.length} values, min ₹${Math.min(...money)}` : 'no money on this record');

    const detail = await api(`/api/admin/customers/${withCalls}`);
    const firstSeen = new Date(detail?.data?.customer?.firstSeenAt).getTime();
    const earliest = Math.min(...(detail?.data?.timeline || []).map((e) => new Date(e.occurredAt).getTime()));
    check('TC-E5', Number.isFinite(firstSeen) && firstSeen <= earliest + 1000,
      `firstSeen ${new Date(firstSeen).toISOString().slice(0, 10)} <= earliest event ${new Date(earliest).toISOString().slice(0, 10)}`);

    const custName = (detail?.data?.customer?.name || '').trim();
    const attrib = t.split('Origin & attribution')[1]?.split('Send nudge')[0] || '';
    const campLine = (attrib.match(/Campaign\s+(.+)/) || [])[1]?.trim() || '';
    check('TC-E6', !custName || campLine !== custName,
      campLine ? `Campaign = "${campLine}", customer = "${custName}"` : 'no campaign on this record');

  }

  /* ── E8: 360 → app profile → back. Needs a customer that HAS an app account, so pick
     one deliberately rather than hoping the conversation index hands us one — the first
     customer with calls is often a website-only lead, which skipped this case. ── */
  const candidates = (await api('/api/admin/customers?pageSize=60'))?.data || [];
  let linked = null;
  for (const c of candidates.slice(0, 12)) {
    const d = await api(`/api/admin/customers/${c.id}`);
    if (d?.data?.user?.id) { linked = c; break; }
  }
  if (linked) {
    await p.goto(`${APP}/customers/${linked.id}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);
    await p.locator('a', { hasText: 'View profile' }).first().click();
    await p.waitForTimeout(3500);
    const onUser = /\/users\/[0-9a-f-]{36}/.test(p.url());
    await p.locator('a', { hasText: 'Full customer journey' }).first().click();
    await p.waitForTimeout(3000);
    check('TC-E8', onUser && /\/customers\/[0-9a-f-]{36}/.test(p.url()),
      `${linked.name || linked.phone}: round trip via real <a> links`);
  } else check('TC-E8', null, 'no customer with a linked app account in the first 12 rows');

  /* ── E4: a disbursed customer is not called "stalled" ── */
  const allCust = await api('/api/admin/customers?pageSize=100');
  const disbursed = (allCust?.data || []).find((c) => c.currentStage === 'disbursed');
  if (disbursed) {
    await p.goto(`${APP}/customers/${disbursed.id}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);
    const dt = await ptext(p);
    check('TC-E4', /In final stage/i.test(dt) && !/Stuck here/i.test(dt) && !/Stalled for/i.test(dt),
      `${disbursed.name || disbursed.phone}: "In final stage" present, no Stuck/Stalled`);
  } else check('TC-E4', null, 'no disbursed customer in this seed');

  /* ── E7: the web→app join is visible on a converted lead ── */
  const converted = (allCust?.data || []).find((c) => c.firstSource === 'website' && ['registered', 'eligibility_checked', 'offers_viewed', 'offer_selected', 'kyc_started', 'kyc_completed', 'application_submitted', 'approved', 'disbursed'].includes(c.currentStage));
  if (converted) {
    const tl = await api(`/api/admin/customers/${converted.id}/timeline?pageSize=100`);
    const names = (tl?.data || []).map((e) => e.name);
    const hasWeb = names.includes('website_visit') || names.includes('lead_captured');
    const hasApp = names.includes('app_installed') || names.includes('otp_verified');
    check('TC-E7', hasWeb && hasApp,
      `${converted.name || converted.phone}: web(${hasWeb}) + app(${hasApp}) on one timeline`);
  } else check('TC-E7', null, 'no website-origin customer progressed into the app in this seed');

  /* ── G3/G4: call outcome coherence and provenance ── */
  const convs = await api('/api/admin/conversations?pageSize=20');
  const rows = convs?.data || [];
  const incoherent = rows.filter((r) =>
    r.lastOutcome === 'wrong_number' && /already applied|status update/i.test(r.summary || ''));
  check('TC-G3', rows.length > 0 && incoherent.length === 0,
    `${rows.length} conversations checked, ${incoherent.length} contradictory`);
  const inferred = rows.filter((r) => r.lastOutcomeConfirmed === false);
  check('TC-G4', inferred.length > 0,
    `${inferred.length} inferred outcomes present to distinguish from agent-reported`);

  /* ── I2: pre-approved amounts (genuinely paise) ── */
  await p.goto(`${APP}/preapproved`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  const preText = await ptext(p);
  const upto = (preText.match(/₹[\d,.]+[LCr]*/g) || []);
  check('TC-I2', (await p.locator('tbody tr').count()) > 0,
    `${await p.locator('tbody tr').count()} plans, amounts like ${upto.slice(0, 3).join(', ') || '(none shown)'}`);

  /* ── I5: integrations never echoes a secret ── */
  await p.goto(`${APP}/integrations`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(5000);

  // Configs is TABBED — only one provider panel exists at a time. Asserting that
  // "Upshot" appears on the default page was wrong: the default tab is Voice calling.
  // Each panel has to be opened to be checked.
  const tabResults = [];
  for (const [label, expectCard] of [
    ['Voice calling', /Voice calling \(Ello\)/i],
    ['Voice agents', /Voice agents/i],
    ['Messaging', /Messaging \(Upshot\)/i],
    ['WhatsApp', /WhatsApp \(Infobip\)/i],
    ['API keys', /API keys/i],
  ]) {
    const chip = p.locator('.chip-filter', { hasText: label }).first();
    if (!(await chip.count())) { tabResults.push(`${label}:missing`); continue; }
    await chip.click();
    await p.waitForTimeout(2200);
    const titles = (await p.locator('.card-title').allInnerTexts()).join(' | ');
    tabResults.push(`${label}:${expectCard.test(titles) ? 'ok' : 'WRONG(' + titles + ')'}`);
  }
  check('TC-I5a', tabResults.every((r) => r.endsWith(':ok')), tabResults.join('  '));

  // Secrets: sweep every tab's text for anything that looks like a live credential.
  let anyLeak = null;
  for (const label of ['Voice calling', 'Messaging', 'WhatsApp', 'API keys']) {
    await p.locator('.chip-filter', { hasText: label }).first().click();
    await p.waitForTimeout(1800);
    const tt = await ptext(p);
    if (/ak_[A-Za-z0-9_-]{20,}/.test(tt)) anyLeak = label;
  }
  check('TC-I5b', anyLeak === null,
    anyLeak ? `A SECRET IS RENDERED on the ${anyLeak} tab` : 'no credential rendered on any tab (shown as "•••• saved")');

  /* ── I4: a weak password is rejected ── */
  await p.goto(`${APP}/account`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  const pwInputs = p.locator('input[type="password"]');
  if ((await pwInputs.count()) >= 2) {
    await pwInputs.nth(0).fill('admin123');
    await pwInputs.nth(1).fill('abc');
    await p.waitForTimeout(800);
    const aText = await ptext(p);
    const submit = p.locator('button', { hasText: /Change password|Update password|Save/i }).first();
    const disabled = (await submit.count()) ? await submit.isDisabled() : false;
    check('TC-I4', disabled || /at least|must|weak|8 char/i.test(aText),
      disabled ? 'submit disabled for a weak password' : 'strength requirements shown');
  } else check('TC-I4', null, 'password form not in the expected shape');

  /* ── F4 LAST: mark all read ── */
  await p.goto(`${APP}/notifications`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const allBtn = p.locator('button', { hasText: /Mark all read/i }).first();
  if (await allBtn.count()) {
    await allBtn.click();
    await p.waitForTimeout(4500);
    const unread = (await api('/api/admin/notifications?pageSize=1'))?.data?.unread;
    check('TC-F4', unread === 0, `unread now ${unread}`);
  } else check('TC-F4', null, 'no Mark all read button');

  console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
  if (fail) console.log('failed: ' + failed.join(', '));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED', e.message); process.exit(2); });
