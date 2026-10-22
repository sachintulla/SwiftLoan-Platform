import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ah } from '../middleware/error.js';
import { resumeForUser, resumeToWire } from '../lib/journeyResume.js';

/**
 * The signed-in app user's unfinished website visit, if any: how the app knows to offer "continue where you
 * left off" when the install could not be matched to the link (a store install, or a same-IP guess we never trust).
 */
export const journeyRouter = Router();
journeyRouter.use(requireAuth);

journeyRouter.get(
  '/resume',
  ah(async (req, res) => {
    const resume = await resumeForUser(req.user!.sub);
    res.json({ success: true, data: { resume: resumeToWire(resume) }, message: resume ? 'Resume available' : 'Nothing to resume' });
  }),
);
