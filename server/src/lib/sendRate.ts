/**
 * Pacing for outbound WhatsApp (pure: no database or network, unit-tested in sendRate.test.ts).
 *
 * Vox accepts up to 2,500 WhatsApp sends a minute (Vox support, 23 Nov 2026). The drop-off job used to send every message that
 * fell due at 7 AM one after another, as fast as Vox answered (about 4 a second), and nothing stopped a bigger batch from going
 * past Vox's limit. Now:
 *   - `createRateGate`  : at most N sends in any 60-second window (Admin → Timings → `limits.whatsappPerMinute`, default 1,000).
 *                         A send over the limit WAITS for the next free slot; it is never dropped.
 *   - `runPool`         : works a list several at a time (`limits.whatsappParallel`), so 1,000 a minute is actually reachable.
 *   - `isThrottled`     : the provider said "too fast" (HTTP 429, or Meta's 130429/80007). The caller retries that message later
 *                         instead of recording it as failed.
 */

export interface RateGate {
  /** Resolves when one more send fits inside the limit. */
  acquire(): Promise<void>;
  /** Sends counted in the current window (tests / diagnostics). */
  inWindow(): number;
}

export interface RateGateDeps {
  /** Read on every call, so an admin change applies at once. A value below 1 counts as 1. */
  perMinute: () => number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  windowMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A sliding one-minute window of send times. Callers that do not fit wait (in order) until the oldest send leaves the window. */
export function createRateGate(deps: RateGateDeps): RateGate {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const windowMs = deps.windowMs ?? 60_000;
  const stamps: number[] = [];
  // One waiter at a time works out its slot, so concurrent callers cannot all take the same free slot.
  let queue: Promise<void> = Promise.resolve();

  const prune = (t: number) => { while (stamps.length && stamps[0] <= t - windowMs) stamps.shift(); };

  const take = async () => {
    for (;;) {
      const t = now();
      prune(t);
      const limit = Math.max(1, Math.floor(deps.perMinute() || 1));
      if (stamps.length < limit) { stamps.push(t); return; }
      // Wait until enough of the oldest sends leave the window (the limit may have been lowered meanwhile).
      const oldest = stamps[stamps.length - limit];
      await sleep(Math.max(1, oldest + windowMs - t));
    }
  };

  return {
    acquire() {
      const next = queue.then(take);
      queue = next.catch(() => undefined);
      return next;
    },
    inWindow() { prune(now()); return stamps.length; },
  };
}

/** Run `fn` over `items`, at most `parallel` at a time. A failing item never stops the others (each fn handles its own errors). */
export async function runPool<T>(items: readonly T[], parallel: number, fn: (item: T) => Promise<void>): Promise<void> {
  const n = Math.max(1, Math.min(Math.floor(parallel || 1), items.length || 1));
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
}

/** True when the provider refused the send for going too fast, so it should be tried again shortly, not counted as failed. */
export function isThrottled(httpStatus: number, body: unknown): boolean {
  if (httpStatus === 429) return true;
  const b = (body ?? {}) as Record<string, any>;
  const code = String(b?.error?.code ?? b?.code ?? b?.errorCode ?? '');
  // Meta Cloud API: 130429 = throughput reached, 80007 = rate limit hit, 4 / 613 = app/API call rate limits.
  if (['130429', '80007', '4', '613'].includes(code)) return true;
  const text = `${b?.message ?? ''} ${b?.error?.message ?? ''}`.toLowerCase();
  return /rate.?limit|too many requests|throttl/.test(text);
}
