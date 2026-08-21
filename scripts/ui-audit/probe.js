// Visit one route, wait a long time, and report the final URL + visible text.
// Used to distinguish "redirect is slow" from "redirect never happens".
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';
const route = process.argv[2];
const wait = parseInt(process.argv[3] || '12000', 10);

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(APP + '/login', { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', 'admin@swiftloan.com');
  await p.fill('input[type="password"]', 'admin123');
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(4000);

  const urls = [];
  p.on('framenavigated', (f) => { if (f === p.mainFrame()) urls.push(f.url().replace(APP, '')); });

  await p.goto(APP + route, { waitUntil: 'networkidle' });
  for (let i = 0; i < wait / 1000; i++) {
    await p.waitForTimeout(1000);
    process.stdout.write(`t+${i + 1}s url=${p.url().replace(APP, '')}\n`);
  }
  const txt = await p.evaluate(() => (document.querySelector('.page')?.innerText || document.body.innerText).replace(/\s+/g, ' ').slice(0, 300));
  console.log('nav history:', JSON.stringify(urls));
  console.log('page text:', txt);
  await b.close();
})();
