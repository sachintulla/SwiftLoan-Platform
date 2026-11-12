import { describe, it, expect } from 'vitest';
import { classifyClaim, classifyInstallSource, cleanInstallId, deviceKeyFor, installDetails } from './installDedup.js';

describe('classifyInstallSource', () => {
  it('Android: Google Play is the store, anything else is a sideloaded APK', () => {
    expect(classifyInstallSource('android', 'com.android.vending')).toBe('play_store');
    expect(classifyInstallSource('android', 'com.google.android.packageinstaller')).toBe('sideload');
    expect(classifyInstallSource('android', null)).toBe('sideload');
    expect(classifyInstallSource('android', '')).toBe('sideload');
  });
  it('iOS: App Store vs TestFlight from the receipt, else unknown', () => {
    expect(classifyInstallSource('ios', 'app_store')).toBe('app_store');
    expect(classifyInstallSource('ios', 'TestFlight')).toBe('testflight');
    expect(classifyInstallSource('ios', null)).toBe('unknown');
  });
  it('a development build is never a store install', () => {
    expect(classifyInstallSource('android', 'com.android.vending', true)).toBe('development');
    expect(classifyInstallSource('ios', 'app_store', true)).toBe('development');
  });
});

describe('deviceKeyFor', () => {
  it('is stable for the same phone and never the raw id', () => {
    const a = deviceKeyFor('android', 'a1b2c3d4e5f60718');
    expect(a).toBe(deviceKeyFor('android', 'a1b2c3d4e5f60718'));
    expect(a).not.toContain('a1b2c3d4e5f60718');
  });
  it('differs by platform and by phone', () => {
    expect(deviceKeyFor('android', 'a1b2c3d4e5f60718')).not.toBe(deviceKeyFor('ios', 'a1b2c3d4e5f60718'));
    expect(deviceKeyFor('android', 'a1b2c3d4e5f60718')).not.toBe(deviceKeyFor('android', 'ffffeeeeddddcccc'));
  });
  it('ignores missing, too-short and the known bogus emulator id', () => {
    expect(deviceKeyFor('android', null)).toBeNull();
    expect(deviceKeyFor('android', 'abc')).toBeNull();
    expect(deviceKeyFor('android', '9774d56d682e549c')).toBeNull();
  });
});

describe('cleanInstallId', () => {
  it('accepts the app id format and rejects junk', () => {
    expect(cleanInstallId('3f2a9c1e-7b4d-4e8a-9c1f-2b3c4d5e6f70')).toBe('3f2a9c1e-7b4d-4e8a-9c1f-2b3c4d5e6f70');
    expect(cleanInstallId('short')).toBeNull();
    expect(cleanInstallId('has spaces in it 1234567')).toBeNull();
    expect(cleanInstallId(42)).toBeNull();
  });
});

describe('classifyClaim', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaa';
  it('first report from a new phone is a new install', () => {
    expect(classifyClaim({ installId: id, byInstallId: null, byDevice: null })).toBe('new');
  });
  it('the same report again (lost reply) is a retry, counted once', () => {
    expect(classifyClaim({ installId: id, byInstallId: { id: 'row' }, byDevice: null })).toBe('retry');
    expect(classifyClaim({ installId: id, byInstallId: null, byDevice: { id: 'row', installId: 'x', lastInstallId: id } })).toBe('retry');
  });
  it('uninstall + reinstall on the same phone is a reinstall, not a new install', () => {
    expect(classifyClaim({ installId: 'bbbbbbbbbbbbbbbbbbbb', byInstallId: null, byDevice: { id: 'row', installId: id, lastInstallId: id } })).toBe('reinstall');
  });
  it('an old app (no ids) is always new, as before', () => {
    expect(classifyClaim({ installId: null, byInstallId: null, byDevice: null })).toBe('new');
  });
});

describe('installDetails', () => {
  it('joins version + build and bounds every field', () => {
    expect(installDetails({ appVersion: '1.1.13', buildNumber: '37', deviceModel: 'Redmi Note 9 Pro Max', osVersion: '12' })).toEqual({
      appVersion: '1.1.13 (37)', deviceModel: 'Redmi Note 9 Pro Max', osVersion: '12',
    });
    expect(installDetails({ appVersion: '', deviceModel: 'x'.repeat(200) }).deviceModel).toHaveLength(64);
    expect(installDetails({}).appVersion).toBeNull();
  });
});
