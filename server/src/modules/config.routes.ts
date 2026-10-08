import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { getNudgeConfig } from '../lib/appConfig.js';
import { yubiEnabled } from '../lib/yubiReferral.js';

// Public app configuration. The mobile app fetches this on launch / foreground
// to pick up admin-tuned nudge timers. Read-only; no auth.
export const configRouter = Router();

// GET /api/config/nudges
configRouter.get('/nudges', ah(async (_req, res) => {
  const cfg = await getNudgeConfig();
  return ok(res, cfg, 'Nudge config');
}));

// GET /api/config/features — client feature flags fetched on launch. Drives
// whether the app shows the "Alternative offers" tile (Yubi/YMPL facility).
configRouter.get('/features', ah(async (_req, res) => {
  return ok(res, { altOffers: yubiEnabled() }, 'Feature flags');
}));

export default configRouter;
