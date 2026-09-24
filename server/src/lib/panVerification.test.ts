import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * pan_comprehensive is a PAID call, so the property that matters most here is
 * "Aurix is called at most once per PAN" — across repeat lookups, other
 * accounts, and concurrent requests. Prisma and the Aurix HTTP call are
 * replaced with in-memory fakes. Fixtures use the confirmed live UAT response
 * structure with made-up values.
 */

const records = new Map<string, any>();
const aurix = vi.fn();

vi.mock('./prisma.js', () => {
  const panRecord = {
    findUnique: async ({ where }: any) => records.get(where.panHash) ?? null,
    create: async ({ data }: any) => {
      const rec = { id: `rec-${records.size + 1}`, cacheHits: 0, createdAt: new Date(), ...data };
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

/** Live UAT structure: { Data: { …flags, Data: {person} }, Meta }. */
const live = (person: Record<string, unknown> | null, over: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) => ({
  Data: { PanNumber: PAN, Data: person, Message: 'Success', Status: 1, Success: true, Error: false, ErrorResponse: null, ...over },
  Meta: { Timestamp: '2026-09-23T09:24:48Z', Success: true, StatusCode: '200', CustomErrorCode: null, Message: 'PAN details fetched successfully.', IsRetryAllowed: false, ...meta },
});
const PERSON = {
  AadhaarLinked: true, Category: 'person', DateOfBirth: '15-08-1990', DateOfBirthCheck: false, DateOfBirthVerified: false,
  EmailId: '', FullName: 'RAVI KUMAR SHARMA', FullNameSplit: ['RAVI', 'KUMAR', 'SHARMA'], Gender: 'M',
  MaskedAadhaar: '12XXXXXXXX34', PhoneNumber: '', LessInfo: true,
  FullAddress: '12-3-45 BANJARA HILLS ROAD NO 2 Hyderabad Telangana India 500034',
  AddressLine1: '12-3-45 BANJARA HILLS', AddressLine2: 'ROAD NO 2', StreetName: 'ROAD NO 2',
  State: 'Telangana', City: 'Hyderabad', Country: 'India', PinCode: '500034',
};
const okBody = live(PERSON);
const ok = { ok: true, status: 200, body: okBody };

beforeEach(() => {
  records.clear();
  aurix.mockReset();
  delete process.env.PAN_SHARED_POLICY;
  delete process.env.PAN_DAILY_LIMIT;
});

describe('pii encryption', () => {
  it('round-trips and never stores plaintext', () => {
    const blob = encryptJson({ pan: PAN, name: 'Ravi' });
    expect(blob).not.toContain(PAN);
    expect(blob).not.toContain('Ravi');
    expect(decryptJson(blob)).toEqual({ pan: PAN, name: 'Ravi' });
  });
  it('uses a fresh IV per encryption', () => {
    expect(encryptJson({ a: 1 })).not.toBe(encryptJson({ a: 1 }));
  });
  it('detects tampering', () => {
    const parts = encryptJson({ a: 1 }).split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptJson(parts.join('.'))).toThrow();
  });
  it('hash is stable, case/space-insensitive, and not the PAN', () => {
    expect(panHash(PAN)).toBe(panHash(' abcpe1234f '));
    expect(panHash(PAN)).not.toContain(PAN);
  });
});

describe('mapPanResponse — live UAT structure', () => {
  it('maps every pre-fill field from Data.Data', () => {
    const m = mapPanResponse(okBody);
    expect(m.success).toBe(true);
    expect(m.verified).toBe(true);
    expect(m.category).toBe('person');
    expect(m.aadhaarLinked).toBe(true);
    expect(m.prefill).toEqual({
      fullName: 'RAVI KUMAR SHARMA', firstName: 'RAVI', middleName: 'KUMAR', lastName: 'SHARMA',
      dob: '1990-08-15', gender: 'male', email: undefined,
      addressLine1: '12-3-45 BANJARA HILLS', addressLine2: 'ROAD NO 2',
      city: 'Hyderabad', district: undefined, state: 'Telangana', pincode: '500034',
    });
  });
  it('never exposes the masked Aadhaar in the pre-fill', () => {
    expect(JSON.stringify(mapPanResponse(okBody).prefill)).not.toContain('XXXX');
  });
  it('two-word name → first + last, no middle', () => {
    const m = mapPanResponse(live({ ...PERSON, FullName: 'PRIYA REDDY', FullNameSplit: ['PRIYA', 'REDDY'] }));
    expect(m.prefill).toMatchObject({ firstName: 'PRIYA', lastName: 'REDDY', middleName: undefined });
  });
  it('single-word name → first only', () => {
    const m = mapPanResponse(live({ ...PERSON, FullName: 'MADHAVI', FullNameSplit: ['MADHAVI'] }));
    expect(m.prefill).toMatchObject({ firstName: 'MADHAVI', lastName: undefined });
  });
  it('falls back to splitting FullName when FullNameSplit is missing', () => {
    const { FullNameSplit: _, ...noSplit } = PERSON;
    expect(mapPanResponse(live(noSplit)).prefill).toMatchObject({ firstName: 'RAVI', middleName: 'KUMAR', lastName: 'SHARMA' });
  });
  it('female gender and a valid email are mapped; an invalid email is dropped', () => {
    expect(mapPanResponse(live({ ...PERSON, Gender: 'F', EmailId: 'a@b.co' })).prefill).toMatchObject({ gender: 'female', email: 'a@b.co' });
    expect(mapPanResponse(live({ ...PERSON, EmailId: 'not-an-email' })).prefill.email).toBeUndefined();
  });
  it('empty strings become missing fields, not ""', () => {
    const m = mapPanResponse(live({ ...PERSON, City: '', PinCode: '', AddressLine2: '' }));
    expect(m.prefill.city).toBeUndefined();
    expect(m.prefill.pincode).toBeUndefined();
    expect(m.prefill.addressLine2).toBeUndefined();
  });
  it('a bad date is dropped rather than guessed', () => {
    expect(mapPanResponse(live({ ...PERSON, DateOfBirth: 'unknown' })).prefill.dob).toBeUndefined();
  });
  it('still handles the { Result: {...} } wrapper', () => {
    expect(mapPanResponse({ Result: okBody }).verified).toBe(true);
  });
});

describe('mapPanResponse — failures', () => {
  it('Meta.Success false is not verified, with Aurix\'s message', () => {
    const m = mapPanResponse(live(null, { Success: false, Error: true, Message: 'No record found' }, { Success: false, Message: 'No record found' }));
    expect(m.verified).toBe(false);
    expect(m.message).toBe('No record found');
  });
  it('inner Data.Success false / Error true overrides a successful Meta', () => {
    expect(mapPanResponse(live(PERSON, { Success: false })).verified).toBe(false);
    expect(mapPanResponse(live(PERSON, { Error: true })).verified).toBe(false);
  });
  it('ErrorResponse message wins when present', () => {
    const m = mapPanResponse(live(null, { Success: false, Error: true, ErrorResponse: { Message: 'PAN is inoperative' } }));
    expect(m.message).toBe('PAN is inoperative');
  });
  it('explicit negative PAN status fails even inside a success envelope', () => {
    expect(mapPanResponse(live({ ...PERSON, PanStatus: 'Invalid' })).verified).toBe(false);
    expect(mapPanResponse(live({ ...PERSON, PanStatus: 'Deactivated' })).verified).toBe(false);
  });
  it('an unrecognised status word does NOT fail a successful lookup (regression)', () => {
    expect(mapPanResponse(live({ ...PERSON, PanStatus: 'E' })).verified).toBe(true);
    expect(mapPanResponse(live(PERSON, { Status: 1 })).verified).toBe(true);
  });
  it('garbage / empty bodies are unverified, never throw', () => {
    for (const b of [null, undefined, {}, 'oops', { Meta: {} }]) expect(mapPanResponse(b).verified).toBe(false);
  });
});

describe('verifyPan — paid call happens at most once', () => {
  it('rejects a malformed PAN without calling Aurix', async () => {
    await expect(verifyPan(userA, 'ABC123')).rejects.toMatchObject({ status: 400 });
    await expect(verifyPan(userA, 'ABCXE1234F')).rejects.toMatchObject({ status: 400 }); // X isn't a holder type
    expect(aurix).not.toHaveBeenCalled();
  });

  it('first lookup calls Aurix, repeat lookup is served from DB', async () => {
    aurix.mockResolvedValue(ok);
    const first = await verifyPan(userA, PAN);
    const again = await verifyPan(userA, PAN.toLowerCase());
    expect(aurix).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ source: 'aurix', verified: true });
    expect(again).toMatchObject({ source: 'cache', verified: true });
    expect(again.prefill.firstName).toBe('RAVI');
  });

  it('stores personal data encrypted only', async () => {
    aurix.mockResolvedValue(ok);
    await verifyPan(userA, PAN);
    const rec = [...records.values()][0];
    for (const secret of [PAN, 'RAVI', 'BANJARA', '500034', '12XXXXXXXX34']) expect(rec.dataEnc).not.toContain(secret);
    expect(rec.panHash).toBe(panHash(PAN));
    expect(JSON.stringify({ ...rec, dataEnc: '' })).not.toContain('RAVI');
  });

  it('another account with the same PAN gets the DB copy (policy: allow)', async () => {
    aurix.mockResolvedValue(ok);
    await verifyPan(userA, PAN);
    const b = await verifyPan(userB, PAN);
    expect(aurix).toHaveBeenCalledTimes(1);
    expect(b).toMatchObject({ source: 'cache', verified: true });
  });

  it('policy: block rejects the second account, still without calling Aurix', async () => {
    process.env.PAN_SHARED_POLICY = 'block';
    aurix.mockResolvedValue(ok);
    await verifyPan(userA, PAN);
    await expect(verifyPan(userA, PAN)).resolves.toMatchObject({ source: 'cache' }); // owner is fine
    await expect(verifyPan(userB, PAN)).rejects.toMatchObject({ status: 409 });
    expect(aurix).toHaveBeenCalledTimes(1);
  });

  it('concurrent lookups share one call', async () => {
    aurix.mockImplementation(() => new Promise(r => setTimeout(() => r(ok), 20)));
    const results = await Promise.all([verifyPan(userA, PAN), verifyPan(userA, PAN), verifyPan(userB, PAN)]);
    expect(aurix).toHaveBeenCalledTimes(1);
    expect(results.every(r => r.verified)).toBe(true);
  });

  it('not-found PAN is negative-cached, with Aurix\'s message both times', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: live(null, { Success: false, Error: true, Message: 'No record found for the given PAN.' }, { Success: false, Message: 'No record found for the given PAN.' }) });
    const r1 = await verifyPan(userA, PAN);
    const r2 = await verifyPan(userA, PAN);
    expect(r1).toMatchObject({ verified: false, source: 'aurix', message: 'No record found for the given PAN.', prefill: {} });
    expect(r2).toMatchObject({ verified: false, source: 'cache', message: 'No record found for the given PAN.' });
    expect(aurix).toHaveBeenCalledTimes(1);
  });

  it('invalid status inside a success envelope reports the status, not "fetched successfully"', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: live({ Category: 'person', PanStatus: 'Invalid' }) });
    const r = await verifyPan(userA, PAN);
    expect(r.verified).toBe(false);
    expect(r.message).toBe('PAN status: Invalid');
  });

  it('an expired negative result is re-checked with Aurix', async () => {
    aurix.mockResolvedValueOnce({ ok: true, status: 200, body: live(null, { Success: false }, { Success: false }) });
    await verifyPan(userA, PAN);
    records.get(panHash(PAN)).expiresAt = new Date(Date.now() - 1000);
    aurix.mockResolvedValueOnce(ok);
    expect((await verifyPan(userA, PAN)).verified).toBe(true);
    expect(aurix).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['HTTP 500', { ok: false, status: 500, body: { Meta: { Success: false } }, error: 'HTTP 500' }],
    ['HTTP 401', { ok: false, status: 401, body: null, error: 'HTTP 401' }],
    ['timeout', { ok: false, status: 0, body: null, error: 'timed out after 20000ms' }],
  ])('%s → 502 and is NOT cached', async (_label, failure) => {
    aurix.mockResolvedValueOnce(failure);
    await expect(verifyPan(userA, PAN)).rejects.toMatchObject({ status: 502 });
    expect(records.size).toBe(0);
    aurix.mockResolvedValueOnce(ok);
    expect((await verifyPan(userA, PAN)).verified).toBe(true);
  });

  it('token generation failure → 502, not a 500, and not cached', async () => {
    aurix.mockRejectedValueOnce(new Error('Aurix generate_token failed: timed out after 15000ms (HTTP 0)'));
    await expect(verifyPan(userA, PAN)).rejects.toMatchObject({ status: 502 });
    expect(records.size).toBe(0);
  });

  it('enforces the per-user daily limit on paid lookups only', async () => {
    process.env.PAN_DAILY_LIMIT = '2';
    aurix.mockResolvedValue(ok);
    await verifyPan(userA, 'ABCPE1234F');
    await verifyPan(userA, 'ABCPE1234G');
    await expect(verifyPan(userA, 'ABCPE1234H')).rejects.toMatchObject({ status: 429 });
    // cached PANs are still free after the limit
    await expect(verifyPan(userA, 'ABCPE1234F')).resolves.toMatchObject({ source: 'cache' });
    // the limit is per user
    await expect(verifyPan(userB, 'ABCPE1234H')).resolves.toMatchObject({ source: 'aurix' });
    expect(aurix).toHaveBeenCalledTimes(3);
  });
});

