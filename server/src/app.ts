import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.js';
import { prisma } from './lib/prisma.js';

import { authRouter } from './modules/auth.routes.js';
import { usersRouter } from './modules/users.routes.js';
import { applicationsRouter } from './modules/applications.routes.js';
import { kycRouter } from './modules/kyc.routes.js';
import { loansRouter } from './modules/loans.routes.js';
import { catalogRouter } from './modules/catalog.routes.js';
import { toolsRouter } from './modules/tools.routes.js';
import { supportRouter } from './modules/support.routes.js';
import { trackingRouter } from './modules/tracking.routes.js';
import { adminRouter } from './modules/admin.routes.js';
import { adminAuthRouter } from './modules/adminAuth.routes.js';
import { contextRouter } from './modules/context.routes.js';
import { downloadsRouter } from './modules/downloads.routes.js';
import { preapprovedRouter } from './modules/preapproved.routes.js';
import { customersRouter } from './modules/customers.routes.js';
import { integrationsRouter } from './modules/integrations.routes.js';
import { apiKeysRouter } from './modules/apiKeys.routes.js';
import { callsRouter } from './modules/calls.routes.js';
import { whatsappRouter } from './modules/whatsapp.routes.js';
import { campaignsRouter } from './modules/campaigns.routes.js';
import { segmentsRouter } from './modules/segments.routes.js';
import { agentsRouter } from './modules/agents.routes.js';
import { stallRulesRouter } from './modules/stallRules.routes.js';
import { adminOpsRouter } from './modules/adminOps.routes.js';
import { voiceRouter } from './modules/voice.routes.js';
import { conversationsRouter } from './modules/conversations.routes.js';
import { upshotTriggerRouter } from './modules/upshotTrigger.routes.js';
import { adminConversationsRouter } from './modules/adminConversations.routes.js';
import { webhooksRouter } from './modules/webhooks.routes.js';
import { aurixWebhookRouter } from './modules/aurixWebhook.routes.js';
import { websiteRouter } from './modules/website.routes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  // Capture the raw body so webhook signature checks (e.g. Knight Fintech's
  // X-KF-Signature = base64(sha256(shared_secret + raw_body))) can recompute it.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
  // Access logging (method, path, status, timing) for EVERY request, in every
  // environment. This used to be gated to non-prod only — meaning the
  // deployed dev/prod boxes had no request-level log at all, only whatever a
  // handler happened to console.log itself. 'combined' in prod (no ANSI
  // colour codes, which read as garbage in a redirected log file); 'dev' is
  // fine locally where a terminal renders them.
  app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // ── Rate limiting ──
  // Previously only the two auth routes were throttled, which left every public
  // endpoint open: /api/track/* could be flooded, and /api/context/create could
  // be scripted to create unlimited leads — each of which now triggers an
  // automatic outbound call, i.e. a real telephony bill and calls to real
  // people. These buckets are sized per-route by blast radius.
  const limiter = (windowMs: number, max: number, message: string) =>
    rateLimit({
      windowMs,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, data: null, message, error: message },
    });

  const authLimiter = limiter(60_000, 30, 'Too many attempts, try again shortly');
  // Strictest: every accepted request can cost money.
  const leadLimiter = limiter(60_000, 5, 'Too many submissions, please wait a minute');
  // High volume by design, but bounded.
  const trackLimiter = limiter(60_000, 300, 'Too many tracking events');
  const webhookLimiter = limiter(60_000, 240, 'Too many webhook posts');
  // Catch-all floor for everything else.
  const globalLimiter = limiter(60_000, 600, 'Too many requests');

  app.use('/api', globalLimiter);

  // Liveness: "is the process up". Deliberately cheap and dependency-free — a
  // load balancer must not restart a healthy API because the database blipped.
  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', service: 'swiftloan-api', time: new Date().toISOString() }));

  // Readiness: "can this instance actually serve traffic". Checks the database,
  // because /api/health returning ok with a dead DB meant a broken instance
  // stayed in the load-balancer pool.
  app.get('/api/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ status: 'ready', db: 'up', time: new Date().toISOString() });
    } catch (e) {
      return res.status(503).json({
        status: 'not-ready',
        db: 'down',
        error: (e as Error)?.message ?? 'database unreachable',
      });
    }
  });

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/tools', toolsRouter);
  app.use('/api/support', supportRouter);

  // ── WS4: activity tracking + admin dashboard (additive) ──
  app.use('/api/track', trackLimiter, trackingRouter);
  app.use('/api/admin/auth', authLimiter, adminAuthRouter);
  // ── WS5: outbound calling + campaigns + provider webhooks ──
  // Mounted before the catch-all adminRouter so its requireAdmin/404 does not
  // swallow these paths.
  app.use('/api/admin/calls', callsRouter);
  app.use('/api/admin/whatsapp', whatsappRouter);
  app.use('/api/admin/campaigns', campaignsRouter);
  app.use('/api/admin/segments', segmentsRouter);
  app.use('/api/admin/agents', agentsRouter);
  app.use('/api/admin/stall-rules', stallRulesRouter);
  app.use('/api/admin/ops', adminOpsRouter);
  app.use('/api/admin/conversations', adminConversationsRouter);
  app.use('/api/admin/customers', customersRouter);
  app.use('/api/admin/integrations', integrationsRouter);
  app.use('/api/admin/api-keys', apiKeysRouter);
  // PUBLIC — the marketing site has no login. Rate-limited because each call
  // starts a billable Ello session.
  app.use('/api/voice', limiter(60_000, 20, 'Too many voice session requests'), voiceRouter);
  // WS10 — agent-facing conversation memory. Secret-authenticated (see the module).
  app.use('/api/conversations', limiter(60_000, 120, 'Too many conversation API requests'), conversationsRouter);
  // PUBLIC — an Upshot journey posts here to place a call. Every guard
  // (calling hours, cooldown, do-not-call) is enforced server-side.
  app.use('/api/webhooks/upshot', webhookLimiter, upshotTriggerRouter);
  app.use('/api/webhooks/aurix', webhookLimiter, aurixWebhookRouter); // PUBLIC — Aurix/KFT posts loan status here
  app.use('/api/webhooks/kft', webhookLimiter, aurixWebhookRouter); // PUBLIC — alias for the KFT journey contract
  app.use('/api/webhooks', webhookLimiter, webhooksRouter); // PUBLIC — Ello posts here

  app.use('/api/admin', adminRouter);

  // ── WS3: context handoff + app-download landing pages ──
  app.use('/api/context', leadLimiter, contextRouter);
  // PUBLIC — post-lead-capture phone verification (OTP) + callback consent for
  // the marketing site. Separate from /api/auth/otp/*: that flow creates a
  // User row and issues real app tokens, the wrong side effect here. Each
  // accepted OTP request can send a real SMS, so it shares the strictest bucket.
  app.use('/api/website', leadLimiter, websiteRouter);
  app.use('/', downloadsRouter); // /api/downloads/manifest + /d/:token landing pages
  app.use('/', preapprovedRouter); // /api/preapproved-plans + /api/admin/preapproved-plans

  // Allow the admin dashboard (localhost:4001) to call this API in the browser.
  // (cors() above is permissive; this comment marks the intended consumer.)

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
