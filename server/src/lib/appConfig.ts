import { prisma } from './prisma.js';
import { scoped } from './log.js';

const log = scoped('app-config');

export interface NudgeConfig {
  nudgeEnabled: boolean;
  nudgeIdleMs: number;
  nudgeDropoffMs: number;
  nudgeEligibleMs: number;
  /** How long after a screen opens the bubble first appears. */
  nudgeStartMs: number;
  /** Time each line stays before the bubble rotates to the next. */
  nudgeRotateMs: number;
  /** Quiet period after the user dismisses the bubble. */
  nudgeSnoozeMs: number;
  /** Epoch ms of the last change — the mobile app uses it to detect updates. */
  version: number;
}

// Defaults mirror the app's built-in fallbacks (src/voice/nudges.ts).
const DEFAULTS: Omit<NudgeConfig, 'version'> = {
  nudgeEnabled: true,
  nudgeIdleMs: 30000,
  nudgeDropoffMs: 18000,
  nudgeEligibleMs: 20000,
  nudgeStartMs: 5000,
  nudgeRotateMs: 3000,
  nudgeSnoozeMs: 600000,
};

// Sensible guard rails so an admin typo can't set an absurd timer.
const MIN_MS = 3000;
const MAX_MS = 600000;
const clampMs = (n: unknown, fallback: number, min = MIN_MS, max = MAX_MS): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};
/** Allowed range per field, in ms. The first three share the original 3 s – 10 min range. */
export const NUDGE_LIMITS = {
  nudgeStartMs: { min: 1000, max: 60_000 },
  nudgeRotateMs: { min: 1000, max: 30_000 },
  nudgeSnoozeMs: { min: 60_000, max: 86_400_000 },
} as const;

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
      nudgeStartMs: row.nudgeStartMs,
      nudgeRotateMs: row.nudgeRotateMs,
      nudgeSnoozeMs: row.nudgeSnoozeMs,
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
    nudgeStartMs: patch.nudgeStartMs != null ? clampMs(patch.nudgeStartMs, current.nudgeStartMs, NUDGE_LIMITS.nudgeStartMs.min, NUDGE_LIMITS.nudgeStartMs.max) : current.nudgeStartMs,
    nudgeRotateMs: patch.nudgeRotateMs != null ? clampMs(patch.nudgeRotateMs, current.nudgeRotateMs, NUDGE_LIMITS.nudgeRotateMs.min, NUDGE_LIMITS.nudgeRotateMs.max) : current.nudgeRotateMs,
    nudgeSnoozeMs: patch.nudgeSnoozeMs != null ? clampMs(patch.nudgeSnoozeMs, current.nudgeSnoozeMs, NUDGE_LIMITS.nudgeSnoozeMs.min, NUDGE_LIMITS.nudgeSnoozeMs.max) : current.nudgeSnoozeMs,
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
    nudgeStartMs: row.nudgeStartMs,
    nudgeRotateMs: row.nudgeRotateMs,
    nudgeSnoozeMs: row.nudgeSnoozeMs,
    version: row.updatedAt.getTime(),
  };
}
