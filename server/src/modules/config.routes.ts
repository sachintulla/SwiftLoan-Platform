import { Router } from 'express';
import { ah } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { getNudgeConfig } from '../lib/appConfig.js';

// Public app configuration. The mobile app fetches this on launch / foreground
// to pick up admin-tuned nudge timers. Read-only; no auth.
export const configRouter = Router();

// GET /api/config/nudges
configRouter.get('/nudges', ah(async (_req, res) => {
  const cfg = await getNudgeConfig();
  return ok(res, cfg, 'Nudge config');
}));

export default configRouter;
