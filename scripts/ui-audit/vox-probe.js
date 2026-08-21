/**
 * Discover what https://api.vox-cpaas.in/sendsms expects, WITHOUT sending a message.
 *
 * The endpoint the operator gave us is a different host and path from the one hardcoded in
 * server/src/lib/sms.ts, so its parameter names are unknown. Guessing and firing a real
 * send is the wrong move twice over: a malformed request wastes a billable attempt, and a
 * request the gateway *accepts* but the operator drops is indistinguishable from success.
 *
 * So: send deliberately incomplete requests (no recipient) and read the validation errors.
 * Nothing here can deliver an SMS — there is no destination in any of them.
 */
const BASE = 'https://api.vox-cpaas.in/sendsms';
const KEY = process.argv[2];
if (!KEY) { console.error('usage: node vox-probe.js <auth-key>'); process.exit(2); }

const show = async (label, res) => {
  const text = await res.text();
  console.log(`\n── ${label}`);
  console.log('   HTTP', res.status, res.headers.get('content-type') || '');
  console.log('   body:', text.slice(0, 400).replace(/\s+/g, ' '));
};

(async () => {
  // 1. Bare GET — many CPaaS gateways document a GET query-string form and will list
  //    required parameters when none are supplied.
  try {
    await show('GET with no params', await fetch(BASE));
  } catch (e) { console.log('\n── GET with no params\n   threw:', e.message); }

  // 2. GET with the key only, under a few common parameter names.
  for (const keyName of ['authkey', 'authtoken', 'apikey', 'api_key', 'key', 'token']) {
    try {
      const u = new URL(BASE);
      u.searchParams.set(keyName, KEY);
      await show(`GET ?${keyName}=<key>`, await fetch(u));
    } catch (e) { console.log(`\n── GET ?${keyName}\n   threw:`, e.message); }
  }

  // 3. Form POST with the key only — the shape sms.ts currently uses.
  try {
    const form = new URLSearchParams({ authtoken: KEY });
    await show('POST form authtoken=<key>', await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }));
  } catch (e) { console.log('\n── POST form\n   threw:', e.message); }

  // 4. JSON POST with the key only, plus the key as a bearer header.
  try {
    await show('POST json {authtoken}', await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authtoken: KEY }),
    }));
  } catch (e) { console.log('\n── POST json\n   threw:', e.message); }

  try {
    await show('POST json + Authorization: Bearer', await fetch(BASE, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({}),
    }));
  } catch (e) { console.log('\n── POST bearer\n   threw:', e.message); }
})();
