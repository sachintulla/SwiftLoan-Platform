import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * pan_comprehensive is a PAID call, so the property that matters most here is
 * "Aurix is called at most once per PAN" — across repeat lookups, other
 * accounts, and concurrent requests. Prisma and the Aurix HTTP call are
 * replaced with in-memory fakes.
 */

const records = new Map<string, any>();
const aurix = vi.fn();

vi.mock('./prisma.js', () => {
  const panRecord = {
    findUnique: async ({ where }: any) => records.get(where.panHash) ?? null,
    create: async ({ data }: any) => {
      const rec = { id: `rec-${records.size + 1}`, cacheHits: 0, ...data };
      records.set(data.panHash, rec);
      return rec;
    },
    update: async ({ where, data }: any) => {
      const rec = [...records.values()].find(r => r.id === where.id);
      if (data.cacheHits?.increment) rec.cacheHits += data.cacheHits.increment;
      else Object.assign(rec, data);
      return rec;
    },
    count: async ({ where }: any) =>
      [...records.values()].filter(r => r.ownerUserId === where.ownerUserId && r.lastAurixCallAt >= where.lastAurixCallAt.gte).length,
  };
  return { prisma: { panRecord, user: { update: async () => ({}) } } };
});
vi.mock('./lenderOffers.js', () => ({ callAurixPanComprehensive: (...a: any[]) => aurix(...a) }));

const { verifyPan, mapPanResponse, getPanVerificationForOffers } = await import('./panVerification.js');
const { encryptJson, decryptJson, panHash } = await import('./pii.js');

const userA = { id: 'user-a', phone: '9876543210', panNumber: null } as any;
const userB = { id: 'user-b', phone: '9876543211', panNumber: null } as any;
const PAN = 'ABCPE1234F';

const okBody = {
  Result: {
    Meta: { Success: true, Message: 'Success' },
    Data: { FirstName: 'Ravi', LastName: 'Kumar', Dob: '15/08/1990', Gender: 'M', Category: 'Individual', AadhaarLinked: true, Address: { City: 'Hyderabad', State: 'Telangana', Pincode: '500081' } },
  },
};

beforeEach(() => {
  records.clear();
  aurix.mockReset();
  delete process.env.PAN_SHARED_POLICY;
  delete process.env.PAN_DAILY_LIMIT;
});

describe('pii', () => {
  it('round-trips and never stores plaintext', () => {
    const blob = encryptJson({ pan: PAN, name: 'Ravi' });
    expect(blob).not.toContain(PAN);
    expect(blob).not.toContain('Ravi');
    expect(decryptJson(blob)).toEqual({ pan: PAN, name: 'Ravi' });
  });
  it('detects tampering', () => {
    const blob = encryptJson({ a: 1 });
    const parts = blob.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptJson(parts.join('.'))).toThrow();
  });
  it('hash is stable, case-insensitive, and not the PAN', () => {
    expect(panHash(PAN)).toBe(panHash(' abcpe1234f '));
    expect(panHash(PAN)).not.toContain(PAN);
  });
});

describe('mapPanResponse', () => {
  it('maps the common shape into prefill', () => {
    const m = mapPanResponse(okBody);
    expect(m.verified).toBe(true);
    expect(m.category).toBe('Individual');
    expect(m.aadhaarLinked).toBe(true);
    expect(m.prefill).toMatchObject({ firstName: 'Ravi', lastName: 'Kumar', dob: '1990-08-15', gender: 'male', city: 'Hyderabad', pincode: '500081' });
  });
  it('Meta.Success false is not verified', () => {
    expect(mapPanResponse({ Meta: { Success: false, Message: 'Invalid PAN' } }).verified).toBe(false);
  });
});

describe('live UAT shape regression', () => {
  // Real dev response: Meta.Success true, "PAN details fetched successfully.",
  // category "person" — was wrongly stored as invalid by a positive-status matcher.
  const liveLike = {
    Meta: { Success: true, Message: 'PAN details fetched successfully.' },
    Data: { Status: 'SUCCESS', Category: 'person', AadhaarLinked: true, FullName: 'RAVI KUMAR' },
  };
  it('Success with an unrecognised status word is verified', () => {
    expect(mapPanResponse(liveLike).verified).toBe(true);
  });
  it('explicit negatives still fail', () => {
    expect(mapPanResponse({ Meta: { Success: true }, Data: { PanStatus: 'Invalid PAN' } }).verified).toBe(false);
    expect(mapPanResponse({ Meta: { Success: true }, Data: { IsValid: false } }).verified).toBe(false);
  });
  it('a record stored as invalid by the old mapping is fixed from its raw response, no new Aurix call', async () => {
    records.set(panHash(PAN), {
      id: 'old', panHash: panHash(PAN), status: 'invalid', verified: false, category: 'person', aadhaarLinked: true,
      verifiedAt: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), cacheHits: 0,
      ownerUserId: userA.id, dataEnc: encryptJson({ pan: PAN, prefill: {}, raw: liveLike }),
    });
    const r = await verifyPan(userA, PAN);
    expect(aurix).not.toHaveBeenCalled();
    expect(r.verified).toBe(true);
    expect(r.prefill).toMatchObject({ firstName: 'RAVI', lastName: 'KUMAR' });
    expect(records.get(panHash(PAN)).status).toBe('verified');
  });
});

