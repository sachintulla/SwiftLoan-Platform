/**
 * Delivery tracking for outbound messages: remember every message the provider accepted, then fold the provider's
 * status callbacks into it (see messageStatus.ts for the rules). Everything here fails safe: tracking a message must
 * never stop one from being sent.
 */
import type { MessageDelivery, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { scoped } from './log.js';
import { mergeStatus, phoneKey, type DeliveryStatus, type StatusEvent } from './messageStatus.js';

const log = scoped('delivery');
const MAX_EVENTS = 25;

/** What fired a message, in words an admin can read. */
export interface TriggerInfo {
  /** The job or person behind it: "Drop-off messages", "Install reminder", "Stuck-stage rule: <name>", "Sent by <email>". */
  by: string;
  /** The journey step the person had reached or was stuck at. */
  stage?: string;
  /** When they reached it / stopped there (ISO). */
  since?: string;
  /** Which message of the sequence this was, for example "Message 1 · +30m whatsapp". */
  step?: string;
}

/** Stored on the delivery row (`meta`). */
export interface MessageMeta {
  language?: string;
  category?: string | null;
  /** The filled-in values of the template's {{1}}, {{2}}… in order. */
  placeholders?: string[];
  trigger?: TriggerInfo;
}

export interface SendRecord {
  channel: 'whatsapp' | 'sms';
  /** Provider's message id; null when the provider rejected the send outright. */
  providerRef?: string | null;
  gtrid?: string | null;
  referenceId?: string | null;
  phone: string;
  template?: string | null;
  kind?: string;
  customerId?: string | null;
  ok: boolean;
  /** Starting status when accepted (default queued). SMS has no delivery callbacks here, so it starts as sent. */
  status?: DeliveryStatus;
  /** The provider's error when it refused the send. */
  error?: string | null;
  /** What was sent and why (shown in Admin → WhatsApp → Sent messages). */
  meta?: MessageMeta | null;
}

type EventLog = { at: string; status: string | null; raw: string; code?: string | null; reason?: string | null };
const readEvents = (r: Pick<MessageDelivery, 'events'>): EventLog[] => (Array.isArray(r.events) ? (r.events as unknown as EventLog[]) : []);

/**
 * Remember a send. Never throws. If the provider's callback beat us here (it can, by milliseconds) a row for this
 * message already exists, so it is completed rather than duplicated.
 */
export async function recordSend(s: SendRecord): Promise<void> {
  try {
    const now = new Date();
    const known = {
      gtrid: s.gtrid ?? null, referenceId: s.referenceId ?? null, phone: phoneKey(s.phone), template: s.template ?? null,
      kind: s.kind ?? 'other', customerId: s.customerId ?? null,
      ...(s.meta ? { meta: s.meta as unknown as Prisma.InputJsonValue } : {}),
    };
    const existing = s.providerRef ? await prisma.messageDelivery.findUnique({ where: { providerRef: s.providerRef } }) : null;
    if (existing) {
      await prisma.messageDelivery.update({ where: { id: existing.id }, data: known });
      return;
    }
    const status: DeliveryStatus = s.ok ? s.status ?? 'queued' : 'failed';
    const data: Prisma.MessageDeliveryCreateInput = {
      channel: s.channel,
      providerRef: s.providerRef ?? null,
      ...known,
      status,
      ...(s.ok ? {} : { failureReason: (s.error ?? 'rejected by the gateway').slice(0, 500), failedAt: now }),
      lastEventAt: now,
      events: [{ at: now.toISOString(), status, raw: s.ok ? 'accepted by gateway' : 'rejected by gateway', reason: s.error ?? null }] as unknown as Prisma.InputJsonValue,
    };
    await prisma.messageDelivery.create({ data });
  } catch (e) {
    log.warn('could not record send', { error: (e as Error).message });
  }
}

export interface ApplyResult { events: number; matched: number; created: number }

/**
 * Fold callback events into the stored messages. An event for a message we never recorded (a test send, or one sent
 * before tracking existed) still gets a row, so nothing the provider tells us is lost.
 */
export async function applyStatusEvents(events: StatusEvent[]): Promise<ApplyResult> {
  const out: ApplyResult = { events: events.length, matched: 0, created: 0 };
  for (const ev of events) {
    try {
      const existing = ev.providerRef
        ? await prisma.messageDelivery.findFirst({ where: { OR: [{ providerRef: ev.providerRef }, { gtrid: ev.providerRef }, ...(ev.gtrid ? [{ gtrid: ev.gtrid }] : [])] } })
        : null;
      const entry: EventLog = { at: ev.at.toISOString(), status: ev.status, raw: ev.rawStatus, ...(ev.code ? { code: ev.code } : {}), ...(ev.reason ? { reason: ev.reason } : {}) };

      if (!existing) {
        await prisma.messageDelivery.create({
          data: {
            channel: 'whatsapp', providerRef: ev.providerRef, gtrid: ev.gtrid, referenceId: ev.referenceId, phone: phoneKey(ev.recipient),
            kind: 'unknown', status: ev.status ?? 'queued', lastEventAt: ev.at,
            ...stamps(ev), ...(ev.status === 'failed' ? { failureCode: ev.code, failureReason: ev.reason } : {}),
            events: [entry] as unknown as Prisma.InputJsonValue,
          },
        });
        out.created++;
        continue;
      }
      const next = mergeStatus(existing.status as DeliveryStatus, ev.status);
      const events = [...readEvents(existing), entry].slice(-MAX_EVENTS);
      await prisma.messageDelivery.update({
        where: { id: existing.id },
        data: {
          status: next,
          lastEventAt: existing.lastEventAt && existing.lastEventAt > ev.at ? existing.lastEventAt : ev.at,
          ...(ev.referenceId && !existing.referenceId ? { referenceId: ev.referenceId } : {}),
          ...(ev.gtrid && !existing.gtrid ? { gtrid: ev.gtrid } : {}),
          ...(ev.status === 'failed' && next === 'failed' ? { failureCode: ev.code ?? existing.failureCode, failureReason: ev.reason ?? existing.failureReason } : {}),
          // a delivery report that arrives after an early failure supersedes it
          ...(next === 'delivered' || next === 'read' ? { failureCode: null, failureReason: null } : {}),
          ...stamps(ev),
          events: events as unknown as Prisma.InputJsonValue,
        },
      });
      out.matched++;
    } catch (e) {
      log.warn('could not apply status event', { error: (e as Error).message });
    }
  }
  return out;
}

/** The per-status timestamp columns an event fills in. */
function stamps(ev: StatusEvent): { sentAt?: Date; deliveredAt?: Date; readAt?: Date; failedAt?: Date } {
  switch (ev.status) {
    case 'sent': return { sentAt: ev.at };
    case 'delivered': return { deliveredAt: ev.at };
    case 'read': return { readAt: ev.at, deliveredAt: ev.at };
    case 'failed': return { failedAt: ev.at };
    default: return {};
  }
}

/** A callback we could not read at all: keep the raw body so the real shape can be learned. */
export async function recordUnparsed(raw: unknown): Promise<void> {
  try {
    const text = JSON.stringify(raw)?.slice(0, 4000) ?? 'null';
    await prisma.messageDelivery.create({
      data: { channel: 'whatsapp', kind: 'unparsed', status: 'queued', lastEventAt: new Date(), events: [{ at: new Date().toISOString(), status: null, raw: text }] as unknown as Prisma.InputJsonValue },
    });
  } catch (e) {
    log.warn('could not store unparsed callback', { error: (e as Error).message });
  }
}
