import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PARTNERS = [
  { name: 'BlueChip Finance', icon: 'account_balance', baseApr: 5.4, tagline: 'Instant Approval', processingFee: 150 },
  { name: 'NeoVault Digital', icon: 'savings', baseApr: 6.1, tagline: 'No Prepayment Penalty', processingFee: 0 },
  { name: 'Heritage Trust', icon: 'domain', baseApr: 5.8, tagline: 'Lowest Fixed Rate', processingFee: 200 },
  { name: 'Aurora Capital', icon: 'account_balance', baseApr: 7.2, tagline: 'Flexible tenure', processingFee: 99 },
  { name: 'Meridian Loans', icon: 'domain', baseApr: 8.0, tagline: 'Quick disbursal', processingFee: 250 },
];

async function main() {
  // Seed lender partners
  for (const p of PARTNERS) {
    await prisma.lenderPartner.upsert({ where: { name: p.name }, update: p, create: p });
  }
  const partnerCount = await prisma.lenderPartner.count();
  console.log(`[seed] lender partners: ${partnerCount}`);

  // Seed admin users
  const adminUsers = [
    { email: 'super@swiftloan.com', fullName: 'Super Admin', role: 'super_admin', password: 'Admin@123' },
    { email: 'admin@swiftloan.com', fullName: 'Admin User', role: 'admin', password: 'Admin@123' },
    { email: 'viewer@swiftloan.com', fullName: 'Viewer User', role: 'viewer', password: 'Viewer@123' },
  ];

  for (const admin of adminUsers) {
    await prisma.adminUser.upsert({
      where: { email: admin.email },
      update: {},
      create: {
        ...admin,
        password: await bcrypt.hash(admin.password, 10),
      },
    });
  }
  const adminCount = await prisma.adminUser.count();
  console.log(`[seed] admin users: ${adminCount}`);

  // Seed sample users with tracking data
  const sampleNames = [
    'Priya Kumar', 'Ravi Sharma', 'Ananya Gupta', 'Vikram Singh', 'Neha Patel',
    'Arjun Reddy', 'Deepak Verma', 'Pooja Desai', 'Rahul Iyer', 'Meera Nair',
  ];

  const samplePhones = Array.from({ length: 10 }, (_, i) => `9${String(9000000000 + i).slice(1)}`);

  const users = await Promise.all(
    sampleNames.map((name, i) =>
      prisma.user.upsert({
        where: { phone: samplePhones[i] },
        update: {},
        create: {
          phone: samplePhones[i],
          fullName: name,
          email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
          lastSeenAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          lastActiveScreen: 'home',
        },
      })
    )
  );
  console.log(`[seed] sample users: ${users.length}`);

  // Seed onboarding funnel records
  const onboardingStatuses = ['not_started', 'in_progress', 'paused', 'completed', 'abandoned'];
  await Promise.all(
    users.map((user, idx) =>
      prisma.onboardingFunnel.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          currentStep: Math.floor(Math.random() * 6),
          status: onboardingStatuses[idx % onboardingStatuses.length],
          startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          lastActivityAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          completedAt: idx % 3 === 0 ? new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000) : null,
          stepsDetail: Array.from({ length: 5 }, (_, step) => ({
            stepNumber: step + 1,
            stepName: `Step ${step + 1}`,
            status: step < Math.floor(Math.random() * 6) ? 'completed' : 'not_started',
            startedAt: new Date(),
            completedAt: step < Math.floor(Math.random() * 6) ? new Date() : null,
            timeSpentSeconds: Math.floor(Math.random() * 300),
          })),
        },
      })
    )
  );
  console.log(`[seed] onboarding funnels: ${users.length}`);

  // Seed sessions and activity events
  let sessionCount = 0;
  let eventCount = 0;
  for (const user of users) {
    const sessionLimit = Math.floor(Math.random() * 5) + 1;
    for (let s = 0; s < sessionLimit; s++) {
      const session = await prisma.session.create({
        data: {
          userId: user.id,
          platform: 'mobile',
          startedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          isActive: Math.random() > 0.7,
        },
      });
      sessionCount++;

      const eventLimit = Math.floor(Math.random() * 20) + 5;
      for (let e = 0; e < eventLimit; e++) {
        await prisma.activityEvent.create({
          data: {
            userId: user.id,
            sessionId: session.id,
            eventType: ['page_view', 'button_click', 'form_submit'][Math.floor(Math.random() * 3)],
            eventName: `Event ${e}`,
            screen: ['home', 'loans', 'profile', 'offers'][Math.floor(Math.random() * 4)],
            platform: 'mobile',
            timestamp: new Date(session.startedAt.getTime() + Math.random() * 60 * 60 * 1000),
          },
        });
        eventCount++;
      }
    }
  }
  console.log(`[seed] sessions: ${sessionCount}, events: ${eventCount}`);

  // Seed anonymous leads
  const sources = ['contact_us', 'download_cta', 'landing_page', 'organic', 'referral'];
  const leads = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      prisma.anonymousLead.create({
        data: {
          source: sources[Math.floor(Math.random() * sources.length)],
          name: `Lead ${i}`,
          email: `lead${i}@example.com`,
          phone: `8${String(8000000000 + i).slice(1)}`,
          status: ['anonymous', 'contacted', 'converted'][Math.floor(Math.random() * 3)],
          firstSeenAt: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
          convertedUserId: i % 5 === 0 ? users[i % users.length].id : null,
        },
      })
    )
  );
  console.log(`[seed] anonymous leads: ${leads.length}`);

  // Seed app downloads
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      prisma.appDownload.create({
        data: {
          platform: i % 2 === 0 ? 'ios' : 'android',
          appVersion: '1.0.0',
          anonymousLeadId: leads[i % leads.length].id,
          convertedUserId: i % 3 === 0 ? users[i % users.length].id : null,
          utmSource: ['google', 'facebook', 'direct'][Math.floor(Math.random() * 3)],
          utmMedium: ['cpc', 'organic', 'social'][Math.floor(Math.random() * 3)],
        },
      })
    )
  );
  console.log(`[seed] app downloads: 20`);

  // Seed loan applications for users
  let loanCount = 0;
  for (let i = 0; i < 5; i++) {
    const user = users[i];
    const statuses = ['draft', 'pan_pending', 'offers_ready', 'under_review', 'approved', 'rejected'];
    await prisma.loanApplication.create({
      data: {
        ref: `SL-${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`,
        userId: user.id,
        amount: Math.floor(Math.random() * 500000) + 100000,
        status: statuses[Math.floor(Math.random() * statuses.length)] as any,
        lastActivityAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
      },
    });
    loanCount++;
  }
  console.log(`[seed] loan applications: ${loanCount}`);
}

main()
  .then(() => {
    console.log('[seed] completed successfully');
    prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('[seed] error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
