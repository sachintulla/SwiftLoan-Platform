/**
 * One real send attempt to a given number, with the credentials we actually have.
 *
 * The probe established: this host routes to the same /sms-customer-apis/sms/v1/send path
 * the code already targets, accepts only form-encoded POST, and answers
 * `code 1401 Invalid Credentials` when the credential is incomplete. A 1401 does not
 * deliver anything, so attempting is safe and tells us whether `projectid` is genuinely
 * required — which is the open question.
 *
 * Attempts are made one at a time, most-likely-correct first, and STOP at the first
 * non-1401 answer so we never fire more billable requests than necessary.
 */
const KEY = process.argv[2];
const PHONE = (process.argv[3] || '').replace(/\D/g, '');
const BASE = 'https://api.vox-cpaas.in/sendsms';
const SENDER = process.argv[4] || 'SW_app';
const TEMPLATE_ID = '1677100000000389280';
const TEMPLATE =
  'Dear Customer, your SwiftLoan login OTP is {#var#}. This OTP is valid for 10 minutes. Do not share this OTP with anyone. Team SwiftLoan';

if (!KEY || PHONE.length !== 10) {
  console.error('usage: node vox-attempt.js <auth-key> <10-digit-phone> [sender]');
  process.exit(2);
}

const code = String(Math.floor(100000 + Math.random() * 900000));
const body = TEMPLATE.replace(/\{#var#\}/g, code);

async function attempt(label, extra) {
  const form = new URLSearchParams({
    authtoken: KEY,
    to: `+91${PHONE}`,
    body,
    from: SENDER,
    template_id: TEMPLATE_ID,
    expiry: '10',
    ...extra,
  });
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch {}
  const c = j?.code;
  console.log(`\n── ${label}`);
  console.log('   HTTP', res.status, '| code', c ?? '(none)', '|', (j?.status ?? text).toString().slice(0, 160));
  return { c, j, text };
}

(async () => {
  console.log('sending OTP code', code, 'to +91' + PHONE, 'from sender', SENDER);

  // 1. No projectid at all — is it actually required?
  let r = await attempt('authtoken only (no projectid)', {});
  if (r.c !== 1401) return verdict(r);

  // 2. Some deployments accept the key as both halves.
  r = await attempt('projectid = same as authtoken', { projectid: KEY });
  if (r.c !== 1401) return verdict(r);

  console.log('\n─── result ───');
  console.log('  Every attempt returned 1401 Invalid Credentials, so NOTHING was sent.');
  console.log('  `projectid` is a genuinely separate value and cannot be derived from the');
  console.log('  auth key. It is not any of the DLT identifiers (UAN / TID / PE id) — those');
  console.log('  belong to the DLT registry, not to the Vox account.');
  console.log('  Needed: the Project ID from the Vox CPaaS dashboard for this account.');

  function verdict(res) {
    console.log('\n─── result ───');
    const ok = res.j && (String(res.j.code ?? '').startsWith('2') || /success|queued|accept/i.test(String(res.j.status ?? '')));
    if (ok) {
      console.log('  Gateway ACCEPTED the message. OTP in it:', code);
      console.log('  NOT proof of delivery: if the body or the sender header does not match');
      console.log('  what is registered on DLT, the operator drops it silently and this still');
      console.log('  reads as success. Confirm on the handset.');
    } else {
      console.log('  Gateway responded with something other than 1401:', JSON.stringify(res.j ?? res.text).slice(0, 300));
      console.log('  Read the code against the 14xx table in server/src/lib/sms.ts.');
    }
  }
})();
