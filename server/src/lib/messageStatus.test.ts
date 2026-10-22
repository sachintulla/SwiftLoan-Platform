import { describe, it, expect } from 'vitest';
import { normaliseStatus, mergeStatus, parseStatusPayload, parseTimestamp, isStuck, phoneKey, STUCK_AFTER_MS } from './messageStatus.js';

const NOW = new Date('2026-10-19T10:00:00Z');

describe('normaliseStatus', () => {
  it.each([
    ['queued', 'queued'], ['ACCEPTED', 'queued'], ['sent', 'sent'], ['Delivered', 'delivered'], ['read', 'read'],
    ['failed', 'failed'], ['undelivered', 'failed'], ['rejected', 'failed'], ['message_delivered', 'delivered'], ['MESSAGE-FAILED', 'failed'],
    ['delivery_failed', 'failed'], ['Not Delivered', 'failed'], ['delivery-error', 'failed'], ['template_rejected', 'failed'],
  ])('%s → %s', (raw, want) => expect(normaliseStatus(raw)).toBe(want));
  it('returns null for something it does not know, so the raw status is kept but the stored status does not move', () => {
    expect(normaliseStatus('weird')).toBeNull();
    expect(normaliseStatus('delivered_to_device')).toBeNull(); // not a word we know: never guess it means delivered
    expect(normaliseStatus('')).toBeNull();
    expect(normaliseStatus(undefined)).toBeNull();
  });
});

describe('mergeStatus (a message never goes backwards)', () => {
  it('moves forward', () => {
    expect(mergeStatus('queued', 'sent')).toBe('sent');
    expect(mergeStatus('sent', 'delivered')).toBe('delivered');
    expect(mergeStatus('delivered', 'read')).toBe('read');
  });
  it('ignores a late, older report', () => {
    expect(mergeStatus('delivered', 'sent')).toBe('delivered');
    expect(mergeStatus('read', 'delivered')).toBe('read');
    expect(mergeStatus('sent', 'queued')).toBe('sent');
  });
  it('failure wins over queued and sent, but not over delivered or read', () => {
    expect(mergeStatus('queued', 'failed')).toBe('failed');
    expect(mergeStatus('sent', 'failed')).toBe('failed');
    expect(mergeStatus('delivered', 'failed')).toBe('delivered');
    expect(mergeStatus('read', 'failed')).toBe('read');
  });
  it('a delivery report that arrives after an early failure supersedes it', () => {
    expect(mergeStatus('failed', 'delivered')).toBe('delivered');
    expect(mergeStatus('failed', 'sent')).toBe('failed');
  });
  it('an unknown status changes nothing', () => expect(mergeStatus('sent', null)).toBe('sent'));
});

describe('parseTimestamp', () => {
  it('reads seconds, milliseconds and ISO text, and falls back to now', () => {
    expect(parseTimestamp('1792474200', NOW).toISOString()).toBe('2026-10-20T05:30:00.000Z');
    expect(parseTimestamp(1792474200000, NOW).toISOString()).toBe('2026-10-20T05:30:00.000Z');
    expect(parseTimestamp('2026-10-19T09:00:00Z', NOW).toISOString()).toBe('2026-10-19T09:00:00.000Z');
    expect(parseTimestamp('nonsense', NOW)).toBe(NOW);
    expect(parseTimestamp(undefined, NOW)).toBe(NOW);
  });
});

