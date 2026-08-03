/**
 * Admin security primitives.
 *
 * These sit on the authentication path, so they are worth guarding properly:
 * a regression in TOTP verification or recovery-code consumption is an
 * account-takeover bug, not a cosmetic one.
 */
import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  generateTotpSecret, verifyTotp, totpUri,
  generateRecoveryCodes, consumeRecoveryCode, sha256,
  validatePasswordStrength, redactBody, deriveAction, isIdleExpired,
} from './adminSecurity.js';

/** Compute the code an authenticator app would show, to test against. */
function authenticatorCode(secret: string, at = Date.now()): string {
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);

  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = crypto.createHmac('sha1', key).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

describe('TOTP', () => {
  const secret = generateTotpSecret();

  it('generates a base32 secret', () => {
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(30);
  });

  it('accepts the current code', () => {
    expect(verifyTotp(secret, authenticatorCode(secret))).toBe(true);
  });

  it('tolerates one step of clock skew in both directions', () => {
    // A phone a few seconds out must still be able to log in.
    expect(verifyTotp(secret, authenticatorCode(secret, Date.now() - 30_000))).toBe(true);
    expect(verifyTotp(secret, authenticatorCode(secret, Date.now() + 30_000))).toBe(true);
  });

  it('rejects a code from too far in the past', () => {
    expect(verifyTotp(secret, authenticatorCode(secret, Date.now() - 300_000))).toBe(false);
  });

  it('rejects malformed input without throwing', () => {
    // timingSafeEqual throws on length mismatch, so these must be filtered first.
    for (const bad of ['', '123', 'abcdef', '12345678', null as unknown as string]) {
      expect(verifyTotp(secret, bad)).toBe(false);
    }
  });

  it('builds a scannable otpauth URI', () => {
    const uri = totpUri(secret, 'admin@swiftloan.com');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${secret}`);
    expect(uri).toContain('digits=6');
  });
});

describe('recovery codes', () => {
  it('stores only hashes and returns the plain codes once', () => {
    const { plain, hashed } = generateRecoveryCodes(10);
    expect(plain).toHaveLength(10);
    expect(hashed).toHaveLength(10);
    expect(hashed).not.toContain(plain[0]);
    expect(hashed[0]).toBe(sha256(plain[0]));
  });

  it('consumes a code exactly once', () => {
    const { plain, hashed } = generateRecoveryCodes(3);
    const after = consumeRecoveryCode(hashed, plain[1]);
    expect(after).toHaveLength(2);
    // The same code must not work a second time.
    expect(consumeRecoveryCode(after!, plain[1])).toBeNull();
  });

  it('rejects an unknown code', () => {
    const { hashed } = generateRecoveryCodes(3);
    expect(consumeRecoveryCode(hashed, 'aaaaa-bbbbb')).toBeNull();
  });
});

describe('password strength', () => {
  it('rejects the seeded demo password', () => {
    expect(validatePasswordStrength('admin123')).toBeTruthy();
  });
  it('rejects predictable prefixes even when long enough', () => {
    expect(validatePasswordStrength('PasswordPassword1')).toBeTruthy();
  });
  it('requires length, case and a digit', () => {
    expect(validatePasswordStrength('Short1A')).toBeTruthy();
    expect(validatePasswordStrength('alllowercase123')).toBeTruthy();
    expect(validatePasswordStrength('ALLUPPERCASE123')).toBeTruthy();
    expect(validatePasswordStrength('NoDigitsInHere!')).toBeTruthy();
  });
  it('accepts a strong password', () => {
    expect(validatePasswordStrength('Str0ngLocalPass!')).toBeNull();
  });
});

describe('audit redaction', () => {
  it('strips credentials at any depth', () => {
    const out = redactBody({
      name: 'ok',
      password: 'hunter2',
      secrets: { apiKey: 'ak_live_123' },
      nested: [{ token: 'abc', keep: 1 }],
    }) as Record<string, any>;
    expect(out.name).toBe('ok');
    expect(out.password).toBe('[REDACTED]');
    expect(out.secrets).toBe('[REDACTED]');
    expect(out.nested[0].token).toBe('[REDACTED]');
    expect(out.nested[0].keep).toBe(1);
  });

  it('survives null and primitives', () => {
    expect(redactBody(null)).toBeNull();
    expect(redactBody('x')).toBe('x');
  });
});

describe('action derivation', () => {
  it('names an action from a sub-route', () => {
    expect(deriveAction('POST', '/api/admin/campaigns/abc12345-0000/start')).toEqual({
      action: 'campaign.start', entity: 'campaign', entityId: 'abc12345-0000',
    });
  });
  it('falls back to the HTTP verb', () => {
    expect(deriveAction('DELETE', '/api/admin/campaigns/abc12345-0000').action).toBe('campaign.delete');
    expect(deriveAction('PATCH', '/api/admin/integrations/ello').action).toBe('integration.ello');
  });
});

describe('idle timeout', () => {
  it('treats a fresh session as active', () => {
    expect(isIdleExpired(new Date())).toBe(false);
  });
  it('expires a long-idle session', () => {
    expect(isIdleExpired(new Date(Date.now() - 60 * 60_000))).toBe(true);
  });
  it('does not expire on the very first request after login', () => {
    expect(isIdleExpired(null)).toBe(false);
  });
});
