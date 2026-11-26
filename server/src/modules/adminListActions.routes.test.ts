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
  auditCreate: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    loanApplication: { findMany: db.loanFindMany, count: db.loanCount },
    revasureLead: { findMany: db.revasureFindMany, count: vi.fn() },
    partnerReferral: { findMany: db.yubiFindMany, count: vi.fn() },
    user: { findMany: db.userFindMany },
    customer: { findMany: db.customerFindMany },
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
  db.auditCreate.mockResolvedValue({});
  db.userFindMany.mockResolvedValue([]);
  db.customerFindMany.mockResolvedValue([]);
});

const get = (path: string, role = 'admin') => fetch(`${base}${path}`, { headers: { 'x-role': role } });

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
    expect(db.loanFindMany).not.toHaveBeenCalled();
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
