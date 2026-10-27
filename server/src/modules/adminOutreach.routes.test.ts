import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

const db = vi.hoisted(() => ({
  customerFind: vi.fn(),
  deliveryFind: vi.fn(),
  outboundFind: vi.fn(),
  adminFind: vi.fn(),
  installFind: vi.fn(),
  reminder: vi.fn(),
  loadPlans: vi.fn(),
  sendWa: vi.fn(),
  sendSms: vi.fn(),
  sendPush: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    customer: { findUnique: db.customerFind },
    messageDelivery: { findMany: db.deliveryFind },
    outboundRequest: { findMany: db.outboundFind },
    adminUser: { findMany: db.adminFind },
    appDownload: { findUnique: db.installFind },
  },
}));

// Sign-in is out of scope: the role comes from a header. requireRole and CAN_WRITE are the real ones.
vi.mock('../middleware/adminAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../middleware/adminAuth.js')>('../middleware/adminAuth.js');
  const pass = (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    ...actual,
    requireAdmin: (req: any, _res: unknown, next: () => void) => {
      req.admin = { sub: 'adm-1', email: 'priya@example.test', role: req.headers['x-role'] };
      next();
    },
    requireActiveAdmin: pass,
    auditAdmin: pass,
  };
});
vi.mock('../lib/installReminderGuard.js', () => ({ hasActiveInstallReminder: db.reminder }));
vi.mock('../lib/manualOutreach.js', async (orig) => ({
  ...(await orig<typeof import('../lib/manualOutreach.js')>()),
  loadPlans: db.loadPlans,
  sendManualWhatsApp: db.sendWa,
  sendManualSms: db.sendSms,
  sendManualPush: db.sendPush,
}));

