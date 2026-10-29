import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({
  loanFindMany: vi.fn(),
  loanCount: vi.fn(),
  revasureFindMany: vi.fn(),
  yubiFindMany: vi.fn(),
  userFindMany: vi.fn(),
  customerFindMany: vi.fn(),
  contactCreateMany: vi.fn(),
  contactCount: vi.fn(),
  campaignUpdate: vi.fn(),
  auditCreate: vi.fn(),
  doNotContactPhones: vi.fn(),
  createDraftCampaign: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    loanApplication: { findMany: db.loanFindMany, count: db.loanCount },
    revasureLead: { findMany: db.revasureFindMany, count: vi.fn() },
    partnerReferral: { findMany: db.yubiFindMany, count: vi.fn() },
    user: { findMany: db.userFindMany },
    customer: { findMany: db.customerFindMany },
    campaignContact: { createMany: db.contactCreateMany, count: db.contactCount },
    campaign: { update: db.campaignUpdate },
    adminAuditLog: { create: db.auditCreate },
  },
}));

// Sign-in is out of scope here: the role comes from a header. requireRole and CAN_WRITE are the real ones.
vi.mock('../middleware/adminAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/adminAuth.js')>('../middleware/adminAuth.js');
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    ...actual,
    requireAdmin: (req: any, _res: unknown, next: () => void) => {
      req.admin = { sub: 'admin-1', email: 'ops@example.com', role: req.headers['x-role'] };
      next();
    },
    requireActiveAdmin: pass,
    auditAdmin: pass,
  };
});

vi.mock('../lib/doNotContact.js', () => ({ doNotContactPhones: db.doNotContactPhones }));
vi.mock('./campaigns.routes.js', () => ({ createDraftCampaign: db.createDraftCampaign }));

const { adminListActionsRouter } = await import('./adminListActions.routes.js');
const { errorHandler } = await import('../middleware/error.js');
const { LOAN_CSV_HEADERS } = await import('../lib/listFilters.js');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/list-actions', adminListActionsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/list-actions`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(() => {
  for (const fn of Object.values(db)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.doNotContactPhones.mockResolvedValue(new Set());
  db.auditCreate.mockResolvedValue({});
  db.contactCreateMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  db.contactCount.mockResolvedValue(0);
  db.campaignUpdate.mockResolvedValue({});
  db.userFindMany.mockResolvedValue([]);
  db.customerFindMany.mockResolvedValue([]);
  db.createDraftCampaign.mockResolvedValue({ id: 'camp-1', code: 'rejected-nov' });
});

const get = (path: string, role = 'admin') => fetch(`${base}${path}`, { headers: { 'x-role': role } });
const post = (path: string, body: unknown, role = 'admin') =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'x-role': role, 'content-type': 'application/json' }, body: JSON.stringify(body) });

const loanRow = (phone: string | null, over: Record<string, unknown> = {}) => ({
  ref: 'SL-1', loanType: 'personal', amount: 150000, status: 'rejected', createdAt: new Date('2026-10-01T00:00:00Z'),
  user: phone === null ? null : { fullName: 'Asha Rao', firstName: 'Asha', phone },
  offers: [{ lenderStatus: 'rejected' }],
  ...over,
});

describe('role gate', () => {
  it('refuses an analyst on every route', async () => {
    for (const path of ['/loans.csv', '/revasure.csv', '/yubi.csv']) {
      expect((await get(path, 'analyst')).status).toBe(403);
    }
    for (const path of ['/loans/campaign', '/revasure/campaign', '/yubi/campaign']) {
      expect((await post(path, { filters: {}, dryRun: true }, 'analyst')).status).toBe(403);
    }
    expect(db.loanFindMany).not.toHaveBeenCalled();
    expect(db.createDraftCampaign).not.toHaveBeenCalled();
  });
});

