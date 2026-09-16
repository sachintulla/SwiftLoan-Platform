/*
 * clear-account-funnel.js — wipe a single test account's loan funnel so no stale
 * offers/applications remain before testing a new PAN. Identified by phone.
 *
 * Deletes (for that user): Repayment, Loan, OfferEmiOption, Offer, KycVerification,
 * and LoanApplication. KEEPS the User account, profile, session — so you stay
 * logged in on the app and can immediately start a fresh application.
 *
 * Run inside the api container on the dev box:
 *   ssh -i <key> ubuntu@35.154.46.155 'docker exec -i swiftloan-api node - 9876500011' < scripts/clear-account-funnel.js
 * (pass the logged-in test phone as the argument after `node -`)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const phone = (process.argv[2] || process.env.CLEAR_PHONE || '').replace(/\D/g, '').slice(-10);

async function main() {
  if (!phone || phone.length < 10) throw new Error(`Pass a 10-digit phone (got "${process.argv[2]}")`);
  const user = await prisma.user.findFirst({ where: { phone } });
  if (!user) { console.log(`No user for phone ${phone} — nothing to clear.`); return; }
  const uid = user.id;
  console.log(`Clearing funnel for user ${uid} (phone ${phone})`);

  const appIds = (await prisma.loanApplication.findMany({ where: { userId: uid }, select: { id: true } })).map((a) => a.id);
  const offerIds = (await prisma.offer.findMany({ where: { applicationId: { in: appIds } }, select: { id: true } })).map((o) => o.id);

  const del = async (m, where, label) => {
    try { const r = await prisma[m].deleteMany({ where }); console.log(`  ${label}: ${r.count} deleted`); }
    catch (e) { console.log(`  ${label}: SKIPPED (${e.code || e.message})`); }
  };

  await del('repayment', { loan: { userId: uid } }, 'repayment');
  await del('loan', { userId: uid }, 'loan');
  await del('offerEmiOption', { offerId: { in: offerIds } }, 'offerEmiOption');
  await del('offer', { applicationId: { in: appIds } }, 'offer');
  await del('kycVerification', { userId: uid }, 'kycVerification');
  await del('loanApplication', { userId: uid }, 'loanApplication');

  const left = await prisma.offer.count({ where: { applicationId: { in: appIds } } });
  console.log(left === 0 ? '\n✓ Funnel cleared — no offers remain for this account.' : `\n⚠ ${left} offers still present.`);
}

main().then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch((e) => { console.error('✗', e.message); prisma.$disconnect().then(() => process.exit(1)); });
