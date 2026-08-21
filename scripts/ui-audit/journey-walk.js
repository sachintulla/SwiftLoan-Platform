/**
 * Walk the end-to-end customer journey by CLICKING, never by typing a URL.
 *
 * The point of the dashboard is that an operator can start at the overview and reach
 * everything about a person without going back to a list and searching. This asserts
 * that path exists.
 */
const { chromium } = require('playwright-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';

const steps = [];
function record(label, ok, detail) {
  steps.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });

  await p.goto(APP + '/login', { waitUntil: 'networkidle' });
  await p.fill('input[type="email"]', 'admin@swiftloan.com');
  await p.fill('input[type="password"]', 'admin123');
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(4000);

  // 1. Overview → a pipeline stage row deep-links into the filtered pipeline.
  await p.goto(APP + '/overview', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const censusRow = p.locator('a.census-row').first();
  const haveCensus = await censusRow.count();
  if (!haveCensus) { record('overview: pipeline row is a link', false); }
  else {
    const href = await censusRow.getAttribute('href');
    await censusRow.click();
    await p.waitForTimeout(2500);
    record('overview → filtered pipeline', p.url().includes('/loans?status='), `${href} → ${p.url().replace(APP, '')}`);
    // The chip for that stage should be the active filter, not "All".
    const active = await p.locator('.chip-filter.active').first().innerText().catch(() => '');
    record('filtered pipeline: stage chip is active', active.trim().toLowerCase() !== 'all', `active chip = "${active.trim()}"`);
  }

  // 2. Pipeline row → application detail.
  const firstRow = p.locator('tbody tr').first();
  if (await firstRow.count()) {
    await firstRow.click();
    await p.waitForTimeout(3000);
    record('pipeline → application detail', /\/loans\/[0-9a-f-]{36}/.test(p.url()), p.url().replace(APP, ''));
  } else {
    record('pipeline → application detail', false, 'no rows to click');
  }

  // 3. Application detail → customer 360 (the link that did not exist before).
  const journeyBtn = p.locator('a', { hasText: 'Full customer journey' }).first();
  if (await journeyBtn.count()) {
    await journeyBtn.click();
    await p.waitForTimeout(3000);
    record('application → customer 360', /\/customers\/[0-9a-f-]{36}/.test(p.url()), p.url().replace(APP, ''));
  } else {
    record('application → customer 360', false, 'no "Full customer journey" link on the page');
  }

  // 4. The 360 view actually contains the cross-channel picture.
  const body = await p.evaluate(() => document.body.innerText);
  record('360 shows journey stepper', /Journey/.test(body));
  record('360 shows conversation history', /Conversation history/.test(body));
  record('360 shows voice calls', /Voice calls/.test(body));
  record('360 shows website enquiries', /Website enquiries/.test(body));
  record('360 shows attribution', /Origin & attribution/.test(body));
  record('360 shows app account', /App account/.test(body));
  record('360 shows full timeline', /Timeline/.test(body));

  // 5. 360 → app profile → back to the 360 (the loop closes).
  const profileBtn = p.locator('a', { hasText: 'View profile' }).first();
  if (await profileBtn.count()) {
    await profileBtn.click();
    await p.waitForTimeout(3000);
    const onUser = /\/users\/[0-9a-f-]{36}/.test(p.url());
    record('360 → app profile', onUser, p.url().replace(APP, ''));
    const backBtn = p.locator('a', { hasText: 'Full customer journey' }).first();
    if (await backBtn.count()) {
      await backBtn.click();
      await p.waitForTimeout(2500);
      record('app profile → 360 (round trip)', /\/customers\/[0-9a-f-]{36}/.test(p.url()), p.url().replace(APP, ''));
    } else {
      record('app profile → 360 (round trip)', false, 'no link back to the journey');
    }
  } else {
    record('360 → app profile', false, 'no "View profile" link (customer may have no app account)');
  }

  // 6. A notification links to the record it is about.
  await p.goto(APP + '/notifications', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const notifLink = p.locator('a', { hasText: 'stalled at' }).first();
  if (await notifLink.count()) {
    await notifLink.click();
    await p.waitForTimeout(3000);
    record('notification → the record it is about', /\/(loans|users)\/[0-9a-f-]{36}/.test(p.url()), p.url().replace(APP, ''));
  } else {
    record('notification → the record it is about', false, 'notification titles are not links');
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} passed`);
  if (failed.length) console.log('failed: ' + failed.map((f) => f.label).join('; '));
  await b.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('WALK CRASHED', e.message); process.exit(2); });
