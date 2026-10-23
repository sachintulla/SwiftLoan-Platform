import { prisma } from './prisma.js';

/**
 * True while a website visitor is on the install-link reminder schedule (or a lender-applied sequence). The stuck-stage SMS and WhatsApp
 * nudges check this and stand down, so one person never gets two overlapping message sequences.
 * Kept apart from installReminder.ts so those modules can import it without a circular import.
 */
export async function hasActiveInstallReminder(phone: string): Promise<boolean> {
  const [row, nudge] = await Promise.all([
    prisma.journeyReminder.findFirst({ where: { phone, status: 'active' }, select: { id: true } }),
    prisma.lenderNudge.findFirst({ where: { phone, status: 'active' }, select: { id: true } }), // "you applied with <lender>" sequences count too
  ]);
  return !!row || !!nudge;
}
