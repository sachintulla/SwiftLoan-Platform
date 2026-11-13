import { describe, it, expect } from 'vitest';
import { originOf, originAllowed } from './csrf.js';

const ALLOWED = ['https://swiftloan.ai', 'http://localhost:4002'];

describe('originOf', () => {
  it('extracts scheme://host[:port], dropping path/query', () => {
    expect(originOf('https://swiftloan.ai/account/support?x=1')).toBe('https://swiftloan.ai');
    expect(originOf('http://localhost:4002/')).toBe('http://localhost:4002');
  });
  it('returns null for missing or unparseable input', () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});

describe('originAllowed', () => {
  it('never guards non-mutating methods', () => {
    expect(originAllowed('GET', undefined, undefined, ALLOWED).ok).toBe(true);
    expect(originAllowed('HEAD', 'https://evil.com', undefined, ALLOWED).ok).toBe(true);
    expect(originAllowed('OPTIONS', undefined, undefined, ALLOWED).ok).toBe(true);
  });
  it('allows a POST from an allow-listed Origin', () => {
    expect(originAllowed('POST', 'https://swiftloan.ai', undefined, ALLOWED).ok).toBe(true);
  });
  it('falls back to Referer when Origin is absent', () => {
    expect(originAllowed('POST', undefined, 'https://swiftloan.ai/apply', ALLOWED).ok).toBe(true);
  });
  it('blocks a POST from a foreign origin', () => {
    const v = originAllowed('POST', 'https://evil.com', undefined, ALLOWED);
    expect(v.ok).toBe(false);
  });
  it('blocks a POST with no Origin and no Referer', () => {
    const v = originAllowed('POST', undefined, undefined, ALLOWED);
    expect(v.ok).toBe(false);
  });
  it('is case-insensitive on the method', () => {
    expect(originAllowed('post', 'https://swiftloan.ai', undefined, ALLOWED).ok).toBe(true);
  });
});
