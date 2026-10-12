import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { scoped } from './log.js';
import {
  CLICK_TTL_HOURS,
  IP_WINDOW_MINUTES,
  hashClient,
  newClickToken,
  newReferralCode,
  normalizeCode,
  parseOsVersion,
  pickIpMatch,
  maskName,
  type MatchMethod,
  type Platform,
} from './attribution.js';

const log = scoped('referral');

/** A referee must be a new account — an existing user re-installing is not a referral. */
export const REFERRAL_ELIGIBLE_DAYS = Number(process.env.REFERRAL_ELIGIBLE_DAYS) || 7;

const STATUS_ORDER = ['signed_up', 'applied', 'disbursed'] as const;
export type ReferralStatus = (typeof STATUS_ORDER)[number];

// ── Codes ───────────────────────────────────────────────────────────────────

export async function getOrCreateCode(userId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { userId } });
  if (existing) return existing.code;
  for (let i = 0; i < 6; i++) {
    try {
      return (await prisma.referralCode.create({ data: { userId, code: newReferralCode() } })).code;
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      // Either the code collided (retry with a new one) or a concurrent call
      // created this user's code first (return that one).
      const raced = await prisma.referralCode.findUnique({ where: { userId } });
      if (raced) return raced.code;
    }
  }
  throw new Error('could not allocate a referral code');
}

// ── Clicks ──────────────────────────────────────────────────────────────────

export interface ClickInput {
  ref: string | null;
  campaignId?: string | null;
  platform: Platform;
  ip: string;
  userAgent: string;
}

export async function recordClick(input: ClickInput) {
  const code = normalizeCode(input.ref);
  const isReferral = code ? !!(await prisma.referralCode.findUnique({ where: { code } })) : false;
  const kind = isReferral ? 'referral' : input.ref ? 'campaign' : 'direct';
  return prisma.appClick.create({
    data: {
      token: newClickToken(),
      ref: isReferral ? code : (input.ref ?? null)?.slice(0, 64) ?? null,
      kind,
      campaignId: input.campaignId?.slice(0, 64) ?? null,
      platform: input.platform,
      ipHash: hashClient(input.ip),
      uaHash: hashClient(input.userAgent),
      osVersion: parseOsVersion(input.userAgent),
      expiresAt: new Date(Date.now() + CLICK_TTL_HOURS * 3600_000),
    },
  });
}

// ── Claim (first launch of the app) ─────────────────────────────────────────

export interface ClaimInput {
  platform: Platform;
  ip: string;
  clickToken?: string | null; // Play referrer click_id, or clipboard token
  via?: 'play_referrer' | 'clipboard';
  osVersion?: string | null;
}

export interface ClaimResult {
  matched: boolean;
  method: MatchMethod | null;
  downloadId: string;
  clickId: string | null;
  source: string;
  referral: { code: string; referrerName: string } | null;
}

/** Flip a pending click to matched exactly once; false if someone else got there first. */
async function consumeClick(id: string): Promise<boolean> {
  const { count } = await prisma.appClick.updateMany({
    where: { id, status: 'pending', expiresAt: { gt: new Date() } },
    data: { status: 'matched', matchedAt: new Date() },
  });
  return count === 1;
}

export async function claimInstall(input: ClaimInput): Promise<ClaimResult> {
  let click: Awaited<ReturnType<typeof prisma.appClick.findUnique>> = null;
  let method: MatchMethod | null = null;

  // 1. Deterministic: a token the click handed us (Play referrer / clipboard).
  if (input.clickToken) {
    const found = await prisma.appClick.findUnique({ where: { token: input.clickToken.toUpperCase() } });
    if (found && found.status === 'pending' && found.expiresAt > new Date() && (await consumeClick(found.id))) {
      click = found;
      method = input.via ?? 'clipboard';
    }
  }

  // 2. Probabilistic fallback: same IP + platform inside a short window, and
  //    only if that picks exactly one click.
  if (!click) {
    const candidates = await prisma.appClick.findMany({
      where: {
        ipHash: hashClient(input.ip),
        platform: input.platform,
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - IP_WINDOW_MINUTES * 60_000) },
        expiresAt: { gt: new Date() },
      },
      select: { id: true, osVersion: true },
      take: 25,
    });
    const hit = pickIpMatch(candidates, input.osVersion);
    if (hit && (await consumeClick(hit.id))) {
      click = await prisma.appClick.findUnique({ where: { id: hit.id } });
      method = 'ip_window';
    }
  }

  const source = click ? (click.kind === 'direct' ? 'organic' : click.kind) : 'organic';
  const download = await prisma.appDownload.create({
    data: {
      platform: input.platform,
      source,
      campaignId: click?.campaignId ?? null,
      referrer: click?.ref ?? null,
      clickId: click?.id ?? null,
      matchMethod: method,
    },
  });

  let referral: ClaimResult['referral'] = null;
  if (click?.kind === 'referral' && click.ref) {
    const owner = await prisma.referralCode.findUnique({ where: { code: click.ref } });
    const user = owner ? await prisma.user.findUnique({ where: { id: owner.userId }, select: { fullName: true, firstName: true, phone: true } }) : null;
    if (owner && user) {
      referral = { code: owner.code, referrerName: maskName(user.fullName ?? user.firstName, user.phone) };
    }
  }

  log.info('install claimed', { platform: input.platform, matched: !!click, method, source });
  return { matched: !!click, method, downloadId: download.id, clickId: click?.id ?? null, source, referral };
}

