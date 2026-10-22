/**
 * One-off migration: move every plaintext PAN into the encrypted column and wipe the plaintext.
 *
 *   npm run pan:encrypt -- --dry-run   # report only
 *   npm run pan:encrypt                # encrypt + null the plaintext (idempotent, safe to re-run)
 *
 * Needs the same PII_ENCRYPTION_KEY the API runs with (it is the only thing that can decrypt the result).
 * After a clean run, `SELECT count(*) FROM "User" WHERE "panNumber" IS NOT NULL` (and LoanApplication) is 0 and
 * the deprecated plaintext columns can be dropped.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { assertPiiKeyConfigured, encryptPan, normalisePan } from '../src/lib/pii.js';

const dry = process.argv.includes('--dry-run');
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

async function main() {
  assertPiiKeyConfigured();
  let users = 0, apps = 0, skipped = 0;

  // `select` is explicit on purpose: lib/prisma.ts omits the PAN columns from every other query.
  const userRows = await prisma.user.findMany({ where: { panNumber: { not: null } }, select: { id: true, panNumber: true, panEnc: true } });
  for (const u of userRows) {
    const pan = normalisePan(u.panNumber ?? '');
    if (!PAN_RE.test(pan)) { skipped++; if (!dry) await prisma.user.update({ where: { id: u.id }, data: { panNumber: null } }); continue; }
    users++;
    if (!dry) await prisma.user.update({ where: { id: u.id }, data: { panEnc: u.panEnc ?? encryptPan(pan), panOnFile: true, panNumber: null } });
  }

  const appRows = await prisma.loanApplication.findMany({ where: { panNumber: { not: null } }, select: { id: true, panNumber: true, panEnc: true } });
  for (const a of appRows) {
    const pan = normalisePan(a.panNumber ?? '');
    if (!PAN_RE.test(pan)) { skipped++; if (!dry) await prisma.loanApplication.update({ where: { id: a.id }, data: { panNumber: null } }); continue; }
    apps++;
    if (!dry) await prisma.loanApplication.update({ where: { id: a.id }, data: { panEnc: a.panEnc ?? encryptPan(pan), panNumber: null } });
  }

  console.log(`${dry ? '[dry run] would encrypt' : 'encrypted'}: ${users} user PAN(s), ${apps} application PAN(s); ${skipped} malformed value(s) ${dry ? 'would be' : ''} cleared`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
