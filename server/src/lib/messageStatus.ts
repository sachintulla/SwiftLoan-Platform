/**
 * Pure rules for message delivery status: reading a provider's status callback, and moving a message's status
 * forward. No database or network, so it is unit-tested (messageStatus.test.ts).
 *
 * A 200 from the WhatsApp send API only means the gateway QUEUED the message. What happens next (sent to Meta,
 * delivered to the phone, read, or failed and why) arrives later on a callback, in one of two shapes:
 *   - Meta's own: { entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp, recipient_id, errors? }] } }] }] }
 *   - a flat gateway shape: { id | messageId | gtrid, status, referenceId?, errorCode?, errorMessage? … } (one or a list)
 * Both are read here, with tolerant field names, because the gateway's exact callback is not documented. The raw
 * body is always kept by the caller, so a shape we did not predict can be read afterwards.
 */

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface StatusEvent {
  /** The provider's message id this event is about (or its gtrid). */
  providerRef: string | null;
  gtrid: string | null;
  referenceId: string | null;
  recipient: string | null;
  status: DeliveryStatus | null;
  /** The status exactly as the provider wrote it. */
  rawStatus: string;
  at: Date;
  code: string | null;
  reason: string | null;
}

const MAPPING: Record<string, DeliveryStatus> = {
  queued: 'queued', accepted: 'queued', pending: 'queued', submitted: 'queued', enqueued: 'queued', scheduled: 'queued', processing: 'queued',
  sent: 'sent', dispatched: 'sent', forwarded: 'sent',
  delivered: 'delivered', delivery: 'delivered',
  read: 'read', seen: 'read',
  failed: 'failed', failure: 'failed', undelivered: 'failed', rejected: 'failed', error: 'failed', expired: 'failed', blocked: 'failed', invalid: 'failed', deleted: 'failed',
};

export function normaliseStatus(raw: unknown): DeliveryStatus | null {
  const k = String(raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/^message_/, '');
  if (!k) return null;
  // Anything that says it failed IS a failure, even when it also says "delivery" ("delivery_failed", "not_delivered").
  if (/fail|reject|undeliver|not_deliver|error|expire|block|invalid/.test(k)) return 'failed';
  return MAPPING[k] ?? null;
}

const RANK: Record<Exclude<DeliveryStatus, 'failed'>, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

/**
 * The status after an event. A message never moves backwards (a late "sent" must not undo "delivered"), and
 * "failed" wins over queued/sent but never over delivered/read (the phone already has it).
 */
export function mergeStatus(current: DeliveryStatus, incoming: DeliveryStatus | null): DeliveryStatus {
  if (!incoming || incoming === current) return current;
  if (current === 'delivered' || current === 'read') return incoming === 'read' && current === 'delivered' ? 'read' : current;
  if (incoming === 'failed') return 'failed';
  if (current === 'failed') return incoming === 'delivered' || incoming === 'read' ? incoming : 'failed'; // a late delivery report beats an early failure
  return RANK[incoming] > RANK[current] ? incoming : current;
}

/** Queued or sent for this long with no delivery report is worth a human's attention. */
export const STUCK_AFTER_MS = 15 * 60_000;

export function isStuck(row: { status: string; createdAt: Date }, now: Date = new Date()): boolean {
  return (row.status === 'queued' || row.status === 'sent') && now.getTime() - row.createdAt.getTime() > STUCK_AFTER_MS;
}

/* ───────────────────────── reading a callback ───────────────────────── */

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.trim() ? s.trim().slice(0, 500) : null;
};
const pick = (o: Record<string, any>, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};

/** Seconds, milliseconds or ISO text → a Date; the receive time when absent or unreadable. */
export function parseTimestamp(v: unknown, fallback: Date): Date {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    const ms = n < 1e11 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function failureFrom(o: Record<string, any>): { code: string | null; reason: string | null } {
  const errs = Array.isArray(o.errors) ? o.errors : o.error && typeof o.error === 'object' ? [o.error] : [];
  const e = errs[0] as Record<string, any> | undefined;
  if (e) {
    const detail = e.error_data?.details ?? e.message ?? e.title ?? e.description ?? e.reason;
    return { code: str(e.code ?? e.errorCode), reason: str([e.title, detail].filter((x, i, a) => x && a.indexOf(x) === i).join(': ')) };
  }
  return {
    code: str(pick(o, ['errorCode', 'error_code', 'failureCode', 'failure_code'])),
    reason: str(pick(o, ['errorMessage', 'error_message', 'failureReason', 'failure_reason', 'reason', 'description', 'detail', 'error'])),
  };
}

function eventFrom(o: Record<string, any>, now: Date): StatusEvent | null {
  const rawStatus = str(pick(o, ['status', 'messageStatus', 'message_status', 'deliveryStatus', 'delivery_status', 'state', 'event']));
  const providerRef = str(pick(o, ['id', 'messageId', 'message_id', 'wamid', 'providerMessageId', 'gtrid']));
  if (!rawStatus || !providerRef) return null;
  const status = normaliseStatus(rawStatus);
  const f = failureFrom(o);
  return {
    providerRef,
    gtrid: str(pick(o, ['gtrid', 'gtrId'])),
    referenceId: str(pick(o, ['referenceId', 'reference_id', 'clientReference', 'client_reference'])),
    recipient: str(pick(o, ['recipient_id', 'recipient', 'to', 'phone', 'msisdn', 'wa_id'])),
    status,
    rawStatus,
    at: parseTimestamp(pick(o, ['timestamp', 'time', 'ts', 'updatedAt', 'deliveredAt', 'statusTime']), now),
    // A failure detail is only meaningful on a failure (some gateways send code 200 on every event).
    code: status === 'failed' ? f.code : null,
    reason: status === 'failed' ? f.reason : null,
  };
}

/** Every status event in a callback body, whichever of the known shapes it arrives in. Unreadable parts are skipped. */
export function parseStatusPayload(body: unknown, now: Date = new Date()): StatusEvent[] {
  const out: StatusEvent[] = [];
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    const o = node as Record<string, any>;
    if (Array.isArray(o.statuses)) { o.statuses.forEach((s: unknown) => { if (s && typeof s === 'object') { const e = eventFrom(s as Record<string, any>, now); if (e) out.push(e); } }); return; }
    if (Array.isArray(o.entry)) { walk(o.entry, depth + 1); return; }
    if (Array.isArray(o.changes)) { walk(o.changes, depth + 1); return; }
    if (o.value && typeof o.value === 'object') { walk(o.value, depth + 1); return; }
    if (o.data && typeof o.data === 'object' && !('status' in o)) { walk(o.data, depth + 1); return; }
    const e = eventFrom(o, now);
    if (e) out.push(e);
  };
  walk(body, 0);
  return out;
}

/** Last ten digits: how we store and compare a recipient. */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : null;
}
