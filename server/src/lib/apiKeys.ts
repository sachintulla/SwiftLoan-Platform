/**
 * Static API keys a third party (an Ello agent's tool config, today) presents
 * to authenticate calls INTO our own API — the reverse direction from
 * IntegrationConfig (lib/integrations.ts), which holds credentials WE use to
 * call THEM.
 *
 * Same principle as OtpToken/AdminRefreshToken: only sha256(plaintext) is ever
 * stored. The plaintext is generated here, returned once at creation time by
 * the route that calls generateApiKey(), and is unrecoverable after that.
 */
import crypto from 'node:crypto';
import { prisma } from './prisma.js';
import { sha256 } from './crypto.js';

/** "swk_" (SwiftLoan Key) + 32 random hex chars. The prefix makes a leaked key
 *  grep-able/recognisable in logs without needing to decode anything. */
const KEY_PREFIX = 'swk_';
/** How much of the plaintext to keep for display in the admin list — enough
 *  to tell two keys apart, nowhere near enough to reconstruct the rest. */
const DISPLAY_PREFIX_LEN = KEY_PREFIX.length + 8;

export interface GeneratedApiKey {
  /** The full plaintext key — show this to the admin exactly once. */
  plain: string;
  keyPrefix: string;
  keyHash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const plain = KEY_PREFIX + crypto.randomBytes(16).toString('hex');
  return { plain, keyPrefix: plain.slice(0, DISPLAY_PREFIX_LEN), keyHash: sha256(plain) };
}

/**
 * Check a presented key against every active (non-revoked) row.
 *
 * Deliberately hash-then-lookup (not a full-table scan with a slow compare
 * per row) — sha256 of the presented value is deterministic, so this is one
 * indexed query, same as OtpToken's phone lookup.
 */
export async function verifyApiKey(presented: string): Promise<{ id: string } | null> {
  if (!presented) return null;
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(presented) },
    select: { id: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  // Best-effort, never blocks the caller on it.
  void prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { id: row.id };
}
