import { afterEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  app: { id: 'app-1', amount: 150000, panNumber: 'ABCPA1234A' } as any,
  user: { id: 'user-1', fullName: 'Asha Rao', phone: '9876543210', email: 'a@b.co' } as any,
  upsert: vi.fn().mockResolvedValue({}),
  update: vi.fn().mockResolvedValue({}),
  findFirst: vi.fn().mockResolvedValue(null), // an earlier lead for this number (null = none)
  tx: { fail: false },
}));
vi.mock('./prisma.js', () => ({
  prisma: {
    loanApplication: { findUnique: vi.fn(async () => db.app) },
    user: { findUnique: vi.fn(async () => db.user) },
    revasureLead: { upsert: db.upsert, update: db.update },
    // check-and-claim runs in a transaction under a per-number advisory lock
    $transaction: async (fn: (tx: any) => unknown) => {
      if (db.tx.fail) throw new Error('db down');
      return fn({ $executeRaw: async () => 1, revasureLead: { findFirst: db.findFirst, upsert: db.upsert } });
    },
  },
}));
const { buildRevasureBody, createRevasureLead, maskedRevasureBody, revasureConfig, revasureEnabled } = await import('./revasureLead.js');

const ENV_KEYS = ['REVASURE_TOKEN', 'REVASURE_BASE_URL', 'REVASURE_BASKET_ID', 'REVASURE_ENABLED', 'REVASURE_ALLOW_INSECURE', 'REVASURE_PRODUCT'];
function setEnv(env: Record<string, string>) {
  for (const k of ENV_KEYS) vi.stubEnv(k, env[k] ?? '');
  // stubEnv('') leaves an empty string; the code treats '' like unset (`|| default`) except ENABLED
  if (!('REVASURE_ENABLED' in env)) delete process.env.REVASURE_ENABLED;
  if (!('REVASURE_ALLOW_INSECURE' in env)) delete process.env.REVASURE_ALLOW_INSECURE;
}
afterEach(() => vi.unstubAllEnvs());

describe('revasureConfig — the bearer token is env-only (no credential in source)', () => {
  it('is disabled when REVASURE_TOKEN is unset, whatever else is configured', () => {
    setEnv({ REVASURE_BASE_URL: 'https://revasure.example' });
    expect(revasureConfig().token).toBe('');
    expect(revasureEnabled()).toBe(false);
  });

  it('is enabled with a token over https', () => {
    setEnv({ REVASURE_TOKEN: 't', REVASURE_BASE_URL: 'https://revasure.example/' });
    const cfg = revasureConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.baseUrl).toBe('https://revasure.example'); // trailing slash trimmed
    expect(cfg.token).toBe('t');
    expect(cfg.product).toBe('Personal Loan');
  });

  it('refuses plaintext http to a remote host (PII goes in the body) unless explicitly allowed', () => {
    setEnv({ REVASURE_TOKEN: 't', REVASURE_BASE_URL: 'http://13.126.208.232' });
    expect(revasureEnabled()).toBe(false);
    setEnv({ REVASURE_TOKEN: 't', REVASURE_BASE_URL: 'http://13.126.208.232', REVASURE_ALLOW_INSECURE: 'true' });
    expect(revasureEnabled()).toBe(true);
  });

  it('allows http to localhost for local development', () => {
    setEnv({ REVASURE_TOKEN: 't', REVASURE_BASE_URL: 'http://localhost:9000' });
    expect(revasureEnabled()).toBe(true);
  });

  it('REVASURE_ENABLED=false hard-disables', () => {
    setEnv({ REVASURE_TOKEN: 't', REVASURE_BASE_URL: 'https://revasure.example', REVASURE_ENABLED: 'false' });
    expect(revasureEnabled()).toBe(false);
  });

  it('falls back to the non-secret UAT base URL and basket id', () => {
    setEnv({ REVASURE_TOKEN: 't', REVASURE_ALLOW_INSECURE: 'true' });
    const cfg = revasureConfig();
    expect(cfg.baseUrl).toBe('http://13.126.208.232');
    expect(cfg.basketId).toBe('b_1t436is');
  });
});

