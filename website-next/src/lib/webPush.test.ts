import { describe, expect, it } from 'vitest';
import { shouldSubscribe, type WebPushEnv } from './webPush';

const env = (o: Partial<WebPushEnv> = {}): WebPushEnv => ({ enabled: true, supported: true, permission: 'default', ...o });

describe('shouldSubscribe', () => {
  it('asks while permission is still undecided', () => {
    expect(shouldSubscribe(env(), false, false)).toBe(true);
  });
  it('does nothing when the switch is off or the browser cannot do push', () => {
    expect(shouldSubscribe(env({ enabled: false }), false, false)).toBe(false);
    expect(shouldSubscribe(env({ supported: false }), false, false)).toBe(false);
    expect(shouldSubscribe(env({ permission: 'unsupported' }), false, false)).toBe(false);
  });
  it('never asks a visitor who blocked it', () => {
    expect(shouldSubscribe(env({ permission: 'denied' }), false, false)).toBe(false);
  });
  it('asks once per moment, so before and after OTP are two separate asks', () => {
    expect(shouldSubscribe(env(), true, false)).toBe(false);
    expect(shouldSubscribe(env(), false, true)).toBe(true);
  });
  it('an allowed visitor is subscribed once per page load, not at every moment', () => {
    expect(shouldSubscribe(env({ permission: 'granted' }), false, false)).toBe(true);
    expect(shouldSubscribe(env({ permission: 'granted' }), false, true)).toBe(false);
  });
});
