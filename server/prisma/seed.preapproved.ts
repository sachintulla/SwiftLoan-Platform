// Seeds the real pre-approved plan catalog (from the "Explore your loan
// options" design) — https://claude.ai/design/p/6ccedc00-25d7-415a-b979-ae5ceaa025aa
import { prisma } from '../src/lib/prisma.js';

const PLANS = [
  {
    lenderName: 'IDFC', icon: 'account_balance', badge: 'Best rate',
    maxAmount: 300000 * 100, rateMin: 10, rateMax: 20.1,
    tenureMinMonths: 12, tenureMaxMonths: 84, displayOrder: 0,
    exploreUrl: 'https://www.idfcfirstbank.com/personal-loan',
  },
  {
    lenderName: 'Prefr', icon: 'wallet',
    maxAmount: 300000 * 100, rateMin: 17.99, rateMax: 29.99,
    tenureMinMonths: 12, tenureMaxMonths: 48, displayOrder: 1,
    exploreUrl: 'https://www.prefr.com/',
  },
  {
    lenderName: 'UnitySFB', icon: 'account_balance',
    maxAmount: 300000 * 100, rateAtApproval: true,
    tenureMinMonths: 6, tenureMaxMonths: 36, displayOrder: 2,
    exploreUrl: 'https://www.unitysfb.co.in/',
  },
  {
    lenderName: 'FREO — larger line', icon: 'payments',
    maxAmount: 300000 * 100, rateMin: 25, rateMax: 30,
    tenureMinMonths: 6, tenureMaxMonths: 36, displayOrder: 3,
    exploreUrl: 'https://www.freo.money/personal-loan',
  },
  {
    lenderName: 'FREO — quick line', icon: 'bolt',
    maxAmount: 100000 * 100, rateMin: 25, rateMax: 30,
    tenureMinMonths: 3, tenureMaxMonths: 12, displayOrder: 4,
    exploreUrl: 'https://www.freo.money/personal-loan',
  },
  {
    lenderName: 'Zype', icon: 'schedule',
    maxAmount: 90000 * 100, rateMin: 22, rateMax: 35,
    tenureMinMonths: 6, tenureMaxMonths: 18, displayOrder: 5,
    exploreUrl: 'https://www.getzype.com/',
  },
  {
    lenderName: 'MoneyView', icon: 'smartphone',
    amountAtApproval: true,
    tags: ['Lowest income entry', 'ROI on offer'],
    displayOrder: 6,
    exploreUrl: 'https://www.moneyview.in/personal-loan',
  },
];

async function main() {
  // Idempotent: replace any previously-seeded rows for these lenders, rather
  // than accumulating duplicates on re-run.
  await prisma.preApprovedPlan.deleteMany({ where: { lenderName: { in: PLANS.map(p => p.lenderName) } } });
  await prisma.preApprovedPlan.createMany({ data: PLANS });
  const count = await prisma.preApprovedPlan.count();
  console.log(`[seed:preapproved] plans: ${count}`);
}

main().finally(() => prisma.$disconnect());