describe('verifyPan — paid call happens at most once', () => {
  it('rejects a malformed PAN without calling Aurix', async () => {
    await expect(verifyPan(userA, 'ABC123')).rejects.toMatchObject({ status: 400 });
    expect(aurix).not.toHaveBeenCalled();
  });

  it('first lookup calls Aurix, repeat lookup is served from DB', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: okBody });
    const first = await verifyPan(userA, PAN);
    const again = await verifyPan(userA, PAN);
    expect(aurix).toHaveBeenCalledTimes(1);
    expect(first.source).toBe('aurix');
    expect(again.source).toBe('cache');
    expect(again.prefill.firstName).toBe('Ravi');
    // stored encrypted, not in the clear
    const rec = [...records.values()][0];
    expect(rec.dataEnc).not.toContain('Ravi');
    expect(rec.dataEnc).not.toContain(PAN);
  });

  it('another account with the same PAN gets the DB copy (policy: allow)', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: okBody });
    await verifyPan(userA, PAN);
    const b = await verifyPan(userB, PAN);
    expect(aurix).toHaveBeenCalledTimes(1);
    expect(b.source).toBe('cache');
  });

  it('policy: block rejects the second account, still without calling Aurix', async () => {
    process.env.PAN_SHARED_POLICY = 'block';
    aurix.mockResolvedValue({ ok: true, status: 200, body: okBody });
    await verifyPan(userA, PAN);
    await expect(verifyPan(userB, PAN)).rejects.toMatchObject({ status: 409 });
    expect(aurix).toHaveBeenCalledTimes(1);
  });

  it('concurrent lookups share one call', async () => {
    aurix.mockImplementation(() => new Promise(r => setTimeout(() => r({ ok: true, status: 200, body: okBody }), 20)));
    await Promise.all([verifyPan(userA, PAN), verifyPan(userA, PAN), verifyPan(userB, PAN)]);
    expect(aurix).toHaveBeenCalledTimes(1);
  });

  it('invalid PAN is negative-cached', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: { Meta: { Success: false, Message: 'No record found' } } });
    const r1 = await verifyPan(userA, PAN);
    const r2 = await verifyPan(userA, PAN);
    expect(r1.verified).toBe(false);
    expect(r2.source).toBe('cache');
    expect(aurix).toHaveBeenCalledTimes(1);
  });

  it('transport failure is not cached', async () => {
    aurix.mockResolvedValueOnce({ ok: false, status: 503, body: null, error: 'HTTP 503' });
    await expect(verifyPan(userA, PAN)).rejects.toMatchObject({ status: 502 });
    aurix.mockResolvedValueOnce({ ok: true, status: 200, body: okBody });
    expect((await verifyPan(userA, PAN)).verified).toBe(true);
    expect(aurix).toHaveBeenCalledTimes(2);
  });

  it('enforces the per-user daily limit on paid lookups', async () => {
    process.env.PAN_DAILY_LIMIT = '2';
    aurix.mockResolvedValue({ ok: true, status: 200, body: okBody });
    await verifyPan(userA, 'ABCPE1234F');
    await verifyPan(userA, 'ABCPE1234G');
    await expect(verifyPan(userA, 'ABCPE1234H')).rejects.toMatchObject({ status: 429 });
    expect(aurix).toHaveBeenCalledTimes(2);
  });

  it('eligible_offers reads the verification from DB only', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: okBody });
    expect(await getPanVerificationForOffers(PAN)).toBeNull();
    await verifyPan(userA, PAN);
    expect(await getPanVerificationForOffers(PAN)).toMatchObject({ verified: true, category: 'Individual', aadhaarLinked: true });
    expect(aurix).toHaveBeenCalledTimes(1);
  });
});
