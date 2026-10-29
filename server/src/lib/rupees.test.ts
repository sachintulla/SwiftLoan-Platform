import { describe, it, expect } from 'vitest';
import { rupeesDigits, rupeesInWords } from './rupees';

describe('rupeesDigits', () => {
  it('shows the amount exactly as chosen, with Indian grouping', () => {
    expect(rupeesDigits(1040000)).toBe('₹10,40,000');
    expect(rupeesDigits(500000)).toBe('₹5,00,000');
    expect(rupeesDigits(25000)).toBe('₹25,000');
  });
  it('does not rescale: ₹10,40,000 stays 10.4 lakh, never 10.4 crore or 10,400', () => {
    expect(rupeesDigits(1040000)).not.toContain('10,40,00,000');
    expect(rupeesDigits(1040000)).not.toBe('₹10,400');
  });
  it('returns an empty string for a missing amount', () => {
    expect(rupeesDigits(null)).toBe('');
    expect(rupeesDigits(undefined)).toBe('');
  });
});

describe('rupeesInWords', () => {
  it('speaks lakh and crore amounts', () => {
    expect(rupeesInWords(1040000)).toBe('10.4 lakh rupees');
    expect(rupeesInWords(300000)).toBe('3 lakh rupees');
    expect(rupeesInWords(10000000)).toBe('1 crore rupees');
    expect(rupeesInWords(104000000)).toBe('10.4 crore rupees');
  });
  it('speaks small amounts in full', () => {
    expect(rupeesInWords(45000)).toBe('45,000 rupees');
  });
  it('returns null for a missing amount', () => {
    expect(rupeesInWords(null)).toBeNull();
  });
});