// ── Redeem (after the friend has an account) ────────────────────────────────

export type RedeemFailure = 'invalid_code' | 'self_referral' | 'already_referred' | 'not_new_user';
export type RedeemResult = { ok: true; referralId: string; referrerName: string } | { ok: false; reason: RedeemFailure };

export async function redeemReferral(
  refereeId: string,
  rawCode: unknown,
  meta: { downloadId?: string | null; matchMethod?: string | null } = {},
): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, reason: 'invalid_code' };

  const owner = await prisma.referralCode.findUnique({ where: { code } });
  if (!owner) return { ok: false, reason: 'invalid_code' };
  if (owner.userId === refereeId) return { ok: false, reason: 'self_referral' };

  const referee = await prisma.user.findUnique({ where: { id: refereeId }, select: { createdAt: true } });
  if (!referee) return { ok: false, reason: 'invalid_code' };
  if (referee.createdAt.getTime() < Date.now() - REFERRAL_ELIGIBLE_DAYS * 86_400_000) {
    return { ok: false, reason: 'not_new_user' };
  }

  // Mutual referral (A invited B, then B tries to invite A) is not allowed either.
  const reverse = await prisma.friendReferral.findFirst({ where: { referrerId: refereeId, refereeId: owner.userId } });
  if (reverse) return { ok: false, reason: 'self_referral' };

  try {
    const row = await prisma.friendReferral.create({
      data: { referrerId: owner.userId, refereeId, code, matchMethod: meta.matchMethod ?? 'manual' },
    });
    if (meta.downloadId) {
      await prisma.appDownload.update({ where: { id: meta.downloadId }, data: { matchedUserId: refereeId } }).catch(() => undefined);
    }
    const ref = await prisma.user.findUnique({ where: { id: owner.userId }, select: { fullName: true, firstName: true, phone: true } });
    return { ok: true, referralId: row.id, referrerName: maskName(ref?.fullName ?? ref?.firstName, ref?.phone) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: false, reason: 'already_referred' };
    throw e;
  }
}

/** Move a referral forward (never backward). Fire-and-forget safe: swallows its own errors. */
export async function advanceReferral(refereeId: string, to: Exclude<ReferralStatus, 'signed_up'>): Promise<void> {
  try {
    const row = await prisma.friendReferral.findUnique({ where: { refereeId } });
    if (!row || STATUS_ORDER.indexOf(to) <= STATUS_ORDER.indexOf(row.status as ReferralStatus)) return;
    const now = new Date();
    await prisma.friendReferral.update({
      where: { id: row.id },
      data: { status: to, ...(to === 'applied' ? { appliedAt: now } : { disbursedAt: now, appliedAt: row.appliedAt ?? now }) },
    });
  } catch (e) {
    log.warn('advanceReferral failed', { refereeId, to, err: (e as Error).message });
  }
}

// ── Read models ─────────────────────────────────────────────────────────────

export function shareLinkFor(code: string, base: string): string {
  return `${base.replace(/\/$/, '')}/dl?ref=${code}`;
}

export async function referralSummary(userId: string) {
  const code = await getOrCreateCode(userId);
  const rows = await prisma.friendReferral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.refereeId) } },
    select: { id: true, fullName: true, firstName: true, phone: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    code,
    stats: {
      invited: rows.length,
      applied: rows.filter((r) => r.status !== 'signed_up').length,
      disbursed: rows.filter((r) => r.status === 'disbursed').length,
    },
    referrals: rows.map((r) => {
      const u = byId.get(r.refereeId);
      return { id: r.id, name: maskName(u?.fullName ?? u?.firstName, u?.phone), status: r.status, createdAt: r.createdAt };
    }),
  };
}

/** Housekeeping: clicks are only useful for a day or two — keep the table (and the data we hold) small. */
export async function purgeExpiredClicks(): Promise<number> {
  const { count } = await prisma.appClick.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
