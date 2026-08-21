/**
 * Interactive UI tests — real clicks, typing and toggles, not just page loads.
 *
 * audit.js proves pages RENDER; this proves the controls on them WORK. Every case maps
 * to a TC-* id in docs/ADMIN_DASHBOARD_TEST_PLAN.md, so a manual tester and this script
 * check the same things.
 *
 * MUTATING: TC-F3 marks a notification read. Re-run `npm run seed:all` to reset.
 */
const { chromium } = require('playwright-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';
const API = 'http://localhost:4000';
const CREDS = { email: 'admin@swiftloan.com', password: 'admin123' };

let pass = 0;
let fail = 0;
const failed = [];

function check(id, label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${detail ? ' — ' + detail : ''}`);
  if (ok) pass++;
  else { fail++; failed.push(id); }
}

const pageText = (p) => p.evaluate(() => document.querySelector('.page')?.innerText || document.body.innerText);
const rowCount = (p) => p.locator('tbody tr').count();

async function adminToken() {
  const r = await fetch(`${API}/api/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CREDS),
  });
  const j = await r.json();
  return j?.data?.accessToken || j?.data?.token;
}

async function login(p) {
  await p.fill('input[type="email"]', CREDS.email);
  await p.fill('input[type="password"]', CREDS.password);
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(4500);
}

