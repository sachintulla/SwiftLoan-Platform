/**
 * Admin "Alerts": everything sent to customers (WhatsApp, SMS, push, calls) as one short list. Mounted at
 * /api/admin/alerts. Rules: lib/alerts.ts; the single query behind the list and the counts: lib/alertsDb.ts.
 * It replaces the separate Messages and Calls pages; a row's details (message text, delivery times, call transcript
 * and recording) come from GET /:type/:id.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { ok, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin } from '../middleware/adminAuth.js';
import { getProviderConfig } from '../lib/integrations.js';
import {
  alertError, alertName, callSummaryText, humanise, isAlertType, outcomeLabel, parseAlertFilters,
  ALERT_STATUS_OPTIONS, ALERT_TYPES, ALERT_TYPE_LABEL, type AlertOutcome,
} from '../lib/alerts.js';
import { countAlerts, listAlerts } from '../lib/alertsDb.js';
import { enrich as enrichMessages } from './adminMessages.routes.js';

export const adminAlertsRouter = Router();
adminAlertsRouter.use(requireAdmin);
adminAlertsRouter.use(requireActiveAdmin);
adminAlertsRouter.use(auditAdmin);

// GET /api/admin/alerts?type=&status=&from=&to=&search=&customerId=&page=&pageSize=
// Newest first. `status` is success | sent | not_answered | failed | pending; `search` is a mobile number or a name.
adminAlertsRouter.get('/', ah(async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const { page, pageSize, skip, take } = pageParams(q, 25);
  const { rows, total } = await listAlerts(parseAlertFilters(q), skip, take);
  return ok(res, rows, 'Alerts', paginate(page, pageSize, total));
}));

// GET /api/admin/alerts/summary?from=&to=&search=&customerId=
// The tiles: how many of each type and how they ended, for the same slice as the list (type and status excluded).
adminAlertsRouter.get('/summary', ah(async (req, res) => {
  const [counts, upshot] = await Promise.all([
    countAlerts(parseAlertFilters(req.query as Record<string, unknown>)),
    getProviderConfig('upshot').catch(() => null),
  ]);
  return ok(res, {
    counts,
    // Push goes through Upshot. While that integration is off nothing is sent, so the Push tile says so instead of "0".
    pushEnabled: !!upshot?.enabled,
    types: ALERT_TYPES.map((key) => ({ key, label: ALERT_TYPE_LABEL[key] })),
    statuses: ALERT_STATUS_OPTIONS,
  }, 'Alert summary');
}));

interface Detail {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  outcome: AlertOutcome;
  status: string;
  error: string | null;
  customer: { id: string | null; name: string | null; phone: string | null };
  /** What happened and when, in order. Only the steps that really happened. */
  times: Array<{ label: string; at: Date }>;
  /** Why it was sent (which job or rule, and the step the customer was at), when recorded. */
  sentBecause: string | null;
  /** Messages: the text that went out, when it can be rebuilt. */
  text: string | null;
  template: string | null;
  /** Calls only. */
  call: null | { durationSec: number | null; result: string | null; summary: string | null; recordingUrl: string | null; transcript: unknown };
}

async function customerFor(customerId: string | null, phone: string | null) {
  const c = customerId
    ? await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true } })
    : phone ? await prisma.customer.findUnique({ where: { phone }, select: { id: true, name: true, phone: true } }) : null;
  const number = phone ?? c?.phone ?? null;
  let name = c?.name?.trim() || null;
  if (!name && number) {
    const u = await prisma.user.findUnique({ where: { phone: number }, select: { fullName: true, firstName: true, lastName: true } }).catch(() => null);
    name = (u?.fullName || [u?.firstName, u?.lastName].filter(Boolean).join(' ')).trim() || null;
  }
  return { id: c?.id ?? null, name, phone: number };
}

const stamp = (label: string, at: Date | null | undefined) => (at ? [{ label, at }] : []);

