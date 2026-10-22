/**
 * The ONLY place that reads or writes a stored PAN.
 *
 * Policy: a PAN is never stored in plaintext anywhere. Where it is needed (the lender eligibility call
 * and the partner lead are made from the server, later than the moment the user typed it) it is kept
 * AES-256-GCM encrypted in `panEnc`, and can be decrypted only by a process holding the unique key in the
 * environment (PII_ENCRYPTION_KEY — see lib/pii.ts; production refuses to boot without it). The plain
 * `panNumber` columns are deprecated: never written, read only as a one-time fallback until
 * `npm run pan:encrypt` has migrated them.
 *
 * lib/prisma.ts omits all PAN columns from every normal query, so reading one needs the explicit selects here.
 */
import { prisma } from './prisma.js';
import { encryptPan, decryptPan, panHash, normalisePan } from './pii.js';
import { scoped } from './log.js';

const log = scoped('storedPan');

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type Holder = { panEnc: string | null; panNumber: string | null } | null | undefined;

/** Decrypt (or, for a not-yet-migrated row, read the legacy plaintext). '' when there is none. */
export function panFromHolder(h: Holder): string {
  if (!h) return '';
  if (h.panEnc) {
    try {
      return decryptPan(h.panEnc);
    } catch (e) {
      log.error('could not decrypt stored PAN (wrong or rotated key?)', { error: String((e as Error)?.message ?? e) });
      return '';
    }
  }
  return h.panNumber ? normalisePan(h.panNumber) : '';
}

/** The PAN to use for this user/application — the application's own snapshot first, else the user's. */
export async function loadPan(userId: string, applicationId?: string | null): Promise<string> {
  const select = { panEnc: true, panNumber: true } as const;
  if (applicationId) {
    const app = await prisma.loanApplication.findUnique({ where: { id: applicationId }, select });
    const fromApp = panFromHolder(app);
    if (fromApp) return fromApp;
  }
  return panFromHolder(await prisma.user.findUnique({ where: { id: userId }, select }));
}

/** Keyed hash of the effective PAN — safe to fold into fingerprints, unlike a plain hash of a guessable PAN. */
export async function panFingerprint(userId: string, applicationId?: string | null): Promise<string | null> {
  const pan = await loadPan(userId, applicationId);
  return pan ? panHash(pan) : null;
}

export const isPanFormat = (pan: string) => PAN_RE.test(normalisePan(pan));

/** Data to spread into a prisma `user.update`/`create` to store this PAN encrypted. */
export const userPanData = (pan: string) => ({ panEnc: encryptPan(pan), panOnFile: true });
/** Data to spread into a prisma `loanApplication.update` to store this PAN encrypted. */
export const applicationPanData = (pan: string) => ({ panEnc: encryptPan(pan) });

import type { LoanApplication, User } from '@prisma/client';
/** What a normal query returns: the same rows, minus the PAN columns (lib/prisma.ts omits them). */
export type SafeUser = Omit<User, 'panNumber' | 'panEnc'>;
export type SafeApplication = Omit<LoanApplication, 'panNumber' | 'panEnc'>;
