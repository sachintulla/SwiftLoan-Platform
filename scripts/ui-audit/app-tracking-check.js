/**
 * Prove the handset → server → dashboard path for the CANONICAL funnel events.
 *
 * Impersonates the app: logs in the way the app does (OTP), then POSTs exactly the
 * event names src/state/store.ts now emits, and asserts each one became a JourneyEvent
 * with the right stage — i.e. that the dashboard's 360 view, stage machine and stall
 * rules can all see it. Before the canonical rename this would have silently written
 * telemetry only.
 */
const API = 'http://localhost:4000';
const ADMIN = { email: 'admin@swiftloan.com', password: 'admin123' };

// The canonical names the app emits on those screens (FUNNEL_EVENTS in store.ts),
// paired with the journey event each one is expected to become. `kyc_submitted`
// deliberately lands as `kyc_started`: submitting ONE document is not completing KYC,
// and treating it as completion would silence the rule that chases half-finished KYC.
const APP_EVENTS = [
  ['eligibility_started', 'basic', 'eligibility_started'],
  ['offer_viewed', 'offers', 'offer_viewed'],
  ['offer_selected', 'handoff', 'offer_selected'],
  ['kyc_started', 'kyc', 'kyc_started'],
  ['kyc_submitted', 'aadhaar', 'kyc_started'],
  ['application_submitted', 'status', 'application_submitted'],
];
// Emitted by the app but deliberately telemetry-only — must NOT reach the journey.
const TELEMETRY_ONLY = [['pan_submitted', 'basicpan'], ['credit_score_viewed', 'creditscore']];

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
let pass = 0, fail = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  ok ? pass++ : fail++;
};

(async () => {
  // ── admin token, to read back what the dashboard would show ──
  const al = await j(await fetch(`${API}/api/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ADMIN),
  }));
  const adminTok = al?.data?.accessToken || al?.data?.token;
  const AH = { Authorization: `Bearer ${adminTok}` };

  // ── pick a user who is still EARLY in the funnel, and log in as the app does ──
  //
  // Not just the first user: `isForwardStage` refuses to move a customer backwards, so
  // sending these events to someone already at `disbursed` correctly changes nothing
  // and proves nothing about stage advancement.
  const STAGE_ORDER = [
    'lead_captured', 'contacted', 'app_installed', 'registered', 'eligibility_checked',
    'offers_viewed', 'offer_selected', 'kyc_started', 'kyc_completed',
    'application_submitted', 'approved', 'disbursed',
  ];
  // Must be early in the funnel AND have an app account: most early-stage customers
  // are website-only leads with no User row, and /api/track needs a user session.
  const allCust = await j(await fetch(`${API}/api/admin/customers?pageSize=100`, { headers: AH }));
  const candidates = (allCust?.data ?? []).filter(
    (c) => c.phone && STAGE_ORDER.indexOf(c.currentStage) >= 0
      && STAGE_ORDER.indexOf(c.currentStage) < STAGE_ORDER.indexOf('application_submitted'),
  );
  let user = null, stageBefore = '(unknown)';
  for (const c of candidates) {
    const hit = await j(await fetch(
      `${API}/api/admin/users?pageSize=1&search=${encodeURIComponent(c.phone)}`, { headers: AH },
    ));
    const u = hit?.data?.[0];
    if (u?.phone === c.phone) { user = u; stageBefore = c.currentStage; break; }
  }
  if (!user?.phone) { console.error('no early-funnel customer with an app account'); process.exit(2); }
  console.log(`  acting as ${user.phone}, customer stage before = ${stageBefore}
`);

  const req = await j(await fetch(`${API}/api/auth/otp/request`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: user.phone }),
  }));
  const otp = req?.devOtp;
  check(!!otp, 'app can request an OTP', otp ? 'devOtp surfaced in dev' : JSON.stringify(req).slice(0, 120));

  const ver = await j(await fetch(`${API}/api/auth/otp/verify`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: user.phone, code: otp }),
  }));
  const userTok = ver?.accessToken || ver?.token || ver?.data?.accessToken;
  check(!!userTok, 'app can verify the OTP and get a session');
  if (!userTok) { console.error(JSON.stringify(ver).slice(0, 300)); process.exit(2); }
  const UH = { 'Content-Type': 'application/json', Authorization: `Bearer ${userTok}` };

  // ── the customer record this user resolves to, before we send anything ──
  const before = await j(await fetch(`${API}/api/admin/customers?pageSize=1&search=${user.phone}`, { headers: AH }));
  const custId = before?.data?.[0]?.id;
  check(!!custId, 'user resolves to a customer the dashboard can show');

  const countJourney = async () => {
    const r = await j(await fetch(`${API}/api/admin/customers/${custId}/timeline?pageSize=200`, { headers: AH }));
    return (Array.isArray(r?.data) ? r.data : []);
  };
  const baseline = await countJourney();

  // ── send the app's funnel events ──
  for (const [name, screen] of [...APP_EVENTS, ...TELEMETRY_ONLY]) {
    await fetch(`${API}/api/track/event`, {
      method: 'POST', headers: UH,
      body: JSON.stringify({ event_type: 'funnel', event_name: name, screen }),
    });
  }
  await new Promise((r) => setTimeout(r, 2500)); // journey promotion is fire-and-forget

  const after = await countJourney();
  const added = after.filter((e) => !baseline.some((b) => b.id === e.id));
  const addedNames = added.map((e) => e.name);

  console.log(`\n  journey events created by this run: ${added.length} -> ${JSON.stringify(addedNames)}\n`);

  // Each app event must land on the journey as its canonical event.
  for (const [name, , expected] of APP_EVENTS) {
    check(
      addedNames.includes(expected),
      `handset "${name}" reached the journey as "${expected}"`,
      name === expected ? '' : 'mapped, not renamed 1:1',
    );
  }
  // Telemetry-only must NOT.
  for (const [name] of TELEMETRY_ONLY) {
    check(!addedNames.includes(name), `handset "${name}" stayed telemetry-only (not in the funnel)`);
  }

  // The stage machine must have moved forward — and never backward.
  const cust = await j(await fetch(`${API}/api/admin/customers/${custId}`, { headers: AH }));
  const stage = cust?.data?.customer?.currentStage;
  const rankBefore = STAGE_ORDER.indexOf(stageBefore);
  const rankAfter = STAGE_ORDER.indexOf(stage);
  check(rankAfter >= rankBefore, 'stage never regressed', `${stageBefore} -> ${stage}`);
  if (rankBefore < STAGE_ORDER.indexOf('application_submitted')) {
    check(stage === 'application_submitted', 'stage advanced to application_submitted', `stage = ${stage}`);
  } else {
    check(true, 'stage already at/after application_submitted — advancement not applicable', `stage = ${stage}`);
  }

  // And the raw telemetry must still exist for analytics.
  const feed = await j(await fetch(`${API}/api/admin/live-feed?limit=40`, { headers: AH }));
  const feedNames = (Array.isArray(feed?.data) ? feed.data : []).map((e) => e.eventName);
  check(feedNames.includes('pan_submitted'), 'telemetry-only event still recorded as an ActivityEvent');

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
