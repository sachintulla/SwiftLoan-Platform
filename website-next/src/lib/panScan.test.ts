import { describe, it, expect } from 'vitest';
import { extractPan } from './panScan';

describe('extractPan', () => {
  it('reads a clean PAN from card text', () => {
    expect(extractPan('INCOME TAX DEPARTMENT\nPermanent Account Number\nABCPE1234F\nRAVI KUMAR')).toBe('ABCPE1234F');
  });
  it('handles spaces inside the number', () => {
    expect(extractPan('Number ABCPE 1234 F')).toBe('ABCPE1234F');
  });
  it('repairs look-alike glyphs by position', () => {
    expect(extractPan('ABCPEI234F')).toBe('ABCPE1234F'); // I read for 1
    expect(extractPan('A8CPE1234F')).toBe('ABCPE1234F'); // 8 read for B
  });
  it('rejects an impossible holder-type letter', () => {
    expect(extractPan('ABCDE1234F')).toBeNull();
  });
  it('returns null when there is nothing PAN-shaped', () => {
    expect(extractPan('')).toBeNull();
    expect(extractPan('INCOME TAX DEPARTMENT GOVT OF INDIA')).toBeNull();
  });
});
