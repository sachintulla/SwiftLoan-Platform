/**
 * WS10 — the cross-channel conversation memory, keyed on phone number.
 *
 * The problem: a person could talk to the website widget, then take a callback
 * from the phone agent, then open the app and talk to the in-app agent — and each
 * one greeted them as a stranger. Only outbound phone calls were ever persisted
 * (as CallAttempt); website and in-app voice sessions vanished when the socket
 * closed.
 *
 * Every agent now does two things:
 *   1. GET the rolling brief for the number BEFORE it starts talking
 *   2. POST what happened when it finishes
 *
 * `phone` is the key because it is the only identifier all four surfaces share.
 * It is always normalised to bare 10 digits — if that normalisation drifts, the
 * same human splits into several histories and the feature quietly stops working.
 */
import type { CallOutcome, Customer, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { normalisePhone } from './dialer.js';
import { nextActionFor } from './nextAction.js';

/** Channels a conversation can happen on. */
export const CONVERSATION_CHANNELS = [
  'phone_outbound',
  'phone_inbound',
  'website_widget',
  'mobile_app',
  'admin',
  // Conversation.channel is a plain String column, so adding a channel needs no
  // migration. Kept in the same table deliberately: the rolling brief we hand
  // the voice agent should include what we said on WhatsApp, or the agent will
  // repeat a message the customer has already read.
  'whatsapp',
] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

/** Human labels, used in the rolling brief and the dashboard. */
export const CHANNEL_LABELS: Record<string, string> = {
  phone_outbound: 'phone call (we called them)',
  phone_inbound: 'phone call (they called us)',
  website_widget: 'website voice chat',
  mobile_app: 'in-app voice chat',
  admin: 'internal',
  whatsapp: 'WhatsApp message',
};

export function isConversationChannel(v: unknown): v is ConversationChannel {
  return typeof v === 'string' && (CONVERSATION_CHANNELS as readonly string[]).includes(v);
}

/** How many past conversations an agent is given. Enough for continuity, not a wall of text. */
const CONTEXT_LIMIT = 8;
/** Longest summary we keep per conversation — a runaway transcript must not become the brief. */
const MAX_SUMMARY = 2000;
/** Longest rolling brief. Beyond this an agent stops reading and latency suffers. */
const MAX_BRIEF = 4000;

export interface RecordConversationInput {
  phone: string;
  channel: ConversationChannel;
  agentRole?: string | null;
  providerConversationId?: string | null;
  summary?: string | null;
  transcript?: unknown;
  outcome?: CallOutcome | null;
  outcomeSource?: string | null;
  details?: Record<string, unknown> | null;
  recordingUrl?: string | null;
  startedAt?: Date;
  endedAt?: Date | null;
  durationSec?: number | null;
  customerId?: string | null;
}

const OPEN_CALL_STATUSES = ['queued', 'dialing', 'in_progress'] as const;

/**
 * Create or update a call/conversation row, then refresh the rolling brief.
 *
 * Three ways this resolves to one row, tried in order:
 *  1. `providerConversationId` given — upsert on it, so repeated posts for the
 *     same Ello conversation (session start, then session end) update one row.
 *  2. No id, but this IS a phone call (phone_outbound/phone_inbound) — find the
 *     most recent still-open dial for this phone (queued/dialing/in_progress)
 *     and close it out here. This is exactly what the agent's own
 *     `save_conversation` tool report looks like: it never carries an id, but
 *     it is unambiguous proof the call connected — without this, that report
 *     used to become an orphan second row while the real CallAttempt sat open
 *     until a 30-minute timeout closed it as "failed", even for a call the
 *     customer actually answered.
 *  3. Neither — a genuinely new row (mobile_app, website_widget, whatsapp, or
 *     a phone report with no open attempt to match).
 */
export async function recordConversation(input: RecordConversationInput) {
  const phone = normalisePhone(input.phone);
  if (!phone) throw new Error('A valid 10-digit phone number is required');

  // Attach to the Customer when we can, so the journey page shows it. Not
  // required though: a website visitor may talk to the widget before any lead
  // row exists, and losing that conversation would defeat the purpose.
  let customerId = input.customerId ?? null;
  if (!customerId) {
    const c = await prisma.customer.findFirst({ where: { phone }, select: { id: true } });
    customerId = c?.id ?? null;
  }

  const data = {
    customerId,
    phone,
    channel: input.channel,
    agentRole: input.agentRole ?? null,
    ...(input.summary != null ? { summary: String(input.summary).slice(0, MAX_SUMMARY) } : {}),
    ...(input.transcript != null ? { transcript: input.transcript as Prisma.InputJsonValue } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.outcomeSource ? { outcomeSource: input.outcomeSource } : {}),
    ...(input.details != null ? { details: input.details as Prisma.InputJsonValue } : {}),
    ...(input.recordingUrl ? { recordingUrl: input.recordingUrl } : {}),
    ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
    ...(input.durationSec != null ? { durationSec: input.durationSec } : {}),
  };

  let row;
  if (input.providerConversationId) {
    row = await prisma.callAttempt.upsert({
      where: { providerConversationId: input.providerConversationId },
      create: { ...data, providerConversationId: input.providerConversationId, startedAt: input.startedAt ?? new Date() },
      update: data,
    });
  } else if (input.channel === 'phone_outbound' || input.channel === 'phone_inbound') {
    const openAttempt = await prisma.callAttempt.findFirst({
      where: { phone, channel: input.channel, status: { in: [...OPEN_CALL_STATUSES] } },
      orderBy: { queuedAt: 'desc' },
    });

    row = openAttempt
      ? await prisma.callAttempt.update({
          where: { id: openAttempt.id },
          data: { ...data, status: 'completed', answered: true, endedAt: input.endedAt ?? new Date() },
        })
      : await prisma.callAttempt.create({ data: { ...data, startedAt: input.startedAt ?? new Date() } });
  } else {
    row = await prisma.callAttempt.create({ data: { ...data, startedAt: input.startedAt ?? new Date() } });
  }

  // Best-effort: a failed brief rebuild must not fail the write that produced it.
  await rebuildSummary(phone).catch((e) =>
    console.error('[conversations] summary rebuild failed for', phone, e),
  );

  return row;
}

/** "12 minutes ago", "3 days ago" — spoken form, since an agent reads it aloud. */
function agoWords(d: Date, now = Date.now()): string {
  const mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return `${Math.round(days / 30)} month${Math.round(days / 30) === 1 ? '' : 's'} ago`;
}

/**
 * Rebuild the rolling brief for a number.
 *
 * Composed server-side rather than left to each agent so all four surfaces
 * describe the history identically — and so the wording of an *unconfirmed*
 * outcome is decided in one place. Ello sends no outcome field, so most outcomes
 * are our own inference; stating a guess as fact to a customer ("you said you
 * weren't interested") is worse than saying nothing.
 */
export async function rebuildSummary(phoneRaw: string) {
  const phone = normalisePhone(phoneRaw);
  if (!phone) return null;

  const [rows, customer] = await Promise.all([
    prisma.callAttempt.findMany({ where: { phone }, orderBy: { startedAt: 'desc' }, take: 50 }),
    prisma.customer.findFirst({ where: { phone } }),
  ]);

  if (!rows.length) {
    await prisma.conversationSummary.deleteMany({ where: { phone } });
    return null;
  }

  const newest = rows[0];
  const oldest = rows[rows.length - 1];
  const channels = Array.from(new Set(rows.map((r) => r.channel)));
  const now = Date.now();

  const lines: string[] = [];
  const who = customer?.name ? customer.name.split(/\s+/)[0] : 'This person';
  lines.push(
    `${who} (${phone}) has had ${rows.length} conversation${rows.length === 1 ? '' : 's'} with us across ${channels
      .map((c) => CHANNEL_LABELS[c] ?? c)
      .join(', ')}.`,
  );
  if (customer) {
    lines.push(`Journey stage: ${customer.currentStage}. First seen via ${customer.firstSource ?? 'unknown'}.`);
  }

  // Newest first — an agent that reads only the first line still gets the most
  // relevant context.
  for (const r of rows.slice(0, CONTEXT_LIMIT)) {
    const bits = [`${agoWords(r.startedAt, now)} — ${CHANNEL_LABELS[r.channel] ?? r.channel}`];
    if (r.durationSec) bits.push(`${r.durationSec}s`);
    if (r.outcome) {
      bits.push(
        r.outcomeSource === 'agent'
          ? `outcome: ${r.outcome.replace(/_/g, ' ')}`
          : `outcome looked like ${r.outcome.replace(/_/g, ' ')} (inferred, not confirmed)`,
      );
    }
    let line = bits.join(', ');
    if (r.summary) line += `. ${r.summary}`;
    lines.push(line);
  }
  if (rows.length > CONTEXT_LIMIT) {
    lines.push(`(+${rows.length - CONTEXT_LIMIT} older conversation(s) not listed.)`);
  }

  const summary = lines.join('\n').slice(0, MAX_BRIEF);

  const payload = {
    customerId: customer?.id ?? null,
    summary,
    conversationCount: rows.length,
    channels,
    firstAt: oldest.startedAt,
    lastAt: newest.startedAt,
    lastChannel: newest.channel,
    lastAgentRole: newest.agentRole,
    lastOutcome: newest.outcome,
    lastOutcomeSource: newest.outcomeSource,
  };

  return prisma.conversationSummary.upsert({
    where: { phone },
    create: { phone, ...payload },
    update: payload,
  });
}

/**
 * Why we would be calling this person right now, in plain English — so the
 * pre-call tool can hand the agent a reason even when nothing has actually
 * been said to them yet (a brand-new lead has no Conversation, but it is not
 * a cold call — they asked us to get in touch).
 */
function callingPurposeFor(customer: Pick<Customer, 'currentStage' | 'callbackStatus'>): string {
  if (customer.callbackStatus === 'requested' || customer.callbackStatus === 'in_progress') {
    return 'They asked us to call them back after verifying their phone on the website.';
  }
  if (customer.currentStage === 'lead_captured') {
    return 'Following up on their website loan enquiry.';
  }
  return nextActionFor(customer.currentStage);
}

/**
 * Everything an agent needs before it opens its mouth.
 *
 * `known` stays strictly tied to real prior CONVERSATIONS (a call/chat that
 * actually happened) — never fabricate "we've spoken before" off a lead
 * that only ever filled in a form. But a fresh website lead is not a cold
 * call either, so `lead` and `callingPurpose` are populated independently of
 * `known`, straight from Lead/Customer, whenever either exists.
 * This is the ONE pre-call lookup an agent makes, so it needs to carry
 * everything: prior call history if there is any, and the website enquiry
 * details (amount, product) if this is the first contact.
 */
export async function getConversationContext(phoneRaw: string, limit = CONTEXT_LIMIT) {
  const phone = normalisePhone(phoneRaw);
  if (!phone) return { known: false as const, reason: 'invalid phone number' };

  const [summary, rows, customer, lead] = await Promise.all([
    prisma.conversationSummary.findUnique({ where: { phone } }),
    prisma.callAttempt.findMany({
      where: { phone },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(1, limit), 25),
      select: {
        id: true, channel: true, agentRole: true, summary: true, outcome: true,
        outcomeSource: true, details: true, startedAt: true, durationSec: true,
      },
    }),
    prisma.customer.findFirst({ where: { phone } }),
    // Most recent website enquiry for this number — the source of truth for
    // what they asked for, same table buildLeadCallContext() reads from when
    // a call is actually placed.
    prisma.lead.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } }),
  ]);

  const hasConversationHistory = !!summary || rows.length > 0;
  const hasLeadOrCustomer = !!customer || !!lead;

  if (!hasConversationHistory && !hasLeadOrCustomer) return { known: false as const, phone };

  return {
    // Only true when a real conversation happened — see the doc comment above.
    known: hasConversationHistory,
    phone,
    name: customer?.name ?? lead?.name ?? null,
    city: customer?.city ?? lead?.city ?? null,
    stage: customer?.currentStage ?? null,
    callingPurpose: customer ? callingPurposeFor(customer) : null,
    /** The website enquiry this number is (or was) captured against — null
     *  only when the number has never touched the website at all (e.g. a
     *  pure campaign contact). */
    lead: lead
      ? {
          product: lead.productInterest,
          amountRupees: lead.amount != null ? Math.round(lead.amount / 100) : null,
          source: lead.source,
          submittedAt: lead.createdAt,
          note: lead.note,
        }
      : null,
    /** The paragraph an agent should read — populated only from a REAL prior
     *  conversation, never synthesised from the lead above. */
    brief: summary?.summary ?? null,
    conversationCount: summary?.conversationCount ?? rows.length,
    channels: summary?.channels ?? [],
    lastAt: summary?.lastAt ?? rows[0]?.startedAt ?? null,
    conversations: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      channelLabel: CHANNEL_LABELS[r.channel] ?? r.channel,
      agentRole: r.agentRole,
      at: r.startedAt,
      durationSec: r.durationSec,
      summary: r.summary,
      outcome: r.outcome,
      /** False means we guessed it from the transcript — do not state it as fact. */
      outcomeConfirmed: r.outcomeSource === 'agent',
      details: r.details,
    })),
  };
}
