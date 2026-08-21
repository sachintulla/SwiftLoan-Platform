/**
 * Admin dashboard audit harness.
 *
 * Logs in once, discovers real entity ids from the API, then visits every route and
 * records: console errors, uncaught page errors, failed network requests, whether the
 * page rendered an empty/error state, and a full-page screenshot.
 *
 * Output: audit/report.json + audit/<slug>.png
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';
const API = 'http://localhost:4000';
const OUTDIR = path.join(__dirname, 'audit');
const WIDTH = 1440;

const CREDS = { email: 'admin@swiftloan.com', password: 'admin123' };

async function api(pathname, token) {
  const res = await fetch(API + pathname, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) return null;
  return res.json();
}

async function discoverRoutes() {
  const loginRes = await fetch(API + '/api/admin/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CREDS),
  });
  const lj = await loginRes.json();
  const token = lj?.data?.accessToken || lj?.data?.token;
  if (!token) throw new Error('login failed: ' + JSON.stringify(lj).slice(0, 200));

  const pick = (r) => (Array.isArray(r) ? r[0] : r?.rows?.[0] || r?.[0]);

  const users = await api('/api/admin/users?pageSize=3', token);
  const loans = await api('/api/admin/loans?pageSize=3', token);
  const leads = await api('/api/admin/leads?pageSize=3', token);
  const custs = await api('/api/admin/customers?pageSize=3', token);
  const camps = await api('/api/admin/campaigns?pageSize=3', token);
  // The page fetches `/preapproved-plans`, not `/preapproved`.
  const plans = await api('/api/admin/preapproved-plans', token);

  const userId = pick(users?.data)?.id;
  const leadId = pick(leads?.data)?.id;
  // `/customers/:id` takes Customer.id (a uuid), not the phone number.
  const custKey = pick(custs?.data)?.id;
  const campId = pick(camps?.data)?.id;
  const planId = pick(plans?.data)?.id;

  // Prefer a *disbursed* application for the detail page: the first row is often an
  // early-stage draft, whose empty "no offers / not disbursed" sections say nothing
  // about whether those sections actually render.
  const disbursed = await api('/api/admin/loans?status=disbursed&pageSize=2', token);
  const appId = pick(disbursed?.data)?.id || pick(loans?.data)?.id;

  const routes = [
    // ── top level ──
    ['overview', '/overview'],
    ['customers', '/customers'],
    ['users', '/users'],
    ['onboarding', '/onboarding'],
    ['leads', '/leads'],
    ['loans', '/loans'],
    ['downloads', '/downloads'],
    ['campaigns', '/campaigns'],
    ['campaigns-new', '/campaigns/new'],
    ['preapproved', '/preapproved'],
    ['preapproved-new', '/preapproved/new'],
    ['notifications', '/notifications'],
    ['notifications-rules', '/notifications-rules'],
    ['analytics', '/analytics'],
    ['audit', '/audit'],
    ['integrations', '/integrations'],
    ['account', '/account'],
  ];

  // ── detail routes (only if we found an id) ──
  if (userId) routes.push(['user-detail', `/users/${userId}`]);
  if (userId) routes.push(['onboarding-detail', `/onboarding/${userId}`]);
  if (appId) routes.push(['loan-detail', `/loans/${appId}`]);
  if (leadId) routes.push(['lead-detail', `/leads/${leadId}`]);
  if (custKey) routes.push(['customer-detail', `/customers/${encodeURIComponent(custKey)}`]);
  if (campId) routes.push(['campaign-detail', `/campaigns/${campId}`]);
  if (planId) routes.push(['preapproved-detail', `/preapproved/${planId}`]);

  return { routes, ids: { userId, appId, leadId, custKey, campId, planId } };
}

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const { routes, ids } = await discoverRoutes();
  console.log('discovered ids:', JSON.stringify(ids));

  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: WIDTH, height: 1000 } });
  const page = await ctx.newPage();

  // Log in through the real form so the app stores its token however it likes.
  await page.goto(APP + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', CREDS.email);
  await page.fill('input[type="password"]', CREDS.password);
  await page.click('button[type="submit"], .btn-primary');
  await page.waitForTimeout(4000);
  console.log('after login:', page.url());

  const report = [];

  for (const [slug, route] of routes) {
    const consoleErrors = [];
    const pageErrors = [];
    const netFails = [];

    const onConsole = (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Hydration noise is app-wide and pre-existing; record it once, separately.
      if (/Hydration|hydrat/i.test(t)) { consoleErrors.push('HYDRATION'); return; }
      consoleErrors.push(t.slice(0, 300));
    };
    const onPageError = (e) => pageErrors.push(String(e.message).slice(0, 300));
    const onResponse = (r) => {
      if (r.status() >= 400) netFails.push(`${r.status()} ${r.url().replace(API, '').replace(APP, '')}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    let nav = 'ok';
    try {
      await page.goto(APP + route, { waitUntil: 'networkidle', timeout: 45000 });
    } catch (e) {
      nav = 'NAV_FAIL: ' + e.message.slice(0, 120);
    }
    // 5s, not 3s: /leads/[id] resolves the lead then client-redirects to the customer
    // journey, and at 3s it was still on the interstitial — which read as a broken
    // page when it was only a slow hop.
    await page.waitForTimeout(5000);

    // What did the user actually end up looking at?
    const probe = await page.evaluate(() => {
      const txt = document.body.innerText || '';
      const norm = txt.replace(/\s+/g, ' ').trim();
      return {
        h1: document.querySelector('h1')?.innerText?.trim() || null,
        emptyStates: Array.from(document.querySelectorAll('.empty')).map((e) => e.innerText.trim()).slice(0, 6),
        skeletons: document.querySelectorAll('.skeleton').length,
        cards: document.querySelectorAll('.card').length,
        tableRows: document.querySelectorAll('tbody tr').length,
        statTiles: document.querySelectorAll('.stat').length,
        hasNextErrorOverlay: !!document.querySelector('nextjs-portal'),
        // crude but effective: does the page show a raw unit-less zero-money everywhere
        mentionsRupeeZero: (norm.match(/₹0(?!\d)/g) || []).length,
        textLen: norm.length,
        snippet: norm.slice(0, 220),
      };
    });

    const shot = path.join(OUTDIR, slug + '.png');
    try { await page.screenshot({ path: shot, fullPage: true }); } catch {}

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);

    const hydrationCount = consoleErrors.filter((c) => c === 'HYDRATION').length;
    const realConsole = consoleErrors.filter((c) => c !== 'HYDRATION');

    const row = {
      slug, route, nav,
      finalUrl: page.url().replace(APP, ''),
      ...probe,
      hydrationErrors: hydrationCount,
      consoleErrors: [...new Set(realConsole)],
      pageErrors: [...new Set(pageErrors)],
      netFails: [...new Set(netFails)],
    };
    report.push(row);

    const flags = [];
    // Hydration errors get their own bucket because they were once app-wide noise —
    // but they MUST still be flagged, or a regression hides behind a "clean" line.
    // (This reporting gap existed briefly: hydrationErrors was recorded and then never
    // surfaced, so a page could hydration-error and still print clean.)
    if (row.hydrationErrors > 0) flags.push('HYDRATION:' + row.hydrationErrors);
    if (nav !== 'ok') flags.push('NAV');
    if (row.netFails.length) flags.push('NET:' + row.netFails.length);
    if (row.pageErrors.length) flags.push('PAGEERR');
    if (row.consoleErrors.length) flags.push('CONSOLE');
    if (row.skeletons > 0) flags.push('STUCK_SKELETON:' + row.skeletons);
    if (row.emptyStates.length) flags.push('EMPTY:' + row.emptyStates.length);
    if (row.textLen < 400) flags.push('THIN_PAGE');
    console.log(
      `${slug.padEnd(20)} ${String(row.finalUrl).padEnd(44)} ${flags.join(' ') || 'clean'}`,
    );
  }

  fs.writeFileSync(path.join(OUTDIR, 'report.json'), JSON.stringify({ ids, report }, null, 2));
  console.log('\nwrote', path.join(OUTDIR, 'report.json'));
  await browser.close();
})().catch((e) => { console.error('AUDIT FAILED', e); process.exit(1); });
