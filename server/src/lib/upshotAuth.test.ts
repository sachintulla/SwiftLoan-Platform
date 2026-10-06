import { describe, it, expect } from 'vitest';
import { upshotAuth } from './integrations.js';

const cfg = (settings: Record<string, any>, secrets: Record<string, any>) =>
  ({ enabled: true, settings, secrets }) as any;

describe('upshotAuth', () => {
  it('reads App ID + Account ID from settings (what the admin card saves) and the key from secrets', () => {
    expect(upshotAuth(cfg({ appId: ' app-1 ', accountId: 'acc-1' }, { apiKey: 'k' }))).toEqual({
      appId: 'app-1', accountId: 'acc-1', apiKey: 'k',
    });
  });

  it('secrets take precedence over settings', () => {
    const a = upshotAuth(cfg({ appId: 'from-settings', accountId: 'from-settings' }, { appId: 'from-secret', accountId: 'acc-s', apiKey: 'k' }));
    expect(a.appId).toBe('from-secret');
    expect(a.accountId).toBe('acc-s');
  });

  it('uses per-platform app ids, falling back to the other platform', () => {
    const c = cfg({}, { appIdMobile: 'm', appIdWeb: 'w', accountId: 'a', apiKey: 'k' });
    expect(upshotAuth(c, 'mobile').appId).toBe('m');
    expect(upshotAuth(c, 'web').appId).toBe('w');
    expect(upshotAuth(cfg({}, { appIdWeb: 'w' }), 'mobile').appId).toBe('w');
  });

  it('returns empty strings when nothing is configured', () => {
    expect(upshotAuth(cfg({}, {}))).toEqual({ appId: '', accountId: '', apiKey: '' });
  });
});
