/*
 * erase-user.mjs — delete ALL data for one account, by phone number. Works on production.
 *
 * It does exactly what the app's "Delete account" does (users.routes.ts DELETE /me) and uses the
 * server's OWN erasure code (lib/customerErasure.ts), so it cannot go out of date with the schema.
 *
 * DRY RUN by default: it only prints what it found. Add --yes to really delete (cannot be undone).
 * Does NOT tell the lenders (Aurix/KFT, Revasure, Yubi): their copies stay.
 *
 * Run it inside the API container (it uses the container's own DATABASE_URL):
 *
 *   # 1. look first
 *   ssh -o IPQoS=none -i ~/Downloads/swiftloan-prod-key.pem ubuntu@13.232.60.204 \
 *     'docker exec -i -w /app swiftloan-api node --import tsx --input-type=module - 9182922731' < server/scripts/erase-user.mjs
 *
 *   # 2. delete
 *   ssh -o IPQoS=none -i ~/Downloads/swiftloan-prod-key.pem ubuntu@13.232.60.204 \
 *     'docker exec -i -w /app swiftloan-api node --import tsx --input-type=module - 9182922731 --yes' < server/scripts/erase-user.mjs
 *
 * Locally (from server/): APP_ROOT=$PWD node --import tsx --input-type=module - <phone> < scripts/erase-user.mjs
 */
const ROOT = process.env.APP_ROOT || '/app';
const args = process.argv.slice(2);
const YES = args.includes('--yes');
const phone = (args.find((a) => /\d/.test(a)) || '').replace(/\D/g, '').slice(-10);

if (phone.length !== 10) {
  console.error('Give a 10-digit mobile number, e.g.  … node - 9182922731 [--yes]');
  process.exit(2);
}

const { prisma } = await import(`${ROOT}/src/lib/prisma.ts`);
const { crmErasureOps } = await import(`${ROOT}/src/lib/customerErasure.ts`);

const dbHost = (() => { try { return new URL(process.env.DATABASE_URL || '').host; } catch { return 'unknown'; } })();
const count = async (label, fn) => {
  try { console.log(`  ${label.padEnd(28)} ${await fn()}`); } catch (e) { console.log(`  ${label.padEnd(28)} (could not count: ${e.code || e.message})`); }
};

try {
  console.log(`\nDatabase: ${dbHost}`);
  console.log(`Number:   ${phone}`);
  console.log(`Mode:     ${YES ? 'DELETE (--yes)' : 'dry run (nothing is changed)'}\n`);

  const variants = [phone, `+91${phone}`, `91${phone}`];
  const users = await prisma.user.findMany({
    where: { phone: { in: variants } },
    select: { id: true, phone: true, createdAt: true, phoneVerified: true },
  });
  if (users.length > 1) {
    console.error(`Found ${users.length} accounts for this number. Stopping; this needs a look by hand.`);
    process.exit(1);
  }
  const user = users[0] || null;
  const customers = await prisma.customer.findMany({
    where: { OR: [...(user ? [{ userId: user.id }] : []), { phone: { in: variants } }] },
    select: { id: true, phone: true },
  });

  if (!user && customers.length === 0) {
    console.log('Nothing found for this number: no account and no customer record. Nothing to delete.');
    process.exit(0);
  }

  console.log(user
    ? `Account:  found (created ${user.createdAt.toISOString().slice(0, 10)}, number ${user.phoneVerified ? 'verified' : 'not verified'})`
    : 'Account:  none (only a customer record exists)');
  console.log(`Customer records: ${customers.length}\n`);

  const customerIds = customers.map((c) => c.id);
  const custOrPhone = { OR: [{ customerId: { in: customerIds } }, { phone: { in: variants } }] };

  console.log('What exists now:');
  if (user) {
    await count('Applications', () => prisma.loanApplication.count({ where: { userId: user.id } }));
    await count('Applications at a lender', () => prisma.lenderApplication.count({ where: { application: { userId: user.id } } }));
    await count('Loans', () => prisma.loan.count({ where: { userId: user.id } }));
    await count('Loans NOT closed', () => prisma.loan.count({ where: { userId: user.id, status: { not: 'closed' } } }));
    await count('Yubi referrals', () => prisma.partnerReferral.count({ where: { userId: user.id } }));
    await count('Revasure leads', () => prisma.revasureLead.count({ where: { userId: user.id } }));
    await count('App sessions', () => prisma.session.count({ where: { userId: user.id } }));
    await count('Activity events', () => prisma.activityEvent.count({ where: { userId: user.id } }));
  }
  await count('Calls', () => prisma.callAttempt.count({ where: custOrPhone }));
  await count('Reminders', () => prisma.journeyReminder.count({ where: custOrPhone }));
  await count('Website leads', () => prisma.lead.count({ where: { phone: { in: variants } } }));
  await count('Journey events', () => prisma.journeyEvent.count({ where: { customerId: { in: customerIds } } }));

  if (!YES) {
    console.log('\nDry run: nothing was changed. Run again with --yes to delete all of the above for good.');
    process.exit(0);
  }

  // Same order as DELETE /users/me: CRM records first, then the partner leads, then the account
  // (deleting the account cascades applications, offers, lender applications, loans, KYC, consents, tokens).
  const dbPhone = user?.phone ?? customers[0]?.phone ?? phone;
  await prisma.$transaction([
    ...crmErasureOps({ customerIds, phone: dbPhone, userId: user?.id }),
    ...(user
      ? [
          prisma.partnerReferral.deleteMany({ where: { userId: user.id } }),
          prisma.revasureLead.deleteMany({ where: { userId: user.id } }),
          prisma.user.delete({ where: { id: user.id } }),
        ]
      : []),
  ]);

  const left = await prisma.user.count({ where: { phone: { in: variants } } });
  const leftCustomers = await prisma.customer.count({ where: { phone: { in: variants } } });
  console.log(`\nDeleted. Check: accounts left for this number = ${left}, customer records left = ${leftCustomers}.`);
  process.exit(left + leftCustomers === 0 ? 0 : 1);
} catch (e) {
  console.error('\nFAILED, nothing was deleted (the delete runs as one transaction):', e.message);
  process.exit(1);
}
