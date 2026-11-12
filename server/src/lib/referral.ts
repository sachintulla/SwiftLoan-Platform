import { timing } from './timings.js';
import { classifyClaim, type ClaimKind } from './installDedup.js';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { scoped } from './log.js';
import {
  clickTtlHours,
  ipWindowMinutes,
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
export const referralEligibleDays = () => timing.num('referral.eligibleDays');

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
      expiresAt: new Date(Date.now() + clickTtlHours() * 3600_000),
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
  /** Random id the app made for this install (dedups a retried report). */
  installId?: string | null;
  /** Hashed device id (lib/installDedup.ts deviceKeyFor): the same phone after a reinstall. */
  deviceKey?: string | null;
  installSource?: string | null;
  appVersion?: string | null;
  deviceModel?: string | null;
}

export interface ClaimResult {
  matched: boolean;
  method: MatchMethod | null;
  downloadId: string;
  clickId: string | null;
  /** The link's `ref` (a referral code, a campaign, or a website visitor's reference ID). */
  clickRef: string | null;
  source: string;
  referral: { code: string; referrerName: string } | null;
  /** new = counted as an install; reinstall = same phone again; retry = the same report twice (counted once). */
  kind: ClaimKind;
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
  const installId = input.installId ?? null;
  const deviceKey = input.deviceKey ?? null;
  const [byInstallId, byDevice] = await Promise.all([
    installId ? prisma.appDownload.findFirst({ where: { OR: [{ installId }, { lastInstallId: installId }] } }) : null,
    deviceKey ? prisma.appDownload.findUnique({ where: { platform_deviceKey: { platform: input.platform, deviceKey } } }) : null,
  ]);
  const kind = classifyClaim({ installId, byInstallId, byDevice });

  // The same report again (the app never got our reply): answer from the row already saved. No link is consumed
  // twice and nothing is counted again.
  if (kind === 'retry') {
    const row = (byInstallId ?? byDevice)!;
    return replyFromRow(row, input.platform, 'retry');
  }

  const { click, method } = await matchClick(input);
  const source = click ? (click.kind === 'direct' ? 'organic' : click.kind) : 'organic';
  const details = {
    installSource: input.installSource ?? null,
    appVersion: input.appVersion ?? null,
    deviceModel: input.deviceModel ?? null,
    osVersion: input.osVersion ?? null,
  };

  let download: { id: string };
  if (kind === 'reinstall' && byDevice) {
    // Same phone, installed again: one install, one more reinstall. A link that brought them back still fills
    // the attribution when the first install had none (and still drives the website "continue" offer below).
    const attribution = click && !byDevice.clickId
      ? { source, campaignId: click.campaignId ?? null, referrer: click.ref ?? null, clickId: click.id, matchMethod: method }
      : {};
    download = await prisma.appDownload.update({
      where: { id: byDevice.id },
      data: { ...details, ...attribution, lastInstallId: installId, reinstallCount: { increment: 1 }, lastReinstalledAt: new Date() },
    });
  } else {
    try {
      download = await prisma.appDownload.create({
        data: {
          platform: input.platform,
          source,
          campaignId: click?.campaignId ?? null,
          referrer: click?.ref ?? null,
          clickId: click?.id ?? null,
          matchMethod: method,
          installId,
          lastInstallId: installId,
          deviceKey,
          ...details,
        },
      });
    } catch (e) {
      // Two reports from the same phone at once: the other one saved the row first. Count it once.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') throw e;
      const raced = await prisma.appDownload.findFirst({
        where: { OR: [...(installId ? [{ installId }] : []), ...(deviceKey ? [{ platform: input.platform, deviceKey }] : [])] },
      });
      if (!raced) throw e;
      return replyFromRow(raced, input.platform, 'retry');
    }
  }

  const referral = click?.kind === 'referral' && click.ref ? await referralFor(click.ref) : null;
  log.info('install claimed', { platform: input.platform, kind, matched: !!click, method, source, installSource: details.installSource });
  return { matched: !!click, method, downloadId: download.id, clickId: click?.id ?? null, clickRef: click?.ref ?? null, source, referral, kind };
}

/** Which /dl link (if any) sent this install: the token it handed over, else exactly one click from the same network. */
async function matchClick(input: ClaimInput) {
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
        createdAt: { gte: new Date(Date.now() - ipWindowMinutes() * 60_000) },
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
  return { click, method };
}

async function referralFor(code: string): Promise<ClaimResult['referral']> {
  const owner = await prisma.referralCode.findUnique({ where: { code } });
  const user = owner ? await prisma.user.findUnique({ where: { id: owner.userId }, select: { fullName: true, firstName: true, phone: true } }) : null;
  return owner && user ? { code: owner.code, referrerName: maskName(user.fullName ?? user.firstName, user.phone) } : null;
}

/** Answer a repeated report with what the first one got (same link, same referral), without counting anything. */
async function replyFromRow(
  row: { id: string; clickId: string | null; matchMethod: string | null; source: string },
  platform: Platform,
  kind: ClaimKind,
): Promise<ClaimResult> {
  const click = row.clickId ? await prisma.appClick.findUnique({ where: { id: row.clickId }, select: { ref: true, kind: true } }) : null;
  const referral = click?.kind === 'referral' && click.ref ? await referralFor(click.ref) : null;
  log.info('install claim repeated', { platform, kind, downloadId: row.id });
  return {
    matched: !!row.clickId,
    method: (row.matchMethod as MatchMethod | null) ?? null,
    downloadId: row.id,
    clickId: row.clickId,
    clickRef: click?.ref ?? null,
    source: row.source,
    referral,
    kind,
  };
}

/**
 * Tie this install to the person who just signed in on it (the app sends its own install id after OTP login).
 * Only an install that belongs to nobody yet is linked; a shared phone keeps its first owner. Returns the row
 * when it was linked now, else null.
 */
export async function linkInstallToUser(installId: string, userId: string) {
  const row = await prisma.appDownload.findFirst({ where: { OR: [{ installId }, { lastInstallId: installId }] } });
  if (!row || row.matchedUserId) return null;
  const { count } = await prisma.appDownload.updateMany({ where: { id: row.id, matchedUserId: null }, data: { matchedUserId: userId, matchedAt: new Date() } });
  return count === 1 ? row : null;
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
  if (referee.createdAt.getTime() < Date.now() - referralEligibleDays() * 86_400_000) {
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
