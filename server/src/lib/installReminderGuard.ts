import { prisma } from './prisma.js';
import { timing } from './timings.js';

/**
 * True while a person is on one of our app-link / drop-off message sequences (the website install reminder, a "you applied"
 * sequence, or a "you dropped at <step>" run). The stuck-stage SMS and WhatsApp nudges check this and stand down, so one
 * person never gets two overlapping message sequences.
 * Kept apart from installReminder.ts so those modules can import it without a circular import.
 *
 * A drop-off run only counts once drop-off sending is switched on: while it is log-only it sends nothing, so the older
 * stuck-stage messages must keep working instead of both going silent.
 */
export async function hasActiveInstallReminder(phone: string): Promise<boolean> {
  const dropoffLive = timing.bool('dropoff.sendEnabled');
  const [row, nudge, dropoff] = await Promise.all([
    prisma.journeyReminder.findFirst({ where: { phone, status: 'active' }, select: { id: true } }),
    prisma.lenderNudge.findFirst({ where: { phone, status: 'active' }, select: { id: true } }), // "you applied with <lender>" sequences count too
    dropoffLive ? prisma.appDropoff.findFirst({ where: { phone, status: 'active' }, select: { id: true } }) : Promise.resolve(null),
  ]);
  return !!row || !!nudge || !!dropoff;
}
