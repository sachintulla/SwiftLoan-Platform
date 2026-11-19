/**
 * Database side of the admin Alerts list (rules: alerts.ts). One query reads the three tables that record what we
 * sent (messages, calls, push) as a single list, so paging, the filters and the counts all agree.
 *
 * What counts as an alert:
 *   - `MessageDelivery` rows for WhatsApp and SMS, except `unparsed` (a provider callback we could not match: not a send).
 *   - `CallAttempt` rows for calls WE placed (`phone_outbound`); app and website voice chats are conversations, not alerts.
 *   - `OutboundRequest` push events that were really attempted. A push still waiting in the queue, or refused because
 *     the push integration is switched off, never left the server: it is not listed (the summary says push is off).
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import {
  alertError, alertName, foldCounts, isAlertOutcome, isAlertType, outcomeLabel, ALERT_TYPE_LABEL,
  type AlertCounts, type AlertFilters, type AlertOutcome, type AlertType,
} from './alerts.js';

/** Every alert, one row each, in the same columns. `outcome` is decided here so the status filter can use it. */
const ALL_ALERTS = Prisma.sql`
  SELECT m.id, m.channel AS type, m."createdAt" AS at, m."customerId" AS customer_id, m.phone,
         m.template, m.kind, NULL::text AS reason,
         CASE WHEN m.status IN ('delivered', 'read') THEN 'success' WHEN m.status = 'failed' THEN 'failed' ELSE 'sent' END AS outcome,
         COALESCE(NULLIF(m."failureReason", ''), m."failureCode") AS error, NULL::int AS duration_sec
  FROM "MessageDelivery" m
  WHERE m.channel IN ('whatsapp', 'sms') AND m.kind <> 'unparsed'
  UNION ALL
  SELECT c.id, 'call', COALESCE(c."queuedAt", c."startedAt"), c."customerId", c.phone,
         NULL, NULL, COALESCE(c."callContext"->>'reason', c."callContext"->>'purpose'),
         CASE WHEN c.answered THEN 'success'
              WHEN c.status IN ('no_answer', 'busy') THEN 'not_answered'
              -- The provider sends nothing for a call nobody picked up; our clean-up job then closes it as "failed".
              WHEN c.status = 'failed' AND c.error ILIKE 'no terminal webhook%' THEN 'not_answered'
              WHEN c.status = 'completed' THEN 'not_answered'
              WHEN c.status IN ('failed', 'cancelled') THEN 'failed'
              WHEN c.status IS NULL AND c."startedAt" < now() - interval '1 hour' THEN 'failed'
              ELSE 'pending' END,
         CASE WHEN c.status IS NULL THEN 'No result was recorded for this call' ELSE c.error END, c."durationSec"
  FROM "CallAttempt" c
  WHERE c.channel = 'phone_outbound'
  UNION ALL
  SELECT o.id, 'push', COALESCE(o."sentAt", o."createdAt"), o."customerId", NULL,
         o.payload->>'eventName', o.kind, NULL,
         CASE WHEN o.status = 'sent' THEN 'sent' ELSE 'failed' END, o."lastError", NULL
  FROM "OutboundRequest" o
  WHERE o.channel = 'push' AND o.kind = 'upshot_event' AND o.status IN ('sent', 'failed')
    AND COALESCE(o."lastError", '') NOT ILIKE '%integration is disabled%'
`;

/** The list joined to the person: the customer by id, else by the row's own number; the account for a missing name. */
const FROM_ALERTS = Prisma.sql`
  FROM (${ALL_ALERTS}) a
  LEFT JOIN "Customer" ci ON ci.id = a.customer_id
  LEFT JOIN "Customer" cp ON a.customer_id IS NULL AND cp.phone = a.phone
  LEFT JOIN "User" u ON u.phone = COALESCE(a.phone, ci.phone)
`;
const PERSON_ID = Prisma.sql`COALESCE(ci.id, cp.id)`;
const PERSON_PHONE = Prisma.sql`COALESCE(a.phone, ci.phone)`;
const PERSON_NAME = Prisma.sql`COALESCE(NULLIF(TRIM(ci.name), ''), NULLIF(TRIM(cp.name), ''), NULLIF(TRIM(u."fullName"), ''), NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''))`;

