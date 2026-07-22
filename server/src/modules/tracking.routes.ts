import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validate } from '../middleware/validate.js';
import { HttpError, ah } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

export const trackingRouter = Router();

trackingRouter.use(requireAuth);

// POST /api/track/event
trackingRouter.post(
  '/event',
  validate(
    z.object({
      event_type: z.string(),
      event_name: z.string(),
      screen: z.string(),
      metadata: z.record(z.string(), z.any()).optional(),
    })
  ),
  ah(async (req, res) => {
    const { event_type, event_name, screen, metadata } = req.body;
    const userId = req.user!.sub;

    const event = await prisma.activityEvent.create({
      data: {
        userId,
        eventType: event_type,
        eventName: event_name,
        screen,
        metadata,
        platform: 'mobile',
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastSeenAt: new Date(),
        lastActiveScreen: screen,
      },
    });

    res.status(201).json({ success: true, data: event });
  })
);

// POST /api/track/session/start
trackingRouter.post(
  '/session/start',
  validate(
    z.object({
      platform: z.string(),
      device_info: z.record(z.string(), z.any()).optional(),
    })
  ),
  ah(async (req, res) => {
    const { platform, device_info } = req.body;
    const userId = req.user!.sub;

    const session = await prisma.session.create({
      data: {
        userId,
        platform,
        deviceInfo: device_info || null,
      },
    });

    res.status(201).json({ success: true, data: { session_id: session.id } });
  })
);

// POST /api/track/session/end
trackingRouter.post(
  '/session/end',
  validate(
    z.object({
      session_id: z.string().uuid(),
      pages_visited: z.array(z.record(z.string(), z.any())).optional(),
    })
  ),
  ah(async (req, res) => {
    const { session_id, pages_visited } = req.body;

    const session = await prisma.session.findUnique({
      where: { id: session_id },
    });

    if (!session) throw new HttpError(404, 'Session not found');

    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000);

    const updated = await prisma.session.update({
      where: { id: session_id },
      data: {
        endedAt,
        durationSeconds,
        isActive: false,
        pagesVisited: pages_visited || null,
      },
    });

    res.json({ success: true, data: updated });
  })
);

// POST /api/track/onboarding/step
trackingRouter.post(
  '/onboarding/step',
  validate(
    z.object({
      step_number: z.number(),
      step_name: z.string(),
      status: z.string(), // not_started | in_progress | paused | completed | abandoned
      time_spent_seconds: z.number(),
      drop_off_reason: z.string().optional(),
    })
  ),
  ah(async (req, res) => {
    const { step_number, step_name, status, time_spent_seconds, drop_off_reason } = req.body;
    const userId = req.user!.sub;

    let funnel = await prisma.onboardingFunnel.findUnique({
      where: { userId },
    });

    if (!funnel) {
      funnel = await prisma.onboardingFunnel.create({
        data: { userId },
      });
    }

    const stepsDetail = (funnel.stepsDetail as any[]) || [];
    const stepIndex = stepsDetail.findIndex(s => s.stepNumber === step_number);

    const stepData = {
      stepNumber: step_number,
      stepName: step_name,
      status,
      startedAt: stepIndex >= 0 ? stepsDetail[stepIndex].startedAt : new Date(),
      completedAt: status === 'completed' ? new Date() : null,
      timeSpentSeconds: time_spent_seconds,
      dropOffReason: drop_off_reason || null,
      errorEncountered: null,
      retryCount: stepIndex >= 0 ? (stepsDetail[stepIndex].retryCount || 0) + 1 : 0,
    };

    if (stepIndex >= 0) {
      stepsDetail[stepIndex] = { ...stepsDetail[stepIndex], ...stepData };
    } else {
      stepsDetail.push(stepData);
    }

    const updateData: any = {
      currentStep: step_number,
      stepsDetail,
      lastActivityAt: new Date(),
      status,
    };

    if (status === 'paused') {
      updateData.pausedAtStep = step_number;
      updateData.pausedReason = drop_off_reason || 'user_left';
      updateData.resumeCount = (funnel.resumeCount || 0) + 1;
    }

    if (status === 'completed' && step_number === (funnel.totalSteps || 5)) {
      updateData.completedAt = new Date();
      updateData.status = 'completed';
    }

    const updated = await prisma.onboardingFunnel.update({
      where: { userId },
      data: updateData,
    });

    res.json({ success: true, data: updated });
  })
);

