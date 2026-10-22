/**
 * What the app needs to resume a website visitor's journey: their phone (to pre-fill the login), first
 * name (for the greeting) and the last step they reached. Built from the JourneyReminder row the website
 * flow created (lib/installReminder.ts); the PAN is never part of it.
 */
import { prisma } from './prisma.js';
import { deriveLastStep, type LastStep } from './reminderSchedule.js';

export interface ResumePayload {
  token: string;
  firstName: string | null;
  /** 10-digit mobile, for pre-filling the login. */
  phone: string;
  lastStep: LastStep;
}

/** A reminder older than this is a stale visit, not a journey worth resuming. */
export const RESUME_MAX_AGE_DAYS = Number(process.env.JOURNEY_RESUME_MAX_AGE_DAYS) || 14;

async function toPayload(r: { token: string; userId: string; phone: string; firstName: string | null }): Promise<ResumePayload> {
  const [user, application] = await Promise.all([
    prisma.user.findUnique({ where: { id: r.userId }, select: { panOnFile: true } }),
    prisma.loanApplication.findFirst({ where: { userId: r.userId }, select: { id: true } }),
  ]);
  return {
    token: r.token,
    firstName: r.firstName,
    phone: r.phone,
    lastStep: deriveLastStep({ panOnFile: !!user?.panOnFile, hasApplication: !!application }),
  };
}

/**
 * The wire format the app reads (snake_case, like the rest of the attribution API). ONE function for both
 * places a resume leaves the server (the install claim and GET /journey/resume), so they cannot drift apart:
 * they did once, and the post-login lookup silently never matched what the app parsed.
 */
export function resumeToWire(r: ResumePayload | null) {
  return r && { token: r.token, first_name: r.firstName, phone: r.phone, last_step: r.lastStep };
}

const freshSince = () => new Date(Date.now() - RESUME_MAX_AGE_DAYS * 86_400_000);

/** From the link's reference ID (the install matched deterministically, so the link holder is the recipient). */
export async function resumeForToken(token: string | null | undefined): Promise<ResumePayload | null> {
  const t = (token ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(t)) return null;
  const r = await prisma.journeyReminder.findUnique({ where: { token: t } });
  return r && r.createdAt >= freshSince() ? toPayload(r) : null;
}

/** For a signed-in user: the latest website visit of theirs that is still fresh. */
export async function resumeForUser(userId: string): Promise<ResumePayload | null> {
  const r = await prisma.journeyReminder.findFirst({
    where: { userId, createdAt: { gte: freshSince() } },
    orderBy: { createdAt: 'desc' },
  });
  return r ? toPayload(r) : null;
}
