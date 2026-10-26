/**
 * Notices the one failure the agent cannot report about itself: the server has gone quiet while the user is
 * clearly talking to it. (Seen live: after a barge-in the Ello session sent nothing for 30+ s — no transcript, no
 * audio, no error, no socket close — while the phone kept streaming a perfectly good microphone.)
 *
 * Pure bookkeeping, no timers of its own: the agent feeds it mic loudness and server frames and asks `check()`
 * every few seconds. `check()` returns true at most once per `cooldownMs`, when
 *   • the user was LOUD (a real utterance, not room noise) at least twice in the last `windowMs`, and
 *   • the server has sent nothing at all for `silentMs`.
 */
export interface StallDetectorOptions {
  /** Server silence that counts as a stall (ms). */
  silentMs: number;
  /** How far back a loud mic chunk still counts as "the user is talking" (ms). */
  windowMs: number;
  /** Mic peak (0..32767) above which a chunk counts as speech. */
  loudPeak: number;
  /** Minimum gap between two reports (ms). */
  cooldownMs: number;
}

export const DEFAULT_STALL_OPTIONS: StallDetectorOptions = { silentMs: 15000, windowMs: 12000, loudPeak: 2500, cooldownMs: 30000 };

/** Seconds of mutual quiet (nothing from the server, nothing from the user) before the agent is asked to check in. */
export const IDLE_CHECKIN_AFTER_MS = 15000;
/** Gap between two check-ins in the same quiet stretch, and how many it may make. */
export const IDLE_CHECKIN_GAP_MS = 20000;
export const IDLE_CHECKIN_MAX = 2;

export class StallDetector {
  private lastServerAt = 0;
  private loudAt: number[] = [];
  private lastReportAt = -Infinity;
  private checkins = 0;
  private lastCheckinAt = -Infinity;

  constructor(private readonly opts: StallDetectorOptions = DEFAULT_STALL_OPTIONS) {}

  /** A new call: forget everything. */
  reset(now: number): void {
    this.lastServerAt = now;
    this.loudAt = [];
    this.lastReportAt = -Infinity;
    this.checkins = 0;
    this.lastCheckinAt = -Infinity;
  }

  /** Any frame from the server counts (audio, transcript, tool call, ack…). */
  noteServerFrame(now: number): void {
    this.lastServerAt = now;
  }

  /** The user did something (spoke, or the agent acted on what they said): a later quiet stretch starts afresh. */
  noteUserActivity(): void {
    this.checkins = 0;
  }

  /** One mic chunk's loudest sample. */
  noteMicPeak(now: number, peak: number): void {
    if (peak < this.opts.loudPeak) return;
    this.checkins = 0;
    this.loudAt.push(now);
    if (this.loudAt.length > 50) this.loudAt.shift();
  }

  /**
   * Both sides have been quiet for a while (the agent finished, the user has said nothing): returns the seconds of
   * quiet when the agent should be asked to check in, otherwise null. At most IDLE_CHECKIN_MAX times per stretch.
   */
  idleCheck(now: number): number | null {
    if (this.checkins >= IDLE_CHECKIN_MAX) return null;
    if (now - this.lastCheckinAt < IDLE_CHECKIN_GAP_MS) return null;
    if (now - this.lastServerAt < IDLE_CHECKIN_AFTER_MS) return null;
    if (this.loudAt.some(t => now - t <= IDLE_CHECKIN_AFTER_MS)) return null; // the user is talking: that is a stall, not quiet
    this.checkins++;
    this.lastCheckinAt = now;
    return Math.round((now - this.lastServerAt) / 1000);
  }

  /** True when the server looks stalled right now (and only once per cooldown). */
  check(now: number): boolean {
    if (now - this.lastReportAt < this.opts.cooldownMs) return false;
    if (now - this.lastServerAt < this.opts.silentMs) return false;
    const recentLoud = this.loudAt.filter(t => now - t <= this.opts.windowMs).length;
    if (recentLoud < 2) return false;
    this.lastReportAt = now;
    return true;
  }
}

/** Loudest sample in a base64 PCM16 chunk, sampled sparsely (cheap enough to run on every 40 ms chunk). */
export function peakOfPcm16Base64(b64: string): number {
  let bin: string;
  try {
    bin = (globalThis as { atob?: (s: string) => string }).atob?.(b64) ?? '';
  } catch {
    return 0;
  }
  let peak = 0;
  for (let i = 0; i + 1 < bin.length; i += 8) {
    // little-endian signed 16-bit
    let v = bin.charCodeAt(i) | (bin.charCodeAt(i + 1) << 8);
    if (v > 32767) v -= 65536;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  return peak;
}
