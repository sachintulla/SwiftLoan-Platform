import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { notFound, errorHandler } from './middleware/error.js';

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

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  if (!env.isProd) app.use(morgan('dev'));

  // Throttle auth endpoints against brute force.
  const authLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'swiftloan-api', time: new Date().toISOString() }));

  app.use('/api/auth', authLimiter, authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/applications', applicationsRouter);
  app.use('/api/kyc', kycRouter);
  app.use('/api/loans', loansRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/tools', toolsRouter);
  app.use('/api/support', supportRouter);

  // ── WS4: activity tracking + admin dashboard (additive) ──
  app.use('/api/track', trackingRouter);
  app.use('/api/admin/auth', authLimiter, adminAuthRouter);
  app.use('/api/admin', adminRouter);

  // Allow the admin dashboard (localhost:4001) to call this API in the browser.
  // (cors() above is permissive; this comment marks the intended consumer.)

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