describe('createRevasureLead when disabled', () => {
  it('returns a "disabled" result without touching the network or DB', async () => {
    setEnv({});
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await createRevasureLead('app-1', 'user-1', '1.2.3.4');
    expect(r).toMatchObject({ provider: 'revasure', ok: false, status: 'disabled' });
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('buildRevasureBody — what the website funnel (same as the app) supplies', () => {
  const cfg = { enabled: true, baseUrl: 'https://r.example', basketId: 'b_1', token: 't', product: 'Personal Loan' };
  const app: any = { id: 'app-uuid', amount: 250000, panNumber: 'abcpa1234a' };
  const user: any = {
    fullName: 'Ravi Kumar',
    phone: '+91 98765 43210',
    email: 'ravi@example.com',
    gender: 'male',
    dob: new Date('1991-03-04T00:00:00Z'),
    employment: 'self_employed',
    monthlyIncome: 80000,
  };

  it('maps a fully-populated applicant', () => {
    const b = buildRevasureBody(app, user, '49.205.10.20', cfg);
    expect(b).toMatchObject({
      source_lead_id: 'app-uuid', // Revasure dedupes on this
      basket_id: 'b_1',
      selected_product: 'Personal Loan',
      mobile_number: '9876543210',
      title: 'Mr',
      full_name: 'Ravi Kumar',
      email_id: 'ravi@example.com',
      pancard: 'ABCPA1234A', // upper-cased
      date_of_birth: '1991-03-04',
      occupation: 2, // self-employed
      monthly_income: 80000,
      loan_amount: 250000,
      is_mobile_verified: 'yes',
      consent: 'yes',
      ip_address: '49.205.10.20',
    });
  });

  it('seeds format-valid defaults so a sparse applicant never fails validation', () => {
    const b = buildRevasureBody({ id: 'a', amount: null, panNumber: null } as any, null, undefined, cfg);
    expect(b.pancard).toMatch(/^[A-Z]{5}[0-9]{4}[A-Z]$/);
    expect(b.mobile_number).toMatch(/^\d{10}$/);
    expect(b.full_name).toBe('SwiftLoan Customer');
    expect(b.email_id).toBe('');
    expect(b.ip_address).toBe('49.36.0.1');
    expect(b.occupation).toBe(1);
    expect(b.monthly_income).toBe(50_000);
    expect(b.loan_amount).toBe(100_000);
  });

  it('rejects a malformed PAN / email / IP rather than forwarding them', () => {
    const b = buildRevasureBody({ ...app, panNumber: 'NOT-A-PAN' }, { ...user, email: 'not-an-email' }, 'garbage', cfg);
    expect(b.pancard).toBe('ABCDE1234F');
    expect(b.email_id).toBe('');
    expect(b.ip_address).toBe('49.36.0.1');
  });

  it('uses the first address of an x-forwarded-for list and strips the IPv4-mapped prefix', () => {
    expect(buildRevasureBody(app, user, '::ffff:103.21.5.9, 10.0.0.1', cfg).ip_address).toBe('103.21.5.9');
  });

  it('clamps out-of-range income and amount', () => {
    const b = buildRevasureBody({ ...app, amount: 1 }, { ...user, monthlyIncome: 5 }, undefined, cfg);
    expect(b.loan_amount).toBe(1000);
    expect(b.monthly_income).toBe(1000);
  });
});

describe('createRevasureLead — outcomes (what the website prequalify returns, same as the app)', () => {
  const on = () => setEnv({ REVASURE_TOKEN: 'secret-token', REVASURE_BASE_URL: 'https://revasure.example' });
  const respond = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) }));
  afterEach(() => {
    vi.unstubAllGlobals();
    db.upsert.mockClear();
    db.update.mockClear();
    db.findFirst.mockReset().mockResolvedValue(null);
    db.tx.fail = false;
  });

  it('201 → success with the lead id; posts the bearer token to /api/inbound/leads', async () => {
    on();
    respond(201, { lead_id: 'L-9', message: 'created' });
    const r = await createRevasureLead('app-1', 'user-1', '49.1.2.3');
    expect(r).toMatchObject({ ok: true, status: 'success', httpStatus: 201, leadId: 'L-9' });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe('https://revasure.example/api/inbound/leads');
    expect(init.headers.authorization).toBe('Bearer secret-token');
    expect(JSON.parse(init.body).source_lead_id).toBe('app-1');
  });

  it('never persists the real PAN or OTP', async () => {
    on();
    respond(201, { lead_id: 'L-1' });
    await createRevasureLead('app-1', 'user-1');
    const stored = db.upsert.mock.calls[0][0].create.requestBody;
    expect(stored.pancard).toBe('ABCPA****A');
    expect(stored.otp).toBe('******');
    expect(JSON.stringify(stored)).not.toContain('secret-token');
  });

  it('409 duplicate → benign success', async () => {
    on();
    respond(409, { message: 'Duplicate source_lead_id' });
    expect(await createRevasureLead('app-1', 'user-1')).toMatchObject({ ok: true, status: 'duplicate' });
  });

  it('409 that is not a duplicate → ineligible (a decline, not a success)', async () => {
    on();
    respond(409, { message: 'Customer not eligible' });
    expect(await createRevasureLead('app-1', 'user-1')).toMatchObject({ ok: false, status: 'ineligible' });
  });

  it('401 / 5xx → failed, and it never throws', async () => {
    on();
    respond(401, { message: 'bad token' });
    expect(await createRevasureLead('app-1', 'user-1')).toMatchObject({ ok: false, status: 'failed', httpStatus: 401 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await createRevasureLead('app-1', 'user-1')).toMatchObject({ ok: false, status: 'failed', httpStatus: null });
  });
});

describe('request/response logging never exposes personal data or the token', () => {
  it('maskedRevasureBody hides PAN, OTP, phone, email, name and birth date', () => {
    const cfg = { enabled: true, baseUrl: 'https://r.example', basketId: 'b', token: 'secret-token', product: 'Personal Loan' };
    const full = buildRevasureBody(
      { id: 'a', amount: 100000, panNumber: 'ABCPA1234A' } as any,
      { fullName: 'Ravi Kumar', phone: '9876543210', email: 'ravi@example.com', dob: new Date('1991-03-04T00:00:00Z') } as any,
      '49.1.1.1',
      cfg,
    );
    const m = maskedRevasureBody(full);
    expect(m).toMatchObject({ pancard: 'ABCPA****A', otp: '******', mobile_number: '******3210', email_id: 'r***@example.com', full_name: 'R. K.', date_of_birth: '1991-**-**' });
    const text = JSON.stringify(m);
    for (const secret of ['ABCPA1234A', '9876543210', 'ravi@example.com', 'Ravi', 'Kumar', '1991-03-04']) expect(text).not.toContain(secret);
    expect(m.source_lead_id).toBe('a'); // the non-personal fields stay readable
    expect(m.loan_amount).toBe(100000);
  });

  it('logs the call and the response when a lead is sent', async () => {
    setEnv({ REVASURE_TOKEN: 'secret-token', REVASURE_BASE_URL: 'https://revasure.example' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ lead_id: 'L-7', message: 'created' }) }));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createRevasureLead('app-1', 'user-1', '49.1.2.3');
    const out = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toMatch(/\[revasure-req\] POST https:\/\/revasure\.example\/api\/inbound\/leads app=app-1/);
    expect(out).toMatch(/\[revasure-res\] HTTP 201 .*L-7/);
    expect(out).not.toContain('secret-token');
    expect(out).not.toContain('ABCPA1234A');
    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});

