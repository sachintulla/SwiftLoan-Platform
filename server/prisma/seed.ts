import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PARTNERS = [
  {
    name: 'BlueChip Finance', icon: 'account_balance', baseApr: 5.4, tagline: 'Instant Approval', processingFee: 150,
    rating: 4.7, rbiApproved: true, minAmount: 25000, maxAmount: 1500000, processingFeePercent: 1.0, disbursalTimeHrs: 2,
    features: ['Zero foreclosure charges after 6 EMIs', 'Instant digital KYC verification', 'Flexible repayment date options'],
  },
  {
    name: 'NeoVault Digital', icon: 'savings', baseApr: 6.1, tagline: 'No Prepayment Penalty', processingFee: 0,
    rating: 4.5, rbiApproved: true, minAmount: 25000, maxAmount: 1000000, processingFeePercent: 0.5, disbursalTimeHrs: 1,
    features: ['No prepayment penalty', '100% paperless processing', 'Instant approval in 5 mins'],
  },
  {
    name: 'Heritage Trust', icon: 'domain', baseApr: 5.8, tagline: 'Lowest Fixed Rate', processingFee: 200,
    rating: 4.6, rbiApproved: true, minAmount: 50000, maxAmount: 1500000, processingFeePercent: 1.25, disbursalTimeHrs: 4,
    features: ['Lowest fixed rate guarantee', 'Dedicated relationship manager'],
    // One of the top-3-by-APR partners always included in /prequalify — kept
    // "EMI at approval" (no priced tenure options) so that real-world lender
    // pattern (rate/EMI only known after approval) is always exercisable,
    // not just a hypothetical branch nobody ever actually sees.
    apiConfig: { emiAtApproval: true },
  },
  {
    name: 'Aurora Capital', icon: 'account_balance', baseApr: 7.2, tagline: 'Flexible tenure', processingFee: 99,
    rating: 4.3, rbiApproved: true, minAmount: 25000, maxAmount: 800000, processingFeePercent: 1.5, disbursalTimeHrs: 6,
    features: ['Flexible tenure up to 60 months', 'Part-payment allowed anytime'],
  },
  {
    name: 'Meridian Loans', icon: 'domain', baseApr: 8.0, tagline: 'Quick disbursal', processingFee: 250,
    rating: 4.1, rbiApproved: true, minAmount: 25000, maxAmount: 600000, processingFeePercent: 2.0, disbursalTimeHrs: 1,
    features: ['Fastest disbursal in the network', 'Minimal documentation'],
  },
];

async function main() {
  for (const p of PARTNERS) {
    await prisma.lenderPartner.upsert({ where: { name: p.name }, update: p, create: p });
  }
  const count = await prisma.lenderPartner.count();
  console.log(`[seed] lender partners: ${count}`);
}
main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
