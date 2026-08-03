// WS4 demo seed — populates tracking + admin-dashboard data so the dashboard shows
// realistic numbers immediately. Safe to re-run: it clears only the WS4 tables and
// its own demo users (email @seed.swiftloan.local) before reseeding.
//
// Run:  npm run seed:ws4   (from server/)

import { PrismaClient, ApplicationStatus, LoanType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: T[]): T => arr[rand(arr.length)];
const daysAgo = (d: number) => new Date(Date.now() - d * 864e5 - rand(864e5));
const rupees = (n: number) => n * 100; // paise

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ananya', 'Diya', 'Aadhya', 'Kiara', 'Ishaan', 'Kabir', 'Anaya', 'Priya', 'Rahul', 'Sneha', 'Karan', 'Meera', 'Rohan', 'Neha', 'Varun', 'Pooja', 'Amit'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Singh', 'Gupta', 'Rao', 'Kumar', 'Das', 'Bose', 'Mehta', 'Joshi'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Surat'];
const EMP = ['salaried', 'self_employed', 'business_owner', 'gig_worker'] as const;
const LOAN_TYPES: LoanType[] = ['personal', 'business', 'home', 'education', 'vehicle'];
const SOURCES = ['widget', 'app', 'campaign', 'organic', 'referral', 'partner'];
const EVENT_NAMES = ['app_opened', 'widget_opened', 'consent_given', 'intent_captured', 'application_started', 'kyc_submitted', 'offers_viewed', 'offer_selected', 'compliance_passed', 'loan_approved', 'loan_disbursed', 'screen_view'];
const SCREENS = ['splash', 'language', 'home', 'basic', 'basicpan', 'offers', 'kyc', 'aadhaar', 'panv', 'status', 'repay'];
const ONBOARD_STEPS = [['language', 1], ['mobile', 2], ['otp', 3], ['permissions', 4], ['aboutyou', 5], ['home', 6]] as const;

// Distribution of application statuses (weighted toward the top of the funnel).
const STATUS_WEIGHTS: [ApplicationStatus, number][] = [
  ['draft', 8], ['pan_pending', 6], ['prequalifying', 4], ['offers_ready', 5],
  ['handoff', 3], ['under_review', 4], ['approved', 3], ['rejected', 2],
  ['disbursed', 6], ['closed', 2],
];
function weightedStatus(): ApplicationStatus {
  const total = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = rand(total);
  for (const [st, w] of STATUS_WEIGHTS) { if ((r -= w) < 0) return st; }
  return 'draft';
}

let refSeq = 800000;
const nextRef = (p: string) => `${p}-${refSeq++}`;

async function clearWs4() {
  await prisma.activityEvent.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.onboardingFunnel.deleteMany({});
  await prisma.anonymousLead.deleteMany({});
  await prisma.appDownload.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.adminRefreshToken.deleteMany({});
  await prisma.adminUser.deleteMany({});
  // demo users cascade to their applications/loans/kyc
  await prisma.user.deleteMany({ where: { email: { endsWith: '@seed.swiftloan.local' } } });
}

async function ensurePartners() {
  const PARTNERS = [
    { name: 'BlueChip Finance', icon: 'account_balance', baseApr: 5.4, tagline: 'Instant Approval', processingFee: 150 },
    { name: 'NeoVault Digital', icon: 'savings', baseApr: 6.1, tagline: 'No Prepayment Penalty', processingFee: 0 },
    { name: 'Heritage Trust', icon: 'domain', baseApr: 5.8, tagline: 'Lowest Fixed Rate', processingFee: 200 },
    { name: 'Aurora Capital', icon: 'account_balance', baseApr: 7.2, tagline: 'Flexible tenure', processingFee: 99 },
    { name: 'Meridian Loans', icon: 'domain', baseApr: 8.0, tagline: 'Quick disbursal', processingFee: 250 },
  ];
  for (const p of PARTNERS) await prisma.lenderPartner.upsert({ where: { name: p.name }, update: p, create: p });
  return prisma.lenderPartner.findMany();
}

