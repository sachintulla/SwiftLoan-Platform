/**
 * Do-not-contact, in one place.
 *
 * A customer is do-not-contact when they asked us to stop. Two signals count, and
 * either one is enough:
 *   - their journey stage is `lost` (the conversation handler writes this when
 *     the voice agent reports `do_not_call`), or
 *   - any call to them ever ended with the outcome `do_not_call`.
 *
 * The automatic senders already refuse these customers one at a time. This file
 * is for the admin paths that act on many people at once (campaigns started from
 * a list) and for the manual "Reach out" buttons, so none of them can become a
 * way around a customer's request.
 *
 * Everything here that takes a list runs a fixed, small number of queries however
 * long the list is, never one query per customer.
 */
import { prisma } from './prisma.js';

/** Why a customer cannot be contacted, or null when they can. */
export type ContactBlock = 'no_phone' | 'do_not_contact';

/**
 * Pure rule: may this customer be contacted at all?
 * `hasDncOutcome` is true when any call to them ended with `do_not_call`.
 */
export function contactBlockReason(
  c: { currentStage: string | null; phone: string | null },
  hasDncOutcome: boolean,
): ContactBlock | null {
  if (!c.phone || !String(c.phone).trim()) return 'no_phone';
  if (c.currentStage === 'lost' || hasDncOutcome) return 'do_not_contact';
  return null;
}

/** Large lists are sent to the database in slices, so a 5,000-row campaign cannot hit a parameter limit. */
const CHUNK = 2000;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * The subset of these customer ids that are do-not-contact.
 * Two batched queries per slice: the customers (stage and phone), then every
 * `do_not_call` call attempt that belongs to any of them by id or by phone.
 */
export async function doNotContactCustomerIds(customerIds: string[]): Promise<Set<string>> {
  const blocked = new Set<string>();
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (!ids.length) return blocked;

  for (const slice of chunks(ids)) {
    const customers = await prisma.customer.findMany({
      where: { id: { in: slice } },
      select: { id: true, phone: true, currentStage: true },
    });
    for (const c of customers) if (c.currentStage === 'lost') blocked.add(c.id);

    // A call is normally tied to its customer, but one logged before the customer
    // row existed carries only the phone. Matching on both is the safe reading of
    // "asked not to be called".
    const phones = customers.map((c) => c.phone).filter((p): p is string => !!p);
    const attempts = await prisma.callAttempt.findMany({
      where: {
        outcome: 'do_not_call',
        OR: [{ customerId: { in: slice } }, ...(phones.length ? [{ phone: { in: phones } }] : [])],
      },
      select: { customerId: true, phone: true },
    });
    const byPhone = new Map<string, string[]>();
    for (const c of customers) {
      if (!c.phone) continue;
      byPhone.set(c.phone, [...(byPhone.get(c.phone) ?? []), c.id]);
    }
    for (const a of attempts) {
      if (a.customerId) blocked.add(a.customerId);
      for (const id of byPhone.get(a.phone) ?? []) blocked.add(id);
    }
  }
  return blocked;
}

/**
 * The subset of these phone numbers that are do-not-contact.
 * Input and output are bare 10-digit strings (the form `normalisePhone` in
 * dialer.ts produces). A number with a `do_not_call` call but no customer row yet
 * is still blocked.
 */
export async function doNotContactPhones(phones: string[]): Promise<Set<string>> {
  const blocked = new Set<string>();
  const list = [...new Set(phones.filter(Boolean))];
  if (!list.length) return blocked;

  for (const slice of chunks(list)) {
    const customers = await prisma.customer.findMany({
      where: { phone: { in: slice } },
      select: { id: true, phone: true },
    });
    const idToPhone = new Map(customers.map((c) => [c.id, c.phone]));
    const blockedIds = await doNotContactCustomerIds(customers.map((c) => c.id));
    for (const id of blockedIds) {
      const p = idToPhone.get(id);
      if (p) blocked.add(p);
    }

    // Numbers that have asked to stop but never became a customer row.
    const orphan = await prisma.callAttempt.findMany({
      where: { outcome: 'do_not_call', phone: { in: slice } },
      select: { phone: true },
    });
    for (const a of orphan) blocked.add(a.phone);
  }
  return blocked;
}
