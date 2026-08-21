/**
 * Send (or dry-run) a real OTP SMS to one number through the configured provider.
 *
 *   node sms-send.js <server/.env> <10-digit-phone>            # dry run, sends nothing
 *   node sms-send.js <server/.env> <10-digit-phone> --send     # actually dials the gateway
 *
 * Reproduces sendViaVox() from server/src/lib/sms.ts exactly, so the body shown in the dry
 * run is byte-for-byte what a real send would post. It refuses to send unless BOTH halves
 * of the credential are present — a partial credential makes the gateway 14xx every OTP.
 */
const fs = require('fs');

const envPath = process.argv[2];
const phoneArg = (process.argv[3] || '').replace(/\D/g, '');
const doSend = process.argv.includes('--send');

if (!envPath || phoneArg.length !== 10) {
  console.error('usage: node sms-send.js <path-to-server/.env> <10-digit-phone> [--send]');
  process.exit(2);
}

const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
  env[m[1]] = v;
}

const CC = env.SMS_DEFAULT_CC || '91';
const toE164 = (p) => `+${CC}${p.slice(-10)}`;

// A realistic 6-digit code, not a fixed one — this is what the customer would receive.
const code = String(Math.floor(100000 + Math.random() * 900000));

const DEFAULT_IN_CODE =
  '{#var#} is your OTP to register/login to your account. Do not share this with anyone. T&C apply - PTIPL';
const template = env.VOX_TEMPLATE_TEXT || DEFAULT_IN_CODE;
const body = template.replace(/\{#var#\}/g, code);

const base = env.VOX_BASE_URL || 'https://cpaas.voxdigitals.com/sms-customer-apis/sms/v1/send';
const form = new URLSearchParams({
  authtoken: env.VOX_AUTH_TOKEN || '',
  projectid: env.VOX_PROJECT_ID || '',
  to: toE164(phoneArg),
  body,
});
if (env.VOX_SENDER) form.set('from', env.VOX_SENDER);
if (env.VOX_TEMPLATE_ID) form.set('template_id', env.VOX_TEMPLATE_ID);
if (env.VOX_DLR_URL) form.set('dlr_url', env.VOX_DLR_URL);
form.set('expiry', env.VOX_EXPIRY_MINUTES || '10');

const redacted = new URLSearchParams(form);
redacted.set('authtoken', env.VOX_AUTH_TOKEN ? '<redacted>' : '(EMPTY)');
redacted.set('projectid', env.VOX_PROJECT_ID ? '<redacted>' : '(EMPTY)');

console.log('─── request that would be POSTed ───');
console.log('  POST', base);
console.log('  content-type: application/x-www-form-urlencoded');
for (const [k, v] of redacted.entries()) console.log(`  ${k.padEnd(11)} = ${v}`);
console.log('\n  message the handset would show:');
console.log('  "' + body + '"');
console.log(`  (${body.length} chars, one SMS segment: ${body.length <= 160 ? 'yes' : 'NO — will be split and billed as ' + Math.ceil(body.length / 153) + ' parts'})`);

const haveCreds = !!(env.VOX_AUTH_TOKEN && env.VOX_PROJECT_ID);
console.log('\n─── credential check ───');
console.log('  VOX_AUTH_TOKEN:', env.VOX_AUTH_TOKEN ? 'set' : 'EMPTY');
console.log('  VOX_PROJECT_ID:', env.VOX_PROJECT_ID ? 'set' : 'EMPTY');

if (!doSend) {
  console.log('\nDRY RUN — nothing sent. Re-run with --send once both credentials are set.');
  process.exit(0);
}

if (!haveCreds) {
  console.error('\nREFUSING TO SEND: both VOX_AUTH_TOKEN and VOX_PROJECT_ID are required.');
  console.error('The gateway rejects a partial credential with a 14xx error on every OTP,');
  console.error('so sending now would only produce a misleading failure.');
  process.exit(1);
}

(async () => {
  console.log('\n─── sending ───');
  const res = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const text = await res.text();
  console.log('  HTTP', res.status);
  console.log('  response:', text.slice(0, 600));

  let json = null;
  try { json = JSON.parse(text); } catch { /* gateway may answer plain text */ }
  const codeField = json && (json.code ?? json.statusCode ?? json.status);

  // A 200 here does NOT mean delivered. Indian operators drop a template mismatch
  // silently, and Vox still answers success — this is the trap documented in sms.ts.
  console.log('\n─── how to read this ───');
  if (res.ok && (codeField == null || String(codeField).startsWith('2') || /success/i.test(text))) {
    console.log('  Gateway ACCEPTED the message. That is not proof of delivery:');
    console.log('  if the body does not match the DLT-registered template exactly, the');
    console.log('  operator drops it and you still see success here. Confirm on the handset.');
    console.log('  OTP that should arrive:', code);
  } else {
    console.log('  Gateway REJECTED it. 14xx codes are credential/DLT problems —');
    console.log('  check the auth token, project id, sender header and template id.');
  }
})().catch((e) => { console.error('send threw:', e.message); process.exit(1); });
