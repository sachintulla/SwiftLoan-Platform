import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

// Route-level regression tests for the Calls admin routes: the hard stops on POST /trigger,
// the role gate and route order of the CSV export, the slim list select, and the fields
// /overview has always returned. Prisma and the dialler are mocked; nothing is dialled.

const m = vi.hoisted(() => ({
  customerFindUnique: vi.fn(),
  callFindUnique: vi.fn(),
  callFindMany: vi.fn(),
  callCount: vi.fn(),
  callGroupBy: vi.fn(),
  callAggregate: vi.fn(),
  queryRaw: vi.fn(),
  campaignFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  placeCall: vi.fn(),
  resolveCustomer: vi.fn(),
  doNotContactCustomerIds: vi.fn(),
  doNotContactPhones: vi.fn(),
  withinTestAllowlist: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    customer: { findUnique: m.customerFindUnique },
    callAttempt: {
      findUnique: m.callFindUnique, findMany: m.callFindMany, count: m.callCount,
      groupBy: m.callGroupBy, aggregate: m.callAggregate,
    },
    campaign: { findUnique: m.campaignFindUnique },
    adminAuditLog: { create: m.auditCreate },
    $queryRaw: m.queryRaw,
  },
}));

// Sign-in is out of scope: the role comes from a header. requireRole and the role lists are the real ones.
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

vi.mock('../lib/journey.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/journey.js')>('../lib/journey.js');
  return { ...actual, resolveCustomer: m.resolveCustomer };
});
vi.mock('../lib/dialer.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/dialer.js')>('../lib/dialer.js');
  return { ...actual, placeCall: m.placeCall };
});
vi.mock('../lib/callContext.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/callContext.js')>('../lib/callContext.js');
  return { ...actual, buildLeadCallContext: vi.fn().mockResolvedValue({}) };
});
vi.mock('../lib/agents.js', () => ({ agentIdFor: vi.fn().mockResolvedValue('agent-1') }));
vi.mock('../jobs/tracking.jobs.js', () => ({ getJobHeartbeats: () => [] }));
vi.mock('../lib/callGate.js', () => ({ withinTestAllowlist: m.withinTestAllowlist }));
vi.mock('../lib/doNotContact.js', () => ({ doNotContactCustomerIds: m.doNotContactCustomerIds, doNotContactPhones: m.doNotContactPhones }));

const { callsRouter } = await import('./calls.routes.js');
const { errorHandler } = await import('../middleware/error.js');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/calls', callsRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/calls`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

const CUSTOMER = { id: 'cust-1', name: 'Asha Rao', phone: '9876543210', currentStage: 'kyc_started', userId: 'user-1' };

beforeEach(() => {
  for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  m.customerFindUnique.mockResolvedValue(CUSTOMER);
  m.doNotContactCustomerIds.mockResolvedValue(new Set());
  m.doNotContactPhones.mockResolvedValue(new Set());
  m.withinTestAllowlist.mockReturnValue(true);
  m.auditCreate.mockResolvedValue({});
  m.placeCall.mockResolvedValue({ ok: true, attempt: { id: 'call-1' } });
  m.callFindUnique.mockResolvedValue({ id: 'call-1', status: 'queued', customer: CUSTOMER });
  m.callFindMany.mockResolvedValue([]);
  m.callCount.mockResolvedValue(0);
  m.callGroupBy.mockResolvedValue([]);
  m.callAggregate.mockResolvedValue({ _avg: { durationSec: null } });
  m.queryRaw.mockResolvedValue([]);
});

