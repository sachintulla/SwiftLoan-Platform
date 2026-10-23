/*
 * reset-dev-users.js — wipe all end-user / funnel / tracking / lead data on the
 * DEV database so internal testing can start from scratch.
 *
 * KEEPS: AdminUser (+ admin refresh/reset/audit), LenderPartner, MarketLoanOffer
 *        catalog, Campaign, IntegrationConfig, ApiKey, StallRule, AppConfig,
 *        AuditLog (system).
 * DELETES: User (+ cascaded OtpToken, RefreshToken, Consent, LoanApplication,
 *        Offer, OfferEmiOption, KycVerification, Loan, Repayment, SupportTicket)
 *        and the non-cascading tracking/engagement tables (Session, ActivityEvent,
 *        OnboardingFunnel, Notification, AppDownload, Lead, Customer, JourneyEvent,
 *        CallAttempt, ConversationSummary, CampaignContact, OutboundRequest).
 *
 * NOTE: This does NOT delete these users on the KFT/Aurix side — that propagation
 *       is still a pending feature. Test users remain on KFT.
 *
 * Run it INSIDE the running api container so it uses the container's DATABASE_URL:
 *   ssh -i <key> ubuntu@<dev-box> 'docker exec -i swiftloan-api node -' < scripts/reset-dev-users.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Guard: refuse to run against anything that looks like production.
function assertNotProd() {
  const url = process.env.DATABASE_URL || '';
  if (/prod/i.test(url) || process.env.NODE_ENV === 'production' && !/dev/i.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL looks like production. Aborting.');
  }
}

// Child → parent order. Non-FK tables are order-independent; real-FK children go first.
const DELETE_ORDER = [
  'repayment', 'offerEmiOption', 'offer', 'loan', 'kycVerification', 'consent',
  'supportTicket', 'loanApplication', 'journeyEvent', 'callAttempt',
  'campaignContact', 'conversationSummary', 'outboundRequest', 'activityEvent',
  'session', 'onboardingFunnel', 'notification', 'appDownload', 'lead',
  'customer', 'otpToken', 'refreshToken', 'user',
];

const KEEP = ['adminUser', 'lenderPartner', 'marketLoanOffer', 'campaign', 'appConfig'];

async function counts(models) {
  const out = {};
  for (const m of models) {
    try { out[m] = await prisma[m].count(); } catch { out[m] = 'n/a'; }
  }
  return out;
}

async function main() {
  assertNotProd();
  console.log('DATABASE_URL host:', (process.env.DATABASE_URL || '').replace(/\/\/[^@]*@/, '//***@').slice(0, 80));

  console.log('\n── BEFORE ──');
  console.log('to delete:', await counts(DELETE_ORDER));
  console.log('to keep  :', await counts(KEEP));

  console.log('\n── DELETING ──');
  for (const m of DELETE_ORDER) {
    try {
      const r = await prisma[m].deleteMany({});
      console.log(`  ${m}: ${r.count} deleted`);
    } catch (e) {
      console.log(`  ${m}: SKIPPED (${e.code || e.message})`);
    }
  }

  console.log('\n── AFTER ──');
  console.log('deleted tables:', await counts(DELETE_ORDER));
  console.log('kept tables   :', await counts(KEEP));
  console.log('\n✓ Dev user data reset complete.');
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch((e) => { console.error('\n✗ Reset failed:', e); prisma.$disconnect().then(() => process.exit(1)); });
