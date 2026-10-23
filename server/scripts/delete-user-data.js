/*
 * delete-user-data.js — remove ALL data for a single account, identified by phone.
 *
 * Deletes the User (cascading applications, offers, EMI options, loans, repayments,
 * KYC, consents, tokens, support tickets) plus the non-cascading records tied to
 * that person by userId / phone / customerId: Customer (+ JourneyEvent), Sessions,
 * ActivityEvents, OnboardingFunnel, AppDownloads, Leads, CallAttempts,
 * ConversationSummary, OutboundRequests, CampaignContacts, and related Notifications.
 *
 * KEEPS everything else (other users, admins, catalog, config).
 * Does NOT propagate the delete to KFT/Aurix (pending feature).
 *
 * Run inside the api container so it uses the container's DATABASE_URL:
 *   ssh -i <key> ubuntu@<dev-box> 'docker exec -i swiftloan-api node - 7032206339' < scripts/delete-user-data.js
 * (the phone is passed as the argument after `node -`)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const raw = process.argv[2] || process.env.DELETE_PHONE || '';
const phone = raw.replace(/\D/g, '').slice(-10); // bare 10-digit

function assertNotProd() {
  const url = process.env.DATABASE_URL || '';
  if (/prod/i.test(url) && !/dev/i.test(url)) throw new Error('DATABASE_URL looks like production — aborting.');
}

async function del(model, where, label) {
  try {
    const r = await prisma[model].deleteMany({ where });
    console.log(`  ${label || model}: ${r.count} deleted`);
    return r.count;
  } catch (e) {
    console.log(`  ${label || model}: SKIPPED (${e.code || e.message})`);
    return 0;
  }
}

async function main() {
  assertNotProd();
  if (!phone || phone.length < 10) throw new Error(`No valid phone given (got "${raw}"). Pass a 10-digit phone.`);
  console.log(`Target phone: ${phone}`);

  const user = await prisma.user.findFirst({ where: { phone } });
  const customer = await prisma.customer.findFirst({ where: { OR: [{ phone }, ...(user ? [{ userId: user.id }] : [])] } });
  const uid = user?.id ?? null;
  const cid = customer?.id ?? null;
  console.log(`Resolved → user: ${uid ?? 'none'}, customer: ${cid ?? 'none'}`);

  if (!user && !customer) {
    // Might still have anonymous phone-keyed records.
    const cs = await prisma.conversationSummary.findUnique({ where: { phone } }).catch(() => null);
    const calls = await prisma.callAttempt.count({ where: { phone } }).catch(() => 0);
    if (!cs && !calls) { console.log('Nothing found for that phone. Nothing to delete.'); return; }
  }

  // Gather related ids for Notification (entityId is a free reference).
  const apps = uid ? await prisma.loanApplication.findMany({ where: { userId: uid }, select: { id: true } }) : [];
  const loans = uid ? await prisma.loan.findMany({ where: { userId: uid }, select: { id: true } }) : [];
  const leads = await prisma.lead.findMany({ where: { OR: [{ phone }, ...(uid ? [{ convertedUserId: uid }, { matchedUserId: uid }] : [])] }, select: { id: true } });
  const entityIds = [uid, cid, phone, ...apps.map((a) => a.id), ...loans.map((l) => l.id), ...leads.map((l) => l.id)].filter(Boolean);

  console.log('\n── DELETING ──');
  // Non-cascade / soft-reference tables first.
  if (cid) await del('journeyEvent', { customerId: cid }, 'journeyEvent (customer)');
  await del('callAttempt', { phone }, 'callAttempt (phone)');
  await del('conversationSummary', { phone }, 'conversationSummary (phone)');
  if (cid) await del('outboundRequest', { customerId: cid }, 'outboundRequest (customer)');
  if (cid) await del('campaignContact', { customerId: cid }, 'campaignContact (customer)');
  if (uid) await del('activityEvent', { userId: uid }, 'activityEvent (user)');
  if (uid) await del('session', { userId: uid }, 'session (user)');
  if (uid) await del('onboardingFunnel', { userId: uid }, 'onboardingFunnel (user)');
  if (uid) await del('appDownload', { matchedUserId: uid }, 'appDownload (user)');
  await del('lead', { OR: [{ phone }, ...(uid ? [{ convertedUserId: uid }, { matchedUserId: uid }] : [])] }, 'lead (phone/user)');
  if (entityIds.length) await del('notification', { entityId: { in: entityIds } }, 'notification (related)');
  if (cid) await del('customer', { id: cid }, 'customer');
  // Finally the user — cascades applications/offers/loans/repayments/kyc/consent/tokens.
  if (uid) await del('user', { id: uid }, 'user (+ cascaded funnel)');

  console.log('\n✓ Done. Verifying user is gone…');
  const still = await prisma.user.findFirst({ where: { phone } });
  console.log(still ? `⚠ user still present: ${still.id}` : '  no user with that phone remains.');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch((e) => { console.error('\n✗ Failed:', e.message); prisma.$disconnect().then(() => process.exit(1)); });
