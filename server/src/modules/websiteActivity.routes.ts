import { timing } from '../lib/timings.js';
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { ah } from '../middleware/error.js';
import { pingInstallReminder } from '../lib/installReminder.js';

/**
 * The website tab's activity ping: "this visitor is here right now". It only moves the visitor's
 * last-seen time (the install reminder's idle clock); it records nothing else and carries no body.
 * Own router and bucket so frequent pings never use up the login rate limit.
 */
export const websiteActivityRouter = Router();

websiteActivityRouter.post(
  '/',
  requireAuth,
  ah(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, select: { id: true, phone: true } });
    if (user) await pingInstallReminder(user).catch(() => {});
    // Tells the open page how often to signal (Admin → Timings), so the interval can change without redeploying the website.
    res.json({ success: true, data: { ok: true, pingEverySeconds: timing.num('website.pingEverySeconds') }, message: 'ok' });
  }),
);
