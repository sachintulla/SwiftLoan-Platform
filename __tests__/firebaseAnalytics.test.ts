// Firebase Analytics wrapper (src/analytics/firebase.ts): funnel events by name only, never throws.
export {};

const logEvent = jest.fn();

function load(linked: boolean) {
  jest.resetModules();
  jest.clearAllMocks();
  jest.doMock('react-native', () => ({ NativeModules: linked ? { SwiftLoanFirebase: { logEvent } } : {} }));
  return require('../src/analytics/firebase');
}

describe('Firebase Analytics wrapper', () => {
  it('sends each app funnel event by name only', () => {
    const f = load(true);
    for (const name of f.FIREBASE_APP_EVENTS) f.firebaseTrackFromAppEvent(name);
    expect(logEvent).toHaveBeenCalledTimes(f.FIREBASE_APP_EVENTS.size);
    expect(logEvent).toHaveBeenCalledWith('offers_got');
    logEvent.mock.calls.forEach((c) => expect(c).toHaveLength(1));
  });

  it('ignores events that are not in the list', () => {
    const f = load(true);
    f.firebaseTrackFromAppEvent('website_visit');
    f.firebaseTrackFromAppEvent('swiftloan_otp_not_verified');
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when the native module is missing', () => {
    const f = load(false);
    expect(() => f.firebaseTrackFromAppEvent('otp_verified')).not.toThrow();
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('only lists valid Firebase names and covers every app upshotEvent', () => {
    const f = load(true);
    for (const n of f.FIREBASE_APP_EVENTS) expect(n).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    const fs = require('fs');
    const path = require('path');
    const used = new Set<string>();
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) {
          for (const m of fs.readFileSync(p, 'utf8').matchAll(/upshotEvent\('([a-z_]+)'/g)) used.add(m[1]);
        }
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    expect([...used].sort()).toEqual([...f.FIREBASE_APP_EVENTS].sort());
  });
});
