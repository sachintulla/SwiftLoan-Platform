/**
 * WS6 — admin account security: audit logging, TOTP 2FA, idle timeout,
 * password reset and recovery codes.
 *
 * TOTP is implemented with node's built-in crypto rather than a dependency —
 * RFC 6238 is ~30 lines and adding a package for it is not worth the supply
 * chain surface on an auth path.
 */
import crypto from 'node:crypto';
import type { Request } from 'express';
import { prisma } from './prisma.js';

/* ─────────────────────────── audit log ─────────────────────────── */

/** Body keys never written to the audit log, whatever their value looks like. */
const SECRET_KEYS = new Set([
  'password', 'newpassword', 'oldpassword', 'currentpassword',
  'apikey', 'api_key', 'secret', 'secrets', 'token', 'accesstoken',
  'refreshtoken', 'totpsecret', 'code', 'otp',
]);

/**
 * Strip credentials before persisting a request body.
 *
 * The integrations endpoint posts live API keys; writing those into an audit
 * table would just move the secret somewhere else that is easier to read.
 */
export function redactBody(value: unknown, depth = 0): unknown {
  if (depth > 5 || value == null) return value ?? null;
  if (Array.isArray(value)) return value.map((v) => redactBody(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.has(k.toLowerCase().replace(/[^a-z]/g, '')) ? '[REDACTED]' : redactBody(v, depth + 1);
  }
  return out;
}

/** Derive `campaign.start` style action names from the route. */
export function deriveAction(method: string, path: string): { action: string; entity?: string; entityId?: string } {
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  const i = parts.indexOf('admin');
  const rest = i >= 0 ? parts.slice(i + 1) : parts;
  const entity = rest[0]?.replace(/s$/, '');
  const maybeId = rest[1] && /^[0-9a-f-]{8,}$/i.test(rest[1]) ? rest[1] : undefined;
  const verb = rest[maybeId ? 2 : 1];
  const op = verb ?? ({ POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete' }[method] ?? 'read');
  return { action: `${entity ?? 'admin'}.${op}`, entity, entityId: maybeId };
}

export async function writeAuditLog(req: Request, status: number): Promise<void> {
  try {
    const { action, entity, entityId } = deriveAction(req.method, req.originalUrl.split('?')[0]);
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin?.sub ?? null,
        adminEmail: req.admin?.email ?? null,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status,
        ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
        userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300) || null,
        metadata: redactBody(req.body) as object,
      },
    });
  } catch {
    // Auditing must never fail the request it is recording.
  }
}

/* ─────────────────────────── idle timeout ─────────────────────────── */

/** Minutes of inactivity before an admin session is refused. */
export const IDLE_TIMEOUT_MINUTES = Number(process.env.ADMIN_IDLE_TIMEOUT_MINUTES ?? 30) || 30;

/**
 * Whether this admin has been idle too long.
 *
 * Tracked server-side rather than by the client's clock — a browser tab left
 * open on a shared machine is exactly the case this guards, and the client is
 * not a trustworthy source for "when did they last do something".
 */
export function isIdleExpired(lastActivityAt: Date | null | undefined, now = new Date()): boolean {
  if (!lastActivityAt) return false; // first request after login
  return now.getTime() - lastActivityAt.getTime() > IDLE_TIMEOUT_MINUTES * 60_000;
}

export async function touchActivity(adminId: string): Promise<void> {
  await prisma.adminUser
    .update({ where: { id: adminId }, data: { lastActivityAt: new Date() } })
    .catch(() => undefined);
}

/* ─────────────────────────── TOTP (RFC 6238) ─────────────────────────── */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function b32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of clean) bits += B32.indexOf(c).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

/**
 * Verify a 6-digit code, allowing ±1 time step for clock skew between the
 * phone and the server — without it, a phone a few seconds out fails to log in.
 */
export function verifyTotp(secret: string, token: string, now = Date.now()): boolean {
  const clean = (token || '').replace(/\D/g, '');
  if (clean.length !== 6) return false;
  const key = b32Decode(secret);
  const step = Math.floor(now / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    // Constant-time compare so a timing side-channel cannot leak the code.
    const expected = hotp(key, step + drift);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

/** otpauth:// URI for the QR code shown during setup. */
export function totpUri(secret: string, email: string, issuer = 'SwiftLoan Admin'): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/* ───────────────────── recovery codes + reset tokens ───────────────────── */

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Ten single-use codes, returned in clear once and stored hashed. */
export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: count }, () =>
    crypto.randomBytes(5).toString('hex').match(/.{1,5}/g)!.join('-'),
  );
  return { plain, hashed: plain.map(sha256) };
}

/** Consume a recovery code, returning the remaining hashes if it matched. */
export function consumeRecoveryCode(stored: string[], supplied: string): string[] | null {
  const h = sha256((supplied || '').trim().toLowerCase());
  if (!stored.includes(h)) return null;
  return stored.filter((x) => x !== h);
}

export function generateResetToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

/** Reject passwords that would not survive a dictionary attack. */
export function validatePasswordStrength(pw: string): string | null {
  if (!pw || pw.length < 12) return 'Password must be at least 12 characters';
  if (!/[a-z]/.test(pw)) return 'Password must contain a lowercase letter';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(pw)) return 'Password must contain a digit';
  if (/^(password|admin|swiftloan|welcome|changeme)/i.test(pw)) return 'Password is too predictable';
  return null;
}
