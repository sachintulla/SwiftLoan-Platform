// Screenshot the admin dashboard using system Edge (no Chromium download).
// Logs in through the real form so the app stores whatever token shape it expects.
const { chromium } = require('playwright-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:4001';
const OUT = process.argv[2] || 'overview.png';
const PATH_TO = process.argv[3] || '/overview';
const WIDTH = parseInt(process.argv[4] || '1440', 10);

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 1100 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', 'admin@swiftloan.com');
  await page.fill('input[type="password"], input[name="password"]', 'admin123');
  await page.click('button[type="submit"], .btn-primary');
  await page.waitForTimeout(3500);

  await page.goto(BASE + PATH_TO, { waitUntil: 'networkidle' });
  // Let SWR settle and the bar transitions finish.
  await page.waitForTimeout(3500);

  await page.screenshot({ path: OUT, fullPage: true });
  console.log('url:', page.url());
  console.log('shot:', OUT);
  if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.slice(0, 12).join('\n'));
  else console.log('no console errors');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
