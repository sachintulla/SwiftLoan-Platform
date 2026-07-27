import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin } from '../middleware/adminAuth.js';

// All routes require an authenticated admin.
export const adminRouter = Router();
adminRouter.use(requireAdmin);

// ─────────────────────────── helpers ───────────────────────────

// The 8-stage business funnel (WS4). Each stage is derived from existing data so
// the dashboard shows real numbers without needing the app to be instrumented first.
async function buildFunnel() {
  const [sessions, leads, qualifiedLeads, apps, kyc, review, approved, disbursed] = await Promise.all([
    prisma.session.count(),
    prisma.anonymousLead.count(),
    prisma.anonymousLead.count({ where: { status: { in: ['qualified', 'converted'] } } }),
    prisma.loanApplication.count(),
    prisma.loanApplication.count({ where: { status: { in: ['handoff', 'under_review', 'approved', 'disbursed', 'closed'] } } }),
    prisma.loanApplication.count({ where: { status: { in: ['under_review', 'approved', 'disbursed', 'closed'] } } }),
    prisma.loanApplication.count({ where: { status: { in: ['approved', 'disbursed', 'closed'] } } }),
    prisma.loanApplication.count({ where: { status: { in: ['disbursed', 'closed'] } } }),
  ]);

  const stages = [
    { key: 'visit', label: 'Visit / Session', value: sessions },
    { key: 'lead', label: 'Lead captured', value: leads },
    { key: 'qualified', label: 'Qualified lead', value: qualifiedLeads },
    { key: 'application', label: 'Application started', value: apps },
    { key: 'kyc', label: 'KYC / docs submitted', value: kyc },
    { key: 'compliance', label: 'Compliance / review', value: review },
    { key: 'approved', label: 'Approved', value: approved },
    { key: 'disbursed', label: 'Disbursed', value: disbursed },
  ];

  // conversion % vs previous stage, drop-off % vs previous stage.
  // Clamp to [0,100]: seeded leads and applications are independent populations, so a
  // downstream stage can momentarily exceed an upstream one — cap so the funnel reads
  // sanely (real linked data will be monotonic).
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return stages.map((s, i) => {
    const prev = i === 0 ? s.value : stages[i - 1].value;
    const conversion = prev > 0 ? clamp((s.value / prev) * 100) : 0;
    const dropOff = prev > 0 ? clamp(((prev - s.value) / prev) * 100) : 0;
    const fromTop = stages[0].value > 0 ? clamp((s.value / stages[0].value) * 100) : 0;
    return { ...s, conversion, dropOff: i === 0 ? 0 : dropOff, fromTopPct: fromTop };
  });
}

const APP_STATUSES = [
  'draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff',
  'under_review', 'approved', 'rejected', 'disbursed', 'closed',
] as const;

// ─────────────────────────── dashboard ───────────────────────────

