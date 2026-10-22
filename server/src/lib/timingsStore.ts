/**
 * Database side of the admin Timings page: loads the saved overrides into the in-memory copy that `timing.*` reads,
 * keeps it fresh, and saves/resets values (validated against the registry in timings.ts).
 */
import { prisma } from './prisma.js';
import { scoped } from './log.js';
import { TIMINGS, checkTiming, defOf, isTimingKey, setOverrides, getOverrides, type TimingValue } from './timings.js';

const log = scoped('timings');

/** Reload every saved override. A row that no longer passes its own rules (edited by hand, or a limit changed) is ignored, never trusted. */
export async function refreshTimings(): Promise<void> {
  const rows = await prisma.platformSetting.findMany();
  const next = new Map<string, unknown>();
  for (const r of rows) {
    if (!isTimingKey(r.key)) continue;
    const checked = checkTiming(defOf(r.key), r.value);
    if (checked.ok) next.set(r.key, checked.value);
    else log.warn('ignoring a saved timing that fails its rules', { key: r.key, error: checked.error });
  }
  setOverrides(next);
}

let timer: NodeJS.Timeout | null = null;

/** Load now, then every `everyMs` (default 30 s). Safe to call twice. A failed refresh keeps the last good copy. */
export async function startTimingsRefresh(everyMs = 30_000): Promise<void> {
  await refreshTimings().catch((e) => log.warn('first timings load failed (using env/defaults)', { error: (e as Error).message }));
  if (timer) return;
  timer = setInterval(() => {
    refreshTimings().catch((e) => log.warn('timings refresh failed', { error: (e as Error).message }));
  }, everyMs);
  timer.unref?.();
}

export function stopTimingsRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
}

export type SaveResult = { ok: true; saved: string[] } | { ok: false; errors: Record<string, string> };

/** Validate every change first; save all or nothing. */
export async function saveTimings(changes: Record<string, unknown>, updatedBy: string | null): Promise<SaveResult> {
  const errors: Record<string, string> = {};
  const clean: Array<[string, TimingValue]> = [];
  for (const [key, raw] of Object.entries(changes)) {
    if (!isTimingKey(key)) { errors[key] = 'Unknown setting'; continue; }
    const checked = checkTiming(defOf(key), raw);
    if (checked.ok) clean.push([key, checked.value]);
    else errors[key] = checked.error;
  }
  if (Object.keys(errors).length || clean.length === 0) {
    return { ok: false, errors: clean.length === 0 && !Object.keys(errors).length ? { _: 'Nothing to save' } : errors };
  }
  await prisma.$transaction(
    clean.map(([key, value]) =>
      prisma.platformSetting.upsert({
        where: { key },
        create: { key, value: value as object, updatedBy },
        update: { value: value as object, updatedBy },
      }),
    ),
  );
  // Take effect on this server immediately; other servers pick it up on their next refresh.
  const next = new Map(getOverrides());
  for (const [key, value] of clean) next.set(key, value);
  setOverrides(next);
  return { ok: true, saved: clean.map(([k]) => k) };
}

/** Remove an override: the setting goes back to its environment value or the built-in default. */
export async function resetTiming(key: string): Promise<boolean> {
  if (!isTimingKey(key)) return false;
  await prisma.platformSetting.deleteMany({ where: { key } });
  const next = new Map(getOverrides());
  next.delete(key);
  setOverrides(next);
  return true;
}

export const timingKeys = () => TIMINGS.map((t) => t.key);
