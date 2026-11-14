import { describe, it, expect } from 'vitest';
import { isAurixPartnerUrl, withAurixAuthToken } from './aurixHandoff.js';

const PROD = 'https://pt.aurix-partner.com/?offer_code=OC123&utm_code=UT456';

describe('Aurix hand-off link', () => {
  it('adds the customer token to an Aurix offer link, keeping its own parameters', () => {
    const u = new URL(withAurixAuthToken(PROD, 'tok.abc')!);
    expect(u.host).toBe('pt.aurix-partner.com');
    expect(u.searchParams.get('offer_code')).toBe('OC123');
    expect(u.searchParams.get('utm_code')).toBe('UT456');
    expect(u.searchParams.get('authtoken')).toBe('tok.abc');
  });

  it('replaces an existing authtoken whatever its case, never sends two', () => {
    const u = new URL(withAurixAuthToken(`${PROD}&Authtoken=old`, 'new')!);
    expect([...u.searchParams.keys()].filter(k => k.toLowerCase() === 'authtoken')).toEqual(['authtoken']);
    expect(u.searchParams.get('authtoken')).toBe('new');
  });

  it('url-encodes the token', () => {
    expect(withAurixAuthToken(PROD, 'a+b/c=')).toContain('authtoken=a%2Bb%2Fc%3D');
  });

  it('leaves the link alone with no token (the customer gets Aurix\'s own OTP screen)', () => {
    expect(withAurixAuthToken(PROD, null)).toBe(PROD);
    expect(withAurixAuthToken(PROD, '')).toBe(PROD);
  });

  it('never gives the token to anyone but Aurix', () => {
    expect(withAurixAuthToken('https://lender.example.com/apply?x=1', 'tok')).toBe('https://lender.example.com/apply?x=1');
    expect(withAurixAuthToken('https://aurix-partner.com.evil.io/?offer_code=1', 'tok')).toBe('https://aurix-partner.com.evil.io/?offer_code=1');
    expect(withAurixAuthToken('http://pt.aurix-partner.com/?offer_code=1', 'tok')).toBe('http://pt.aurix-partner.com/?offer_code=1');
    expect(isAurixPartnerUrl('https://pt-uat.aurix-partner.com/')).toBe(true);
    expect(isAurixPartnerUrl('not a url')).toBe(false);
  });

  it('passes an empty link through', () => {
    expect(withAurixAuthToken(null, 'tok')).toBeNull();
    expect(withAurixAuthToken(undefined, 'tok')).toBeNull();
  });
});
