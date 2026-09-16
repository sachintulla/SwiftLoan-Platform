/**
 * Dial-safety checks shared by every job that places outbound calls
 * (leadCaller.ts's passive follow-up, immediateCallback.ts's opt-in callback).
 *
 * Both count against the same `CallAttempt` table regardless of which job
 * queued the row, so a phone-level cooldown here is automatically global
 * across every calling source — the two jobs can never double-dial the same
 * number within the cooldown window just because they're on different
 * schedules.
 */
import { prisma } from './prisma.js';

/** How many more calls a job may place this hour, counted from what was
 *  actually dialled (CallAttempt.queuedAt) rather than an in-memory tally, so
 *  a process restart cannot reset the cap. */
export async function hourlyCallBudget(maxPerHour: number, now: Date = new Date()): Promise<number> {
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const lastHour = await prisma.callAttempt.count({ where: { queuedAt: { gte: hourAgo } } });
  return maxPerHour - lastHour;
}

/** Whether this phone has been dialled (by ANY job) within the cooldown window. */
export async function isPhoneInCooldown(phone: string, cooldownHours: number, now: Date = new Date()): Promise<boolean> {
  if (cooldownHours <= 0) return false;
  const since = new Date(now.getTime() - cooldownHours * 3_600_000);
  const recent = await prisma.callAttempt.count({ where: { phone, queuedAt: { gte: since } } });
  return recent > 0;
}