async function main() {
  // This seed deletes data (clearWs4) AND creates five admin accounts with the
  // published password `admin123`. Running it against production would both
  // destroy real records and leave a super_admin backdoor open. It is named in
  // the setup docs, so an accidental run is one command away.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'yes-really') {
    console.error(
      '[seed:ws4] REFUSING to run: NODE_ENV=production.\n' +
        '  This seed deletes data and creates admins with a public password.\n' +
        '  If you genuinely mean it: ALLOW_DEMO_SEED=yes-really npm run seed:ws4',
    );
    process.exit(1);
  }

  console.log('[seed:ws4] clearing existing WS4 data…');
  await clearWs4();
  const partners = await ensurePartners();

  // ── 5 admin users ──
  const adminPass = await bcrypt.hash('admin123', 10);
  const ADMINS = [
    { email: 'admin@swiftloan.com', name: 'Super Admin', role: 'super_admin' as const },
    { email: 'ops@swiftloan.com', name: 'Ops Manager', role: 'admin' as const },
    { email: 'analyst@swiftloan.com', name: 'Data Analyst', role: 'analyst' as const },
    { email: 'risk@swiftloan.com', name: 'Risk Officer', role: 'admin' as const },
    { email: 'support@swiftloan.com', name: 'Support Lead', role: 'admin' as const },
  ];
  for (const a of ADMINS) await prisma.adminUser.create({ data: { ...a, passwordHash: adminPass } });
  console.log(`[seed:ws4] admins: ${ADMINS.length}  (password: admin123)`);

  // ── 50 users, each with 0-2 applications; ~15 disbursed loans ──
  let loanCount = 0;
  const createdUsers: { id: string; name: string }[] = [];
  for (let i = 0; i < 50; i++) {
    const fn = pick(FIRST), ln = pick(LAST);
    const created = daysAgo(rand(60));
    const user = await prisma.user.create({
      data: {
        phone: `9${String(100000000 + rand(899999999))}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}.${i}@seed.swiftloan.local`,
        firstName: fn, lastName: ln, fullName: `${fn} ${ln}`,
        pincode: String(110000 + rand(90000)),
        employment: pick(EMP as unknown as string[]) as never,
        monthlyIncome: rupees(25000 + rand(175000)),
        creditScore: 620 + rand(230),
        phoneVerified: true,
        createdAt: created, updatedAt: created,
      },
    });
    createdUsers.push({ id: user.id, name: user.fullName! });

    const nApps = rand(3); // 0,1,2
    for (let j = 0; j < nApps; j++) {
      const status = weightedStatus();
      const amount = rupees(50000 + rand(950000));
      const loanType = pick(LOAN_TYPES);
      const appCreated = new Date(created.getTime() + rand(5) * 864e5);
      const app = await prisma.loanApplication.create({
        data: {
          ref: nextRef('SL'), userId: user.id, loanType, amount,
          tenureMonths: pick([6, 12, 18, 24, 36]), purpose: pick(['Medical', 'Wedding', 'Travel', 'Education', 'Home renovation', 'Business']),
          status, employment: user.employment ?? undefined, monthlyIncome: user.monthlyIncome ?? undefined,
          createdAt: appCreated, updatedAt: appCreated,
        },
      });

      // Offers once past prequalifying
      if (['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed', 'closed'].includes(status)) {
        for (const partner of partners.slice(0, 3)) {
          const apr = partner.baseApr + rand(4);
          const emi = Math.round((amount * (1 + apr / 100)) / app.tenureMonths);
          await prisma.offer.create({
            data: { applicationId: app.id, partnerId: partner.id, amount, apr, emi, tenureMonths: app.tenureMonths, processingFee: partner.processingFee, recommended: partner.name === 'BlueChip Finance', selected: status !== 'offers_ready' && partner.name === 'BlueChip Finance' },
          });
        }
      }

      // KYC records once submitted
      if (['handoff', 'under_review', 'approved', 'disbursed', 'closed'].includes(status)) {
        for (const method of ['aadhaar', 'pan', 'bank', 'selfie'] as const) {
          await prisma.kycVerification.create({
            data: { userId: user.id, applicationId: app.id, method, status: 'verified', verifiedAt: appCreated, reference: `XXXX${1000 + rand(9000)}` },
          }).catch(() => {});
        }
      }

      // Disbursed loan + repayments
      if ((status === 'disbursed' || status === 'closed') && loanCount < 18) {
        loanCount++;
        const partner = pick(partners);
        const apr = partner.baseApr + rand(3);
        const emi = Math.round((amount * (1 + apr / 100)) / app.tenureMonths);
        const disbursedAt = new Date(appCreated.getTime() + 2 * 864e5);
        const paidN = status === 'closed' ? app.tenureMonths : rand(app.tenureMonths);
        const loan = await prisma.loan.create({
          data: {
            ref: nextRef('SLN'), userId: user.id, applicationId: app.id, partnerName: partner.name,
            principal: amount, apr, tenureMonths: app.tenureMonths, emiAmount: emi,
            status: status === 'closed' ? 'closed' : 'active',
            disbursedAt, firstEmiDate: new Date(disbursedAt.getTime() + 30 * 864e5),
            outstanding: Math.max(0, emi * (app.tenureMonths - paidN)),
          },
        });
        for (let m = 0; m < app.tenureMonths; m++) {
          const due = new Date(loan.firstEmiDate.getTime() + m * 30 * 864e5);
          const paid = m < paidN;
          await prisma.repayment.create({
            data: { loanId: loan.id, ref: nextRef('EMI'), amount: emi, dueDate: due, paidDate: paid ? due : null, status: paid ? 'paid' : (due < new Date() ? 'late' : 'scheduled') },
          });
        }
      }
    }
  }
  console.log(`[seed:ws4] users: 50, disbursed loans: ${loanCount}`);

  // ── sessions + 200 activity events ──
  const sessions = [];
  for (let i = 0; i < 60; i++) {
    const u = Math.random() < 0.7 ? pick(createdUsers) : null;
    const started = daysAgo(rand(14));
    const ended = Math.random() < 0.8 ? new Date(started.getTime() + rand(1800) * 1000) : null;
    const s = await prisma.session.create({
      data: {
        userId: u?.id ?? null,
        deviceInfo: { platform: pick(['android', 'ios']), model: pick(['Nord', 'iPhone 14', 'Pixel 7', 'OnePlus 11']), appVersion: '1.0' },
        startedAt: started, endedAt: ended, pagesVisited: 1 + rand(8),
        durationSec: ended ? Math.round((ended.getTime() - started.getTime()) / 1000) : null,
      },
    });
    sessions.push(s);
  }
  for (let i = 0; i < 200; i++) {
    const s = pick(sessions);
    await prisma.activityEvent.create({
      data: {
        sessionId: s.id, userId: s.userId,
        eventType: pick(['navigation', 'action', 'funnel', 'system']),
        eventName: pick(EVENT_NAMES), screen: pick(SCREENS),
        metadata: { ok: true },
        ts: new Date(s.startedAt.getTime() + rand(1800) * 1000),
      },
    });
  }
  console.log('[seed:ws4] sessions: 60, events: 200');

  // ── 20 onboarding funnel rows ──
  for (let i = 0; i < 20; i++) {
    const u = pick(createdUsers);
    const reached = 1 + rand(6);
    for (const [name, num] of ONBOARD_STEPS) {
      if (num > reached) break;
      const completed = num < reached || Math.random() < 0.6;
      await prisma.onboardingFunnel.create({
        data: {
          userId: u.id, stepNumber: num, stepName: name,
          status: completed ? 'completed' : pick(['started', 'abandoned']),
          timeSpentSec: 5 + rand(120), createdAt: daysAgo(rand(20)),
        },
      });
    }
  }
  console.log('[seed:ws4] onboarding rows: ~20 users');

  // ── 30 anonymous leads ──
  for (let i = 0; i < 30; i++) {
    const fn = pick(FIRST);
    await prisma.anonymousLead.create({
      data: {
        name: Math.random() < 0.8 ? fn : null,
        phone: Math.random() < 0.7 ? `9${String(100000000 + rand(899999999))}` : null,
        city: pick(CITIES), productInterest: pick(LOAN_TYPES as unknown as string[]),
        amount: rupees(50000 + rand(500000)),
        source: pick(SOURCES), campaignId: Math.random() < 0.5 ? `camp_${pick(['diwali', 'newyear', 'summer', 'referral'])}` : null,
        status: pick(['new', 'new', 'contacted', 'qualified', 'converted', 'lost']),
        createdAt: daysAgo(rand(30)),
      },
    });
  }
  console.log('[seed:ws4] leads: 30');

  // ── 20 app downloads ──
  for (let i = 0; i < 20; i++) {
    const source = pick(['organic', 'campaign', 'referral', 'partner']);
    const context = source !== 'organic' && Math.random() < 0.7;
    await prisma.appDownload.create({
      data: {
        platform: pick(['android', 'ios']), source,
        campaignId: source === 'campaign' ? `camp_${pick(['diwali', 'newyear', 'summer'])}` : null,
        referrer: source === 'referral' ? pick(createdUsers).id : null,
        contextLoaded: context, matchedUserId: context ? pick(createdUsers).id : null,
        installedAt: daysAgo(rand(30)),
      },
    });
  }
  console.log('[seed:ws4] downloads: 20');

  // ── a few notifications ──
  await prisma.notification.createMany({
    data: [
      { type: 'system', title: 'Dashboard seeded', body: 'Demo data loaded successfully.', severity: 'success' },
      { type: 'new_lead', title: 'New high-value lead', body: 'A ₹5,00,000 personal loan lead just came in.', severity: 'info' },
      { type: 'loan_stale', title: 'Application stalled', body: 'SL-800042 has been in review for 3 days.', severity: 'warning' },
    ],
  });

  console.log('[seed:ws4] done ✓');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
