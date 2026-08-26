import { prisma } from './prisma.js';
import { scoped } from './log.js';

const log = scoped('app-config');

export interface NudgeConfig {
  nudgeEnabled: boolean;
  nudgeIdleMs: number;
  nudgeDropoffMs: number;
  nudgeEligibleMs: number;
  /** Epoch ms of the last change — the mobile app uses it to detect updates. */
  version: number;
}

// Defaults mirror the app's built-in fallbacks (src/voice/nudges.ts).
const DEFAULTS: Omit<NudgeConfig, 'version'> = {
  nudgeEnabled: true,
  nudgeIdleMs: 30000,
  nudgeDropoffMs: 18000,
  nudgeEligibleMs: 20000,
};

// Sensible guard rails so an admin typo can't set an absurd timer.
const MIN_MS = 3000;
const MAX_MS = 600000;
const clampMs = (n: unknown, fallback: number): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_MS, Math.max(MIN_MS, v)) : fallback;
};

// Short in-memory cache so the public endpoint (hit by every app) is cheap.
let cache: { at: number; value: NudgeConfig } | null = null;
const CACHE_MS = 15000;

/**
 * Read the nudge config (upserting the singleton with defaults on first use).
 * Degrades to in-memory defaults if the AppConfig table isn't migrated yet
 * (prisma:push not run) so nothing 500s before the migration lands.
 */
export async function getNudgeConfig(force = false): Promise<NudgeConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const row = await prisma.appConfig.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
    const value: NudgeConfig = {
      nudgeEnabled: row.nudgeEnabled,
      nudgeIdleMs: row.nudgeIdleMs,
      nudgeDropoffMs: row.nudgeDropoffMs,
      nudgeEligibleMs: row.nudgeEligibleMs,
      version: row.updatedAt.getTime(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    log.warn('AppConfig unavailable, serving defaults', { error: String(e) });
    return { ...DEFAULTS, version: 0 };
  }
}

/** Update the nudge config (admin). Clamps values and busts the cache. */
export async function setNudgeConfig(patch: Partial<Omit<NudgeConfig, 'version'>>): Promise<NudgeConfig> {
  const current = await getNudgeConfig(true);
  const data = {
    nudgeEnabled: typeof patch.nudgeEnabled === 'boolean' ? patch.nudgeEnabled : current.nudgeEnabled,
    nudgeIdleMs: patch.nudgeIdleMs != null ? clampMs(patch.nudgeIdleMs, current.nudgeIdleMs) : current.nudgeIdleMs,
    nudgeDropoffMs: patch.nudgeDropoffMs != null ? clampMs(patch.nudgeDropoffMs, current.nudgeDropoffMs) : current.nudgeDropoffMs,
    nudgeEligibleMs: patch.nudgeEligibleMs != null ? clampMs(patch.nudgeEligibleMs, current.nudgeEligibleMs) : current.nudgeEligibleMs,
  };
  const row = await prisma.appConfig.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  });
  cache = null; // bust so the next read reflects the change immediately
  return {
    nudgeEnabled: row.nudgeEnabled,
    nudgeIdleMs: row.nudgeIdleMs,
    nudgeDropoffMs: row.nudgeDropoffMs,
    nudgeEligibleMs: row.nudgeEligibleMs,
    version: row.updatedAt.getTime(),
  };
}
