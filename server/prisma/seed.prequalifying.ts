import { prisma } from '../src/lib/prisma.js';

// Seed the PrequalifyingOffer catalog from the lender-policy sheet.
//
// The source data is range + eligibility based; PrequalifyingOffer holds FIRM
// headline values shown on the card, so each lender is mapped as:
//   amount  = top of the loan-amount range (the "up to ₹X" headline), in paise
//   rate    = best (min) ROI in the range
//   tenure  = max tenure
//   feePct  = min processing fee where specified
// and the income / credit-score / employment rules go into `terms`.
//
// Fields marked ASSUMPTION were "not specified" in the sheet — placeholder
// values an admin should confirm/edit in the dashboard. redirectionUrl is left
// null: real lender handoff URLs still need to be supplied.

const L = 100; // rupees → paise

const offers = [
  {
    lenderName: 'MoneyView', badge: 'Low-income friendly',
    amount: 200000 * L, // ASSUMPTION: amount not specified in sheet
    rate: 24, // ASSUMPTION: ROI not specified
    tenureMonths: 24, // ASSUMPTION: tenure not specified
    processingFeePercent: null,
    terms: 'Salaried / Self-employed · income ≥ ₹13,500/mo · CIBIL ≥ 600 or Experian ≥ 650 · lowest income entry',
    displayOrder: 0,
  },
  {
    lenderName: 'Zype',
    amount: 45000 * L, // up to 3× of ₹15,000
    rate: 22, tenureMonths: 18, processingFeePercent: 2,
    terms: 'Salaried · income ≥ ₹15,000/mo · Equifax 650+ · salary via bank · up to 3× income · short tenure',
    displayOrder: 1,
  },
  {
    lenderName: 'IDFC First Bank', badge: 'Up to ₹1 Cr',
    amount: 10000000 * L, // ₹1,00,00,000
    rate: 10, tenureMonths: 84, processingFeePercent: null,
    terms: 'Salaried · income ≥ ₹20,000/mo · CIBIL ≥ 650 & CRIF ≥ 600 · bank salary · FOIR ≤ 70% · up to 10× income',
    displayOrder: 2,
  },
  {
    lenderName: 'Unity Small Finance Bank',
    amount: 500000 * L, // ₹5,00,000
    rate: 18, // ASSUMPTION: ROI not specified
    tenureMonths: 36, processingFeePercent: null,
    terms: 'Salaried / Self-employed · income ≥ ₹20,000/mo · CIBIL > 680 · 2-yr vintage · up to 10× income',
    displayOrder: 3,
  },
  {
    lenderName: 'Prefr',
    amount: 500000 * L, // ₹5,00,000
    rate: 17.99, tenureMonths: 48, processingFeePercent: 3,
    terms: 'Salaried / Self-employed · income ≥ ₹25,000/mo · CIBIL (V3) ≥ 720 · serviceable pincodes only',
    displayOrder: 4,
  },
  {
    lenderName: 'FREO — Large Credit Line',
    amount: 400000 * L, // ₹4,00,000
    rate: 25, tenureMonths: 36, processingFeePercent: null,
    terms: 'Salaried · income ≥ ₹25,000/mo · bureau > 710 · bank salary · vintage ≥ 12m · larger ticket',
    displayOrder: 5,
  },
  {
    lenderName: 'FREO — Mini Credit Line',
    amount: 100000 * L, // ₹1,00,000
    rate: 25, tenureMonths: 12, processingFeePercent: null,
    terms: 'Salaried / Self-employed · income ≥ ₹25,000/mo · bureau > 710 · any salary mode · small ticket',
    displayOrder: 6,
  },
];

async function main() {
  await prisma.prequalifyingOffer.deleteMany({});
  for (const o of offers) {
    await prisma.prequalifyingOffer.create({ data: { icon: 'account_balance', active: true, ...o } });
  }
  console.log(`[seed:prequalifying] seeded ${offers.length} pre-qualifying offers`);
}

main().then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch((e) => { console.error(e); prisma.$disconnect().then(() => process.exit(1)); });
