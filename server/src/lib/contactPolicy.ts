/**
 * One contact limit for every scheduled touch (Sachin's review RB-09 / RB-20): at most `limits.touchesPerDay` (2) touches a day and
 * `limits.touchesPerWeek` (6) in 7 days, and — when `limits.noCallAndMessageSameDay` is on — never a call and a NEW written message
 * (WhatsApp / SMS) on the same India day. All three are Admin → Timings settings; 0 = no cap.
 *
 * A "touch" is a scheduled WhatsApp or SMS we sent (MessageDelivery, not failed) or a call we placed (CallAttempt phone_outbound that was
 * not a failed dial). NOT counted, because they are part of a conversation the customer is already in or asked for: the WhatsApp recap
 * after a call (`conversation_summary`), the "sorry we missed you" note (`missed_call_note`), a link sent because the customer asked on a
 * call (`agentlink:` reference), test sends, and OTPs (never recorded here).
 *
 * The rule is pure (`touchVerdict`, tested); `touchAllowed` reads the counts. Senders that use it skip the touch when it says no.
 */
import { prisma } from './prisma.js';
import { timing } from './timings.js';
import { phoneKey } from './messageStatus.js';
import { istDayStart } from './stallCallLimits.js';

export type TouchKind = 'message' | 'call';
export interface TouchCounts { today: number; week: number; callToday: boolean; messageToday: boolean }
export interface TouchCaps { perDay: number; perWeek: number; noCallAndMessageSameDay: boolean }

// welcome_sms: the SMS half of the welcome (the WhatsApp welcome is the touch).
// sms_fallback: the SMS copy of a WhatsApp that was not delivered (the WhatsApp is the touch).
const EXEMPT_KINDS = ['test', 'conversation_summary', 'missed_call_note', 'welcome_sms', 'sms_fallback', 'agent_link'];

export function touchVerdict(c: TouchCounts, kind: TouchKind, caps: TouchCaps): { ok: true } | { ok: false; reason: string } {
  if (caps.perDay > 0 && c.today >= caps.perDay) return { ok: false, reason: `already ${c.today} touches today (limit ${caps.perDay})` };
  if (caps.perWeek > 0 && c.week >= caps.perWeek) return { ok: false, reason: `already ${c.week} touches this week (limit ${caps.perWeek})` };
  if (caps.noCallAndMessageSameDay) {
    if (kind === 'call' && c.messageToday) return { ok: false, reason: 'a message already went today (no call and message on the same day)' };
    if (kind === 'message' && c.callToday) return { ok: false, reason: 'a call already went today (no call and message on the same day)' };
  }
  return { ok: true };
}

export function currentCaps(): TouchCaps {
  return { perDay: timing.num('limits.touchesPerDay'), perWeek: timing.num('limits.touchesPerWeek'), noCallAndMessageSameDay: timing.bool('limits.noCallAndMessageSameDay') };
}

export async function countTouches(phone: string, now: Date = new Date()): Promise<TouchCounts> {
  const key = phoneKey(phone);
  if (!key) return { today: 0, week: 0, callToday: false, messageToday: false };
  const weekStart = new Date(now.getTime() - 7 * 86_400_000);
  const dayStart = istDayStart(now);
  const [msgs, calls] = await Promise.all([
    prisma.messageDelivery.findMany({
      where: {
        phone: key, channel: { in: ['whatsapp', 'sms'] }, status: { not: 'failed' }, createdAt: { gte: weekStart, lte: now },
        kind: { notIn: EXEMPT_KINDS },
        // A plain NOT would also drop rows whose referenceId is NULL (SQL: NOT NULL LIKE … is not true), i.e. most sends.
        OR: [{ referenceId: null }, { NOT: { referenceId: { startsWith: 'agentlink:' } } }],
      },
      select: { createdAt: true },
    }),
    prisma.callAttempt.findMany({
      where: { phone: { endsWith: key }, channel: 'phone_outbound', status: { notIn: ['failed', 'cancelled'] }, startedAt: { gte: weekStart, lte: now } },
      select: { startedAt: true },
    }),
  ]);
  const msgToday = msgs.filter((m) => m.createdAt >= dayStart).length;
  const callToday = calls.filter((c) => c.startedAt >= dayStart).length;
  return { today: msgToday + callToday, week: msgs.length + calls.length, callToday: callToday > 0, messageToday: msgToday > 0 };
}

/** May we make this scheduled touch now? */
export async function touchAllowed(phone: string, kind: TouchKind, now: Date = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  return touchVerdict(await countTouches(phone, now), kind, currentCaps());
}
