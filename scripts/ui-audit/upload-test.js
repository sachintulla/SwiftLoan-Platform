/**
 * TC-G5 — campaign spreadsheet upload, the one case the plan could not run for want of a
 * file. Builds a CSV with realistic header aliases plus deliberately bad rows, uploads it
 * through the real UI (file chooser, not an API call), and checks what came back.
 *
 * MUTATING: adds contacts to the draft campaign. `npm run seed:campaigns` resets it.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const APP = 'http://localhost:4001';
const API = 'http://localhost:4000';
const CREDS = { email: 'admin@swiftloan.com', password: 'admin123' };

let pass = 0, fail = 0; const failed = [];
const check = (id, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : (fail++, failed.push(id));
};

// Deliberate mix: alias headers ("Mobile Number", "Loan Amount", "Loan Type"), a rupee
// amount with commas and a ₹ sign, a duplicate phone, a blank phone, and a junk phone.
const CSV = [
  'Full Name,Mobile Number,Email ID,Location,Loan Type,Loan Amount',
  'Ananya Raghavan,9812345670,ananya@example.com,Pune,personal,"₹4,50,000"',
  'Vikram Shetty,9812345671,vikram@example.com,Mumbai,business,650000',
  'Priya Menon,9812345672,priya@example.com,Kochi,home,1200000',
  'Duplicate Person,9812345670,dup@example.com,Pune,personal,300000',
  'No Phone Person,,nophone@example.com,Delhi,personal,250000',
  'Junk Phone,abcdefg,junk@example.com,Surat,personal,250000',
].join('\n');

(async () => {
  const lr = await fetch(`${API}/api/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(CREDS),
  });
  const token = (await lr.json())?.data?.accessToken;
  const AH = { Authorization: `Bearer ${token}` };
  const api = async (u) => (await fetch(API + u, { headers: AH })).json();

  // The draft campaign is the safe target — it is not dialling.
  const camps = await api('/api/admin/campaigns?pageSize=20');
  const draft = (camps?.data || []).find((c) => c.status === 'draft') || (camps?.data || [])[0];
  if (!draft) { console.error('no campaign to upload into'); process.exit(2); }
  const before = await api(`/api/admin/campaigns/${draft.id}`);
  const countBefore = before?.data?.stats?.contactsByState
    ? Object.values(before.data.stats.contactsByState).reduce((a, n) => a + n, 0)
    : (before?.data?.contacts?.length ?? 0);

  const csvPath = path.join(__dirname, 'tc-g5-contacts.csv');
  fs.writeFileSync(csvPath, CSV, 'utf8');

  const b = await chromium.launch({ executablePath: EDGE, headless: true });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 1200 } })).newPage();
  await p.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.fill('input[type="email"]', CREDS.email);
  await p.fill('input[type="password"]', CREDS.password);
  await p.click('button[type="submit"], .btn-primary');
  await p.waitForTimeout(5000);

  await p.goto(`${APP}/campaigns/${draft.id}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(4000);

  const fileInput = p.locator('input[type="file"]').first();
  check('TC-G5a', await fileInput.count() > 0, 'upload control present on the campaign page');
  if (!(await fileInput.count())) { await b.close(); process.exit(1); }

  await fileInput.setInputFiles(csvPath);
  await p.waitForTimeout(7000);

  const pageText = await p.evaluate(() => document.querySelector('.page')?.innerText || '');
  const after = await api(`/api/admin/campaigns/${draft.id}`);
  const contacts = after?.data?.contacts || [];
  const countAfter = after?.data?.stats?.contactsByState
    ? Object.values(after.data.stats.contactsByState).reduce((a, n) => a + n, 0)
    : contacts.length;

  check('TC-G5b', countAfter > countBefore, `contacts ${countBefore} -> ${countAfter}`);

  // Header aliases must have mapped: "Full Name"→name, "Mobile Number"→phone, etc.
  const ananya = contacts.find((c) => c.phone === '9812345670');
  check('TC-G5c', !!ananya && /Ananya/i.test(ananya.name || ''),
    ananya ? `name="${ananya.name}" city="${ananya.city}" product="${ananya.product}"` : 'row not imported');

  // "₹4,50,000" must land as 45000000 paise (parseAmount strips non-digits, ×100).
  check('TC-G5d', ananya && ananya.amount === 45000000,
    ananya ? `amount stored = ${ananya.amount} paise (= ₹${(ananya.amount / 100).toLocaleString('en-IN')})` : 'n/a');

  // Duplicate phone within one campaign is deduped by the @@unique([campaignId, phone]).
  const dupes = contacts.filter((c) => c.phone === '9812345670').length;
  check('TC-G5e', dupes === 1, `rows for the duplicated phone: ${dupes}`);

  // Rows with no usable phone must be rejected, not silently imported.
  const blank = contacts.filter((c) => !c.phone || c.phone.length < 10);
  check('TC-G5f', blank.length === 0, `unusable-phone rows imported: ${blank.length}`);

  // And the operator must be told about them.
  check('TC-G5g', /skip|invalid|reject|error|duplicate/i.test(pageText),
    (pageText.match(/[^\n]*(skipped|invalid|rejected|duplicate)[^\n]*/i) || ['no summary shown'])[0].trim().slice(0, 110));

  fs.unlinkSync(csvPath);
  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) console.log('failed: ' + failed.join(', '));
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASHED', e.message); process.exit(2); });
