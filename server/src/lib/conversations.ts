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
import type { CallOutcome, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { normalisePhone } from './dialer.js';

/** Channels a conversation can happen on. */
export const CONVERSATION_CHANNELS = [
  'phone_outbound',
  'phone_inbound',
  'website_widget',
  'mobile_app',
  'admin',
] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

/** Human labels, used in the rolling brief and the dashboard. */
export const CHANNEL_LABELS: Record<string, string> = {
  phone_outbound: 'phone call (we called them)',
  phone_inbound: 'phone call (they called us)',
  website_widget: 'website voice chat',
  mobile_app: 'in-app voice chat',
  admin: 'internal',
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
  callAttemptId?: string | null;
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

/**
 * Create or update a conversation, then refresh the rolling brief.
 *
 * Upserts on `providerConversationId` when present so repeated posts for the same
 * Ello conversation (session start, then session end) update one row rather than
 * accumulating duplicates.
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
    callAttemptId: input.callAttemptId ?? null,
    ...(input.summary != null ? { summary: String(input.summary).slice(0, MAX_SUMMARY) } : {}),
    ...(input.transcript != null ? { transcript: input.transcript as Prisma.InputJsonValue } : {}),
    ...(input.outcome ? { outcome: input.outcome } : {}),
    ...(input.outcomeSource ? { outcomeSource: input.outcomeSource } : {}),
    ...(input.details != null ? { details: input.details as Prisma.InputJsonValue } : {}),
    ...(input.recordingUrl ? { recordingUrl: input.recordingUrl } : {}),
    ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
    ...(input.durationSec != null ? { durationSec: input.durationSec } : {}),
  };

  const row = input.providerConversationId
    ? await prisma.conversation.upsert({
        where: { providerConversationId: input.providerConversationId },
        create: {
          ...data,
          providerConversationId: input.providerConversationId,
          startedAt: input.startedAt ?? new Date(),
        },
        update: data,
      })
    : await prisma.conversation.create({
        data: { ...data, startedAt: input.startedAt ?? new Date() },
      });

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
    prisma.conversation.findMany({ where: { phone }, orderBy: { startedAt: 'desc' }, take: 50 }),
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
 * Everything an agent needs before it opens its mouth.
 *
 * Returns `known: false` for an unrecognised number rather than an error — a
 * first-time caller is normal, and the agent should simply behave as it always
 * did.
 */
export async function getConversationContext(phoneRaw: string, limit = CONTEXT_LIMIT) {
  const phone = normalisePhone(phoneRaw);
  if (!phone) return { known: false as const, reason: 'invalid phone number' };

  const [summary, rows, customer] = await Promise.all([
    prisma.conversationSummary.findUnique({ where: { phone } }),
    prisma.conversation.findMany({
      where: { phone },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(1, limit), 25),
      select: {
        id: true, channel: true, agentRole: true, summary: true, outcome: true,
        outcomeSource: true, details: true, startedAt: true, durationSec: true,
      },
    }),
    prisma.customer.findFirst({ where: { phone } }),
  ]);

  if (!summary && !rows.length) return { known: false as const, phone };

  return {
    known: true as const,
    phone,
    name: customer?.name ?? null,
    city: customer?.city ?? null,
    stage: customer?.currentStage ?? null,
    /** The paragraph an agent should read. */
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
