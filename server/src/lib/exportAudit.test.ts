import { describe, expect, it, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./prisma.js', () => ({ prisma: { adminAuditLog: { create: db.create } } }));

const { auditExport, csvFilename, sendCsv } = await import('./exportAudit.js');

function fakeReq(over: Record<string, unknown> = {}) {
  return {
    admin: { sub: 'admin-1', email: 'ops@example.com', role: 'admin' },
    originalUrl: '/api/admin/list-actions/loans.csv?status=rejected&search=98',
    headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'Mozilla/5.0' },
    ip: '10.0.0.1',
    ...over,
  } as any;
}

beforeEach(() => { db.create.mockReset(); });

describe('auditExport', () => {
  it('writes one export row with who, what and how many', async () => {
    db.create.mockResolvedValue({});
    await auditExport(fakeReq(), { name: 'loans', filters: { status: 'rejected' }, rows: 42, truncated: false });
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create.mock.calls[0][0]).toEqual({
      data: {
        adminId: 'admin-1',
        adminEmail: 'ops@example.com',
        action: 'export.loans',
        entity: 'export',
        method: 'GET',
        path: '/api/admin/list-actions/loans.csv',
        status: 200,
        ip: '203.0.113.9',
        userAgent: 'Mozilla/5.0',
        metadata: { filters: { status: 'rejected' }, rows: 42, truncated: false },
      },
    });
  });

  it('does not put the query string in the path', async () => {
    db.create.mockResolvedValue({});
    await auditExport(fakeReq(), { name: 'loans', filters: {}, rows: 0, truncated: false });
    expect(db.create.mock.calls[0][0].data.path).not.toContain('?');
  });

  it('records a truncated export', async () => {
    db.create.mockResolvedValue({});
    await auditExport(fakeReq(), { name: 'customers', filters: {}, rows: 10000, truncated: true });
    expect(db.create.mock.calls[0][0].data.metadata).toEqual({ filters: {}, rows: 10000, truncated: true });
  });

  it('falls back to the socket address and null fields when headers are missing', async () => {
    db.create.mockResolvedValue({});
    await auditExport(fakeReq({ admin: undefined, headers: {} }), { name: 'calls', filters: {}, rows: 1, truncated: false });
    const data = db.create.mock.calls[0][0].data;
    expect(data.adminId).toBeNull();
    expect(data.adminEmail).toBeNull();
    expect(data.ip).toBe('10.0.0.1');
    expect(data.userAgent).toBeNull();
  });

  it('swallows a database error', async () => {
    db.create.mockRejectedValue(new Error('db down'));
    await expect(auditExport(fakeReq(), { name: 'loans', filters: {}, rows: 1, truncated: false })).resolves.toBeUndefined();
  });
});

describe('csvFilename', () => {
  it('is <kind>-YYYY-MM-DD.csv', () => {
    expect(csvFilename('loans', new Date('2026-10-27T10:00:00Z'))).toBe('loans-2026-10-27.csv');
  });
});

describe('sendCsv', () => {
  it('sends a download with a byte-order mark', () => {
    const headers: Record<string, string> = {};
    const res: any = {
      setHeader: (k: string, v: string) => { headers[k] = v; },
      send: vi.fn((b: string) => b),
    };
    sendCsv(res, 'loans-2026-10-27.csv', 'a,b');
    expect(headers['Content-Type']).toBe('text/csv; charset=utf-8');
    expect(headers['Content-Disposition']).toBe('attachment; filename="loans-2026-10-27.csv"');
    const body = res.send.mock.calls[0][0] as string;
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body.slice(1)).toBe('a,b');
  });
});
