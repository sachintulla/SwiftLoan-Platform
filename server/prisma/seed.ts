import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PARTNERS = [
  { name: 'BlueChip Finance', icon: 'account_balance', baseApr: 5.4, tagline: 'Instant Approval', processingFee: 150 },
  { name: 'NeoVault Digital', icon: 'savings', baseApr: 6.1, tagline: 'No Prepayment Penalty', processingFee: 0 },
  { name: 'Heritage Trust', icon: 'domain', baseApr: 5.8, tagline: 'Lowest Fixed Rate', processingFee: 200 },
  { name: 'Aurora Capital', icon: 'account_balance', baseApr: 7.2, tagline: 'Flexible tenure', processingFee: 99 },
  { name: 'Meridian Loans', icon: 'domain', baseApr: 8.0, tagline: 'Quick disbursal', processingFee: 250 },
];

async function main() {
  for (const p of PARTNERS) {
    await prisma.lenderPartner.upsert({ where: { name: p.name }, update: p, create: p });
  }
  const count = await prisma.lenderPartner.count();
  console.log(`[seed] lender partners: ${count}`);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