describe('parseStatusPayload', () => {
  it("reads Meta's status callback", () => {
    const ev = parseStatusPayload({
      object: 'whatsapp_business_account',
      entry: [{ id: 'W', changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.ABC', status: 'delivered', timestamp: '1792474200', recipient_id: '919300000001' }] } }] }],
    }, NOW);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ providerRef: 'wamid.ABC', status: 'delivered', recipient: '919300000001', code: null, reason: null });
    expect(ev[0].at.toISOString()).toBe('2026-10-20T05:30:00.000Z');
  });

  it('reads the failure code and reason from Meta errors', () => {
    const [e] = parseStatusPayload({ entry: [{ changes: [{ value: { statuses: [{ id: 'x1', status: 'failed', errors: [{ code: 131049, title: 'Message not delivered', message: 'Ecosystem engagement limit', error_data: { details: 'This message was not delivered to maintain healthy ecosystem engagement.' } }] }] } }] }] }, NOW);
    expect(e.status).toBe('failed');
    expect(e.code).toBe('131049');
    expect(e.reason).toMatch(/Message not delivered/);
    expect(e.reason).toMatch(/healthy ecosystem engagement/);
  });

  it('reads several statuses in one callback', () => {
    const evs = parseStatusPayload({ entry: [{ changes: [{ value: { statuses: [{ id: 'a', status: 'sent' }, { id: 'b', status: 'read' }] } }] }] }, NOW);
    expect(evs.map((e) => [e.providerRef, e.status])).toEqual([['a', 'sent'], ['b', 'read']]);
  });

  it('reads a flat gateway callback (one object, or a list)', () => {
    const one = parseStatusPayload({ id: 'WCA1', gtrid: 'WCA0', status: 'DELIVERED', referenceId: 'ref-9', to: '919300000001' }, NOW);
    expect(one[0]).toMatchObject({ providerRef: 'WCA1', gtrid: 'WCA0', status: 'delivered', referenceId: 'ref-9', recipient: '919300000001' });
    const many = parseStatusPayload([{ messageId: 'm1', messageStatus: 'sent' }, { message_id: 'm2', state: 'failed', errorCode: 1013, errorMessage: 'Template not approved' }], NOW);
    expect(many).toHaveLength(2);
    expect(many[1]).toMatchObject({ providerRef: 'm2', status: 'failed', code: '1013', reason: 'Template not approved' });
  });

  it('looks inside a data wrapper', () => {
    expect(parseStatusPayload({ data: { id: 'z', status: 'read' } }, NOW)[0]).toMatchObject({ providerRef: 'z', status: 'read' });
  });

  it('keeps an unknown status word as raw text with no mapped status', () => {
    const [e] = parseStatusPayload({ id: 'q', status: 'Held_For_Review' }, NOW);
    expect(e.rawStatus).toBe('Held_For_Review');
    expect(e.status).toBeNull();
  });

  it('does not attach a failure code or reason to a non-failure event', () => {
    const [e] = parseStatusPayload({ id: 'q', status: 'delivered', code: 200, error: 'none' }, NOW);
    expect(e.code).toBeNull();
    expect(e.reason).toBeNull();
  });

  it('returns nothing for bodies it cannot read, without throwing', () => {
    for (const body of [null, undefined, 'text', 42, {}, [], { hello: 'world' }, { statuses: 'oops' }, { entry: [{ changes: [{}] }] }, { id: 'only-id' }, { status: 'sent' }]) {
      expect(parseStatusPayload(body as never, NOW)).toEqual([]);
    }
  });

  it('survives a deeply nested hostile body', () => {
    let deep: Record<string, unknown> = { id: 'x', status: 'sent' };
    for (let i = 0; i < 50; i++) deep = { data: deep, status2: 1 };
    expect(() => parseStatusPayload(deep, NOW)).not.toThrow();
  });
});

describe('isStuck', () => {
  const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000);
  it('flags queued or sent messages older than 15 minutes', () => {
    expect(isStuck({ status: 'queued', createdAt: at(16) }, NOW)).toBe(true);
    expect(isStuck({ status: 'sent', createdAt: at(60) }, NOW)).toBe(true);
  });
  it('does not flag recent, delivered, read or failed ones', () => {
    expect(isStuck({ status: 'queued', createdAt: at(5) }, NOW)).toBe(false);
    expect(isStuck({ status: 'delivered', createdAt: at(600) }, NOW)).toBe(false);
    expect(isStuck({ status: 'failed', createdAt: at(600) }, NOW)).toBe(false);
    expect(isStuck({ status: 'queued', createdAt: new Date(NOW.getTime() - STUCK_AFTER_MS) }, NOW)).toBe(false); // exactly at the limit
  });
});

describe('phoneKey', () => {
  it('keeps the last ten digits', () => {
    expect(phoneKey('919300000001')).toBe('9300000001');
    expect(phoneKey('+91 93000 00001')).toBe('9300000001');
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});
