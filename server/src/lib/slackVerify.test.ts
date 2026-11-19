import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifySlackSignature } from './slackVerify';

const SECRET = 'test-signing-secret';
const sign = (ts: string, body: string) =>
  'v0=' + createHmac('sha256', SECRET).update(`v0:${ts}:${body}`).digest('hex');

describe('verifySlackSignature', () => {
  const now = 1_700_000_000_000;
  const ts = String(Math.floor(now / 1000));
  const body = '{"type":"event_callback","event":{"type":"app_mention"}}';

  it('accepts a correctly signed, fresh request', () => {
    const r = verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: sign(ts, body), rawBody: body, nowMs: now });
    expect(r.ok).toBe(true);
  });

  it('rejects a tampered body', () => {
    const r = verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: sign(ts, body), rawBody: body + 'x', nowMs: now });
    expect(r.ok).toBe(false);
  });

  it('rejects a wrong signing secret', () => {
    const bad = 'v0=' + createHmac('sha256', 'other').update(`v0:${ts}:${body}`).digest('hex');
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: bad, rawBody: body, nowMs: now }).ok).toBe(false);
  });

  it('rejects a replay older than 5 minutes', () => {
    const oldTs = String(Math.floor(now / 1000) - 6 * 60);
    const r = verifySlackSignature({ signingSecret: SECRET, timestamp: oldTs, signature: sign(oldTs, body), rawBody: body, nowMs: now });
    expect(r.ok).toBe(false);
  });

  it('rejects missing headers or secret', () => {
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: undefined, signature: 'x', rawBody: body, nowMs: now }).ok).toBe(false);
    expect(verifySlackSignature({ signingSecret: '', timestamp: ts, signature: sign(ts, body), rawBody: body, nowMs: now }).ok).toBe(false);
  });
});
