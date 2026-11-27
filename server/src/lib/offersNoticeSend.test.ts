// The "no offers" WhatsApp: at most once per person per India day, and only inside calling hours.
// Before this it was once per APPLICATION (every retry is a new application) and ignored the hours.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  claims: new Set<string>(),
  deliveries: [] as Array<{ kind: string; phone: string; createdAt: Date; status: string }>,
  sent: [] as string[],
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ phone: '+919876543210', fullName: 'Asha Rao', firstName: 'Asha' })) },
    customer: { findFirst: vi.fn(async () => ({ id: 'cust-1', currentStage: 'eligibility_checked', name: 'Asha' })) },
    loanApplication: { findUnique: vi.fn(async ({ where }: any) => ({ ref: `SL-${where.id}` })) },
    outboundRequest: {
      create: vi.fn(async ({ data }: any) => {
        if (db.claims.has(data.idempotencyKey)) throw new Error('Unique constraint failed on idempotencyKey');
        db.claims.add(data.idempotencyKey);
        return { id: `claim-${db.claims.size}` };
      }),
      update: vi.fn(async () => ({})),
    },
    messageDelivery: {
      findFirst: vi.fn(async ({ where }: any) =>
        db.deliveries.find((d) => d.kind === where.kind && d.phone === where.phone && d.createdAt >= where.createdAt.gte && d.status !== 'failed') ?? null),
    },
  },
}));
vi.mock('./integrations.js', () => ({
  getProviderConfig: vi.fn(async () => ({ settings: { noOffers: { enabled: true, template: 'no_offers_call', language: 'en', placeholders: ['{name}'] } } })),
  DEFAULT_SETTINGS: {},
}));
vi.mock('./whatsapp.js', () => ({
  whatsappConfigured: vi.fn(async () => true),
  sendWhatsAppTemplate: vi.fn(async (a: any) => { db.sent.push(a.templateName); return { ok: true, messageId: 'm1' }; }),
}));

const { sendOffersNotice, noOffersNoticeSentToday, indiaDayKey, indiaDayStart, noticeClaimKey } = await import('./offersNotice.js');

// India is UTC+5:30. 10:00 IST = 04:30 UTC; 22:30 IST = 17:00 UTC.
const IST = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:30`);

beforeEach(() => { db.claims.clear(); db.deliveries = []; db.sent = []; });
afterEach(() => vi.clearAllMocks());

describe('India day helpers', () => {
  it('keys and starts the day in India time, not UTC', () => {
    // 00:30 IST on the 21st is still the 20th in UTC.
    expect(indiaDayKey(IST('2026-11-21', '00:30'))).toBe('2026-11-21');
    expect(indiaDayStart(IST('2026-11-21', '00:30')).toISOString()).toBe(IST('2026-11-21', '00:00').toISOString());
    expect(indiaDayStart(new Date('2026-11-20T23:59:59.999+05:30')).toISOString()).toBe(IST('2026-11-20', '00:00').toISOString());
  });
  it('the claim key is per person, kind and day (not per application)', () => {
    expect(noticeClaimKey('no_offers', 'u1', IST('2026-11-20', '10:00'))).toBe('offers-notice:no_offers:user:u1:2026-11-20');
    expect(noticeClaimKey('no_offers', 'u1', IST('2026-11-20', '20:00'))).toBe(noticeClaimKey('no_offers', 'u1', IST('2026-11-20', '09:00')));
  });
});

describe('sendOffersNotice', () => {
  it('a customer who retries the check many times in a day gets ONE notice', async () => {
    const at = IST('2026-11-20', '10:00');
    const results = [];
    for (let i = 0; i < 9; i++) results.push(await sendOffersNotice({ applicationId: `app-${i}`, userId: 'u1', reason: 'not_eligible' }, at));
    expect(results[0]).toBe('sent');
    expect(results.slice(1).every((r) => r === 'skipped:already_sent')).toBe(true);
    expect(db.sent).toHaveLength(1);
  });

  it('the next India day they can get it again', async () => {
    expect(await sendOffersNotice({ applicationId: 'a1', userId: 'u1', reason: 'not_eligible' }, IST('2026-11-20', '20:00'))).toBe('sent');
    expect(await sendOffersNotice({ applicationId: 'a2', userId: 'u1', reason: 'not_eligible' }, IST('2026-11-21', '09:30'))).toBe('sent');
  });

  it('is not sent outside calling hours, and nothing is claimed (a morning check still sends)', async () => {
    expect(await sendOffersNotice({ applicationId: 'a1', userId: 'u1', reason: 'not_eligible' }, IST('2026-11-20', '22:30'))).toBe('skipped:outside_calling_hours');
    expect(await sendOffersNotice({ applicationId: 'a2', userId: 'u1', reason: 'duplicate' }, IST('2026-11-21', '02:00'))).toBe('skipped:outside_calling_hours');
    expect(db.sent).toHaveLength(0);
    expect(db.claims.size).toBe(0);
    expect(await sendOffersNotice({ applicationId: 'a3', userId: 'u1', reason: 'not_eligible' }, IST('2026-11-21', '10:00'))).toBe('sent');
  });

  it('different people are independent', async () => {
    const at = IST('2026-11-20', '11:00');
    expect(await sendOffersNotice({ applicationId: 'a1', userId: 'u1', reason: 'not_eligible' }, at)).toBe('sent');
    expect(await sendOffersNotice({ applicationId: 'a2', userId: 'u2', reason: 'not_eligible' }, at)).toBe('sent');
  });
});

describe('noOffersNoticeSentToday (the drop-off journey skips its "no offers" WhatsApp)', () => {
  it('true only for a notice to that number earlier the same India day', async () => {
    db.deliveries.push({ kind: 'offers_notice_no_offers', phone: '9876543210', createdAt: IST('2026-11-20', '09:05'), status: 'sent' });
    expect(await noOffersNoticeSentToday('+91 98765 43210', IST('2026-11-20', '18:00'))).toBe(true);
    expect(await noOffersNoticeSentToday('+919876543210', IST('2026-11-21', '07:00'))).toBe(false); // next morning's daily message goes
    expect(await noOffersNoticeSentToday('9999999999', IST('2026-11-20', '18:00'))).toBe(false);
  });
  it('a failed notice does not count', async () => {
    db.deliveries.push({ kind: 'offers_notice_no_offers', phone: '9876543210', createdAt: IST('2026-11-20', '09:05'), status: 'failed' });
    expect(await noOffersNoticeSentToday('9876543210', IST('2026-11-20', '18:00'))).toBe(false);
  });
});
