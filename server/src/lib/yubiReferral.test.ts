import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  ref: null as any,
  user: { id: 'user-1', firstName: 'Asha', lastName: 'Rao', phone: '+919876543210', email: 'asha.rao@gmail.comj', pincode: '560001' } as any,
  update: vi.fn(async ({ data }: any) => ({ ...db.ref, ...data })),
}));
vi.mock('./prisma.js', () => ({
  prisma: {
    partnerReferral: {
      findFirst: vi.fn(async () => db.ref),
      create: vi.fn(async ({ data }: any) => (db.ref = { id: 'ref-1', ...data })),
      update: db.update,
    },
    user: { findUnique: vi.fn(async () => db.user) },
  },
}));
vi.mock('./apiLog.js', () => ({ recordApiLog: () => {} }));

const { ensureReferral, getReferralStatus, splitName, yubiCleanName, yubiRejectedField, yubiFallbackEmail } = await import('./yubiReferral.js');

const EMAIL_400 = {
  errors: [{ code: 'x', field: 'individualDetails.email', description: '$.individualDetails.email: does not match the email pattern must be a valid RFC 5321 Mailbox' }],
};

function fetchSeq(...answers: Array<{ status: number; body: unknown }>) {
  const f = vi.fn();
  for (const a of answers) {
    f.mockResolvedValueOnce({ ok: a.status < 400, status: a.status, text: async () => JSON.stringify(a.body) });
  }
  vi.stubGlobal('fetch', f);
  return f;
}

describe('yubi name cleaning', () => {
  it('keeps only letters, spaces, hyphens and apostrophes', () => {
    expect(yubiCleanName('Rao.')).toBe('Rao');
    expect(yubiCleanName("D'Souza-Pai")).toBe("D'Souza-Pai");
    expect(yubiCleanName('K. S.  Murthy')).toBe('K S Murthy');
    expect(yubiCleanName('राव')).toBe('');
    expect(yubiCleanName(null)).toBe('');
  });

  it('splitName never sends a character YMPL refuses', () => {
    const re = /^[a-zA-Z\s\-']*$/;
    for (const u of [
      { firstName: 'Asha', lastName: 'Rao.', fullName: null },
      { firstName: null, lastName: null, fullName: 'Asha K. Rao2' },
      { firstName: 'आशा', lastName: 'Rao', fullName: null },
    ] as any[]) {
      const n = splitName(u);
      expect(n.firstName).toMatch(re);
      expect(n.lastName).toMatch(re);
      if (n.middleName) expect(n.middleName).toMatch(re);
      expect(n.firstName).not.toBe('');
    }
    expect(splitName({ firstName: 'आशा', lastName: 'Rao', fullName: null } as any)).toMatchObject({ firstName: 'Rao', lastName: 'Rao' });
    expect(splitName({ firstName: null, lastName: null, fullName: '...' } as any)).toMatchObject({ firstName: 'Applicant', lastName: '' });
  });
});

describe('yubiRejectedField', () => {
  it('finds the field by name or in the description', () => {
    expect(yubiRejectedField(EMAIL_400, 'individualDetails.email')).toBe(true);
    expect(yubiRejectedField({ errors: [{ description: '$.individualDetails.email: bad' }] }, 'individualDetails.email')).toBe(true);
    expect(yubiRejectedField({ errors: [{ field: 'individualDetails.lastName' }] }, 'individualDetails.email')).toBe(false);
    expect(yubiRejectedField(null, 'individualDetails.email')).toBe(false);
    expect(yubiRejectedField('HTTP 400', 'individualDetails.email')).toBe(false);
  });
});

describe('ensureReferral / getReferralStatus against YMPL', () => {
  beforeEach(() => {
    vi.stubEnv('YUBI_BASE_URL', 'https://ympl.test/api/v1');
    vi.stubEnv('YUBI_API_KEY', 'k');
    vi.stubEnv('YUBI_REFERRER_ID', 'r');
    db.ref = null;
    db.update.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('an email YMPL refuses is retried once with the lead-domain address', async () => {
    const f = fetchSeq({ status: 400, body: EMAIL_400 }, { status: 201, body: { ymplReferralId: 'Y-1' } });
    const ref: any = await ensureReferral('app-1', 'user-1');
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[0][1].body).individualDetails.email).toBe('asha.rao@gmail.comj');
    expect(JSON.parse(f.mock.calls[1][1].body).individualDetails.email).toBe(yubiFallbackEmail('9876543210'));
    expect(ref).toMatchObject({ status: 'referred', ymplReferralId: 'Y-1' });
  });

  it('any other 400 is not retried', async () => {
    const f = fetchSeq({ status: 400, body: { errors: [{ field: 'addressDetails.pincode' }] } });
    const ref: any = await ensureReferral('app-1', 'user-1');
    expect(f).toHaveBeenCalledTimes(1);
    expect(ref.status).toBe('failed');
  });

  it('only one retry: a second email refusal fails the referral', async () => {
    const f = fetchSeq({ status: 400, body: EMAIL_400 }, { status: 400, body: EMAIL_400 });
    const ref: any = await ensureReferral('app-1', 'user-1');
    expect(f).toHaveBeenCalledTimes(2);
    expect(ref.status).toBe('failed');
  });

  it('does not ask YMPL for the status of a referral it never created', async () => {
    db.ref = { id: 'ref-1', clientReferralId: 'c-1', ymplReferralId: null, lastStatus: null, status: 'failed' };
    const f = fetchSeq();
    expect(await getReferralStatus('app-1', 'user-1')).toEqual({ journeyStatus: null, raw: null });
    expect(f).not.toHaveBeenCalled();
  });

  it('still asks for a referral YMPL created', async () => {
    db.ref = { id: 'ref-1', clientReferralId: 'c-1', ymplReferralId: 'Y-1', lastStatus: null, status: 'referred' };
    const f = fetchSeq({ status: 200, body: { journeyStatus: 'NEW_LEAD' } });
    expect((await getReferralStatus('app-1', 'user-1')).journeyStatus).toBe('NEW_LEAD');
    expect(f).toHaveBeenCalledTimes(1);
  });
});
