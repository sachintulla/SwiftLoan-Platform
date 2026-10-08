import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTicketEmail, ticketRef, categoryLabel, supportRecipients, esc } from './supportTickets.js';
import { headerSafe } from './mail.js';

const base = {
  ticketNo: 42,
  id: 'abc-123',
  type: 'query',
  category: 'repayments',
  subject: 'EMI deducted twice',
  body: 'My EMI of ₹5,000 was debited two times on 5th.',
  status: 'open',
  createdAt: new Date('2026-10-06T06:30:00Z'),
  user: { id: 'u1', fullName: 'Asha Rao', phone: '9876543210', email: 'asha@example.com' },
  application: { ref: 'SL-APP-77', amount: 500000, status: 'offers_ready' },
};

describe('ticket reference', () => {
  it('zero-pads the sequence number', () => {
    expect(ticketRef(42)).toBe('SL-T-00042');
    expect(ticketRef(123456)).toBe('SL-T-123456');
  });
  it('labels known categories and passes unknown ones through', () => {
    expect(categoryLabel('repayments')).toContain('Repayments');
    expect(categoryLabel('weird')).toBe('weird');
  });
});

describe('buildTicketEmail', () => {
  it('includes every ticket detail in subject, text and html', () => {
    const m = buildTicketEmail(base);
    expect(m.subject).toContain('SL-T-00042');
    expect(m.subject).toContain('EMI deducted twice');
    for (const part of ['SL-T-00042', 'EMI deducted twice', 'EMI of ₹5,000 was debited', 'Asha Rao', '+91 9876543210', 'asha@example.com', 'u1', 'SL-APP-77', '₹5,00,000']) {
      expect(m.text).toContain(part);
      expect(m.html).toContain(part.replace(/&/g, '&amp;'));
    }
    expect(m.text).toContain('/support?ticket=abc-123');
    expect(m.html).toContain('/support?ticket=abc-123');
  });

  it('labels grievances distinctly', () => {
    const m = buildTicketEmail({ ...base, type: 'grievance' });
    expect(m.subject.toLowerCase()).toContain('grievance');
  });

  it('copes with a missing name, email, message and application', () => {
    const m = buildTicketEmail({ ...base, body: null, application: null, user: { id: 'u2', fullName: null, phone: '9000000000', email: null } });
    expect(m.text).toContain('Name: Not provided');
    expect(m.text).toContain('Email: Not provided');
    expect(m.text).toContain('(No message provided)');
    expect(m.text).not.toContain('LINKED APPLICATION');
  });

  it('escapes user-supplied HTML so it cannot be injected into the mail', () => {
    const m = buildTicketEmail({ ...base, subject: '<script>alert(1)</script>', body: '<img src=x onerror=alert(1)> & "quotes"' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('&amp; &quot;quotes&quot;');
  });
});

describe('helpers', () => {
  it('esc handles all five special characters', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
  it('headerSafe strips CR/LF to block header injection', () => {
    expect(headerSafe('Hello\r\nBcc: evil@x.com')).toBe('Hello Bcc: evil@x.com');
  });
});

describe('supportRecipients', () => {
  const prev = process.env.SUPPORT_NOTIFY_TO;
  beforeEach(() => { delete process.env.SUPPORT_NOTIFY_TO; });
  afterEach(() => { if (prev === undefined) delete process.env.SUPPORT_NOTIFY_TO; else process.env.SUPPORT_NOTIFY_TO = prev; });

  it('is empty when unset', () => expect(supportRecipients()).toEqual([]));
  it('splits and trims a comma list', () => {
    process.env.SUPPORT_NOTIFY_TO = ' a@x.com, b@x.com ,,';
    expect(supportRecipients()).toEqual(['a@x.com', 'b@x.com']);
  });
});
