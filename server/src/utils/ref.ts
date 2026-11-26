import crypto from 'node:crypto';

// Human-friendly loan/application reference, e.g. SL-884021. Six random digits: 900,000 possible numbers, so as rows grow a new
// one can land on a number already used (2 failed application creates on prod on 22 Nov 2026, "Unique constraint failed on ref").
// Every create that uses one goes through `withFreshRef`, which draws a new number and tries again.
export const makeRef = (prefix = 'SL') => `${prefix}-${crypto.randomInt(100000, 999999)}`;

/** `n` references, all different from each other (for rows created together, e.g. a repayment schedule). */
export function makeRefs(n: number, prefix = 'SL'): string[] {
  const out = new Set<string>();
  while (out.size < n) out.add(makeRef(prefix));
  return [...out];
}

/** True when a database error is a clash on a `ref` column (Prisma P2002 naming the field `ref`). */
export function isRefClash(e: unknown): boolean {
  const err = e as { code?: string; meta?: { target?: unknown } } | null;
  if (err?.code !== 'P2002') return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((f) => f === 'ref' || /_ref_key$/.test(f));
}

/**
 * Run a create that draws its own reference(s) with makeRef/makeRefs, and run it again (with new numbers) if a reference was
 * already taken. Any other error, or a clash on the last attempt, is thrown as before.
 */
export async function withFreshRef<T>(create: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await create();
    } catch (e) {
      if (i >= attempts || !isRefClash(e)) throw e;
    }
  }
}