// GET /api/admin/dashboard/overview
adminRouter.get('/dashboard/overview', ah(async (_req, res) => {
  const [users, apps, loans, leads, downloads, disbursedAgg, funnel, statusGroups] = await Promise.all([
    prisma.user.count(),
    prisma.loanApplication.count(),
    prisma.loan.count(),
    prisma.anonymousLead.count(),
    prisma.appDownload.count(),
    prisma.loan.aggregate({ _sum: { principal: true, outstanding: true } }),
    buildFunnel(),
    prisma.loanApplication.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const byStatus = Object.fromEntries(APP_STATUSES.map((s) => [s, 0]));
  statusGroups.forEach((g) => { byStatus[g.status] = g._count._all; });

  const totalDisbursed = disbursedAgg._sum.principal ?? 0;
  const approved = byStatus['approved'] + byStatus['disbursed'] + byStatus['closed'];
  const applied = apps;
  const appToDisbursal = applied > 0 ? Math.round(((byStatus['disbursed'] + byStatus['closed']) / applied) * 100) : 0;

  return ok(res, {
    stats: {
      totalUsers: users,
      totalApplications: apps,
      activeLoans: loans,
      totalLeads: leads,
      totalDownloads: downloads,
      totalDisbursedPaise: totalDisbursed,
      outstandingPaise: disbursedAgg._sum.outstanding ?? 0,
      approvedCount: approved,
      applicationToDisbursalPct: appToDisbursal,
    },
    funnel,
    applicationsByStatus: byStatus,
  }, 'Overview');
}));

// GET /api/admin/dashboard/realtime  — light, polled every few seconds by the UI
adminRouter.get('/dashboard/realtime', ah(async (_req, res) => {
  const hourAgo = new Date(Date.now() - 3600_000);
  const dayAgo = new Date(Date.now() - 864e5);
  const [activeSessions, eventsLastHour, appsToday, disbursedToday, unreadNotifs] = await Promise.all([
    prisma.session.count({ where: { endedAt: null, startedAt: { gte: dayAgo } } }),
    prisma.activityEvent.count({ where: { ts: { gte: hourAgo } } }),
    prisma.loanApplication.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.loan.count({ where: { disbursedAt: { gte: dayAgo } } }),
    prisma.notification.count({ where: { read: false } }),
  ]);
  return ok(res, { activeSessions, eventsLastHour, appsToday, disbursedToday, unreadNotifs, ts: new Date().toISOString() }, 'Realtime');
}));

// GET /api/admin/dashboard/charts?days=14
adminRouter.get('/dashboard/charts', ah(async (req, res) => {
  const days = Math.min(90, Math.max(7, parseInt(String(req.query.days ?? '14'), 10) || 14));
  const since = new Date(Date.now() - days * 864e5);

  const [apps, loans, leadsBySource, appsByType] = await Promise.all([
    prisma.loanApplication.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.loan.findMany({ where: { disbursedAt: { gte: since } }, select: { disbursedAt: true, principal: true } }),
    prisma.anonymousLead.groupBy({ by: ['source'], _count: { _all: true } }),
    prisma.loanApplication.groupBy({ by: ['loanType'], _count: { _all: true } }),
  ]);

  // Bucket per day (UTC date key).
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const series: Record<string, { date: string; applications: number; disbursals: number; disbursedPaise: number }> = {};
  for (let i = 0; i < days; i++) {
    const k = dayKey(new Date(since.getTime() + i * 864e5));
    series[k] = { date: k, applications: 0, disbursals: 0, disbursedPaise: 0 };
  }
  apps.forEach((a) => { const k = dayKey(a.createdAt); if (series[k]) series[k].applications++; });
  loans.forEach((l) => { const k = dayKey(l.disbursedAt); if (series[k]) { series[k].disbursals++; series[k].disbursedPaise += l.principal; } });

  return ok(res, {
    timeseries: Object.values(series),
    leadsBySource: leadsBySource.map((g) => ({ source: g.source, count: g._count._all })),
    applicationsByType: appsByType.map((g) => ({ type: g.loanType, count: g._count._all })),
  }, 'Charts');
}));

// GET /api/admin/live-feed?limit=30
adminRouter.get('/live-feed', ah(async (req, res) => {
  const limit = Math.min(100, Math.max(5, parseInt(String(req.query.limit ?? '30'), 10) || 30));
  const events = await prisma.activityEvent.findMany({ orderBy: { ts: 'desc' }, take: limit });
  return ok(res, events, 'Live feed');
}));

// ─────────────────────────── loans / pipeline ───────────────────────────

// GET /api/admin/loans?status=&search=&page=&pageSize=
adminRouter.get('/loans', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const status = req.query.status ? String(req.query.status) : undefined;
  const search = req.query.search ? String(req.query.search).trim() : undefined;

  const where: Record<string, unknown> = {};
  if (status && (APP_STATUSES as readonly string[]).includes(status)) where.status = status;
  if (search) {
    where.OR = [
      { ref: { contains: search, mode: 'insensitive' } },
      { user: { fullName: { contains: search, mode: 'insensitive' } } },
      { user: { phone: { contains: search } } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.loanApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take,
      include: { user: { select: { id: true, fullName: true, phone: true, pincode: true } }, loan: true, _count: { select: { offers: true } } },
    }),
    prisma.loanApplication.count({ where }),
  ]);

  return ok(res, rows, 'Loans', paginate(page, pageSize, total));
}));

// GET /api/admin/loans/:id  — single application + loan journey
adminRouter.get('/loans/:id', ah(async (req, res) => {
  const app = await prisma.loanApplication.findUnique({
    where: { id: req.params.id },
    include: {
      user: true,
      offers: { include: { partner: true }, orderBy: { createdAt: 'asc' } },
      loan: { include: { repayments: { orderBy: { dueDate: 'asc' } } } },
      kyc: true,
    },
  });
  if (!app) throw new HttpError(404, 'Application not found');

  // Timeline of loan-step events for this application/loan.
  const timeline = await prisma.activityEvent.findMany({
    where: { OR: [{ userId: app.userId, eventType: 'funnel' }] },
    orderBy: { ts: 'asc' }, take: 100,
  });

  return ok(res, { application: app, timeline }, 'Loan journey');
}));

// ─────────────────────────── onboarding ───────────────────────────

// GET /api/admin/onboarding?status=&page=&pageSize=
adminRouter.get('/onboarding', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const status = req.query.status ? String(req.query.status) : undefined;
  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const [rows, total] = await Promise.all([
    prisma.onboardingFunnel.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }),
    prisma.onboardingFunnel.count({ where }),
  ]);
  // Step distribution for the funnel widget.
  const byStep = await prisma.onboardingFunnel.groupBy({ by: ['stepName', 'status'], _count: { _all: true } });
  return ok(res, { rows, byStep }, 'Onboarding', paginate(page, pageSize, total));
}));

// GET /api/admin/onboarding/:userId — single user's onboarding journey
adminRouter.get('/onboarding/:userId', ah(async (req, res) => {
  const steps = await prisma.onboardingFunnel.findMany({ where: { userId: req.params.userId }, orderBy: { createdAt: 'asc' } });
  const events = await prisma.activityEvent.findMany({ where: { userId: req.params.userId }, orderBy: { ts: 'asc' }, take: 200 });
  return ok(res, { steps, events }, 'Onboarding journey');
}));

