// One-off migration: earlier the mobile app stored loan amounts in RUPEES while
// the rest of the system uses PAISE. App-created records are therefore 100x too
// small. Seed data is already paise and does not overlap:
//   app-created amount   : 25,000 .. 1,500,000  (rupees)
//   seeded amount (paise): >= 5,000,000
// So amount <= 1,500,000 uniquely identifies app-created rows. We capture their
// ids first, then multiply each money field by 100 with atomic updateMany
// (scoped to those ids — no threshold guessing on children). Idempotent:
// migrated rows become >= 5,000,000 and won't be reselected. Reversible (/100).
//
// Usage:  tsx scripts/migrate-amounts.ts           (dry-run, counts only)
//         tsx scripts/migrate-amounts.ts --apply    (perform the update)
import { prisma } from '../src/lib/prisma.js';

const APPLY = process.argv.includes('--apply');
const THRESHOLD = 1_500_000;

async function main() {
  const apps = await prisma.loanApplication.findMany({
    where: { amount: { lte: THRESHOLD } },
    select: { id: true, ref: true, amount: true, loan: { select: { id: true } } },
  });
  const appIds = apps.map((a) => a.id);
  const loanIds = apps.map((a) => a.loan?.id).filter(Boolean) as string[];

  console.log(`Found ${apps.length} app-created applications (amount <= ${THRESHOLD}).`);
  console.log(`Scoped cascade: applications ${appIds.length}, loans ${loanIds.length}.`);
  if (apps[0]) console.log(`Example: ${apps[0].ref} amount ${apps[0].amount} -> ${apps[0].amount * 100}`);
  if (!APPLY) { console.log('\nDRY RUN. Re-run with --apply.'); return; }
  if (!appIds.length) { console.log('Nothing to migrate.'); return; }

  const a = await prisma.loanApplication.updateMany({ where: { id: { in: appIds } }, data: { amount: { multiply: 100 } } });
  const o = await prisma.offer.updateMany({ where: { applicationId: { in: appIds } }, data: { amount: { multiply: 100 }, emi: { multiply: 100 } } });
  const l = loanIds.length
    ? await prisma.loan.updateMany({ where: { id: { in: loanIds } }, data: { principal: { multiply: 100 }, emiAmount: { multiply: 100 }, outstanding: { multiply: 100 } } })
    : { count: 0 };
  const r = loanIds.length
    ? await prisma.repayment.updateMany({ where: { loanId: { in: loanIds } }, data: { amount: { multiply: 100 } } })
    : { count: 0 };

  console.log(`\nAPPLIED (rupees -> paise): applications ${a.count}, offers ${o.count}, loans ${l.count}, repayments ${r.count}.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