const send = (method: string, path: string, role: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method,
    headers: { 'x-role': role, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

describe('POST /trigger', () => {
  it('is for super admins only', async () => {
    for (const role of ['analyst', 'admin']) {
      const res = await send('POST', '/trigger', role, { customerId: 'cust-1' });
      expect(res.status).toBe(403);
    }
    expect(m.placeCall).not.toHaveBeenCalled();
    const ok = await send('POST', '/trigger', 'super_admin', { customerId: 'cust-1' });
    expect(ok.status).toBe(201);
    expect(m.placeCall).toHaveBeenCalledTimes(1);
    expect(m.placeCall.mock.calls[0][0]).toMatchObject({ customerId: 'cust-1', phone: '9876543210' });
  });

  it('refuses a do-not-contact customer with a code, and dials nothing', async () => {
    m.doNotContactCustomerIds.mockResolvedValue(new Set(['cust-1']));
    const res = await send('POST', '/trigger', 'super_admin', { customerId: 'cust-1' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data.code).toBe('do_not_contact');
    expect(m.placeCall).not.toHaveBeenCalled();
  });

  it('refuses a do-not-contact NUMBER even when the customerId named is a normal customer', async () => {
    m.doNotContactPhones.mockResolvedValue(new Set(['9000000001']));
    const res = await send('POST', '/trigger', 'super_admin', { customerId: 'cust-1', phone: '9000000001' });
    expect(res.status).toBe(409);
    expect((await res.json()).data.code).toBe('do_not_contact');
    expect(m.placeCall).not.toHaveBeenCalled();
  });

  it('refuses a number that is off the test allowlist, and dials nothing', async () => {
    m.withinTestAllowlist.mockReturnValue(false);
    const res = await send('POST', '/trigger', 'super_admin', { customerId: 'cust-1' });
    expect(res.status).toBe(403);
    expect((await res.json()).data.code).toBe('not_on_test_allowlist');
    expect(m.placeCall).not.toHaveBeenCalled();
  });

  it('checks the guards before it looks at a campaign or builds anything', async () => {
    m.doNotContactCustomerIds.mockResolvedValue(new Set(['cust-1']));
    await send('POST', '/trigger', 'super_admin', { customerId: 'cust-1', campaignId: 'camp-1' });
    expect(m.campaignFindUnique).not.toHaveBeenCalled();
  });
});

describe('GET /export.csv', () => {
  it('needs an admin or super admin', async () => {
    expect((await send('GET', '/export.csv', 'analyst')).status).toBe(403);
    expect(m.callFindMany).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it('is served as the export, not read as a call id', async () => {
    m.callFindMany.mockResolvedValue([{
      id: 'call-1', phone: '9876543210', status: 'completed', outcome: 'interested', answered: true, durationSec: 61, attempt: 1,
      queuedAt: new Date('2026-10-27T05:00:00Z'), endedAt: new Date('2026-10-27T05:01:01Z'), error: null, campaignId: null,
      customer: { name: 'Asha Rao', firstSource: 'website' }, campaign: null,
    }]);
    m.callCount.mockResolvedValue(1);
    const res = await send('GET', '/export.csv?status=completed&search=98765', 'admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(m.callFindUnique).not.toHaveBeenCalled();

    // fetch's text() drops a byte-order mark, so read the raw bytes: EF BB BF is what Excel needs for UTF-8 names.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const header = new TextDecoder().decode(bytes).split(/\r?\n/)[0];
    expect(header).not.toMatch(/recordingUrl|summary|transcript/i);
    expect(header).toContain('outcome');

    // The same filters as the list, and an audit row that records who took the file.
    expect(m.callFindMany.mock.calls[0][0].where).toMatchObject({ status: 'completed', phone: { contains: '98765' } });
    expect(m.auditCreate).toHaveBeenCalledTimes(1);
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe('export.calls');
    expect(audit.metadata).toMatchObject({ rows: 1, truncated: false });
  });
});

describe('GET /', () => {
  it('selects list fields only, never the transcript, raw payload, call context or recording', async () => {
    const res = await send('GET', '/?status=failed&page=2&pageSize=10', 'analyst');
    expect(res.status).toBe(200);
    const args = m.callFindMany.mock.calls[0][0];
    for (const field of ['rawPayload', 'transcript', 'callContext', 'recordingUrl']) {
      expect(args.select).not.toHaveProperty(field);
    }
    expect(args.include).toBeUndefined();
    expect(args.where).toMatchObject({ status: 'failed' });
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });
});

describe('GET /overview', () => {
  it('keeps every field it had before and adds the summary', async () => {
    const res = await send('GET', '/overview', 'analyst');
    expect(res.status).toBe(200);
    const d = (await res.json()).data;
    for (const key of ['totals', 'byStatus', 'byPurpose', 'perDay', 'recent', 'jobs', 'generatedAt']) {
      expect(d).toHaveProperty(key);
    }
    expect(d.totals).toHaveProperty('last24h');
    expect(d.totals).toHaveProperty('last7d');
    for (const key of ['range', 'summary', 'byOutcome']) expect(d).toHaveProperty(key);
    expect(d.summary).toMatchObject({ placed: 0, answered: 0, answerRate: 0, avgDurationSec: null, needsFollowUp: 0 });
  });
});

describe('GET /:id', () => {
  it('still returns the full call, and 404s for an unknown id', async () => {
    const found = await send('GET', '/call-1', 'analyst');
    expect(found.status).toBe(200);
    m.callFindUnique.mockResolvedValue(null);
    expect((await send('GET', '/nope', 'analyst')).status).toBe(404);
  });
});