const { adminOutreachRouter } = await import('./adminOutreach.routes.js');
const { errorHandler } = await import('../middleware/error.js');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/outreach', adminOutreachRouter);
  app.use(errorHandler);
  await new Promise<void>((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/outreach`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); });

const customer = {
  id: 'cust-1', name: 'Asha Verma', phone: '9876543210', userId: 'user-1', currentStage: 'eligibility_checked',
  stageEnteredAt: new Date('2026-10-25T10:00:00Z'),
};

const plan = (over: Record<string, unknown> = {}) => ({
  available: true, reason: null, code: null, preview: { kind: 'sms', text: 'Finish your KYC', templateId: 'T1' },
  recentlySent: false, sentToday: 0, lastSentAt: null, lastSentBy: null,
  contentBlock: 'secret-server-only', send: { sms: { templateId: 'T1', body: 'Finish your KYC' } }, ...over,
});

beforeEach(() => {
  for (const fn of Object.values(db)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.customerFind.mockResolvedValue(customer);
  db.deliveryFind.mockResolvedValue([]);
  db.outboundFind.mockResolvedValue([]);
  db.adminFind.mockResolvedValue([]);
  db.reminder.mockResolvedValue(false);
  db.loadPlans.mockResolvedValue({ whatsapp: plan(), sms: plan(), push: plan(), snapshot: { dnc: false } });
  db.sendWa.mockResolvedValue({ ok: true, data: { channel: 'whatsapp', status: 'sent', outboundRequestId: 'r1', messageId: 'm1', sentAt: '2026-10-27T10:00:00.000Z' } });
  db.sendSms.mockResolvedValue({ ok: true, data: { channel: 'sms', status: 'sent', outboundRequestId: 'r2', messageId: 'm2', sentAt: '2026-10-27T10:00:00.000Z' } });
  db.sendPush.mockResolvedValue({ ok: true, data: { channel: 'push', status: 'queued', outboundRequestId: 'r3', messageId: null, sentAt: null } });
});

const get = (path: string, role = 'analyst') => fetch(`${base}${path}`, { headers: { 'x-role': role } });
const post = (path: string, body: unknown, role = 'admin') =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'x-role': role, 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('GET /customers/:id/options', () => {
  it('is open to any admin role, including an analyst', async () => {
    const res = await get('/customers/cust-1/options', 'analyst');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.role).toEqual({ canMessage: false, canCall: false });
  });

  it('describes the customer, the stage and every channel', async () => {
    const body = await (await get('/customers/cust-1/options', 'super_admin')).json();
    expect(body.data.customer).toMatchObject({ id: 'cust-1', currentStage: 'eligibility_checked', stageLabel: 'Eligibility checked' });
    expect(body.data.outreachStage).toBe('eligibility_completed');
    expect(body.data.terminal).toBe(false);
    expect(body.data.doNotContact).toEqual({ blocked: false, reason: null });
    expect(body.data.role).toEqual({ canMessage: true, canCall: true });
    expect(Object.keys(body.data.channels).sort()).toEqual(['push', 'sms', 'whatsapp']);
  });

  it('never sends the server-only parts of a plan to the browser', async () => {
    const text = await (await get('/customers/cust-1/options', 'admin')).text();
    expect(text).not.toContain('secret-server-only');
    expect(text).not.toContain('"send"');
    expect(text).not.toContain('contentBlock');
  });

  it('says why a do-not-contact customer is blocked', async () => {
    db.loadPlans.mockResolvedValue({ whatsapp: plan(), sms: plan(), push: plan(), snapshot: { dnc: true } });
    db.customerFind.mockResolvedValue({ ...customer, currentStage: 'lost' });
    const body = await (await get('/customers/cust-1/options', 'admin')).json();
    expect(body.data.doNotContact).toEqual({ blocked: true, reason: 'stage_lost' });
    expect(body.data.terminal).toBe(true);
  });

  it('reads delivery history by phone, in both stored forms, without events or raw payloads', async () => {
    await get('/customers/cust-1/options', 'admin');
    const args = db.deliveryFind.mock.calls[0][0];
    expect(args.where.phone).toEqual({ in: ['9876543210', '919876543210'] });
    expect(args.take).toBe(20);
    expect(Object.keys(args.select).sort()).toEqual(['channel', 'createdAt', 'deliveredAt', 'failureReason', 'id', 'kind', 'readAt', 'sentAt', 'status', 'template']);
    expect(args.select.events).toBeUndefined();
  });

  it('lists the last manual sends with the admin name, and counts app-link rows separately', async () => {
    db.outboundFind
      .mockResolvedValueOnce([{ kind: 'whatsapp_template', channel: 'whatsapp', status: 'sent', createdAt: new Date('2026-10-27T09:00:00Z'), sentAt: new Date('2026-10-27T09:00:05Z'), payload: { source: 'admin', sentBy: { id: 'adm-1', email: 'priya@example.test' } } }])
      .mockResolvedValueOnce([{ status: 'sent' }, { status: 'cancelled' }]);
    db.adminFind.mockResolvedValue([{ id: 'adm-1', name: 'Priya Rao' }]);
    const body = await (await get('/customers/cust-1/options', 'admin')).json();
    expect(body.data.manualSends).toEqual([{ channel: 'whatsapp', at: '2026-10-27T09:00:05.000Z', by: 'Priya Rao', status: 'sent' }]);
    expect(body.data.installLinks).toEqual({ total: 2, sent: 1 });
    expect(db.outboundFind.mock.calls[0][0].where.payload).toEqual({ path: ['source'], equals: 'admin' });
    expect(db.outboundFind.mock.calls[0][0].take).toBe(10);
  });

  it('answers 404 with a code for an unknown customer', async () => {
    db.customerFind.mockResolvedValue(null);
    const res = await get('/customers/nope/options', 'admin');
    expect(res.status).toBe(404);
    expect((await res.json()).data.code).toBe('not_found');
  });
});

describe('POST /customers/:id/send', () => {
  it('refuses an analyst before anything else runs', async () => {
    const res = await post('/customers/cust-1/send', { channel: 'sms' }, 'analyst');
    expect(res.status).toBe(403);
    expect(db.customerFind).not.toHaveBeenCalled();
    expect(db.sendSms).not.toHaveBeenCalled();
  });

  it('routes each channel to its own sender and answers 201', async () => {
    const wa = await post('/customers/cust-1/send', { channel: 'whatsapp' });
    expect(wa.status).toBe(201);
    expect((await wa.json()).data).toMatchObject({ channel: 'whatsapp', status: 'sent' });
    const sms = await post('/customers/cust-1/send', { channel: 'sms' });
    expect(sms.status).toBe(201);
    const push = await post('/customers/cust-1/send', { channel: 'push' });
    expect(push.status).toBe(201);
    expect((await push.json()).data.status).toBe('queued');
    expect(db.sendWa).toHaveBeenCalledTimes(1);
    expect(db.sendSms).toHaveBeenCalledTimes(1);
    expect(db.sendPush).toHaveBeenCalledTimes(1);
  });

  it('passes the admin, and the flags, to the sender', async () => {
    await post('/customers/cust-1/send', { channel: 'whatsapp', confirmRepeat: true, overrideHours: true }, 'super_admin');
    const [c, actor, flags] = db.sendWa.mock.calls[0];
    expect(c.id).toBe('cust-1');
    expect(actor).toEqual({ id: 'adm-1', email: 'priya@example.test', role: 'super_admin' });
    expect(flags).toEqual({ confirmRepeat: true, overrideHours: true });
  });

  it('turns a refusal into the error envelope with its code and extra detail', async () => {
    db.sendWa.mockResolvedValue({ ok: false, status: 409, code: 'recently_sent', message: 'A WhatsApp for this stage was already sent 12 minutes ago.', extra: { lastSentAt: '2026-10-27T09:48:00.000Z' } });
    const res = await post('/customers/cust-1/send', { channel: 'whatsapp' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      data: { code: 'recently_sent', lastSentAt: '2026-10-27T09:48:00.000Z' },
      message: 'A WhatsApp for this stage was already sent 12 minutes ago.',
      error: 'A WhatsApp for this stage was already sent 12 minutes ago.',
    });
  });

  it('carries a do-not-contact refusal through as 403', async () => {
    db.sendSms.mockResolvedValue({ ok: false, status: 403, code: 'do_not_contact', message: 'This customer asked not to be contacted' });
    const res = await post('/customers/cust-1/send', { channel: 'sms', confirmRepeat: true }, 'super_admin');
    expect(res.status).toBe(403);
    expect((await res.json()).data.code).toBe('do_not_contact');
  });

  it('answers 502 send_failed with the provider reason', async () => {
    db.sendWa.mockResolvedValue({ ok: false, status: 502, code: 'send_failed', message: 'WhatsApp failed: Template not approved. Nothing was sent.' });
    const res = await post('/customers/cust-1/send', { channel: 'whatsapp' });
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain('Template not approved');
  });

  it('rejects an unknown channel, and a call (calls use their own route)', async () => {
    expect((await post('/customers/cust-1/send', { channel: 'email' })).status).toBe(400);
    expect((await post('/customers/cust-1/send', { channel: 'call' })).status).toBe(400);
    expect((await post('/customers/cust-1/send', {})).status).toBe(400);
    expect(db.sendWa).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown customer without sending', async () => {
    db.customerFind.mockResolvedValue(null);
    const res = await post('/customers/nope/send', { channel: 'sms' });
    expect(res.status).toBe(404);
    expect(db.sendSms).not.toHaveBeenCalled();
  });

  describe('from an install', () => {
    it('refuses an install that was matched by an IP window, and sends nothing', async () => {
      db.installFind.mockResolvedValue({ matchMethod: 'ip_window', matchedUserId: 'user-1' });
      const res = await post('/customers/cust-1/send', { channel: 'whatsapp', installId: 'inst-1' });
      expect(res.status).toBe(409);
      expect((await res.json()).data.code).toBe('unconfirmed_match');
      expect(db.sendWa).not.toHaveBeenCalled();
    });

    it('refuses an install that belongs to someone else, or to no one', async () => {
      db.installFind.mockResolvedValue({ matchMethod: 'play_referrer', matchedUserId: 'someone-else' });
      expect((await post('/customers/cust-1/send', { channel: 'sms', installId: 'inst-1' })).status).toBe(409);
      db.installFind.mockResolvedValue({ matchMethod: 'clipboard', matchedUserId: null });
      expect((await post('/customers/cust-1/send', { channel: 'sms', installId: 'inst-1' })).status).toBe(409);
      expect(db.sendSms).not.toHaveBeenCalled();
    });

    it('sends for an install that is matched to this customer', async () => {
      db.installFind.mockResolvedValue({ matchMethod: 'play_referrer', matchedUserId: 'user-1' });
      expect((await post('/customers/cust-1/send', { channel: 'sms', installId: 'inst-1' })).status).toBe(201);
      expect(db.sendSms).toHaveBeenCalledTimes(1);
    });

    it('answers 404 for an install that does not exist', async () => {
      db.installFind.mockResolvedValue(null);
      const res = await post('/customers/cust-1/send', { channel: 'sms', installId: 'gone' });
      expect(res.status).toBe(404);
      expect(db.sendSms).not.toHaveBeenCalled();
    });
  });
});
