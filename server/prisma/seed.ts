import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Realtime offers come from Aurix (Knight Fintech): ONE eligible_offers call
// returns every real lender. The prequalify route calls the offer provider once
// per active LenderPartner row, so we keep a SINGLE driver row whose `provider`
// is 'aurix' — that makes exactly one Aurix call and surfaces the real lenders.
//
// We deliberately do NOT seed mock lender partners any more: they used to show
// up as generic "Lender" static offers (fixed rates, no real lender name) and
// must never appear again. This seed also retires any legacy mock rows left in
// an existing database.
const AURIX_DRIVER = {
  name: 'Aurix Partner Network',
  provider: 'aurix',
  baseApr: 0,
  active: true,
  icon: 'account_balance',
} as const;

async function main() {
  await prisma.lenderPartner.upsert({
    where: { name: AURIX_DRIVER.name },
    update: { provider: AURIX_DRIVER.provider, active: true },
    create: AURIX_DRIVER,
  });

  // Retire legacy mock partners so they never produce static offers again.
  // Delete rows with no offers (FK is restrict); deactivate ones that still have
  // offers so prequalify (which filters on active) skips them without breaking
  // the FK.
  const legacy = await prisma.lenderPartner.findMany({
    where: { provider: { not: 'aurix' } },
    select: { id: true, name: true },
  });
  for (const l of legacy) {
    const offers = await prisma.offer.count({ where: { partnerId: l.id } });
    if (offers === 0) {
      await prisma.lenderPartner.delete({ where: { id: l.id } });
    } else {
      await prisma.lenderPartner.update({ where: { id: l.id }, data: { active: false } });
    }
  }

  const rows = await prisma.lenderPartner.findMany({ select: { name: true, provider: true, active: true } });
  console.log('[seed] lender partners:', rows);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
