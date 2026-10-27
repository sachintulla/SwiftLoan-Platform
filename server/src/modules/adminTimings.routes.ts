/**
 * Admin "Timings" API: every timing and limit that can be changed without a deploy. Mounted at /api/admin/timings.
 *   GET    /            every setting with its rules, default, current value and where that value comes from
 *   PUT    /            { changes: { key: value, … } }  validate all, save all (super_admin only)
 *   DELETE /:key        back to the environment value / built-in default (super_admin only)
 * Every call is recorded in the admin audit log by auditAdmin (who, what, when).
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { TIMINGS, describeTiming, isTimingKey } from '../lib/timings.js';
import { refreshTimings, saveTimings, resetTiming } from '../lib/timingsStore.js';

export const adminTimingsRouter = Router();
adminTimingsRouter.use(requireAdmin);
adminTimingsRouter.use(requireActiveAdmin);
adminTimingsRouter.use(auditAdmin);

/** Section order and wording for the page. */
const GROUPS = [
  { key: 'install', title: 'Website drop-off → install reminders', help: 'When a visitor leaves the website part-way, how and when we bring them back to the app.' },
  { key: 'hours', title: 'Calling hours (shared)', help: 'One window used by the reminders, the stuck-stage nudges and every automatic call.' },
  { key: 'website', title: 'Website', help: 'Signals sent by the open website.' },
  { key: 'calls', title: 'Website lead → automatic call', help: 'The AI call that follows a website lead who agreed to be called.' },
  { key: 'auth', title: 'Login and sessions', help: 'How long codes and logins last. These are security settings: change with care.' },
  { key: 'tracking', title: 'Tracking and limits', help: 'Install matching, reuse windows and per-person limits.' },
  { key: 'stage', title: 'Per-stage schedules', help: 'A schedule for one journey stage instead of the shared one. Edited on Stage outreach.' },
];

adminTimingsRouter.get('/', ah(async (_req, res) => {
  await refreshTimings(); // another server may have saved a change since this one last looked
  const rows = await prisma.platformSetting.findMany({ select: { key: true, updatedAt: true, updatedBy: true } });
  const meta = new Map(rows.map((r) => [r.key, r]));
  const items = TIMINGS.map((d) => ({
    ...describeTiming(d),
    updatedAt: meta.get(d.key)?.updatedAt ?? null,
    updatedBy: meta.get(d.key)?.updatedBy ?? null,
  }));
  return ok(res, { groups: GROUPS, items }, 'Timings');
}));

adminTimingsRouter.put('/', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const changes = (req.body as { changes?: unknown } | undefined)?.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return res.status(400).json({ success: false, data: null, message: 'Nothing to save', error: 'Send { "changes": { "<setting>": <value> } }' });
  }
  const result = await saveTimings(changes as Record<string, unknown>, req.admin?.email ?? null);
  if (!result.ok) {
    return res.status(400).json({ success: false, data: null, message: 'Some values are not allowed', error: 'Some values are not allowed', errors: result.errors });
  }
  return ok(res, { saved: result.saved }, 'Saved');
}));

adminTimingsRouter.delete('/:key', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const key = String(req.params.key);
  if (!isTimingKey(key)) return res.status(404).json({ success: false, data: null, message: 'Unknown setting', error: 'Unknown setting' });
  await resetTiming(key);
  return ok(res, { reset: key }, 'Back to the default');
}));
