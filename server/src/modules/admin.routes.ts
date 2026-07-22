import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { requireAdminAuth } from '../middleware/auth.js';

export const adminRouter = Router();

adminRouter.use(requireAdminAuth);

// ─────────────────────── Users ───────────────────────

// GET /api/admin/users
adminRouter.get(
  '/users',
  ah(async (req, res) => {
    const { platform, status, onboarding_status, loan_status, date_from, date_to, search, page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
      ];
    }

    if (date_from || date_to) {
      where.createdAt = {};
      if (date_from) where.createdAt.gte = new Date(date_from as string);
      if (date_to) where.createdAt.lte = new Date(date_to as string);
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        lastSeenAt: true,
        lastActiveScreen: true,
        createdAt: true,
        onboardingFunnel: {
          select: { status: true, currentStep: true },
        },
        applications: {
          where: { status: { not: 'closed' } },
          select: { status: true, amount: true },
        },
      },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.user.count({ where });

    const data = users.map(u => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      platform: 'mobile',
      status: u.lastSeenAt ? 'active' : 'inactive',
      lastSeenAt: u.lastSeenAt,
      lastActiveScreen: u.lastActiveScreen,
      onboardingStatus: u.onboardingFunnel?.status || 'not_started',
      onboardingStep: u.onboardingFunnel?.currentStep || 0,
      activeLoanStatus: u.applications[0]?.status || null,
      activeLoanAmount: u.applications[0]?.amount || null,
      createdAt: u.createdAt,
    }));

    res.json({
      success: true,
      data,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);

// GET /api/admin/users/:id
adminRouter.get(
  '/users/:id',
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        trackingSessions: { take: 50 },
        activityEvents: { take: 50, orderBy: { timestamp: 'desc' } },
        onboardingFunnel: true,
        applications: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) throw new HttpError(404, 'User not found');

    res.json({ success: true, data: user });
  })
);

// GET /api/admin/users/:id/activity
adminRouter.get(
  '/users/:id/activity',
  ah(async (req, res) => {
    const { event_type, page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { userId: req.params.id };
    if (event_type) where.eventType = event_type;

    const events = await prisma.activityEvent.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { timestamp: 'desc' },
    });

    const total = await prisma.activityEvent.count({ where });

    res.json({
      success: true,
      data: events,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);

// GET /api/admin/users/:id/sessions
adminRouter.get(
  '/users/:id/sessions',
  ah(async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { userId: req.params.id },
      orderBy: { startedAt: 'desc' },
    });

    res.json({ success: true, data: sessions });
  })
);

// PUT /api/admin/users/:id/status
adminRouter.put(
  '/users/:id/status',
  validate(z.object({ status: z.string(), reason: z.string().optional() })),
  ah(async (req, res) => {
    const { status, reason } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    res.json({ success: true, data: user });
  })
);

// ─────────────────────── Onboarding ───────────────────────

// GET /api/admin/onboarding/funnel
adminRouter.get(
  '/onboarding/funnel',
  ah(async (req, res) => {
    const funnels = await prisma.onboardingFunnel.findMany();

    const steps: any = {};
    for (let i = 1; i <= 5; i++) {
      steps[i] = {
        step: i,
        stepName: `Step ${i}`,
        reached: funnels.filter(f => (f.currentStep || 0) >= i).length,
        completed: funnels.filter(f => f.status === 'completed' && (f.currentStep || 0) >= i).length,
        dropOffCount: funnels.filter(f => (f.currentStep || 0) === i && f.status !== 'completed').length,
      };
      steps[i].dropOffPct = steps[i].reached > 0 ? Math.round((steps[i].dropOffCount / steps[i].reached) * 100) : 0;
    }

    res.json({ success: true, data: Object.values(steps) });
  })
);

