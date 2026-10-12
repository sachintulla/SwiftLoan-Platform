import { describe, it, expect } from 'vitest';
import {
  parsePlayReferrer, parseClipboard, formatClipboard, pickIpMatch, detectPlatform, parseOsVersion,
  storeUrl, normalizeCode, maskName, newClickToken, newReferralCode, hashClient,
} from './attribution.js';

describe('Play referrer parsing', () => {
  it('reads click_id and ref', () => {
    expect(parsePlayReferrer('click_id=ABCD2345XYZ9&ref=PRIYA7K2')).toEqual({ clickId: 'ABCD2345XYZ9', ref: 'PRIYA7K2' });
  });
  it('rejects malformed or absent ids', () => {
    expect(parsePlayReferrer('click_id=<script>')).toEqual({ clickId: null, ref: null });
    expect(parsePlayReferrer('utm_source=google-play&utm_medium=organic')).toEqual({ clickId: null, ref: null });
    expect(parsePlayReferrer(null)).toEqual({ clickId: null, ref: null });
  });
});

describe('clipboard token', () => {
  it('round-trips and only accepts our prefix', () => {
    expect(parseClipboard(formatClipboard('ABCD2345XYZ9'))).toBe('ABCD2345XYZ9');
    expect(parseClipboard('  swiftloan-ref:abcd2345xyz9 ')).toBe('ABCD2345XYZ9');
    expect(parseClipboard('my bank password 1234')).toBeNull();
    expect(parseClipboard('swiftloan-ref:x')).toBeNull();
    expect(parseClipboard(undefined)).toBeNull();
  });
});

describe('IP-window match', () => {
  it('matches a single candidate', () => {
    expect(pickIpMatch([{ id: 'a', osVersion: '17.5' }])?.id).toBe('a');
  });
  it('never guesses between several candidates without a tie-breaker', () => {
    const two = [{ id: 'a', osVersion: '17.5' }, { id: 'b', osVersion: '17.5' }];
    expect(pickIpMatch(two)).toBeNull();
    expect(pickIpMatch(two, '17.5')).toBeNull(); // still ambiguous
  });
  it('breaks a tie on OS version only when it leaves exactly one', () => {
    const two = [{ id: 'a', osVersion: '17.5' }, { id: 'b', osVersion: '16.7' }];
    expect(pickIpMatch(two, '17.5')?.id).toBe('a');
    expect(pickIpMatch(two, '18.0')).toBeNull();
  });
  it('returns null for no candidates', () => {
    expect(pickIpMatch([], '17.5')).toBeNull();
  });
});

describe('user agent helpers', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36';
  it('detects platform', () => {
    expect(detectPlatform(iphone)).toBe('ios');
    expect(detectPlatform(pixel)).toBe('android');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('web');
  });
  it('parses OS versions', () => {
    expect(parseOsVersion(iphone)).toBe('17.5');
    expect(parseOsVersion(pixel)).toBe('14');
  });
});

describe('store redirect', () => {
  const click = { token: 'ABCD2345XYZ9', ref: 'PRIYA7K2' };
  it('adds the encoded referrer on Google Play', () => {
    const u = new URL(storeUrl('https://play.google.com/store/apps/details?id=com.swiftloan.ai', click));
    expect(u.searchParams.get('id')).toBe('com.swiftloan.ai');
    expect(u.searchParams.get('referrer')).toBe('click_id=ABCD2345XYZ9&ref=PRIYA7K2');
  });
  it('leaves sideload / TestFlight / App Store URLs untouched', () => {
    for (const url of ['https://example.com/app.apk', 'https://testflight.apple.com/join/ABC', 'https://apps.apple.com/app/id1']) {
      expect(storeUrl(url, click)).toBe(url);
    }
  });
});

describe('codes and names', () => {
  it('generates unambiguous tokens of the right size', () => {
    expect(newClickToken()).toMatch(/^[A-HJKMNP-Z2-9]{12}$/);
    expect(newReferralCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
  });
  it('normalizes referral codes', () => {
    expect(normalizeCode(' priya7k2 ')).toBe('PRIYA7K2');
    expect(normalizeCode('a b')).toBeNull();
    expect(normalizeCode(null)).toBeNull();
  });
  it('masks names for the referrer list', () => {
    expect(maskName('Rahul Kumar Sharma')).toBe('Rahul S.');
    expect(maskName('Rahul')).toBe('Rahul');
    expect(maskName(null, '9876543210')).toBe('•••• 3210');
    expect(maskName(null, null)).toBe('A friend');
  });
  it('hashes deterministically without leaking the input', () => {
    expect(hashClient('1.2.3.4')).toBe(hashClient(' 1.2.3.4 '));
    expect(hashClient('1.2.3.4')).not.toContain('1.2.3.4');
    expect(hashClient('1.2.3.4')).not.toBe(hashClient('1.2.3.5'));
  });
});
