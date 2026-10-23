/** How long after applying the "Just applied" badge may show. */
export const JUST_APPLIED_WINDOW_MS = 30 * 60_000;

/**
 * "Just applied" is only true right after the user applies. Once the window has passed it
 * must not linger (an application from hours ago is not "just" anything), so the badge is
 * dropped. Missing/unparseable/future timestamps hide it too — better no badge than a wrong one.
 */
export function isJustApplied(
  internalStatus: string | null | undefined,
  appliedAt: string | number | null | undefined,
  now: number = Date.now(),
): boolean {
  if ((internalStatus || 'just_applied') !== 'just_applied') return false;
  if (appliedAt == null || appliedAt === '') return false;
  const ts = typeof appliedAt === 'number' ? appliedAt : new Date(appliedAt).getTime();
  if (Number.isNaN(ts)) return false;
  const age = now - ts;
  return age >= -60_000 && age <= JUST_APPLIED_WINDOW_MS;
}
