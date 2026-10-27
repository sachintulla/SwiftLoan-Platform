import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({
  updateMany: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  loanFindMany: vi.fn(),
  customerFindMany: vi.fn(),
  userFindMany: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    notification: { updateMany: db.updateMany, findMany: db.findMany, count: db.count, groupBy: db.groupBy },
    loanApplication: { findMany: db.loanFindMany },
    customer: { findMany: db.customerFindMany },
    user: { findMany: db.userFindMany },
    adminAuditLog: { create: db.auditCreate },
  },
}));

// Sign-in is out of scope: the role comes from a header. requireRole and CAN_WRITE are the real ones.
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

const { adminNotificationCenterRouter } = await import('./adminNotificationCenter.routes.js');
const { errorHandler } = await import('../middleware/error.js');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/notification-center', adminNotificationCenterRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/notification-center`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

beforeEach(() => {
  for (const fn of Object.values(db)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.updateMany.mockResolvedValue({ count: 2 });
  db.findMany.mockResolvedValue([]);
  db.count.mockResolvedValue(0);
  db.groupBy.mockResolvedValue([]);
  db.loanFindMany.mockResolvedValue([]);
  db.customerFindMany.mockResolvedValue([]);
  db.userFindMany.mockResolvedValue([]);
});

const post = (body: unknown, role = 'admin') =>
  fetch(`${base}/read`, { method: 'POST', headers: { 'x-role': role, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('POST /read', () => {
  it('refuses a body with neither ids nor a filter, and changes nothing', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it('refuses more than 200 ids', async () => {
    const res = await post({ ids: Array.from({ length: 201 }, (_, i) => `n-${i}`) });
    expect(res.status).toBe(400);
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it('never touches rows that are already read, for ids or for a filter', async () => {
    expect((await post({ ids: ['n-1', 'n-2'] })).status).toBe(200);
    expect(db.updateMany.mock.calls[0][0].where).toMatchObject({ read: false, id: { in: ['n-1', 'n-2'] } });

    expect((await post({ filter: { type: 'loan_stale', severity: 'warning' } })).status).toBe(200);
    expect(db.updateMany.mock.calls[1][0].where).toMatchObject({ read: false, type: 'loan_stale', severity: 'warning' });
    expect(db.updateMany.mock.calls[1][0].data).toEqual({ read: true });
  });

  it('lets an analyst mark single rows, but not clear everything that matches a filter', async () => {
    expect((await post({ ids: ['n-1'] }, 'analyst')).status).toBe(200);
    expect(db.updateMany).toHaveBeenCalledTimes(1);

    expect((await post({ filter: {} }, 'analyst')).status).toBe(403);
    expect((await post({ filter: { type: 'loan_stale' } }, 'analyst')).status).toBe(403);
    expect(db.updateMany).toHaveBeenCalledTimes(1); // the refused calls changed nothing
  });

  it('lets an admin and a super admin clear a filter', async () => {
    expect((await post({ filter: {} }, 'admin')).status).toBe(200);
    expect((await post({ filter: {} }, 'super_admin')).status).toBe(200);
    expect(db.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('GET /', () => {
  it('looks up loans once, however many rows come back', async () => {
    const now = new Date('2026-10-27T10:00:00Z');
    db.findMany.mockResolvedValue(['loan_stale', 'loan_stale', 'loan_stale'].map((type, i) => ({
      id: `n-${i}`, type, title: 't', body: null, severity: 'warning', read: false, createdAt: now, entityId: `loan-${i}`,
    })));
    db.count.mockResolvedValue(3);
    const res = await fetch(base, { headers: { 'x-role': 'analyst' } });
    expect(res.status).toBe(200);
    expect(db.loanFindMany).toHaveBeenCalledTimes(1);
    expect(db.loanFindMany.mock.calls[0][0].where.id.in).toHaveLength(3);
    expect(db.customerFindMany).not.toHaveBeenCalled();
  });
});
