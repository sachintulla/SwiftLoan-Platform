/**
 * Admin-side full erasure of a Customer. Removes the CRM Customer row and every
 * identifiable record tied to them — journey events (cascade), call attempts,
 * conversation summaries, campaign contacts, outbound requests, lender nudges,
 * message-delivery logs, leads and journey reminders — plus the linked User
 * account (which cascades applications → offers → lender applications, loans,
 * KYC, consents and tokens) and the plain-FK partner leads (Yubi/Revasure).
 *
 * The app/website's own right-to-erasure (users.routes.ts DELETE /me) uses the
 * same CRM clean-up (`crmErasureOps`), so both paths remove the same records.
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
    ...crmErasureOps({ customerIds: [customerId], phone, userId: user?.id }),
    // The linked User account + its plain-FK partner leads. Deleting the User
    // cascades applications/offers/lenderApplications/loans/kyc/consents/tokens.
    ...(user
      ? [
          prisma.partnerReferral.deleteMany({ where: { userId: user.id } }),
          prisma.revasureLead.deleteMany({ where: { userId: user.id } }),
          prisma.user.delete({ where: { id: user.id } }),
        ]
      : []),
  ]);

  log.warn('customer erased', { customerId, phone: pKey, deletedUser: !!user });
  return { found: true, deletedUser: !!user, phone };
}

/**
 * The CRM / tracking records tied to one person that no database relation to
 * User cascades: call attempts, conversation summaries, campaign contacts,
 * outbound requests, message-delivery logs, website leads, journey reminders,
 * tracking sessions / activity / onboarding rows, and finally the Customer rows
 * themselves (which cascade JourneyEvent). Run inside the caller's transaction,
 * BEFORE the User is deleted.
 */
export function crmErasureOps(p: { customerIds: string[]; phone?: string | null; userId?: string | null }) {
  const ids = p.customerIds;
  const phone = p.phone ?? '__none__';
  const pKey = phoneKey(p.phone) ?? '__none__'; // MessageDelivery stores a keyed phone
  const byCustomerOrPhone = { OR: [{ customerId: { in: ids } }, { phone }] };
  return [
    prisma.callAttempt.deleteMany({ where: byCustomerOrPhone }),
    prisma.conversationSummary.deleteMany({ where: byCustomerOrPhone }),
    prisma.campaignContact.deleteMany({ where: byCustomerOrPhone }),
    prisma.outboundRequest.deleteMany({ where: { customerId: { in: ids } } }),
    prisma.messageDelivery.deleteMany({ where: { OR: [{ customerId: { in: ids } }, { phone: pKey }] } }),
    prisma.lead.deleteMany({ where: { phone } }),
    prisma.journeyReminder.deleteMany({ where: byCustomerOrPhone }),
    ...(p.userId
      ? [
          prisma.activityEvent.deleteMany({ where: { userId: p.userId } }),
          prisma.onboardingFunnel.deleteMany({ where: { userId: p.userId } }),
          prisma.session.deleteMany({ where: { userId: p.userId } }),
        ]
      : []),
    // Last: the Customer rows (JourneyEvent cascades with them).
    prisma.customer.deleteMany({ where: { id: { in: ids } } }),
  ];
}