// POST /api/track/loan/step
trackingRouter.post(
  '/loan/step',
  validate(
    z.object({
      loan_id: z.string().uuid(),
      step_name: z.string(),
      status: z.string(), // in_progress | paused | completed
      time_spent_seconds: z.number(),
      hold_reason: z.string().optional(),
    })
  ),
  ah(async (req, res) => {
    const { loan_id, step_name, status, time_spent_seconds, hold_reason } = req.body;

    const application = await prisma.loanApplication.findUnique({
      where: { id: loan_id },
    });

    if (!application) throw new HttpError(404, 'Loan application not found');

    const stepsDetail = (application.stepsDetail as any[]) || [];
    const stepIndex = stepsDetail.findIndex(s => s.stepName === step_name);

    const stepData = {
      stepName: step_name,
      status,
      startedAt: stepIndex >= 0 ? stepsDetail[stepIndex].startedAt : new Date(),
      completedAt: status === 'completed' ? new Date() : null,
      timeSpentSeconds: time_spent_seconds,
      holdAtStep: status === 'paused' ? step_name : null,
      holdReason: hold_reason || null,
    };

    if (stepIndex >= 0) {
      stepsDetail[stepIndex] = { ...stepsDetail[stepIndex], ...stepData };
    } else {
      stepsDetail.push(stepData);
    }

    const updated = await prisma.loanApplication.update({
      where: { id: loan_id },
      data: {
        stepsDetail,
        lastActivityAt: new Date(),
      },
    });

    res.json({ success: true, data: updated });
  })
);

// POST /api/track/lead
trackingRouter.post(
  '/lead',
  validate(
    z.object({
      session_id: z.string().optional(),
      source: z.string(),
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      message: z.string().optional(),
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      pages_visited: z.array(z.record(z.string(), z.any())).optional(),
    })
  ),
  ah(async (req, res) => {
    const { session_id, source, name, email, phone, message, utm_source, utm_medium, utm_campaign, pages_visited } = req.body;

    let lead = null;
    if (email) {
      lead = await prisma.anonymousLead.findFirst({
        where: { email },
      });
    }

    if (lead) {
      lead = await prisma.anonymousLead.update({
        where: { id: lead.id },
        data: {
          lastSeenAt: new Date(),
          pagesVisited: pages_visited || null,
        },
      });
    } else {
      lead = await prisma.anonymousLead.create({
        data: {
          sessionId: session_id || null,
          source,
          name: name || null,
          email: email || null,
          phone: phone || null,
          message: message || null,
          utmSource: utm_source || null,
          utmMedium: utm_medium || null,
          utmCampaign: utm_campaign || null,
          pagesVisited: pages_visited || null,
        },
      });
    }

    res.status(201).json({ success: true, data: { lead_id: lead.id } });
  })
);

// POST /api/track/download
trackingRouter.post(
  '/download',
  validate(
    z.object({
      platform: z.string(),
      app_version: z.string().optional(),
      utm_source: z.string().optional(),
      utm_medium: z.string().optional(),
      utm_campaign: z.string().optional(),
      anonymous_lead_id: z.string().optional(),
    })
  ),
  ah(async (req, res) => {
    const { platform, app_version, utm_source, utm_medium, utm_campaign, anonymous_lead_id } = req.body;

    const download = await prisma.appDownload.create({
      data: {
        platform,
        appVersion: app_version || null,
        utmSource: utm_source || null,
        utmMedium: utm_medium || null,
        utmCampaign: utm_campaign || null,
        anonymousLeadId: anonymous_lead_id || null,
      },
    });

    res.status(201).json({ success: true, data: download });
  })
);
