import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(async () => ({})),
  failFirst: 0,
}));
vi.mock('./prisma.js', () => ({ prisma: { outboundRequest: { create: db.create, update: db.update } } }));
vi.mock('../config/downloads.js', () => ({ downloads: { publicBase: 'https://api.example.test/' } }));

const I = await import('./installContext.js');

const NOW = new Date('2026-10-27T10:00:00Z');
const input = {
  customer: { id: 'cust-1', name: ' Asha Verma ', phone: '9876543210' },
  stage: 'app_installed',
  channel: 'whatsapp' as const,
  admin: { id: 'adm-1', email: 'priya@example.test' },
  amountRupees: 300000,
  product: 'personal',
  now: NOW,
};

beforeEach(() => {
  db.create.mockReset();
  db.update.mockClear();
  db.failFirst = 0;
  db.create.mockImplementation(async (args: any) => {
    if (db.failFirst > 0) { db.failFirst--; throw new Error('unique'); }
    return { id: 'row-1', ...args.data };
  });
});

describe('newInstallToken', () => {
  it('is 8 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(I.newInstallToken()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(I.newInstallToken(10)).toHaveLength(10);
  });
});

describe('buildInstallLinkPayload', () => {
  it('has exactly the shape the installs page reads', () => {
    expect(I.buildInstallLinkPayload('ABCD2345', input)).toEqual({
      v: 1, token: 'ABCD2345', customerId: 'cust-1', name: 'Asha Verma', phone: '9876543210',
      amountRupees: 300000, product: 'personal', stage: 'app_installed', channel: 'whatsapp',
      sentBy: { type: 'admin', id: 'adm-1', email: 'priya@example.test' }, sentAt: NOW.toISOString(),
    });
  });

  it('keeps null for what is not known', () => {
    const p = I.buildInstallLinkPayload('ABCD2345', { ...input, customer: { id: 'c', name: null, phone: null }, amountRupees: null, product: null });
    expect(p).toMatchObject({ name: null, phone: null, amountRupees: null, product: null });
  });
});

describe('mintInstallLink', () => {
  it('stores an install_link row keyed by its token and returns the attributed link', async () => {
    const out = await I.mintInstallLink(input);
    const data = db.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ customerId: 'cust-1', channel: 'whatsapp', kind: 'install_link', status: 'sent', sentAt: NOW });
    expect(data.idempotencyKey).toBe(`install_link:${out.token}`);
    expect(data.payload.token).toBe(out.token);
    expect(out.url).toBe(`https://api.example.test/dl?ref=${out.token}`);
    expect(out.outboundRequestId).toBe('row-1');
  });

  it('draws a fresh, longer token when the first one collides', async () => {
    db.failFirst = 1;
    const out = await I.mintInstallLink(input);
    expect(db.create).toHaveBeenCalledTimes(2);
    expect(out.token).toHaveLength(10);
  });

  it('gives up with a plain error after three collisions', async () => {
    db.failFirst = 3;
    await expect(I.mintInstallLink(input)).rejects.toThrow('Could not create the app link');
  });
});

describe('cancelInstallLink', () => {
  it('marks the row cancelled so it does not look like a link that was sent', async () => {
    await I.cancelInstallLink('row-1');
    expect(db.update).toHaveBeenCalledWith({ where: { id: 'row-1' }, data: { status: 'cancelled' } });
  });
});

describe('pickInstallDetails', () => {
  it('uses the application amount as it is (rupees) and its loan type', () => {
    expect(I.pickInstallDetails({ amount: 500000, loanType: 'personal' }, { amount: 100000, productInterest: 'business' })).toEqual({ amountRupees: 500000, product: 'personal' });
  });

  it('uses an enquiry amount as it is: every amount is whole rupees', () => {
    expect(I.pickInstallDetails(null, { amount: 300000, productInterest: ' personal loan ' })).toEqual({ amountRupees: 300000, product: 'personal loan' });
  });

  it('returns nothing when neither is known', () => {
    expect(I.pickInstallDetails(null, null)).toEqual({ amountRupees: null, product: null });
    expect(I.pickInstallDetails(null, { amount: null, productInterest: 'home' })).toEqual({ amountRupees: null, product: 'home' });
  });
});