describe('re-mapping stored responses (no re-pay)', () => {
  it('a record stored as invalid by an older mapping is repaired from its raw response', async () => {
    records.set(panHash(PAN), {
      id: 'old', panHash: panHash(PAN), status: 'invalid', verified: false, category: 'person', aadhaarLinked: true,
      verifiedAt: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), cacheHits: 0,
      ownerUserId: userA.id, dataEnc: encryptJson({ pan: PAN, prefill: {}, raw: okBody }),
    });
    const r = await verifyPan(userA, PAN);
    expect(aurix).not.toHaveBeenCalled();
    expect(r).toMatchObject({ verified: true, source: 'cache' });
    expect(r.prefill).toMatchObject({ firstName: 'RAVI', lastName: 'SHARMA', city: 'Hyderabad' });
    expect(records.get(panHash(PAN))).toMatchObject({ status: 'verified', expiresAt: null });
  });
});

describe('eligible_offers PAN DTO', () => {
  it('reads the verification from DB only — null until verified', async () => {
    aurix.mockResolvedValue(ok);
    expect(await getPanVerificationForOffers(PAN)).toBeNull();
    await verifyPan(userA, PAN);
    expect(await getPanVerificationForOffers(PAN)).toMatchObject({ verified: true, category: 'person', aadhaarLinked: true });
    expect(aurix).toHaveBeenCalledTimes(1);
  });
  it('an unverified PAN gives null (offers keep their previous DTO)', async () => {
    aurix.mockResolvedValue({ ok: true, status: 200, body: live(null, { Success: false }, { Success: false }) });
    await verifyPan(userA, PAN);
    expect(await getPanVerificationForOffers(PAN)).toBeNull();
  });
  it('a malformed PAN never hits the DB', async () => {
    expect(await getPanVerificationForOffers('bad')).toBeNull();
  });
});
