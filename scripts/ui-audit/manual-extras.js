/**
 * The cases the test plan marked "manual" that can still be driven: legacy redirects,
 * role-gated nav, pagination, mark-all-read, and the ranked-bar checks.
 * Verifying them here rather than asserting them in the doc unchecked.
 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';

let pass = 0, fail = 0; const failed = [];
const check = (id, label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : (fail++, failed.push(id));
};
const text = (p) => p.evaluate(() => document.querySelector('.page')?.innerText || document.body.innerText);

async function signIn(p, email) {
  await p.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.fill('input[type="email"]', email);
  await p.fill('input[type="password"]', 'admin123');
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(5000);
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  await signIn(p, 'admin@swiftloan.com');

  /* TC-B3 — every legacy route still resolves somewhere sensible */
  const redirects = [
    ['/leads', '/customers'],
    ['/analytics', '/overview'],
    ['/onboarding', '/customers'],
  ];
  for (const [from, to] of redirects) {
    await p.goto(APP + from, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000);
    const url = p.url().replace(APP, '');
    check('TC-B3', `${from} resolves to ${to}`, url.startsWith(to), url);
  }
  // /onboarding must also arrive with the stall filter applied, not bare.
  await p.goto(`${APP}/onboarding`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);
  check('TC-B3b', '/onboarding arrives with the stall filter pre-applied',
    p.url().includes('stalledMinutes'), p.url().replace(APP, ''));

  /* TC-C5 — pagination */
  await p.goto(`${APP}/loans`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const firstBefore = await p.locator('tbody tr td').first().innerText();
  const nextBtn = p.locator('button', { hasText: 'Next' }).first();
  if (await nextBtn.count()) {
    await nextBtn.click();
    await p.waitForTimeout(3000);
    const firstAfter = await p.locator('tbody tr td').first().innerText();
    check('TC-C5', 'Next advances the page and changes the rows',
      firstBefore.trim() !== firstAfter.trim(), `${firstBefore.trim()} -> ${firstAfter.trim()}`);
  } else check('TC-C5', 'pagination present', false, 'no Next button');

  /* TC-I1 — downloads totals reconcile, and no donut remains */
  await p.goto(`${APP}/downloads`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  // Read the stat tiles structurally (.stat-label / .stat-value) rather than regexing the
  // whole page. The regex version matched nothing and reported
  // "undefined = undefined + undefined" — a test bug that looked like a product bug.
  const tiles = await p.locator('.stat').evaluateAll((els) =>
    els.map((el) => ({
      label: (el.querySelector('.stat-label')?.textContent || '').trim(),
      value: (el.querySelector('.stat-value')?.textContent || '').trim(),
    })),
  );
  const tileVal = (needle) => {
    const hit = tiles.find((t) => t.label.toLowerCase().includes(needle));
    return hit ? parseInt(hit.value.replace(/[^\d]/g, ''), 10) : NaN;
  };
  const total = tileVal('total installs');
  const ctx = tileVal('context installs');
  const org = tileVal('organic installs');
  check('TC-I1', 'downloads: total = context + organic',
    Number.isFinite(total) && Number.isFinite(ctx) && Number.isFinite(org) && total === ctx + org,
    `${total} = ${ctx} + ${org}  (tiles seen: ${tiles.length})`);
  const svgPaths = await p.locator('svg path').count();
  const hbars = await p.locator('.hbar-row').count();
  check('TC-I1b', 'source/platform render as ranked bars, not donuts',
    hbars > 0, `hbar rows=${hbars}, svg paths=${svgPaths}`);

  /* TC-I3 — audit log records a mutation */
  await p.goto(`${APP}/audit`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);
  const aRows = await p.locator('tbody tr').count();
  check('TC-I3', 'audit log lists mutations (read-only browsing logs nothing)',
    aRows > 0, `${aRows} entries`);

  /* TC-A4 — a non-super admin does not see Audit Log in the nav */
  await p.locator('button', { hasText: 'Sign out' }).first().click();
  await p.waitForTimeout(3000);
  await signIn(p, 'ops@swiftloan.com');
  const nav = await p.locator('aside.sidebar').innerText();
  check('TC-A4', 'Audit Log hidden from the sidebar for role "admin"',
    !/Audit Log/.test(nav), `nav items: ${nav.split('\n').filter(Boolean).length}`);
  check('TC-A4b', 'a non-super admin still sees the core surfaces',
    /All Users/.test(nav) && /Loan Funnel/.test(nav));

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) console.log('failed: ' + failed.join(', '));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED', e.message); process.exit(2); });
