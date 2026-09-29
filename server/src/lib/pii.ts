/**
 * Field-level encryption for personal data (PAN Comprehensive results).
 *
 * One master key, PII_ENCRYPTION_KEY (32 bytes, hex or base64), is expanded
 * with HKDF into two independent keys:
 *   • an AES-256-GCM key for encrypting records (`encryptJson`/`decryptJson`)
 *   • an HMAC-SHA256 key for deterministic lookups (`panHash`) — lets us find
 *     a PAN's record without storing the PAN itself anywhere in the clear.
 *
 * The key only ever lives in server env — never the DB, the app, or logs.
 * Production refuses to start without a real one (same rule as JWT secrets).
 */
import crypto from 'node:crypto';

const KEY_VERSION = 1;
const DEV_FALLBACK = 'dev-only-pii-key-do-not-use-in-production-000000';

function masterKey(): Buffer {
  const v = process.env.PII_ENCRYPTION_KEY;
  if (!v) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PII_ENCRYPTION_KEY must be set in production — refusing to handle PII with a default key');
    }
    return crypto.createHash('sha256').update(DEV_FALLBACK).digest();
  }
  const buf = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
  if (buf.length !== 32) throw new Error(`PII_ENCRYPTION_KEY must be 32 bytes (hex or base64); got ${buf.length}`);
  return buf;
}

let keys: { enc: Buffer; mac: Buffer } | null = null;
function getKeys() {
  if (!keys) {
    const m = masterKey();
    const derive = (info: string) => Buffer.from(crypto.hkdfSync('sha256', m, Buffer.alloc(0), info, 32));
    keys = { enc: derive('swiftloan-pii-enc-v1'), mac: derive('swiftloan-pii-hmac-v1') };
  }
  return keys;
}

/** Fail fast at boot rather than on the first PAN verification. */
export function assertPiiKeyConfigured(): void {
  getKeys();
}

export const normalisePan = (pan: string) => pan.trim().toUpperCase();

/** Deterministic, keyed hash of a PAN — the DB lookup key. */
export function panHash(pan: string): string {
  return crypto.createHmac('sha256', getKeys().mac).update(normalisePan(pan)).digest('hex');
}

/** AES-256-GCM. Output: "v<version>.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptJson(value: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKeys().enc, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [`v${KEY_VERSION}`, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptJson<T = unknown>(blob: string): T {
  const [ver, iv, tag, ct] = blob.split('.');
  if (ver !== `v${KEY_VERSION}` || !iv || !tag || !ct) throw new Error('Unrecognised PII ciphertext format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKeys().enc, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]);
  return JSON.parse(pt.toString('utf8')) as T;
}

export const PII_KEY_VERSION = KEY_VERSION;
