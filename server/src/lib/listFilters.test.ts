import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  customerFindMany: vi.fn(),
}));
vi.mock('./prisma.js', () => ({
  prisma: {
    user: { findMany: db.userFindMany },
    customer: { findMany: db.customerFindMany },
  },
}));

const f = await import('./listFilters.js');

beforeEach(() => {
  db.userFindMany.mockReset();
  db.customerFindMany.mockReset();
});

describe('buildLoanWhere', () => {
  it('is empty with no filters', () => {
    expect(f.buildLoanWhere({})).toEqual({});
  });

  it('keeps a valid status and ignores an unknown one', () => {
    expect(f.buildLoanWhere({ status: 'rejected' })).toEqual({ status: 'rejected' });
    expect(f.buildLoanWhere({ status: 'nonsense' })).toEqual({});
    // the dashboard list never offered `failed`, so it is still not a list filter
    expect(f.buildLoanWhere({ status: 'failed' })).toEqual({});
  });

  it('searches reference, name and mobile', () => {
    const w = f.buildLoanWhere({ search: '  98765 ' });
    expect(w.OR).toEqual([
      { ref: { contains: '98765', mode: 'insensitive' } },
      { user: { fullName: { contains: '98765', mode: 'insensitive' } } },
      { user: { phone: { contains: '98765' } } },
    ]);
  });

  it('ignores a blank search', () => {
    expect(f.buildLoanWhere({ search: '   ' })).toEqual({});
  });

  it('takes the first value when a param is repeated', () => {
    expect(f.buildLoanWhere({ status: ['approved', 'draft'] })).toEqual({ status: 'approved' });
  });

  it('expresses each lenderResult over applied offers', () => {
    expect(f.buildLoanWhere({ lenderResult: 'any' }).AND).toEqual([{ offers: { some: { applied: true } } }]);
    expect(f.buildLoanWhere({ lenderResult: 'approved' }).AND).toEqual([
      { offers: { some: { applied: true, lenderStatus: 'approved' } } },
    ]);
    expect(f.buildLoanWhere({ lenderResult: 'disbursed' }).AND).toEqual([
      { offers: { some: { applied: true, lenderStatus: 'disbursed' } } },
    ]);
  });

  it('counts failed as rejected, as the page summary does', () => {
    expect(f.buildLoanWhere({ lenderResult: 'rejected' }).AND).toEqual([
      { offers: { some: { applied: true, lenderStatus: { in: ['rejected', 'failed'] } } } },
    ]);
  });

  it('in_progress includes applied offers with no status yet', () => {
    const and = f.buildLoanWhere({ lenderResult: 'in_progress' }).AND as any[];
    const inner = and[0].offers.some;
    expect(inner.applied).toBe(true);
    expect(inner.OR).toEqual([
      { lenderStatus: null },
      { lenderStatus: { notIn: ['approved', 'disbursed', 'rejected', 'failed'] } },
    ]);
  });

  it('ignores an unknown lenderResult', () => {
    expect(f.buildLoanWhere({ lenderResult: 'weird' })).toEqual({});
  });

  it('applies a created-on date range and ignores invalid dates', () => {
    const w = f.buildLoanWhere({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' });
    expect(w.createdAt).toEqual({ gte: new Date('2026-10-01T00:00:00.000Z'), lte: new Date('2026-10-31T23:59:59.999Z') });
    expect(f.buildLoanWhere({ from: 'not a date', to: 'also not' })).toEqual({});
    expect(f.buildLoanWhere({ from: 'not a date', to: '2026-10-31T00:00:00.000Z' }).createdAt)
      .toEqual({ lte: new Date('2026-10-31T00:00:00.000Z') });
  });
});

describe('loanLenderSummary', () => {
  it('shows a dash when no lender was applied to', () => {
    expect(f.loanLenderSummary([])).toBe('-');
    expect(f.loanLenderSummary(undefined)).toBe('-');
  });

  it('matches the page wording', () => {
    expect(f.loanLenderSummary([{ lenderStatus: 'rejected' }])).toBe('1 lender - 1 Rejected');
    expect(f.loanLenderSummary([
      { lenderStatus: 'disbursed' }, { lenderStatus: 'approved' }, { lenderStatus: 'failed' }, { lenderStatus: null },
    ])).toBe('4 lenders - 1 Active, 1 Approved, 1 Rejected, 1 in progress');
  });
});

describe('buildRevasureWhere', () => {
  it('is empty by default', () => {
    expect(f.buildRevasureWhere({})).toEqual({});
  });

  it('passes a status through', () => {
    expect(f.buildRevasureWhere({ status: 'failed' })).toEqual({ status: 'failed' });
  });

  it('searches lead ids, plus customers resolved by the caller', () => {
    expect(f.buildRevasureWhere({ search: 'abc' }, ['u1', 'u2']).OR).toEqual([
      { sourceLeadId: { contains: 'abc', mode: 'insensitive' } },
      { leadId: { contains: 'abc', mode: 'insensitive' } },
      { userId: { in: ['u1', 'u2'] } },
    ]);
  });

  it('leaves out the customer clause when no user matched', () => {
    const or = f.buildRevasureWhere({ search: 'abc' }, []).OR as unknown[];
    expect(or).toHaveLength(2);
  });

  it('filters on updatedAt', () => {
    expect(f.buildRevasureWhere({ from: '2026-10-01T00:00:00.000Z' }).updatedAt)
      .toEqual({ gte: new Date('2026-10-01T00:00:00.000Z') });
  });
});

describe('buildYubiWhere', () => {
  it('lists applied referrals only by default', () => {
    expect(f.buildYubiWhere({})).toEqual({ appliedAt: { not: null } });
    expect(f.buildYubiWhere({ applied: '1' })).toEqual({ appliedAt: { not: null } });
  });

  it('lists everything when applied is 0 or false', () => {
    expect(f.buildYubiWhere({ applied: '0' })).toEqual({});
    expect(f.buildYubiWhere({ applied: 'false' })).toEqual({});
  });

  it('filters status on lastStatus', () => {
    expect(f.buildYubiWhere({ status: 'REJECTED' }).lastStatus).toBe('REJECTED');
  });

  it('combines the applied rule with the date range on appliedAt', () => {
    expect(f.buildYubiWhere({ from: '2026-10-01T00:00:00.000Z' }).appliedAt)
      .toEqual({ not: null, gte: new Date('2026-10-01T00:00:00.000Z') });
  });

  it('searches by the customers the caller resolved, and matches nobody when none did', () => {
    expect(f.buildYubiWhere({ search: 'asha' }, ['u9']).userId).toEqual({ in: ['u9'] });
    expect(f.buildYubiWhere({ search: 'asha' }, []).userId).toEqual({ in: [] });
    expect(f.buildYubiWhere({ search: 'asha' }).userId).toEqual({ in: [] });
  });
});

describe('buildCustomerExportWhere', () => {
  it('accepts every funnel stage plus rejected and lost', () => {
    for (const stage of ['lead_captured', 'kyc_started', 'disbursed', 'rejected', 'lost']) {
      expect(f.buildCustomerExportWhere({ stage }).currentStage).toBe(stage);
    }
  });

  it('ignores an unknown stage, as the list does', () => {
    expect(f.buildCustomerExportWhere({ stage: 'nope' })).toEqual({});
  });

  it('maps source and campaign', () => {
    expect(f.buildCustomerExportWhere({ source: 'app', campaignId: 'c1' })).toEqual({ firstSource: 'app', campaignId: 'c1' });
  });

  it('searches name, mobile and email', () => {
    expect(f.buildCustomerExportWhere({ search: 'Asha' }).OR).toEqual([
      { name: { contains: 'Asha', mode: 'insensitive' } },
      { phone: { contains: 'Asha' } },
      { email: { contains: 'Asha', mode: 'insensitive' } },
    ]);
  });

  it('filters the joined date range and ignores invalid dates', () => {
    expect(f.buildCustomerExportWhere({ from: '2026-10-01T00:00:00.000Z', to: 'bad' }).createdAt)
      .toEqual({ gte: new Date('2026-10-01T00:00:00.000Z') });
  });

  it('adds the inactivity rule only for a positive number of minutes', () => {
    expect(f.buildCustomerExportWhere({ stalledMinutes: '0' }).events).toBeUndefined();
    expect(f.buildCustomerExportWhere({ stalledMinutes: 'x' }).events).toBeUndefined();
    const w = f.buildCustomerExportWhere({ stalledMinutes: '60' });
    expect((w.events as any).none.channel).toEqual({ in: ['website', 'app'] });
    expect(w.AND).toEqual([{ currentStage: { notIn: ['rejected', 'disbursed', 'lost'] } }]);
  });
});

describe('redactRevasurePayload', () => {
  it('drops pan, aadhaar, otp, password and token keys at any depth', () => {
    const body = {
      first_name: 'Asha',
      pan: 'ABCDE1234F',
      PAN_Number: 'ABCDE1234F',
      aadhaar_number: '1234',
      applicant: { otp: '123456', city: 'Pune', nested: { access_token: 'x', loan_amount: 100000 } },
      people: [{ name: 'A', Aadhar: '1' }, { name: 'B', password: 'p' }],
    };
    expect(f.redactRevasurePayload(body)).toEqual({
      first_name: 'Asha',
      applicant: { city: 'Pune', nested: { loan_amount: 100000 } },
      people: [{ name: 'A' }, { name: 'B' }],
    });
  });

  it('leaves other keys and plain values alone', () => {
    expect(f.redactRevasurePayload({ status: 'ok', n: 1, ok: true, none: null })).toEqual({ status: 'ok', n: 1, ok: true, none: null });
    expect(f.redactRevasurePayload(null)).toBeNull();
    expect(f.redactRevasurePayload('text')).toBe('text');
  });

  it('does not change the input', () => {
    const body = { pan: 'x', keep: { otp: '1', a: 1 } };
    f.redactRevasurePayload(body);
    expect(body).toEqual({ pan: 'x', keep: { otp: '1', a: 1 } });
  });
});

describe('export columns', () => {
  it('never include a forbidden field', () => {
    for (const headers of [f.LOAN_CSV_HEADERS, f.REVASURE_CSV_HEADERS, f.YUBI_CSV_HEADERS]) {
      for (const h of headers) expect(h).not.toMatch(f.FORBIDDEN_EXPORT_COLUMN);
    }
  });

  it('the guard itself catches the fields we must never export', () => {
    for (const bad of ['pan', 'panNumber', 'panEnc', 'aadhaarLast4', 'otp', 'requestBody', 'responseBody', 'accessToken']) {
      expect(bad).toMatch(f.FORBIDDEN_EXPORT_COLUMN);
    }
  });

  it('row builders match their headers in length', () => {
    const now = new Date('2026-10-27T10:00:00Z');
    expect(f.loanCsvRow({
      ref: 'SL-1', loanType: 'personal', amount: 100000, status: 'approved', createdAt: now,
      user: { fullName: 'Asha', phone: '9876543210' }, offers: [],
    })).toHaveLength(f.LOAN_CSV_HEADERS.length);
    expect(f.revasureCsvRow({
      sourceLeadId: 's', leadId: null, status: 'failed', httpStatus: 500, message: null, lastError: 'boom', updatedAt: now,
    }, null)).toHaveLength(f.REVASURE_CSV_HEADERS.length);
    expect(f.yubiCsvRow({ appliedLender: 'X', lastStatus: null, status: 'created', appliedAt: now }, null))
      .toHaveLength(f.YUBI_CSV_HEADERS.length);
  });

  it('cuts the Revasure message to 300 characters and falls back to the last error', () => {
    const long = 'x'.repeat(500);
    const row = f.revasureCsvRow({
      sourceLeadId: 's', leadId: 'L', status: 'failed', httpStatus: 400, message: long, lastError: null, updatedAt: new Date(),
    }, { name: 'Asha', phone: '9876543210' });
    expect((row[6] as string).length).toBe(300);
    const fallback = f.revasureCsvRow({
      sourceLeadId: 's', leadId: null, status: 'failed', httpStatus: null, message: null, lastError: 'timeout', updatedAt: new Date(),
    }, null);
    expect(fallback[6]).toBe('timeout');
  });

  it('puts the lender summary in the loans row', () => {
    const row = f.loanCsvRow({
      ref: 'SL-1', loanType: 'personal', amount: 50000, status: 'rejected', createdAt: new Date(),
      user: null, offers: [{ lenderStatus: 'rejected' }],
    });
    expect(row[6]).toBe('1 lender - 1 Rejected');
  });
});

describe('pickFilters', () => {
  it('keeps only the keys a list understands and drops blanks', () => {
    expect(f.pickFilters('loans', { status: 'approved', search: ' ', lenderResult: 'rejected', applied: '1', evil: 'x' }))
      .toEqual({ status: 'approved', lenderResult: 'rejected' });
    expect(f.pickFilters('yubi', { applied: '0', lenderResult: 'rejected' })).toEqual({ applied: '0' });
    expect(f.pickFilters('revasure', { status: 'failed', applied: '0' })).toEqual({ status: 'failed' });
  });

  it('ignores values that are not strings', () => {
    expect(f.pickFilters('loans', { status: { $ne: 'x' } as any })).toEqual({});
  });
});

describe('planContacts', () => {
  const base = { product: null, amountPaise: null, status: 'x' };

  it('normalises numbers, drops unusable ones and keeps the first of a repeated number', () => {
    const plan = f.planContacts([
      { ...base, name: 'A', phone: '+91 98765 43210' },
      { ...base, name: 'A again', phone: '9876543210' },
      { ...base, name: 'B', phone: '12345' },
      { ...base, name: 'C', phone: null },
      { ...base, name: 'D', phone: '09123456789' },
    ]);
    expect(plan.contacts.map((c) => [c.name, c.phone])).toEqual([['A', '9876543210'], ['D', '9123456789']]);
    expect(plan.noPhone).toBe(2);
    expect(plan.duplicates).toBe(1);
    expect(plan.withPhone).toBe(3);
  });
});

describe('rupeesToPaise', () => {
  it('converts rupees to paise', () => {
    expect(f.rupeesToPaise(50000)).toBe(5_000_000);
  });
  it('returns null for a missing, zero, negative or too-large amount', () => {
    expect(f.rupeesToPaise(null)).toBeNull();
    expect(f.rupeesToPaise(0)).toBeNull();
    expect(f.rupeesToPaise(-5)).toBeNull();
    expect(f.rupeesToPaise(30_000_000)).toBeNull();
  });
});

describe('describeFilterSet', () => {
  it('describes filters in words', () => {
    expect(f.describeFilterSet({})).toBe('no filters');
    expect(f.describeFilterSet({ status: 'rejected', search: '98' })).toBe('status rejected, search "98"');
  });
});

describe('findUserIdsBySearch', () => {
  it('does not query when there is no search', async () => {
    expect(await f.findUserIdsBySearch(undefined)).toBeUndefined();
    expect(db.userFindMany).not.toHaveBeenCalled();
  });

  it('looks up name and mobile, capped', async () => {
    db.userFindMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
    expect(await f.findUserIdsBySearch('asha')).toEqual(['u1', 'u2']);
    const arg = db.userFindMany.mock.calls[0][0];
    expect(arg.take).toBe(2000);
    expect(arg.where.OR).toHaveLength(3);
  });
});

describe('personsByUserId', () => {
  it('joins the user and the customer', async () => {
    db.userFindMany.mockResolvedValue([
      { id: 'u1', fullName: 'Asha Rao', firstName: 'Asha', phone: '9876543210' },
      { id: 'u2', fullName: null, firstName: null, phone: '9000000000' },
    ]);
    db.customerFindMany.mockResolvedValue([{ id: 'c1', userId: 'u1', name: 'A', phone: '9876543210' }]);
    const m = await f.personsByUserId(['u1', 'u2', 'u1', null]);
    expect(m.get('u1')).toEqual({ id: 'c1', name: 'Asha Rao', phone: '9876543210' });
    expect(m.get('u2')).toEqual({ id: null, name: null, phone: '9000000000' });
  });
});
