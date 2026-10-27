/**
 * Manual outreach for one customer, mounted at /api/admin/outreach.
 *
 *   GET  /customers/:id/options  what each button should say (any admin)
 *   POST /customers/:id/send     send the stage's WhatsApp, SMS or push now (admin, super admin)
 *
 * Calls are not here: the Call button keeps using POST /api/admin/calls/trigger,
 * which is super admin only.
 *
 * Every guard (do-not-contact, test list, calling hours, repeat, daily cap) is
 * enforced in lib/manualOutreach.ts, so the dashboard buttons are a convenience and
 * not the protection. Every POST is written to the admin audit log.
 *
 * Errors carry a machine code the dashboard reads:
 *   { success:false, data:{ code, ... }, message, error }
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Customer } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE } from '../middleware/adminAuth.js';
import { STAGE_LABELS } from '../lib/journey.js';
import { hasActiveInstallReminder } from '../lib/installReminderGuard.js';
import { phoneKey } from '../lib/messageStatus.js';
import {
  isFinishedStage, loadPlans, resolveOutreachStage, sendManualPush, sendManualSms, sendManualWhatsApp,
  type Actor, type ChannelPlan, type SendOutcome,
} from '../lib/manualOutreach.js';

export const adminOutreachRouter = Router();
adminOutreachRouter.use(requireAdmin);
adminOutreachRouter.use(requireActiveAdmin);
adminOutreachRouter.use(auditAdmin);

/** The error envelope the dashboard reads a code from. */
function refuse(res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ success: false, data: { code, ...extra }, message, error: message });
}

