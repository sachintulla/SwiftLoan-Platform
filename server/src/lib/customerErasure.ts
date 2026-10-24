/**
 * Admin-side full erasure of a Customer. Removes the CRM Customer row and every
 * identifiable record tied to them — journey events (cascade), call attempts,
 * conversation summaries, campaign contacts, outbound requests, lender nudges,
 * message-delivery logs, leads and journey reminders — plus the linked User
 * account (which cascades applications → offers → lender applications, loans,
 * KYC, consents and tokens) and the plain-FK partner leads (Yubi/Revasure).
 *
 * This is the admin counterpart to the app's right-to-erasure (users.routes.ts
 * DELETE /me), which only deletes the User and leaves the CRM record behind.
 */
import { prisma } from './prisma.js';
import { phoneKey } from './messageStatus.js';
import { scoped } from './log.js';

const log = scoped('customer-erasure');

export interface CustomerErasureResult {
  found: boolean;
  deletedUser: boolean;
  phone?: string;
}

export async function eraseCustomer(customerId: string): Promise<CustomerErasureResult> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, phone: true, userId: true },
  });
  if (!c) return { found: false, deletedUser: false };

  const phone = c.phone;                     // bare 10-digit
  const pKey = phoneKey(phone) ?? '__none__'; // MessageDelivery stores a hashed/keyed phone
  // The person's User account may be linked by userId, else matched by phone.
  const user = c.userId
    ? await prisma.user.findUnique({ where: { id: c.userId }, select: { id: true } })
    : await prisma.user.findUnique({ where: { phone }, select: { id: true } }).catch(() => null);

  await prisma.$transaction([
    // CRM children keyed on customerId (JourneyEvent cascades with the Customer).
    prisma.callAttempt.deleteMany({ where: { customerId } }),
    prisma.conversationSummary.deleteMany({ where: { customerId } }),
    prisma.campaignContact.deleteMany({ where: { customerId } }),
    prisma.outboundRequest.deleteMany({ where: { customerId } }),
    // Phone-keyed records.
    prisma.messageDelivery.deleteMany({ where: { OR: [{ customerId }, { phone: pKey }] } }),
    prisma.lead.deleteMany({ where: { phone } }),
    prisma.journeyReminder.deleteMany({ where: { OR: [{ customerId }, { phone }] } }),
    // The linked User account + its plain-FK partner leads. Deleting the User
    // cascades applications/offers/lenderApplications/loans/kyc/consents/tokens.
    ...(user
      ? [
          prisma.partnerReferral.deleteMany({ where: { userId: user.id } }),
          prisma.revasureLead.deleteMany({ where: { userId: user.id } }),
          prisma.user.delete({ where: { id: user.id } }),
        ]
      : []),
    // Finally the Customer itself (cascades JourneyEvent).
    prisma.customer.delete({ where: { id: customerId } }),
  ]);

  log.warn('customer erased', { customerId, phone: pKey, deletedUser: !!user });
  return { found: true, deletedUser: !!user, phone };
}