describe('CSV export', () => {
  it('sends a BOM-prefixed CSV, follows the filters and writes an audit row', async () => {
    db.loanFindMany.mockResolvedValue([loanRow('9876543210')]);
    const res = await get('/loans.csv?status=rejected&lenderResult=rejected&page=3&evil=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="loans-\d{4}-\d{2}-\d{2}\.csv"/);

    // fetch's text() drops a byte-order mark, so read the raw bytes
    const bytes = Buffer.from(await res.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.subarray(3).toString('utf8').split('\r\n');
    expect(lines[0]).toBe(LOAN_CSV_HEADERS.join(','));
    expect(lines[1]).toContain('SL-1');
    expect(lines[1]).toContain('9876543210');
    expect(lines[1]).toContain('1 lender - 1 Rejected');

    // the same where-builder as the list, so the filters reached the query
    const where = db.loanFindMany.mock.calls[0][0].where;
    expect(where.status).toBe('rejected');
    expect(where.AND).toEqual([{ offers: { some: { applied: true, lenderStatus: { in: ['rejected', 'failed'] } } } }]);
    expect(db.loanFindMany.mock.calls[0][0].take).toBe(10_001);

    expect(db.auditCreate).toHaveBeenCalledTimes(1);
    const audit = db.auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe('export.loans');
    expect(audit.metadata).toEqual({ filters: { status: 'rejected', lenderResult: 'rejected' }, rows: 1, truncated: false });
  });

  it('cuts at 10,000 rows and says so in the audit row', async () => {
    db.loanFindMany.mockResolvedValue(Array.from({ length: 10_001 }, () => loanRow('9876543210')));
    const res = await get('/loans.csv');
    const lines = (await res.text()).split('\r\n');
    expect(lines).toHaveLength(10_001); // header + 10,000
    expect(db.auditCreate.mock.calls[0][0].data.metadata).toEqual({ filters: {}, rows: 10_000, truncated: true });
  });

  it('never selects a stored Revasure request or response body', async () => {
    db.revasureFindMany.mockResolvedValue([]);
    await get('/revasure.csv');
    const select = db.revasureFindMany.mock.calls[0][0].select;
    expect(select).toBeDefined();
    expect(select.requestBody).toBeUndefined();
    expect(select.responseBody).toBeUndefined();
  });
});

describe('campaign from a list', () => {
  it('dry run reports counts and creates nothing', async () => {
    db.loanFindMany.mockResolvedValue([
      loanRow('9876543210'),
      loanRow('+91 98765 43210'), // same number again
      loanRow('9123456789'),
      loanRow('12345'), // not a mobile
      loanRow(null),
    ]);
    db.doNotContactPhones.mockResolvedValue(new Set(['9123456789']));

    const res = await post('/loans/campaign', { filters: { status: 'rejected' }, dryRun: true });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual({
      matched: 5, withPhone: 3, noPhone: 2, duplicates: 1, excludedDoNotContact: 1, willAdd: 1, capped: false,
    });
    expect(db.doNotContactPhones).toHaveBeenCalledWith(['9876543210', '9123456789']);
    expect(db.createDraftCampaign).not.toHaveBeenCalled();
    expect(db.contactCreateMany).not.toHaveBeenCalled();
  });

  it('creates a draft with the contacts, amounts in whole rupees, and ignores any phone list from the client', async () => {
    db.loanFindMany.mockResolvedValue([loanRow('9876543210'), loanRow('9123456789', { amount: 50000, loanType: 'business' })]);
    db.contactCount.mockResolvedValue(2);

    const res = await post('/loans/campaign', {
      name: 'Rejected customers, November',
      filters: { status: 'rejected', phones: '9000000000,9000000001' },
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data).toMatchObject({ campaignId: 'camp-1', campaignCode: 'rejected-nov', matched: 2, inserted: 2, excludedDoNotContact: 0 });

    expect(db.createDraftCampaign).toHaveBeenCalledTimes(1);
    expect(db.createDraftCampaign.mock.calls[0][0]).toMatchObject({ name: 'Rejected customers, November', createdBy: 'admin-1' });
    expect(db.createDraftCampaign.mock.calls[0][0].note).toContain('Loan Pipeline');

    const contacts = db.contactCreateMany.mock.calls[0][0].data;
    expect(contacts.map((c: any) => c.phone)).toEqual(['9876543210', '9123456789']); // from the database, not the request
    expect(contacts[0]).toMatchObject({ campaignId: 'camp-1', name: 'Asha Rao', product: 'personal', amount: 150000, extra: { sourceList: 'loans', status: 'rejected' } });
    expect(contacts[1].amount).toBe(50000);
    expect(db.contactCreateMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(db.campaignUpdate).toHaveBeenCalledWith({ where: { id: 'camp-1' }, data: { totalContacts: 2 } });
    // a campaign created here is only ever a draft: createDraftCampaign is the only way in and nothing starts it
    expect(db.loanFindMany.mock.calls[0][0].where).toEqual({ status: 'rejected' });
  });

  it('needs a name unless it is a dry run', async () => {
    const res = await post('/loans/campaign', { filters: {} });
    expect(res.status).toBe(400);
    expect(db.createDraftCampaign).not.toHaveBeenCalled();
  });

  it('refuses with nothing_to_add when everyone is excluded', async () => {
    db.loanFindMany.mockResolvedValue([loanRow('9876543210')]);
    db.doNotContactPhones.mockResolvedValue(new Set(['9876543210']));
    const res = await post('/loans/campaign', { name: 'x', filters: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).data.code).toBe('nothing_to_add');
    expect(db.createDraftCampaign).not.toHaveBeenCalled();
  });

  it('answers 409 with a plain sentence when the campaign code is already taken', async () => {
    const { Prisma } = await import('@prisma/client');
    db.loanFindMany.mockResolvedValue([loanRow('9876543210')]);
    db.createDraftCampaign.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }));
    const res = await post('/loans/campaign', { name: 'Rejected customers', filters: {} });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      success: false, data: { code: 'code_taken' }, message: 'A campaign with that code already exists. Try a different name.',
    });
    expect(db.contactCreateMany).not.toHaveBeenCalled();
  });

  it('refuses with too_many above 5,000 and reports the cap on a dry run', async () => {
    const all = Array.from({ length: 5_001 }, (_, i) => loanRow(`9${String(100000000 + i)}`));
    db.loanFindMany.mockImplementation(async ({ skip, take }: { skip: number; take: number }) => all.slice(skip, skip + take));
    db.loanCount.mockResolvedValue(7_200);

    const real = await post('/loans/campaign', { name: 'x', filters: {} });
    expect(real.status).toBe(422);
    expect(await real.json()).toMatchObject({ success: false, data: { code: 'too_many', matched: 7_200 } });

    const dry = await post('/loans/campaign', { filters: {}, dryRun: true });
    expect(dry.status).toBe(200);
    expect((await dry.json()).data).toMatchObject({ capped: true, matched: 7_200, willAdd: 0 });
    expect(db.createDraftCampaign).not.toHaveBeenCalled();
  });

  it('builds Revasure and Yubi contacts from the customer behind each row', async () => {
    db.revasureFindMany.mockResolvedValue([{ userId: 'u1', status: 'failed' }]);
    db.yubiFindMany.mockResolvedValue([{ userId: 'u1', lastStatus: 'REJECTED', status: 'created' }]);
    db.userFindMany.mockResolvedValue([{ id: 'u1', fullName: 'Asha Rao', firstName: 'Asha', phone: '9876543210' }]);

    const rev = await post('/revasure/campaign', { filters: { status: 'failed' }, dryRun: true });
    expect((await rev.json()).data).toMatchObject({ matched: 1, willAdd: 1 });

    db.contactCount.mockResolvedValue(1);
    const yubi = await post('/yubi/campaign', { name: 'Yubi win-back', filters: { status: 'REJECTED' } });
    expect(yubi.status).toBe(201);
    expect(db.contactCreateMany.mock.calls[0][0].data[0]).toMatchObject({
      phone: '9876543210', name: 'Asha Rao', extra: { sourceList: 'yubi', status: 'REJECTED' },
    });
  });
});
