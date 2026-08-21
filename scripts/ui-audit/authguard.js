/**
 * Is TC-A1 a real hole (unauthenticated users see the dashboard) or just a slow redirect?
 *
 * Reports the URL every 500ms and whether any customer data leaked onto the page while
 * it waited, so "slow" and "broken" cannot be confused.
 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

  // Record any admin API call that succeeds while unauthenticated — that would be the
  // actually-serious failure, as opposed to a cosmetic delay in redirecting.
  const apiCalls = [];
  p.on('response', (r) => {
    if (r.url().includes('/api/admin/')) apiCalls.push(`${r.status()} ${r.url().split('/api/admin/')[1].split('?')[0]}`);
  });

  await p.goto(`${APP}/overview`, { waitUntil: 'domcontentloaded' });
  for (let i = 1; i <= 20; i++) {
    await p.waitForTimeout(500);
    const url = p.url().replace(APP, '');
    if (url.includes('/login')) { console.log(`redirected to /login after ~${i * 500}ms`); break; }
    if (i === 20) console.log(`STILL on ${url} after 10s — this would be a real hole`);
  }

  const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
  console.log('final url :', p.url().replace(APP, ''));
  console.log('page text :', text);
  console.log('admin API calls made while unauthenticated:', apiCalls.length ? apiCalls.join(', ') : 'none');

  const leaked = apiCalls.some((c) => c.startsWith('200'));
  console.log(leaked ? 'LEAK: an admin endpoint returned 200 without a session' : 'no data leak: no admin endpoint returned 200');

  await b.close();
})();