/** What the client may see of a plan. The server-only fields (what to send) are dropped. */
function toChannelState(p: ChannelPlan) {
  return {
    available: p.available,
    reason: p.reason,
    code: p.code,
    preview: p.preview,
    lastSentAt: p.lastSentAt ? p.lastSentAt.toISOString() : null,
    lastSentBy: p.lastSentBy,
    recentlySent: p.recentlySent,
    sentToday: p.sentToday,
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function actorOf(req: { admin?: { sub: string; email: string; role: string } }): Actor {
  return { id: req.admin!.sub, email: req.admin!.email, role: req.admin!.role };
}

/* ─────────────────────────── options ─────────────────────────── */

adminOutreachRouter.get('/customers/:id/options', ah(async (req, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return refuse(res, 404, 'not_found', 'Customer not found');

  const role = req.admin!.role;
  const bare = phoneKey(customer.phone);
  const [plans, deliveries, manual, installLinkRows, onSchedule] = await Promise.all([
    loadPlans(customer, role),
    // The phone column is indexed, customerId is not. recordSend stores the last ten digits; the 91 form is a safety net.
    bare
      ? prisma.messageDelivery.findMany({
          where: { channel: { in: ['whatsapp', 'sms'] }, phone: { in: [bare, `91${bare}`] } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          // Never events or raw payloads: they can hold provider detail that is not for this screen.
          select: { id: true, channel: true, template: true, kind: true, status: true, sentAt: true, deliveredAt: true, readAt: true, failureReason: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.outboundRequest.findMany({
      where: {
        customerId: customer.id,
        kind: { in: ['whatsapp_template', 'sms_template', 'upshot_event'] },
        payload: { path: ['source'], equals: 'admin' },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { kind: true, channel: true, status: true, createdAt: true, sentAt: true, payload: true },
    }),
    prisma.outboundRequest.findMany({
      where: { customerId: customer.id, kind: 'install_link' },
      select: { status: true },
      take: 200,
    }),
    customer.phone ? hasActiveInstallReminder(customer.phone).catch(() => false) : Promise.resolve(false),
  ]);

  // Names for "sent by", resolved in one query.
  const ids = new Set<string>();
  for (const m of manual) {
    const by = ((m.payload ?? {}) as { sentBy?: { id?: string } }).sentBy?.id;
    if (by) ids.add(by);
  }
  const admins = ids.size ? await prisma.adminUser.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(admins.map((a) => [a.id, a.name]));

  const manualSends = manual.map((m) => {
    const p = (m.payload ?? {}) as { sentBy?: { id?: string; email?: string } };
    const channel = m.kind === 'whatsapp_template' ? 'whatsapp' : m.kind === 'sms_template' ? 'sms' : 'push';
    return {
      channel,
      at: iso(m.sentAt ?? m.createdAt),
      by: (p.sentBy?.id ? nameOf.get(p.sentBy.id) : null) ?? p.sentBy?.email ?? null,
      status: m.status,
    };
  });

  const blocked = plans.snapshot.dnc;
  return ok(res, {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      currentStage: customer.currentStage,
      stageLabel: STAGE_LABELS[customer.currentStage] ?? customer.currentStage,
      stageEnteredAt: iso(customer.stageEnteredAt),
    },
    outreachStage: resolveOutreachStage(customer.currentStage),
    terminal: isFinishedStage(customer.currentStage),
    doNotContact: {
      blocked,
      reason: !blocked ? null : customer.currentStage === 'lost' ? 'stage_lost' : 'do_not_call',
    },
    onReminderSchedule: onSchedule,
    role: { canMessage: CAN_WRITE.includes(role), canCall: role === 'super_admin' },
    channels: { whatsapp: toChannelState(plans.whatsapp), sms: toChannelState(plans.sms), push: toChannelState(plans.push) },
    recent: deliveries.map((d) => ({
      id: d.id,
      channel: d.channel === 'sms' ? 'sms' : 'whatsapp',
      template: d.template,
      kind: d.kind,
      status: d.status,
      sentAt: iso(d.sentAt ?? d.createdAt),
      deliveredAt: iso(d.deliveredAt),
      readAt: iso(d.readAt),
      failureReason: d.failureReason,
    })),
    manualSends,
    // App-link rows are bookkeeping for the installs page, not messages. The page subtracts them from its nudge counts.
    installLinks: { total: installLinkRows.length, sent: installLinkRows.filter((r) => r.status === 'sent').length },
  }, 'Outreach options');
}));

/* ─────────────────────────── send ─────────────────────────── */

const sendSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'push']),
  confirmRepeat: z.boolean().optional(),
  overrideHours: z.boolean().optional(),
  installId: z.string().min(1).max(100).optional(),
});

adminOutreachRouter.post('/customers/:id/send', requireRole(...CAN_WRITE), validate(sendSchema), ah(async (req, res) => {
  const body = req.body as z.infer<typeof sendSchema>;
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) return refuse(res, 404, 'not_found', 'Customer not found');

  // A send from the installs page must be about the person who actually installed. An install matched only by
  // an IP-address window is a guess, and messaging a guess could reach the wrong person.
  if (body.installId) {
    const install = await prisma.appDownload.findUnique({
      where: { id: body.installId },
      select: { matchMethod: true, matchedUserId: true },
    });
    if (!install) return refuse(res, 404, 'not_found', 'Install not found');
    if (install.matchMethod === 'ip_window') {
      return refuse(res, 409, 'unconfirmed_match', 'This install was matched by a guess, so no message can be sent from it. Open the customer to confirm who it is.');
    }
    if (!install.matchedUserId || install.matchedUserId !== customer.userId) {
      return refuse(res, 409, 'unconfirmed_match', 'This install is not matched to this customer, so no message can be sent from it.');
    }
  }

  const actor = actorOf(req);
  const flags = { confirmRepeat: body.confirmRepeat === true, overrideHours: body.overrideHours === true };
  const run = (c: Customer): Promise<SendOutcome> =>
    body.channel === 'whatsapp' ? sendManualWhatsApp(c, actor, flags)
      : body.channel === 'sms' ? sendManualSms(c, actor, flags)
        : sendManualPush(c, actor, flags);

  const out = await run(customer);
  if (!out.ok) return refuse(res, out.status, out.code, out.message, out.extra);
  return res.status(201).json({ success: true, data: out.data, message: out.data.status === 'queued' ? 'Push queued' : 'Sent' });
}));