// ─────────────────────────── leads ───────────────────────────

// GET /api/admin/leads?status=&source=&search=&page=&pageSize=
adminRouter.get('/leads', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = String(req.query.status);
  if (req.query.source) where.source = String(req.query.source);
  if (req.query.search) {
    const s = String(req.query.search).trim();
    where.OR = [{ name: { contains: s, mode: 'insensitive' } }, { phone: { contains: s } }, { city: { contains: s, mode: 'insensitive' } }];
  }
  const [rows, total] = await Promise.all([
    prisma.anonymousLead.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.anonymousLead.count({ where }),
  ]);
  return ok(res, rows, 'Leads', paginate(page, pageSize, total));
}));

// GET /api/admin/leads/:id  — lead + (if converted) the user + any activity matched by phone
adminRouter.get('/leads/:id', ah(async (req, res) => {
  const lead = await prisma.anonymousLead.findUnique({ where: { id: req.params.id } });
  if (!lead) throw new HttpError(404, 'Lead not found');

  // If the lead converted to a real user, pull that user + their applications for the journey.
  let convertedUser = null;
  if (lead.convertedUserId) {
    convertedUser = await prisma.user.findUnique({
      where: { id: lead.convertedUserId },
      select: {
        id: true, fullName: true, phone: true, createdAt: true,
        applications: { select: { id: true, ref: true, amount: true, status: true }, orderBy: { createdAt: 'desc' } },
      },
    });
  }
  return ok(res, { lead, convertedUser }, 'Lead');
}));

// PATCH /api/admin/leads/:id  { status?, note? }
adminRouter.patch('/leads/:id', ah(async (req, res) => {
  const lead = await prisma.anonymousLead.update({
    where: { id: req.params.id },
    data: { status: req.body?.status ?? undefined, note: req.body?.note ?? undefined },
  });
  return ok(res, lead, 'Lead updated');
}));

// ─────────────────────────── downloads / attribution ───────────────────────────

// GET /api/admin/downloads?page=&pageSize=
adminRouter.get('/downloads', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const [rows, total, bySource, byPlatform, contextCount] = await Promise.all([
    prisma.appDownload.findMany({ orderBy: { installedAt: 'desc' }, skip, take }),
    prisma.appDownload.count(),
    prisma.appDownload.groupBy({ by: ['source'], _count: { _all: true } }),
    prisma.appDownload.groupBy({ by: ['platform'], _count: { _all: true } }),
    prisma.appDownload.count({ where: { contextLoaded: true } }),
  ]);
  return ok(res, {
    rows,
    bySource: bySource.map((g) => ({ source: g.source, count: g._count._all })),
    byPlatform: byPlatform.map((g) => ({ platform: g.platform, count: g._count._all })),
    contextInstalls: contextCount,
    organicInstalls: total - contextCount,
  }, 'Downloads', paginate(page, pageSize, total));
}));

// ─────────────────────────── users ───────────────────────────

// GET /api/admin/users?search=&page=&pageSize=
adminRouter.get('/users', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.search) {
    const s = String(req.query.search).trim();
    where.OR = [{ fullName: { contains: s, mode: 'insensitive' } }, { phone: { contains: s } }, { email: { contains: s, mode: 'insensitive' } }];
  }
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where, orderBy: { createdAt: 'desc' }, skip, take,
      select: {
        id: true, fullName: true, firstName: true, phone: true, email: true, pincode: true,
        creditScore: true, employment: true, monthlyIncome: true, createdAt: true,
        _count: { select: { applications: true, loans: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  return ok(res, rows, 'Users', paginate(page, pageSize, total));
}));

// GET /api/admin/users/:id — full profile
adminRouter.get('/users/:id', ah(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      applications: { orderBy: { createdAt: 'desc' }, include: { loan: true } },
      loans: { orderBy: { disbursedAt: 'desc' } },
      kyc: true,
      consents: true,
    },
  });
  if (!user) throw new HttpError(404, 'User not found');
  return ok(res, user, 'User profile');
}));

// ─────────────────────────── notifications ───────────────────────────

// GET /api/admin/notifications?unread=1&page=&pageSize=
adminRouter.get('/notifications', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};
  if (req.query.unread === '1' || req.query.unread === 'true') where.read = false;
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { read: false } }),
  ]);
  return ok(res, { rows, unread }, 'Notifications', paginate(page, pageSize, total));
}));

// PATCH /api/admin/notifications/:id/read
adminRouter.patch('/notifications/:id/read', ah(async (req, res) => {
  const n = await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } });
  return ok(res, n, 'Marked read');
}));

// POST /api/admin/notifications/read-all
adminRouter.post('/notifications/read-all', ah(async (_req, res) => {
  await prisma.notification.updateMany({ where: { read: false }, data: { read: true } });
  return ok(res, null, 'All marked read');
}));
