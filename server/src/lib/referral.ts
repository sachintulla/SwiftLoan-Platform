import { prisma } from './prisma.js';
import { scoped } from './log.js';
import {
  clickTtlHours,
  ipWindowMinutes,
  hashClient,
  newClickToken,
  parseOsVersion,
  pickIpMatch,
  type MatchMethod,
  type Platform,
} from './attribution.js';

const log = scoped('referral');

// ── Clicks ──────────────────────────────────────────────────────────────────

export interface ClickInput {
  ref: string | null;
  campaignId?: string | null;
  platform: Platform;
  ip: string;
  userAgent: string;
}

export async function recordClick(input: ClickInput) {
  const kind = input.ref ? 'campaign' : 'direct';
  return prisma.appClick.create({
    data: {
      token: newClickToken(),
      ref: (input.ref ?? null)?.slice(0, 64) ?? null,
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
  /** The ad the Play referrer names (attribution.ts adCampaignFromReferrer), used when no SwiftLoan link claims the install. */
  adCampaign?: string | null;
}

export interface ClaimResult {
  matched: boolean;
  method: MatchMethod | null;
  downloadId: string;
  clickId: string | null;
  /** The link's `ref` (a campaign, or a website visitor's reference ID). */
  clickRef: string | null;
  source: string;
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

  // No link of ours brought them, but the Play referrer names an ad (Instagram / Facebook / WhatsApp / Google Ads): a campaign install.
  const ad = !click && input.adCampaign ? input.adCampaign : null;
  const source = click ? (click.kind === 'direct' ? 'organic' : click.kind) : ad ? 'campaign' : 'organic';
  const download = await prisma.appDownload.create({
    data: {
      platform: input.platform,
      source,
      campaignId: click?.campaignId ?? ad,
      referrer: click?.ref ?? null,
      clickId: click?.id ?? null,
      matchMethod: method,
    },
  });

  log.info('install claimed', { platform: input.platform, matched: !!click, method, source });
  return { matched: !!click, method, downloadId: download.id, clickId: click?.id ?? null, clickRef: click?.ref ?? null, source };
}

/** Housekeeping: clicks are only useful for a day or two — keep the table (and the data we hold) small. */
export async function purgeExpiredClicks(): Promise<number> {
  const { count } = await prisma.appClick.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return count;
}
