import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  customers: [] as Array<{ id: string; phone: string | null; currentStage: string }>,
  attempts: [] as Array<{ customerId: string | null; phone: string; outcome: string }>,
  customerFind: vi.fn(),
  attemptFind: vi.fn(),
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    customer: {
      findMany: db.customerFind.mockImplementation(async (args: any) => {
        const w = args.where;
        return db.customers.filter((c) =>
          w.id?.in ? w.id.in.includes(c.id) : w.phone?.in ? w.phone.in.includes(c.phone) : false,
        );
      }),
    },
    callAttempt: {
      findMany: db.attemptFind.mockImplementation(async (args: any) => {
        const w = args.where;
        return db.attempts.filter((a) => {
          if (a.outcome !== w.outcome) return false;
          if (w.OR) {
            return w.OR.some((o: any) => (o.customerId?.in ? o.customerId.in.includes(a.customerId) : o.phone?.in?.includes(a.phone)));
          }
          return w.phone?.in?.includes(a.phone) ?? false;
        });
      }),
    },
  },
}));

const { contactBlockReason, doNotContactCustomerIds, doNotContactPhones } = await import('./doNotContact.js');

beforeEach(() => {
  db.customers = [];
  db.attempts = [];
  db.customerFind.mockClear();
  db.attemptFind.mockClear();
});

describe('contactBlockReason', () => {
  it('blocks a customer whose stage is lost', () => {
    expect(contactBlockReason({ currentStage: 'lost', phone: '9876543210' }, false)).toBe('do_not_contact');
  });
  it('blocks a customer with a do_not_call outcome at any stage', () => {
    expect(contactBlockReason({ currentStage: 'kyc_started', phone: '9876543210' }, true)).toBe('do_not_contact');
  });
  it('blocks a customer with no phone, and says so before anything else', () => {
    expect(contactBlockReason({ currentStage: 'kyc_started', phone: null }, false)).toBe('no_phone');
    expect(contactBlockReason({ currentStage: 'lost', phone: '  ' }, true)).toBe('no_phone');
  });
  it('lets a normal customer through', () => {
    expect(contactBlockReason({ currentStage: 'offers_viewed', phone: '9876543210' }, false)).toBeNull();
    expect(contactBlockReason({ currentStage: null, phone: '9876543210' }, false)).toBeNull();
  });
});

describe('doNotContactCustomerIds', () => {
  it('returns nothing and queries nothing for an empty list', async () => {
    expect((await doNotContactCustomerIds([])).size).toBe(0);
    expect(db.customerFind).not.toHaveBeenCalled();
  });

  it('finds lost customers and do_not_call callers, and ignores everyone else', async () => {
    db.customers = [
      { id: 'a', phone: '9000000001', currentStage: 'lost' },
      { id: 'b', phone: '9000000002', currentStage: 'kyc_started' },
      { id: 'c', phone: '9000000003', currentStage: 'offers_viewed' },
    ];
    db.attempts = [
      { customerId: 'b', phone: '9000000002', outcome: 'do_not_call' },
      { customerId: 'c', phone: '9000000003', outcome: 'interested' },
    ];
    const out = await doNotContactCustomerIds(['a', 'b', 'c']);
    expect([...out].sort()).toEqual(['a', 'b']);
  });

  it('matches a do_not_call call that was logged by phone only', async () => {
    db.customers = [{ id: 'a', phone: '9000000001', currentStage: 'registered' }];
    db.attempts = [{ customerId: null, phone: '9000000001', outcome: 'do_not_call' }];
    expect([...(await doNotContactCustomerIds(['a']))]).toEqual(['a']);
  });

  it('uses a fixed number of queries however many ids there are', async () => {
    db.customers = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, phone: `90000${String(i).padStart(5, '0')}`, currentStage: 'registered' }));
    await doNotContactCustomerIds(db.customers.map((c) => c.id));
    expect(db.customerFind).toHaveBeenCalledTimes(1);
    expect(db.attemptFind).toHaveBeenCalledTimes(1);
  });
});

describe('doNotContactPhones', () => {
  it('maps blocked customers back to their phones', async () => {
    db.customers = [
      { id: 'a', phone: '9000000001', currentStage: 'lost' },
      { id: 'b', phone: '9000000002', currentStage: 'registered' },
    ];
    const out = await doNotContactPhones(['9000000001', '9000000002']);
    expect([...out]).toEqual(['9000000001']);
  });

  it('blocks a number that asked to stop but has no customer row', async () => {
    db.attempts = [{ customerId: null, phone: '9000000009', outcome: 'do_not_call' }];
    const out = await doNotContactPhones(['9000000009', '9000000008']);
    expect([...out]).toEqual(['9000000009']);
  });
});
