import { describe, it, expect } from 'vitest';
import { serialiseBody } from './apiLog.js';

/**
 * The /logs table stores request/response bodies, so PII must be redacted before
 * it lands there — including the snake_case / PascalCase field names the partner
 * lender bodies (Aurix, Revasure, Yubi) use, not just our own camelCase.
 */
describe('serialiseBody redaction', () => {
  function parsed(v: unknown): any {
    return JSON.parse(serialiseBody(v) as string);
  }

  it('redacts our own camelCase PII keys', () => {
    const out = parsed({ fullName: 'Asha Rao', phone: '9000000001', panNumber: 'ABCDE1234F', amount: 50000 });
    expect(out.fullName).toBe('[redacted]');
    expect(out.phone).toBe('[redacted]');
    expect(out.panNumber).toBe('[redacted]');
    expect(out.amount).toBe(50000); // non-PII passes through
  });

  it('redacts Revasure flat snake_case fields (pancard, mobile_number, full_name, email_id, date_of_birth)', () => {
    const out = parsed({
      full_name: 'Asha Rao',
      mobile_number: '9000000001',
      email_id: 'asha@example.com',
      pancard: 'ABCDE1234F',
      date_of_birth: '1990-01-01',
      basket_id: 'xyz', // non-PII passes through
    });
    expect(out.full_name).toBe('[redacted]');
    expect(out.mobile_number).toBe('[redacted]');
    expect(out.email_id).toBe('[redacted]');
    expect(out.pancard).toBe('[redacted]');
    expect(out.date_of_birth).toBe('[redacted]');
    expect(out.basket_id).toBe('xyz');
  });

  it('redacts Aurix PascalCase PII (PanNumber) and nested identity data', () => {
    const out = parsed({ PanNumber: 'ABCDE1234F', PartnerCustomerId: 'u1', Data: { FullName: 'Asha Rao', Dob: '1990-01-01' } });
    expect(out.PanNumber).toBe('[redacted]');
    expect(out.PartnerCustomerId).toBe('u1');
    expect(out.Data.FullName).toBe('[redacted]');
    expect(out.Data.Dob).toBe('[redacted]');
  });

  it('redacts credential headers/keys regardless of separators', () => {
    const out = parsed({ authorization: 'Bearer x', api_key: 'k', 'x-api-key': 'k2', accessToken: 't' });
    expect(out.authorization).toBe('[redacted]');
    expect(out.api_key).toBe('[redacted]');
    expect(out['x-api-key']).toBe('[redacted]');
    expect(out.accessToken).toBe('[redacted]');
  });
});