// GET /api/admin/alerts/:type/:id: one alert in full, for the panel that opens from a row.
adminAlertsRouter.get('/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  if (!isAlertType(type)) throw new HttpError(404, 'Alert not found');

  if (type === 'whatsapp' || type === 'sms') {
    const row = await prisma.messageDelivery.findUnique({ where: { id } });
    if (!row || row.channel !== type || row.kind === 'unparsed') throw new HttpError(404, 'Alert not found');
    const m = (await enrichMessages([row]))[0];
    const outcome: AlertOutcome = row.status === 'delivered' || row.status === 'read' ? 'success' : row.status === 'failed' ? 'failed' : 'sent';
    const trigger = m.trigger as { by?: string; stage?: string } | null;
    const detail: Detail = {
      id, type, typeLabel: ALERT_TYPE_LABEL[type],
      name: alertName(type, { template: row.template, kind: row.kind }),
      outcome, status: outcomeLabel(type, outcome),
      error: alertError(outcome, row.failureReason || row.failureCode),
      customer: await customerFor(row.customerId, row.phone),
      times: [
        ...stamp('Sent', row.sentAt ?? row.createdAt),
        ...stamp('Delivered', row.deliveredAt),
        ...stamp('Read', row.readAt),
        ...stamp('Failed', row.failedAt),
      ],
      sentBecause: trigger?.by ? [trigger.by, trigger.stage].filter(Boolean).join(' · ') : null,
      text: m.text,
      template: row.template,
      call: null,
    };
    return ok(res, detail, 'Alert');
  }

  if (type === 'call') {
    const c = await prisma.callAttempt.findUnique({ where: { id } });
    if (!c || c.channel !== 'phone_outbound') throw new HttpError(404, 'Alert not found');
    const ctx = (c.callContext && typeof c.callContext === 'object' ? c.callContext : {}) as Record<string, unknown>;
    const reason = typeof ctx.reason === 'string' ? ctx.reason : typeof ctx.purpose === 'string' ? ctx.purpose : null;
    const unreported = c.status === 'failed' && /^no terminal webhook/i.test(c.error ?? '');
    const outcome: AlertOutcome = c.answered ? 'success'
      : c.status === 'no_answer' || c.status === 'busy' || c.status === 'completed' || unreported ? 'not_answered'
      : c.status === 'failed' || c.status === 'cancelled' ? 'failed'
      : c.status == null && c.startedAt.getTime() < Date.now() - 3_600_000 ? 'failed'
      : 'pending';
    const detail: Detail = {
      id, type, typeLabel: ALERT_TYPE_LABEL.call,
      name: alertName('call', { reason }),
      outcome, status: outcomeLabel('call', outcome),
      error: alertError(outcome, c.status == null ? 'No result was recorded for this call' : c.error),
      customer: await customerFor(c.customerId, c.phone),
      times: [...stamp('Called', c.queuedAt ?? c.startedAt), ...stamp('Ended', c.endedAt)],
      sentBecause: null,
      text: null,
      template: null,
      call: {
        durationSec: c.answered ? c.durationSec : null,
        result: c.outcome ? humanise(c.outcome) : null,
        summary: callSummaryText(c.summary),
        recordingUrl: c.recordingUrl,
        transcript: c.transcript,
      },
    };
    return ok(res, detail, 'Alert');
  }

  const o = await prisma.outboundRequest.findUnique({ where: { id } });
  if (!o || o.channel !== 'push' || o.kind !== 'upshot_event') throw new HttpError(404, 'Alert not found');
  const payload = (o.payload && typeof o.payload === 'object' ? o.payload : {}) as Record<string, unknown>;
  const outcome: AlertOutcome = o.status === 'sent' ? 'sent' : 'failed';
  const detail: Detail = {
    id, type, typeLabel: ALERT_TYPE_LABEL.push,
    name: alertName('push', { template: typeof payload.eventName === 'string' ? payload.eventName : null }),
    outcome, status: outcomeLabel('push', outcome),
    error: alertError(outcome, o.lastError),
    customer: await customerFor(o.customerId, null),
    times: [...stamp('Queued', o.createdAt), ...stamp('Sent', o.sentAt)],
    sentBecause: null,
    text: null,
    template: typeof payload.eventName === 'string' ? payload.eventName : null,
    call: null,
  };
  return ok(res, detail, 'Alert');
}));