function whereFor(f: AlertFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.type) parts.push(Prisma.sql`a.type = ${f.type}`);
  if (f.outcome) parts.push(Prisma.sql`a.outcome = ${f.outcome}`);
  if (f.from) parts.push(Prisma.sql`a.at >= ${f.from}`);
  if (f.to) parts.push(Prisma.sql`a.at <= ${f.to}`);
  if (f.customerId) parts.push(Prisma.sql`${PERSON_ID} = ${f.customerId}`);
  if (f.phone) parts.push(Prisma.sql`${PERSON_PHONE} LIKE ${`%${f.phone}%`}`);
  if (f.name) parts.push(Prisma.sql`${PERSON_NAME} ILIKE ${`%${f.name.replace(/[%_\\]/g, (ch) => `\\${ch}`)}%`}`);
  return Prisma.join(parts, ' AND ');
}

interface RawRow {
  id: string; type: string; at: Date; customer_id: string | null; phone: string | null; name: string | null;
  template: string | null; kind: string | null; reason: string | null; outcome: string; error: string | null; duration_sec: number | null;
}

export interface AlertRow {
  id: string;
  type: AlertType;
  typeLabel: string;
  /** When it was sent (a call: when it was placed). */
  at: Date;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  /** Plain name: "Continue application", "No offers call". */
  name: string;
  outcome: AlertOutcome;
  /** The word on the status pill: Success, Answered, Sent, Not answered, Failed, Waiting. */
  status: string;
  /** Why it failed; null unless `outcome` is `failed`. */
  error: string | null;
  /** Calls only: how long the customer was on the line. */
  durationSec: number | null;
}

function toRow(r: RawRow): AlertRow | null {
  if (!isAlertType(r.type) || !isAlertOutcome(r.outcome)) return null;
  return {
    id: r.id,
    type: r.type,
    typeLabel: ALERT_TYPE_LABEL[r.type],
    at: r.at,
    customerId: r.customer_id,
    customerName: r.name,
    phone: r.phone,
    name: alertName(r.type, { template: r.template, kind: r.kind, reason: r.reason }),
    outcome: r.outcome,
    status: outcomeLabel(r.type, r.outcome),
    error: alertError(r.outcome, r.error),
    durationSec: r.type === 'call' && r.outcome === 'success' ? r.duration_sec : null,
  };
}

/** One page of alerts, newest first, with the total for the same filters. */
export async function listAlerts(f: AlertFilters, skip: number, take: number): Promise<{ rows: AlertRow[]; total: number }> {
  const where = whereFor(f);
  const [raw, count] = await Promise.all([
    prisma.$queryRaw<RawRow[]>(Prisma.sql`
      SELECT a.id, a.type, a.at, ${PERSON_ID} AS customer_id, ${PERSON_PHONE} AS phone, ${PERSON_NAME} AS name,
             a.template, a.kind, a.reason, a.outcome, a.error, a.duration_sec
      ${FROM_ALERTS}
      WHERE ${where}
      ORDER BY a.at DESC, a.id
      LIMIT ${take} OFFSET ${skip}`),
    prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`SELECT count(*) AS n ${FROM_ALERTS} WHERE ${where}`),
  ]);
  return { rows: raw.map(toRow).filter((r): r is AlertRow => !!r), total: Number(count[0]?.n ?? 0) };
}

/** The tiles: how many of each type, split by how they ended. The type and status filters are ignored on purpose. */
export async function countAlerts(f: AlertFilters): Promise<AlertCounts> {
  const where = whereFor({ ...f, type: null, outcome: null });
  const rows = await prisma.$queryRaw<Array<{ type: string; outcome: string; n: bigint }>>(Prisma.sql`
    SELECT a.type, a.outcome, count(*) AS n ${FROM_ALERTS} WHERE ${where} GROUP BY a.type, a.outcome`);
  return foldCounts(rows);
}
