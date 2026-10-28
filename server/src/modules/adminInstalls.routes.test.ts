import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({
  downloads: vi.fn(),
  outbound: vi.fn(),
  reminders: vi.fn(),
  nudges: vi.fn(),
  leads: vi.fn(),
  codes: vi.fn(),
  customers: vi.fn(),
  loans: vi.fn(),
  users: vi.fn(),
  admins: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    appDownload: { findMany: db.downloads },
    outboundRequest: { findMany: db.outbound },
    journeyReminder: { findMany: db.reminders },
    lenderNudge: { findMany: db.nudges },
    lead: { findMany: db.leads },
    referralCode: { findMany: db.codes },
    customer: { findMany: db.customers },
    loanApplication: { findMany: db.loans },
    user: { findMany: db.users },
    adminUser: { findMany: db.admins },
  },
}));

vi.mock('../middleware/adminAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/adminAuth.js')>('../middleware/adminAuth.js');
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    ...actual,
    requireAdmin: (req: any, _res: unknown, next: () => void) => {
      req.admin = { sub: 'admin-1', email: 'ops@example.com', role: 'analyst' };
      next();
    },
    requireActiveAdmin: pass,
  };
});

const { adminInstallsRouter } = await import('./adminInstalls.routes.js');
const { errorHandler } = await import('../middleware/error.js');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use('/api/admin/installs', adminInstallsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/installs`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

const download = (i: number) => ({
  id: `dl-${i}`, platform: 'android', source: 'link', campaignId: null, referrer: `ABCD${2000 + i}`,
  matchedUserId: `user-${i}`, matchMethod: 'referrer_token', installedAt: new Date(`2026-10-${10 + i}T10:00:00Z`),
});

beforeEach(() => {
  for (const fn of Object.values(db)) (fn as ReturnType<typeof vi.fn>).mockReset();
  for (const fn of [db.outbound, db.reminders, db.nudges, db.leads, db.codes, db.customers, db.loans, db.users, db.admins]) fn.mockResolvedValue([]);
  db.downloads.mockResolvedValue([download(1), download(2), download(3), download(4), download(5)]);
});

describe('GET /api/admin/installs', () => {
  it('runs each lookup once, however many installs are returned', async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(db.downloads).toHaveBeenCalledTimes(1);
    expect(db.outbound).toHaveBeenCalledTimes(1);
    expect(db.customers).toHaveBeenCalledTimes(1);
    expect(db.loans).toHaveBeenCalledTimes(1);
    expect(db.customers.mock.calls[0][0].where.userId.in).toHaveLength(5);
    for (const fn of [db.reminders, db.nudges, db.leads, db.codes, db.users, db.admins]) {
      expect(fn.mock.calls.length).toBeLessThanOrEqual(1);
    }
  });

  it('only reads install links that were actually sent', async () => {
    await fetch(base);
    const where = db.outbound.mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: 'install_link', status: 'sent' });
    expect(where.idempotencyKey.in.length).toBeGreaterThan(0);
  });

  it('shows no sender for an install whose link row was not returned (a cancelled send)', async () => {
    // The query filters on status, so a cancelled row never comes back; the install must not claim a sender.
    db.outbound.mockResolvedValue([]);
    const res = await fetch(base);
    const body = await res.json();
    expect(JSON.stringify(body.data.rows)).not.toContain('WhatsApp by');
  });
});
