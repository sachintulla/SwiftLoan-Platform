/* End-to-end smoke test against a running server (node fetch). */
const BASE = process.env.BASE || 'http://localhost:4000';
let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`, extra ?? ''); }
}
async function j(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function run() {
  const phone = String(9000000000 + Math.floor(Math.random() * 999999999)).slice(0, 10);
  console.log(`SwiftLoan API smoke test → ${BASE} (phone ${phone})`);

  const health = await j('GET', '/api/health');
  check('health ok', health.status === 200 && health.data.status === 'ok');

  const reg = await j('POST', '/api/auth/register', { phone, email: `u${phone}@ex.com`, lang: 'en' });
  check('register 201', reg.status === 201, reg.data);
  const otp = reg.data.devOtp || '123456';

  const verify = await j('POST', '/api/auth/otp/verify', { phone, code: otp });
  check('otp verify → tokens', verify.status === 200 && !!verify.data.accessToken, verify.data);
  const token = verify.data.accessToken;

  const me = await j('GET', '/api/users/me', undefined, token);
  check('GET /users/me', me.status === 200 && me.data.user.phone === phone);

  const patch = await j('PATCH', '/api/users/me', { fullName: 'Asha Kumari', pincode: '560001', gender: 'female', monthlyIncome: 65000 }, token);
  check('PATCH /users/me updates profile', patch.status === 200 && patch.data.user.fullName === 'Asha Kumari', patch.data);

  const lang = await j('PATCH', '/api/users/me/language', { lang: 'hi' }, token);
  check('PATCH language', lang.status === 200 && lang.data.user.lang === 'hi');

  const notif = await j('PATCH', '/api/users/me/notifications', { promoOffers: true }, token);
  check('PATCH notifications', notif.status === 200 && notif.data.user.notifyPromoOffers === true);

  const emi = await j('POST', '/api/tools/emi', { amount: 150000, tenureMonths: 24, rate: 16 });
  check('EMI tool computes', emi.status === 200 && emi.data.emi > 7000 && emi.data.emi < 7600, emi.data);

  const partners = await j('GET', '/api/catalog/partners');
  check('partners seeded', partners.status === 200 && partners.data.partners.length >= 3, partners.data);

  const app = await j('POST', '/api/applications', { loanType: 'personal', amount: 45000, tenureMonths: 60 }, token);
  check('create application', app.status === 201 && !!app.data.application.ref, app.data);
  const appId = app.data.application.id;

  const panPatch = await j('PATCH', `/api/applications/${appId}`, { panNumber: 'ABCDE1234F' }, token);
  check('attach PAN', panPatch.status === 200 && panPatch.data.application.status === 'pan_pending');

  const preq = await j('POST', `/api/applications/${appId}/prequalify`, {}, token);
  check('prequalify → 3 offers', preq.status === 200 && preq.data.offers.length === 3, preq.data);
  const recommended = preq.data.offers.find((o: any) => o.recommended) || preq.data.offers[0];

  const sel = await j('POST', `/api/applications/${appId}/offers/${recommended.id}/select`, {}, token);
  check('select offer', sel.status === 200 && sel.data.offer.selected === true);

  const kyc = await j('POST', '/api/kyc/aadhaar', { applicationId: appId, reference: 'XXXX-1234' }, token);
  check('kyc aadhaar submitted (pending real verification)', kyc.status === 201 && kyc.data.verification.status === 'pending', kyc.data);

  const handoff = await j('POST', `/api/applications/${appId}/handoff`, {}, token);
  check('handoff → loan created', handoff.status === 201 && !!handoff.data.loan.ref, handoff.data);
  const loanId = handoff.data.loan.id;

  const loans = await j('GET', '/api/loans', undefined, token);
  check('list loans', loans.status === 200 && loans.data.loans.length === 1);

  const loan = await j('GET', `/api/loans/${loanId}`, undefined, token);
  check('loan detail + schedule', loan.status === 200 && loan.data.loan.repayments.length === 60, loan.data.summary);

  const firstRepayment = loan.data.loan.repayments[0];
  const pay = await j('POST', `/api/loans/${loanId}/repayments/${firstRepayment.id}/pay`, {}, token);
  check('pay first EMI', pay.status === 200 && pay.data.repayment.status === 'paid');

  const score = await j('GET', '/api/users/me/credit-score', undefined, token);
  check('credit score', score.status === 200 && score.data.score === 750);

  const ticket = await j('POST', '/api/support/tickets', { type: 'grievance', subject: 'Test grievance' }, token);
  check('support ticket', ticket.status === 201);

  // auth negative case
  const noauth = await j('GET', '/api/users/me');
  check('unauth → 401', noauth.status === 401);

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((e) => { console.error(e); process.exit(1); });
