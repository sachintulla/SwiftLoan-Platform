import { describe, it, expect } from 'vitest';
import { extractAurixLeadId } from './lenderOffers.js';

describe('extractAurixLeadId', () => {
  it('reads the root Id on the wrapped shape', () => {
    expect(extractAurixLeadId({ Result: { Data: { Offers: [] }, Meta: {} }, Id: 'LEAD-123' })).toBe('LEAD-123');
  });
  it('reads Id on the bare shape', () => {
    expect(extractAurixLeadId({ Data: { Offers: [] }, Meta: {}, Id: 456 })).toBe('456');
  });
  it('falls back to nested lead id fields', () => {
    expect(extractAurixLeadId({ Result: { Data: { LeadId: 'L9' } } })).toBe('L9');
    expect(extractAurixLeadId({ Data: { Lead: { Id: 'L7' } } })).toBe('L7');
  });
  it('returns null when nothing usable is present', () => {
    expect(extractAurixLeadId({ Result: { Data: { Offers: [] }, Meta: {} } })).toBeNull();
    expect(extractAurixLeadId({ Id: '   ' })).toBeNull();
    expect(extractAurixLeadId(null)).toBeNull();
    expect(extractAurixLeadId('nope')).toBeNull();
  });
});