describe('one Revasure lead per phone number', () => {
  const on = () => setEnv({ REVASURE_TOKEN: 'secret-token', REVASURE_BASE_URL: 'https://revasure.example' });
  const spyFetch = () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => JSON.stringify({ lead_id: 'L-1' }) });
    vi.stubGlobal('fetch', f);
    return f;
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    db.upsert.mockClear();
    db.update.mockClear();
    db.findFirst.mockReset().mockResolvedValue(null);
    db.tx.fail = false;
  });

  it('first time for a number → sends', async () => {
    on();
    const f = spyFetch();
    expect(await createRevasureLead('app-1', 'user-1')).toMatchObject({ ok: true, status: 'success' });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'duplicate', 'ineligible'])('a lead already %s for this number → NOT sent again', async (status) => {
    on();
    db.findFirst.mockResolvedValue({ sourceLeadId: 'app-0', status, httpStatus: status === 'success' ? 201 : 409, leadId: 'L-0' });
    const f = spyFetch();
    const r = await createRevasureLead('app-2', 'user-1');
    expect(r).toMatchObject({ ok: true, status: 'skipped', leadId: 'L-0' });
    expect(f).not.toHaveBeenCalled();
    expect(db.upsert).not.toHaveBeenCalled(); // no new lead row either
  });

  it('looks the number up across accounts by the phone in the stored request, and by user', async () => {
    on();
    spyFetch();
    await createRevasureLead('app-1', 'user-1');
    const where = db.findFirst.mock.calls[0][0].where;
    const text = JSON.stringify(where);
    expect(text).toContain('"success"'); expect(text).toContain('"duplicate"'); expect(text).toContain('"ineligible"');
    expect(text).toContain('mobile_number'); expect(text).toContain('9876543210');
    expect(text).toContain('user-1');
  });

  it('a failed earlier attempt does not block (so a fixed token can retry)', async () => {
    on();
    // the query only asks for decided outcomes (or a fresh in-flight claim) — a 401/5xx row is not among them
    const f = spyFetch();
    await createRevasureLead('app-1', 'user-1');
    const statuses = JSON.stringify(db.findFirst.mock.calls[0][0].where);
    expect(statuses).not.toContain('"failed"');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('an in-flight claim (two prequalify runs at once) also blocks the second', async () => {
    on();
    db.findFirst.mockResolvedValue({ sourceLeadId: 'app-1', status: 'pending', httpStatus: null, leadId: null });
    const f = spyFetch();
    expect((await createRevasureLead('app-1', 'user-1')).status).toBe('skipped');
    expect(f).not.toHaveBeenCalled();
  });

  it("fails closed: if it can't check/record, it does not send", async () => {
    on();
    db.tx.fail = true;
    const f = spyFetch();
    const r = await createRevasureLead('app-1', 'user-1');
    expect(r).toMatchObject({ ok: false, status: 'failed' });
    expect(f).not.toHaveBeenCalled();
  });

  it('the skipped log never contains the phone number', async () => {
    on();
    db.findFirst.mockResolvedValue({ sourceLeadId: 'app-0', status: 'success', httpStatus: 201, leadId: 'L-0' });
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await createRevasureLead('app-2', 'user-1');
    const out = spy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toMatch(/skipped/);
    expect(out).not.toContain('9876543210');
    spy.mockRestore();
  });
});