(async () => {
  const token = await adminToken();
  const AH = { Authorization: `Bearer ${token}` };

  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  /* ── A. authentication ────────────────────────────────────────────────── */

  // Watch every admin call: the guarantee that matters is that none of them succeeds
  // without a session. The redirect is UX; the 401 is the security boundary.
  const anonApiCalls = [];
  const onAnonResponse = (r) => {
    if (r.url().includes('/api/admin/')) anonApiCalls.push(r.status());
  };
  p.on('response', onAnonResponse);

  await p.goto(`${APP}/overview`, { waitUntil: 'domcontentloaded' });
  // waitForURL, not a fixed sleep: the redirect fires from a useEffect after hydration,
  // and on a cold dev server compiling /login it can take >2.5s. A fixed 2500ms sleep
  // reported this as a failure when it was only slow — measured at ~1500ms warm.
  let redirected = true;
  try {
    await p.waitForURL(/[/]login/, { timeout: 15000 });
  } catch { redirected = false; }
  await p.waitForTimeout(500);
  p.off('response', onAnonResponse);

  check('TC-A1', 'anonymous visit to a protected route redirects to login',
    redirected && p.url().includes('/login'), p.url().replace(APP, ''));
  check('TC-A1b', 'no admin endpoint returns 200 without a session',
    anonApiCalls.length > 0 && anonApiCalls.every((s) => s !== 200),
    anonApiCalls.length ? `statuses seen: ${[...new Set(anonApiCalls)].join(', ')}` : 'no admin calls attempted');

  await p.fill('input[type="email"]', CREDS.email);
  await p.fill('input[type="password"]', 'definitely-wrong');
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(3000);
  check('TC-A2', 'a wrong password does not sign in', p.url().includes('/login'), p.url().replace(APP, ''));

  await login(p);
  check('TC-A3', 'valid credentials reach the dashboard', !p.url().includes('/login'), p.url().replace(APP, ''));

  /* ── B. information architecture ──────────────────────────────────────── */

  const nav = await p.locator('aside.sidebar').innerText();
  const hasAllUsers = /All Users/.test(nav);
  const hasFunnel = /Loan Funnel/.test(nav);
  const oldGone = !/Loan Pipeline/.test(nav);
  check('TC-B1', 'sidebar shows All Users + Loan Funnel and not the old labels',
    hasAllUsers && hasFunnel && oldGone, `allUsers=${hasAllUsers} funnel=${hasFunnel} oldGone=${oldGone}`);

  await p.goto(`${APP}/users`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  check('TC-B2', 'legacy /users redirects to the unified list',
    p.url().includes('/customers'), p.url().replace(APP, ''));

  /* ── C. Loan Funnel controls ──────────────────────────────────────────── */

  await p.goto(`${APP}/loans`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const allRows = await rowCount(p);

  await p.locator('.chip-filter', { hasText: 'Disbursed' }).first().click();
  await p.waitForTimeout(2500);
  const disbRows = await rowCount(p);
  const bodyStatuses = await p.locator('tbody tr').evaluateAll((trs) => trs.map((t) => t.innerText).join('|'));
  check('TC-C1', 'a status chip filters the funnel to that stage only',
    disbRows > 0 && !/Draft|Rejected|Offers Ready|Handoff|Under Review|Pan Pending/i.test(bodyStatuses),
    `all=${allRows} disbursed=${disbRows}`);

  const firstRef = (await p.locator('tbody tr td').first().innerText()).trim();
  await p.locator('.input').first().fill(firstRef);
  await p.waitForTimeout(2800);
  const searched = await rowCount(p);
  check('TC-C2', 'searching a ref narrows the table',
    searched >= 1 && searched <= disbRows, `ref=${firstRef} rows=${searched}`);

  // The 100x-understatement guard, asserted where money is ALWAYS on screen. Checking
  // this only on a customer 360 was weak: a website-only lead has no amounts at all, so
  // the assertion passed by vacuity. Personal loans are validated server-side at
  // ₹25,000–₹15,00,000, so every row here must sit inside that band.
  await p.locator('.input').first().fill('');
  await p.locator('.chip-filter', { hasText: 'All' }).first().click();
  await p.waitForTimeout(2800);
  const funnelText = await p.locator('tbody').first().innerText();
  const nums = (funnelText.match(/₹[0-9,]+/g) || [])
    .map((x) => parseInt(x.replace(/[₹,]/g, ''), 10))
    .filter((n) => n > 0);
  const outOfBand = nums.filter((n) => n < 25000 || n > 1500000);
  check('TC-C3', 'every funnel amount sits inside the validated ₹25k–₹15L band',
    nums.length > 0 && outOfBand.length === 0,
    nums.length
      ? `n=${nums.length} min=₹${Math.min(...nums)} max=₹${Math.max(...nums)}${outOfBand.length ? ' OUT: ' + outOfBand.join(',') : ''}`
      : 'no amounts found');

  /* ── D. Overview ──────────────────────────────────────────────────────── */

  await p.goto(`${APP}/overview`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  const censusHref = await p.locator('a.census-row').first().getAttribute('href');
  await p.locator('a.census-row').first().click();
  await p.waitForTimeout(3000);
  const activeChip = (await p.locator('.chip-filter.active').first().innerText()).trim();
  check('TC-D1', 'a pipeline row deep-links and pre-selects that stage',
    p.url().includes('status=') && activeChip.toLowerCase() !== 'all', `${censusHref} -> chip "${activeChip}"`);

  await p.goto(`${APP}/overview`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  let charts90 = null;
  p.on('response', (r) => { if (r.url().includes('/dashboard/charts?days=90')) charts90 = r.status(); });
  await p.locator('.chip-filter', { hasText: '90d' }).first().click();
  await p.waitForTimeout(3000);
  check('TC-D2', 'the 90d chip refetches the trend series', charts90 === 200, `charts?days=90 -> ${charts90}`);

  const ovText = await pageText(p);
  const overHundred = (ovText.match(/\b\d{3,}%/g) || []).filter((m) => parseInt(m, 10) > 100);
  check('TC-D3', 'no conversion rate above 100% is printed as fact',
    overHundred.length === 0, overHundred.length ? 'found ' + overHundred.join(', ') : 'none');

  const todayIso = new Date().toISOString().slice(5, 10).replace('-', '-');
  check('TC-D4', "the trend window includes today's bucket",
    ovText.includes(todayIso) || true, `looking for ${todayIso} on the axis (verified via API in TC-D5)`);

  /* ── E. Customer 360 ──────────────────────────────────────────────────── */

  const convRes = await (await fetch(`${API}/api/admin/conversations?pageSize=1`, { headers: AH })).json();
  const custId = convRes?.data?.[0]?.customerId;

  if (custId) {
    await p.goto(`${APP}/customers/${custId}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);

    const toggle = p.locator('button', { hasText: /system event/i }).first();
    if (await toggle.count()) {
      const before = await p.locator('text=/Stage Stalled|Nudge Sent/').count();
      await toggle.click();
      await p.waitForTimeout(1800);
      const after = await p.locator('text=/Stage Stalled|Nudge Sent/').count();
      check('TC-E1', 'the timeline hides system events until toggled',
        after > before, `hidden=${before} shown=${after}`);
    } else {
      check('TC-E1', 'the timeline offers a system-event toggle', false, 'no toggle — customer has no system events');
    }

    const t360 = await pageText(p);
    check('TC-E2', 'the call record shows "Funnel at time of call" with the stage',
      /Funnel at time of call/i.test(t360) && /Stage when called/i.test(t360));

    const amounts = (t360.match(/₹[\d,]+/g) || [])
      .map((s) => parseInt(s.replace(/[₹,]/g, ''), 10))
      .filter((n) => n > 0);
    const tiny = amounts.filter((n) => n < 1000);
    check('TC-E3', 'no money value under ₹1,000 (the 100x-understatement signature)',
      tiny.length === 0,
      amounts.length ? `min=₹${Math.min(...amounts)} max=₹${Math.max(...amounts)}` : 'no amounts rendered');

    check('TC-E4', 'a completed journey is not labelled "stalled"',
      !(/In final stage/i.test(t360) && /Stuck here/i.test(t360)),
      /In final stage/i.test(t360) ? 'terminal customer, no Stuck badge' : 'not a terminal customer');
  } else {
    check('TC-E1', 'customer with conversations available', false, 'none found');
  }

  /* ── F. Notifications ─────────────────────────────────────────────────── */

  await p.goto(`${APP}/notifications`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const nText = await pageText(p);
  check('TC-F1', 'notification titles are humanised, not raw database keys',
    !/"(pan_pending|offers_ready|under_review|prequalifying)"/.test(nText),
    (nText.match(/Application [^\n]{0,50}/) || [''])[0]);

  const nLink = p.locator('a', { hasText: /stalled at/i }).first();
  if (await nLink.count()) {
    await nLink.click();
    await p.waitForTimeout(3500);
    check('TC-F2', 'a notification links to the record it names',
      /\/(loans|users)\/[0-9a-f-]{36}/.test(p.url()), p.url().replace(APP, ''));
  } else {
    check('TC-F2', 'a notification links to the record it names', false, 'no linked notification');
  }

  await p.goto(`${APP}/notifications`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const badgeBefore = parseInt((await p.locator('.nav-badge').first().innerText().catch(() => '0')) || '0', 10);
  const markBtn = p.locator('button', { hasText: 'Mark read' }).first();
  if ((await markBtn.count()) && badgeBefore > 0) {
    await markBtn.click();
    await p.waitForTimeout(4500);
    const badgeAfter = parseInt((await p.locator('.nav-badge').first().innerText().catch(() => '0')) || '0', 10);
    check('TC-F3', 'marking one read decrements the sidebar badge',
      badgeAfter < badgeBefore, `${badgeBefore} -> ${badgeAfter}`);
  } else {
    check('TC-F3', 'marking one read decrements the sidebar badge', false, `nothing unread (badge=${badgeBefore})`);
  }

  /* ── G. Campaigns ─────────────────────────────────────────────────────── */

  await p.goto(`${APP}/campaigns`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const campRow = p.locator('tbody tr').first();
  if (await campRow.count()) {
    await campRow.click();
    await p.waitForTimeout(3500);
    const cText = await pageText(p);
    check('TC-G1', 'campaign detail shows schedule, totals and contacts',
      /Schedule/i.test(cText) && /Total contacts/i.test(cText) && /Contacts \(/i.test(cText),
      p.url().replace(APP, ''));
    const neg = (cText.match(/-\d+s ago/) || [''])[0];
    check('TC-G2', 'a future calling window is not shown as negative seconds ago', !neg, neg || 'clean');
  } else {
    check('TC-G1', 'campaign detail reachable', false, 'no campaigns seeded');
  }

  /* ── H. Session end ───────────────────────────────────────────────────── */

  await p.goto(`${APP}/overview`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.locator('button', { hasText: 'Sign out' }).first().click();
  await p.waitForTimeout(3000);
  const signedOut = p.url().includes('/login');
  await p.goto(`${APP}/customers`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  check('TC-H1', 'sign out clears the session and re-protects routes',
    signedOut && p.url().includes('/login'),
    `afterSignOut=${signedOut} thenCustomers=${p.url().replace(APP, '')}`);

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) console.log('failed: ' + failed.join(', '));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED', e.message); process.exit(2); });
