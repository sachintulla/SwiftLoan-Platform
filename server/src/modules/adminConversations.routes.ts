/**
 * WS10 — admin views over the conversation memory. Mounted at
 * /api/admin/conversations.
 *
 * The list is one row per PHONE NUMBER, not per conversation: the operator's
 * question is "what's the history with this person", so the number is the unit.
 * Reads the denormalised ConversationSummary rather than aggregating, so the page
 * stays fast as history grows.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin } from '../middleware/adminAuth.js';
import { normalisePhone } from '../lib/dialer.js';
import { CHANNEL_LABELS, rebuildSummary } from '../lib/conversations.js';

export const adminConversationsRouter = Router();
adminConversationsRouter.use(requireAdmin);
adminConversationsRouter.use(requireActiveAdmin);
adminConversationsRouter.use(auditAdmin);

// GET /api/admin/conversations?search=&channel=&page=
adminConversationsRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 25);
  const q = req.query as Record<string, string | undefined>;

  const where: Record<string, unknown> = {};
  if (q.search) {
    const digits = q.search.replace(/\D/g, '');
    // A numeric search is a phone lookup; anything else searches the brief text.
    where.OR = digits.length >= 4
      ? [{ phone: { contains: digits } }]
      : [{ summary: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }];
  }
  if (q.channel) where.channels = { has: q.channel };

  const [rows, total] = await Promise.all([
    prisma.conversationSummary.findMany({ where, orderBy: { lastAt: 'desc' }, skip, take }),
    prisma.conversationSummary.count({ where }),
  ]);

  // Names come from Customer, which may not exist for a website visitor who only
  // ever talked to the widget — hence one batched lookup rather than a join.
  const phones = rows.map((r) => r.phone);
  const customers = phones.length
    ? await prisma.customer.findMany({
        where: { phone: { in: phones } },
        select: { id: true, phone: true, name: true, city: true, currentStage: true },
      })
    : [];
  const byPhone = new Map(customers.map((c) => [c.phone as string, c]));

  return ok(
    res,
    rows.map((r) => {
      const c = r.phone ? byPhone.get(r.phone) : undefined;
      return {
        phone: r.phone,
        name: c?.name ?? null,
        city: c?.city ?? null,
        stage: c?.currentStage ?? null,
        customerId: c?.id ?? r.customerId ?? null,
        conversationCount: r.conversationCount,
        channels: r.channels,
        channelLabels: r.channels.map((ch) => CHANNEL_LABELS[ch] ?? ch),
        firstAt: r.firstAt,
        lastAt: r.lastAt,
        lastChannel: r.lastChannel,
        lastChannelLabel: r.lastChannel ? CHANNEL_LABELS[r.lastChannel] ?? r.lastChannel : null,
        lastAgentRole: r.lastAgentRole,
        lastOutcome: r.lastOutcome,
        /** False = we inferred it from the transcript; the UI must not imply certainty. */
        lastOutcomeConfirmed: r.lastOutcomeSource === 'agent',
        summary: r.summary,
      };
    }),
    'Conversations by phone',
    paginate(page, pageSize, total),
  );
}));

// GET /api/admin/conversations/:phone — every conversation for one number
adminConversationsRouter.get('/:phone', ah(async (req, res) => {
  const phone = normalisePhone(req.params.phone);
  if (!phone) return fail(res, 400, 'Invalid phone number');

  const [summary, conversations, customer] = await Promise.all([
    prisma.conversationSummary.findUnique({ where: { phone } }),
    prisma.conversation.findMany({ where: { phone }, orderBy: { startedAt: 'desc' } }),
    prisma.customer.findFirst({ where: { phone } }),
  ]);

  if (!summary && !conversations.length) return fail(res, 404, 'No conversations for that number');

  return ok(
    res,
    {
      phone,
      customer: customer
        ? {
            id: customer.id, name: customer.name, city: customer.city,
            email: customer.email, stage: customer.currentStage,
            source: customer.firstSource, campaignId: customer.campaignId,
          }
        : null,
      brief: summary?.summary ?? null,
      conversationCount: summary?.conversationCount ?? conversations.length,
      channels: summary?.channels ?? [],
      firstAt: summary?.firstAt ?? null,
      lastAt: summary?.lastAt ?? null,
      conversations: conversations.map((c) => ({
        id: c.id,
        channel: c.channel,
        channelLabel: CHANNEL_LABELS[c.channel] ?? c.channel,
        agentRole: c.agentRole,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        durationSec: c.durationSec,
        summary: c.summary,
        transcript: c.transcript,
        outcome: c.outcome,
        outcomeConfirmed: c.outcomeSource === 'agent',
        outcomeSource: c.outcomeSource,
        details: c.details,
        recordingUrl: c.recordingUrl,
        providerConversationId: c.providerConversationId,
      })),
    },
    'Conversation history',
  );
}));

// POST /api/admin/conversations/:phone/rebuild — regenerate the brief by hand
adminConversationsRouter.post('/:phone/rebuild', ah(async (req, res) => {
  const phone = normalisePhone(req.params.phone);
  if (!phone) return fail(res, 400, 'Invalid phone number');
  const row = await rebuildSummary(phone);
  return ok(res, { phone, rebuilt: !!row, conversationCount: row?.conversationCount ?? 0 },
    row ? 'Summary rebuilt' : 'No conversations for that number');
}));
