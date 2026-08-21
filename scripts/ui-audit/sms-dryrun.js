/**
 * DLT template dry-run — builds the EXACT form body sendViaVox() would POST, and
 * verifies it reproduces the approved template character-for-character.
 *
 * Sends nothing. This is the check that matters: Vox answers "200 Success" even when the
 * operator drops the message for a template mismatch, so a wrong body is indistinguishable
 * from a working send until you notice no SMS ever arrived.
 */
const fs = require('fs');
const path = require('path');

const ENV = path.join(__dirname, '..', '..', '..', '..', '..', '..');
// Load server/.env without adding a dependency.
const envPath = process.argv[2];
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}

// Exactly what the DLT portal shows as approved.
const APPROVED =
  'Dear Customer, your SwiftLoan login OTP is {#var#}. This OTP is valid for 10 minutes. Do not share this OTP with anyone. Team SwiftLoan';

const DEFAULT_IN_CODE =
  '{#var#} is your OTP to register/login to your account. Do not share this with anyone. T&C apply - PTIPL';

const CODE = '482913';
const PHONE = '9876543210';
const DEFAULT_CC = env.SMS_DEFAULT_CC ?? '91';

function toE164(phone) {
  const digits = phone.replace(/\D/g, '');
  if (phone.trim().startsWith('+')) return '+' + digits;
  if (digits.length > 10) return '+' + digits;
  return `+${DEFAULT_CC}${digits}`;
}

const template = env.VOX_TEMPLATE_TEXT ?? DEFAULT_IN_CODE;
const body = template.replace(/\{#var#\}/g, CODE);
const expected = APPROVED.replace(/\{#var#\}/g, CODE);

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

console.log('─── configuration ───');
console.log('  SMS_PROVIDER      :', env.SMS_PROVIDER || '(unset)');
console.log('  VOX_SENDER        :', env.VOX_SENDER || '(unset)');
console.log('  VOX_TEMPLATE_ID   :', env.VOX_TEMPLATE_ID || '(unset)');
console.log('  VOX_EXPIRY_MINUTES:', env.VOX_EXPIRY_MINUTES || '10 (default)');
console.log('  VOX_AUTH_TOKEN    :', env.VOX_AUTH_TOKEN ? '<set>' : '(EMPTY — cannot send)');
console.log('  VOX_PROJECT_ID    :', env.VOX_PROJECT_ID ? '<set>' : '(EMPTY — cannot send)');

console.log('\n─── the body that would be POSTed ───');
console.log('  ' + JSON.stringify(body));
console.log('  length:', body.length, 'chars');

console.log('\n─── checks ───');
check('provider is vox', env.SMS_PROVIDER === 'vox', env.SMS_PROVIDER);
check('template text is configured (not the old hardcoded default)',
  template !== DEFAULT_IN_CODE,
  template === DEFAULT_IN_CODE ? 'still using the in-code default — operator WILL drop it' : 'from VOX_TEMPLATE_TEXT');
check('body matches the approved template character-for-character', body === expected,
  body === expected ? `${body.length} chars` : 'MISMATCH');
check('the variable was substituted, no placeholder left', !/\{#var#\}/.test(body) && body.includes(CODE));
check('template id is the approved one', env.VOX_TEMPLATE_ID === '1677100000000389280', env.VOX_TEMPLATE_ID);
check('recipient is normalised to E.164 with a leading +', toE164(PHONE) === '+919876543210', toE164(PHONE));

// smsConfigured() gate — both halves of the credential are required.
const configured = !!(env.VOX_AUTH_TOKEN && env.VOX_PROJECT_ID);
check('smsConfigured() would be TRUE (real SMS instead of dev OTP)', configured,
  configured ? 'ready to send' : 'FALSE — app correctly falls back to the dev OTP');

if (body !== expected) {
  console.log('\n  diff:');
  console.log('    expected:', JSON.stringify(expected));
  console.log('    actual  :', JSON.stringify(body));
  for (let i = 0; i < Math.max(body.length, expected.length); i++) {
    if (body[i] !== expected[i]) {
      console.log(`    first difference at index ${i}: expected ${JSON.stringify(expected[i])}, got ${JSON.stringify(body[i])}`);
      break;
    }
  }
}

console.log(`\n${pass}/${pass + fail} checks passed`);
console.log(configured
  ? '\nReady to send. Supply a destination number to do a live test.'
  : '\nNOT sending: VOX_AUTH_TOKEN and VOX_PROJECT_ID are empty, and no destination number was given.');