// GET /api/admin/onboarding/users
adminRouter.get(
  '/onboarding/users',
  ah(async (req, res) => {
    const { status, stuck_at_step, paused_for, date_from, date_to, search, page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) where.status = status;
    if (stuck_at_step) where.currentStep = parseInt(stuck_at_step as string);

    if (paused_for) {
      const hoursMap: Record<string, number> = { '24h': 24, '48h': 48, '7d': 168 };
      const hours = hoursMap[paused_for as string] || 24;
      const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      where.lastActivityAt = { lt: cutoffDate };
    }

    const funnels = await prisma.onboardingFunnel.findMany({
      where,
      include: { user: true },
      skip,
      take: limitNum,
      orderBy: { lastActivityAt: 'desc' },
    });

    const total = await prisma.onboardingFunnel.count({ where });

    res.json({
      success: true,
      data: funnels,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);

// GET /api/admin/onboarding/users/:user_id
adminRouter.get(
  '/onboarding/users/:user_id',
  ah(async (req, res) => {
    const funnel = await prisma.onboardingFunnel.findUnique({
      where: { userId: req.params.user_id },
      include: {
        user: true,
      },
    });

    if (!funnel) throw new HttpError(404, 'Onboarding funnel not found');

    const sessions = await prisma.session.findMany({
      where: { userId: req.params.user_id },
      orderBy: { startedAt: 'desc' },
    });

    res.json({ success: true, data: { ...funnel, sessions } });
  })
);

// ─────────────────────── Loans ───────────────────────

// GET /api/admin/loans
adminRouter.get(
  '/loans',
  ah(async (req, res) => {
    const { status, hold_only, hold_reason, date_from, date_to, search, page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) where.status = status;

    const applications = await prisma.loanApplication.findMany({
      where,
      include: { user: true },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.loanApplication.count({ where });

    res.json({
      success: true,
      data: applications.map(a => ({
        ...a,
        holdAtStep: (a.stepsDetail as any)?.[0]?.holdAtStep,
        holdReason: (a.stepsDetail as any)?.[0]?.holdReason,
      })),
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);

// GET /api/admin/loans/stats
adminRouter.get(
  '/loans/stats',
  ah(async (req, res) => {
    const apps = await prisma.loanApplication.findMany();

    const stats = {
      total: apps.length,
      inProgress: apps.filter(a => a.status === 'draft' || a.status === 'pan_pending').length,
      paused: apps.filter(a => a.status === 'handoff').length,
      submitted: apps.filter(a => a.status === 'under_review').length,
      underReview: apps.filter(a => a.status === 'under_review').length,
      approvedNotDisbursed: apps.filter(a => a.status === 'approved').length,
      disbursed: apps.filter(a => a.status === 'disbursed').length,
      rejected: apps.filter(a => a.status === 'rejected').length,
      approvalRate: apps.length > 0 ? Math.round((apps.filter(a => a.status === 'approved' || a.status === 'disbursed').length / apps.length) * 100) : 0,
      totalAmountApplied: apps.reduce((sum, a) => sum + a.amount, 0),
      totalAmountApproved: apps.filter(a => a.status === 'approved' || a.status === 'disbursed').reduce((sum, a) => sum + a.amount, 0),
      totalAmountDisbursed: apps.filter(a => a.status === 'disbursed').reduce((sum, a) => sum + a.amount, 0),
    };

    res.json({ success: true, data: stats });
  })
);

// GET /api/admin/loans/funnel
adminRouter.get(
  '/loans/funnel',
  ah(async (req, res) => {
    const apps = await prisma.loanApplication.findMany();

    const statuses = ['draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff', 'under_review', 'approved', 'rejected', 'disbursed'];
    const funnel = statuses.map(status => {
      const count = apps.filter(a => a.status === status).length;
      return {
        step: status,
        count,
        conversionPct: apps.length > 0 ? Math.round((count / apps.length) * 100) : 0,
      };
    });

    res.json({ success: true, data: funnel });
  })
);

// GET /api/admin/loans/:id
adminRouter.get(
  '/loans/:id',
  ah(async (req, res) => {
    const app = await prisma.loanApplication.findUnique({
      where: { id: req.params.id },
      include: { user: true, offers: true, loan: true },
    });

    if (!app) throw new HttpError(404, 'Loan application not found');

    res.json({ success: true, data: app });
  })
);

// PUT /api/admin/loans/:id/status
adminRouter.put(
  '/loans/:id/status',
  validate(z.object({ status: z.string(), reason: z.string().optional(), agent_id: z.string().optional() })),
  ah(async (req, res) => {
    const { status, reason, agent_id } = req.body;

    const updated = await prisma.loanApplication.update({
      where: { id: req.params.id },
      data: { status: status as any },
    });

    res.json({ success: true, data: updated });
  })
);

// ─────────────────────── Leads ───────────────────────

// GET /api/admin/leads
adminRouter.get(
  '/leads',
  ah(async (req, res) => {
    const { status, source, converted_only, not_contacted, date_from, date_to, search, page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (status) where.status = status;
    if (source) where.source = source;
    if (converted_only === 'true') where.convertedUserId = { not: null };
    if (not_contacted === 'true') where.contactedAt = null;

    if (search) {
      where.OR = [
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string } },
        { name: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.anonymousLead.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { firstSeenAt: 'desc' },
    });

    const total = await prisma.anonymousLead.count({ where });

    res.json({
      success: true,
      data: leads,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);

// GET /api/admin/leads/funnel
adminRouter.get(
  '/leads/funnel',
  ah(async (req, res) => {
    const leads = await prisma.anonymousLead.findMany();
    const downloads = await prisma.appDownload.findMany();
    const users = await prisma.user.findMany();
    const funnels = await prisma.onboardingFunnel.findMany();
    const apps = await prisma.loanApplication.findMany();

    const funnel = {
      websiteVisitors: leads.length,
      contactSubmissions: leads.filter(l => l.source === 'contact_us').length,
      appDownloads: downloads.length,
      registered: users.length,
      onboardingComplete: funnels.filter(f => f.status === 'completed').length,
      loanApplied: apps.length,
      loanApproved: apps.filter(a => a.status === 'approved').length,
      loanDisbursed: apps.filter(a => a.status === 'disbursed').length,
    };

    res.json({ success: true, data: funnel });
  })
);

// GET /api/admin/leads/:id
adminRouter.get(
  '/leads/:id',
  ah(async (req, res) => {
    const lead = await prisma.anonymousLead.findUnique({
      where: { id: req.params.id },
    });

    if (!lead) throw new HttpError(404, 'Lead not found');

    const download = lead.id ? await prisma.appDownload.findFirst({ where: { anonymousLeadId: lead.id } }) : null;
    const user = lead.convertedUserId ? await prisma.user.findUnique({ where: { id: lead.convertedUserId } }) : null;
    const onboarding = lead.convertedUserId ? await prisma.onboardingFunnel.findUnique({ where: { userId: lead.convertedUserId } }) : null;
    const application = lead.convertedUserId ? await prisma.loanApplication.findFirst({ where: { userId: lead.convertedUserId } }) : null;

    res.json({
      success: true,
      data: { lead, download, user, onboarding, application },
    });
  })
);

// PUT /api/admin/leads/:id
adminRouter.put(
  '/leads/:id',
  validate(z.object({ status: z.string().optional(), follow_up_notes: z.string().optional(), assigned_to: z.string().optional() })),
  ah(async (req, res) => {
    const { status, follow_up_notes, assigned_to } = req.body;

    const updated = await prisma.anonymousLead.update({
      where: { id: req.params.id },
      data: {
        status: status || undefined,
        followUpNotes: follow_up_notes || undefined,
        assignedTo: assigned_to || undefined,
        contactedAt: status === 'contacted' ? new Date() : undefined,
      },
    });

    res.json({ success: true, data: updated });
  })
);

// ─────────────────────── Downloads ───────────────────────

// GET /api/admin/downloads
adminRouter.get(
  '/downloads',
  ah(async (req, res) => {
    const { platform, converted_only, source, date_from, date_to, page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (platform) where.platform = platform;
    if (converted_only === 'true') where.convertedUserId = { not: null };

    const downloads = await prisma.appDownload.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { downloadedAt: 'desc' },
    });

    const total = await prisma.appDownload.count({ where });

    res.json({
      success: true,
      data: downloads,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);

// GET /api/admin/downloads/stats
adminRouter.get(
  '/downloads/stats',
  ah(async (req, res) => {
    const downloads = await prisma.appDownload.findMany();
    const users = await prisma.user.findMany();

    const stats = {
      total: downloads.length,
      ios: downloads.filter(d => d.platform === 'ios').length,
      android: downloads.filter(d => d.platform === 'android').length,
      converted: downloads.filter(d => d.convertedUserId).length,
      conversionToRegisteredPct: downloads.length > 0 ? Math.round((downloads.filter(d => d.convertedUserId).length / downloads.length) * 100) : 0,
      conversionToLoanPct: users.length > 0 ? Math.round((users.filter(u => u.createdAt).length / downloads.length) * 100) : 0,
    };

    res.json({ success: true, data: stats });
  })
);

// GET /api/admin/downloads/by-source
adminRouter.get(
  '/downloads/by-source',
  ah(async (req, res) => {
    const downloads = await prisma.appDownload.findMany();

    const sources = [...new Set(downloads.map(d => d.utmSource))];
    const bySource = sources.map(source => ({
      source,
      downloads: downloads.filter(d => d.utmSource === source).length,
    }));

    res.json({ success: true, data: bySource });
  })
);

// ─────────────────────── Dashboard ───────────────────────

// GET /api/admin/dashboard/overview
adminRouter.get(
  '/dashboard/overview',
  ah(async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [users, leads, downloads, apps] = await Promise.all([
      prisma.user.findMany({ where: { createdAt: { gte: today } } }),
      prisma.anonymousLead.findMany({ where: { firstSeenAt: { gte: today } } }),
      prisma.appDownload.findMany({ where: { downloadedAt: { gte: today } } }),
      prisma.loanApplication.findMany(),
    ]);

    const funnels = await prisma.onboardingFunnel.findMany();

    const overview = {
      acquisition: {
        visitorsToday: leads.length,
        contactUsToday: leads.filter(l => l.source === 'contact_us').length,
        downloadsToday: downloads.length,
        signupsToday: users.length,
      },
      onboarding: {
        started: funnels.filter(f => f.status !== 'not_started').length,
        completed: funnels.filter(f => f.status === 'completed').length,
        paused: funnels.filter(f => f.status === 'paused').length,
        abandoned: funnels.filter(f => f.status === 'abandoned').length,
        completionRate: funnels.length > 0 ? Math.round((funnels.filter(f => f.status === 'completed').length / funnels.length) * 100) : 0,
      },
      loans: {
        total: apps.length,
        inProgress: apps.filter(a => ['draft', 'pan_pending'].includes(a.status)).length,
        paused: apps.filter(a => a.status === 'handoff').length,
        submitted: apps.filter(a => a.status === 'under_review').length,
        underReview: apps.filter(a => a.status === 'under_review').length,
        approvedNotDisbursed: apps.filter(a => a.status === 'approved').length,
        disbursed: apps.filter(a => a.status === 'disbursed').length,
        rejected: apps.filter(a => a.status === 'rejected').length,
        approvalRate: apps.length > 0 ? Math.round((apps.filter(a => ['approved', 'disbursed'].includes(a.status)).length / apps.length) * 100) : 0,
        totalDisbursedAmount: apps.filter(a => a.status === 'disbursed').reduce((sum, a) => sum + a.amount, 0),
      },
      conversion: {
        contactToDownloadRate: leads.length > 0 ? Math.round((downloads.length / leads.length) * 100) : 0,
        downloadToRegisterRate: downloads.length > 0 ? Math.round((users.length / downloads.length) * 100) : 0,
        registerToLoanRate: users.length > 0 ? Math.round((apps.length / users.length) * 100) : 0,
        loanToApprovalRate: apps.length > 0 ? Math.round((apps.filter(a => a.status === 'approved').length / apps.length) * 100) : 0,
      },
    };

    res.json({ success: true, data: overview });
  })
);

// GET /api/admin/dashboard/realtime
adminRouter.get(
  '/dashboard/realtime',
  ah(async (req, res) => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [activeSessions, recentEvents, submittedLoans, signups, dailyDownloads] = await Promise.all([
      prisma.session.count({ where: { isActive: true } }),
      prisma.activityEvent.count({ where: { timestamp: { gte: fiveMinutesAgo } } }),
      prisma.loanApplication.count({ where: { status: 'under_review' } }),
      prisma.user.count({ where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
      prisma.appDownload.count({ where: { downloadedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    ]);

    res.json({
      success: true,
      data: {
        usersOnlineNow: activeSessions,
        activeSessionsCount: activeSessions,
        eventsLast5Min: recentEvents,
        loansSubmittedToday: submittedLoans,
        signupsToday: signups,
        downloadsToday: dailyDownloads,
      },
    });
  })
);

// GET /api/admin/dashboard/charts
adminRouter.get(
  '/dashboard/charts',
  ah(async (req, res) => {
    const { metric, period = '7d', platform } = req.query;

    const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period as string] || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let data: any[] = [];

    if (metric === 'signups') {
      const users = await prisma.user.findMany({ where: { createdAt: { gte: startDate } } });
      data = generateChartData(users, 'createdAt', days);
    } else if (metric === 'loan_applications') {
      const apps = await prisma.loanApplication.findMany({ where: { createdAt: { gte: startDate } } });
      data = generateChartData(apps, 'createdAt', days);
    } else if (metric === 'downloads') {
      const downloads = await prisma.appDownload.findMany({ where: { downloadedAt: { gte: startDate } } });
      data = generateChartData(downloads, 'downloadedAt', days);
    }

    res.json({ success: true, data });
  })
);

function generateChartData(items: any[], dateField: string, days: number) {
  const result: any = {};
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    result[dateStr] = 0;
  }

  items.forEach(item => {
    const dateStr = new Date(item[dateField]).toISOString().split('T')[0];
    if (result[dateStr] !== undefined) result[dateStr]++;
  });

  return Object.entries(result)
    .sort((a, b) => (a[0] as string).localeCompare(b[0] as string))
    .map(([date, count]) => ({ date, count }));
}

// GET /api/admin/dashboard/live-feed
adminRouter.get(
  '/dashboard/live-feed',
  ah(async (req, res) => {
    const events = await prisma.activityEvent.findMany({
      take: 20,
      orderBy: { timestamp: 'desc' },
      include: { user: true },
    });

    const feed = events.map(e => {
      const name = e.user?.fullName || e.user?.phone || 'Anonymous';
      const timeAgo = getTimeAgo(e.timestamp);
      return `${name} ${e.eventName} on ${e.screen} — ${timeAgo}`;
    });

    res.json({ success: true, data: feed });
  })
);

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─────────────────────── Notifications ───────────────────────

// POST /api/admin/notifications/send
adminRouter.post(
  '/notifications/send',
  validate(
    z.object({
      segment: z.string(),
      user_ids: z.array(z.string()).optional(),
      channel: z.string(),
      title: z.string(),
      body: z.string(),
    })
  ),
  ah(async (req, res) => {
    const { segment, user_ids, channel, title, body } = req.body;

    const userIds = user_ids || [];
    if (segment === 'all') {
      const users = await prisma.user.findMany();
      userIds.push(...users.map(u => u.id));
    }

    const notifications = await Promise.all(
      userIds.map((userId: string) =>
        prisma.adminNotification.create({
          data: {
            userId,
            segment,
            channel,
            title,
            body,
          },
        })
      )
    );

    res.status(201).json({ success: true, data: { sent: notifications.length } });
  })
);

// GET /api/admin/notifications/history
adminRouter.get(
  '/notifications/history',
  ah(async (req, res) => {
    const { page = '1', limit = '25' } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 25);
    const skip = (pageNum - 1) * limitNum;

    const notifications = await prisma.adminNotification.findMany({
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    });

    const total = await prisma.adminNotification.count();

    res.json({
      success: true,
      data: notifications,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
    });
  })
);
