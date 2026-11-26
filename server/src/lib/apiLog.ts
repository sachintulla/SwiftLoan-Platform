/**
 * API failure log: persists every FAILED request/response between the app/website/webhooks and this API (inbound) and
 * between this API and the partners (outbound) to the `ApiLog` table, powering Admin → API & Webhook Errors and the
 * internal /logs page (see modules/logs.routes.ts).
 *
 * Only failures are saved (owner, 2026-11-23): a 4xx/5xx answer, a call that got no answer, or one that reported an
 * error (`isFailedCall`). Successes were ~95% of the rows and nobody read them. Failures are kept for
 * `tracking.apiLogKeepDays` (Admin → Timings, default 30) so an old failure can still be looked up.
 *
 * Writes are fire-and-forget: logging must never slow down or fail a real
 * request. Bodies are redacted for the usual sensitive keys (PAN, OTP, tokens,
 * password) and truncated.
 */
import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { scoped } from './log.js';
import { timing } from './timings.js';

const log = scoped('api-log');

const MAX_BODY = 20_000;                   // cap each stored body

/**
 * A call worth keeping: refused or broken (HTTP 400 and up), no answer at all (status missing or 0: a timeout or network
 * failure), or one the caller marked with an error. Same rule as the API errors page (apiErrors.ts IS_ERROR).
 */
export function isFailedCall(e: { status?: number | null; error?: string | null }): boolean {
  if (e.error) return true;
  return e.status == null || e.status === 0 || e.status >= 400;
}

/** Rows that are NOT failures (saved before only failures were kept); the clean-up removes them. */
const NOT_FAILED: Prisma.ApiLogWhereInput = { AND: [{ status: { gt: 0, lt: 400 } }, { error: null }] };

// Exact key names (case-insensitive) whose values are replaced with
// "[redacted]" — same set the debug-http logger uses, so PII never lands in
// the log table in plaintext.
const SENSITIVE_KEYS = new Set([
  'pan', 'pannumber', 'aadhaar', 'aadhaarlast4', 'aadhaarnumber',
  'password', 'passwordhash', 'otp', 'otpcode', 'code', 'codehash',
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'secret', 'apikey',
  'api_key', 'cvv', 'pin', 'authorization', 'prefill', 'maskedaadhaar',
  // Personal data + short-lived partner credentials
  'phone', 'mobile', 'mobilenumber', 'email', 'emailid', 'dob', 'dateofbirth', 'fullname',
  'firstname', 'middlename', 'lastname', 'addressline1', 'addressline2',
  // Partner-body variants (Revasure flat snake_case uses `pancard`/`email_id` etc;
  // separators are stripped before matching, so mobile_number/full_name/date_of_birth all hit).
  'pancard',
  'redirecturl', 'redirectionurl', 'rawauth', 'rawcreate', 'xapikey',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Normalise key before matching: lowercase and drop separators so snake_case
      // (mobile_number), camelCase and PascalCase all collapse to the same token.
      const norm = k.toLowerCase().replace(/[_-]/g, '');
      out[k] = SENSITIVE_KEYS.has(norm) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

/** Serialise a body to a string (JSON when possible), redacted + truncated. */
export function serialiseBody(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(redact(value));
  } catch {
    s = String(value);
  }
  return s.length > MAX_BODY ? `${s.slice(0, MAX_BODY)}…(truncated)` : s;
}

export interface ApiLogEntry {
  direction: 'inbound' | 'outbound';
  source: string;
  target: string;
  method: string;
  url: string;
  status?: number | null;
  durationMs?: number | null;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string | null;
  meta?: Record<string, unknown> | null;
}

/** Record one API log row if the call failed (successes are not kept). Fire-and-forget — never throws into the caller. */
export function recordApiLog(entry: ApiLogEntry): void {
  if (!isFailedCall(entry)) return;
  // Wrap the whole call: a missing client/model (tests that mock prisma without
  // apiLog, a stale generated client) throws synchronously on the property access,
  // which .catch() can't swallow. This logger must never affect its callers.
  try {
    const p = prisma.apiLog?.create({
      data: {
        direction: entry.direction,
        source: entry.source,
        target: entry.target,
        method: entry.method,
        url: entry.url,
        status: entry.status ?? null,
        durationMs: entry.durationMs ?? null,
        requestBody: serialiseBody(entry.requestBody),
        responseBody: serialiseBody(entry.responseBody),
        error: entry.error ?? null,
        meta: (entry.meta ?? undefined) as any,
      },
    });
    if (p && typeof p.catch === 'function') {
      p.catch((err: unknown) => log.warn('write failed', { error: (err as Error)?.message }));
    }
  } catch (err) {
    log.warn('write failed', { error: (err as Error)?.message });
  }
}

/** List recent log rows for the /logs page. */
export async function listApiLogs(opts: {
  limit?: number; direction?: 'inbound' | 'outbound'; target?: string; q?: string;
} = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  const where: any = {};
  if (opts.direction) where.direction = opts.direction;
  if (opts.target) where.target = opts.target;
  if (opts.q) where.url = { contains: opts.q, mode: 'insensitive' };
  return prisma.apiLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
}

/**
 * Delete failures older than `tracking.apiLogKeepDays` (default 30), and any successful call (rows saved before only
 * failures were kept). Runs on start and hourly thereafter.
 */
export async function pruneApiLogs(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - timing.daysMs('tracking.apiLogKeepDays'));
  const { count } = await prisma.apiLog.deleteMany({ where: { OR: [{ createdAt: { lt: cutoff } }, NOT_FAILED] } });
  if (count) log.info('pruned', { removed: count });
  return count;
}

let retentionTimer: ReturnType<typeof setInterval> | null = null;
export function startApiLogRetention(): void {
  if (retentionTimer) return;
  pruneApiLogs().catch(() => {});
  retentionTimer = setInterval(() => pruneApiLogs().catch(() => {}), 60 * 60 * 1000);
  if (typeof retentionTimer.unref === 'function') retentionTimer.unref();
}
export function stopApiLogRetention(): void {
  if (retentionTimer) { clearInterval(retentionTimer); retentionTimer = null; }
}

// Paths not worth logging (the logs page itself, health checks) — skip them so
// the table isn't flooded with self-referential noise.
const SKIP = [/^\/logs\b/, /^\/api\/logs\b/, /^\/api\/health\b/, /^\/api\/ready\b/, /favicon/];

/**
 * Express middleware — records each inbound API request + its response.
 * Mounted app-wide; captures direction "inbound" (app → swiftloan-api).
 * Hooks res.json AND res.send so non-JSON responses — redirects (/dl?ref=),
 * HTML, plain text, 204s — are logged too, not just JSON handlers. The actual
 * write happens once on 'finish' so res.json→res.send delegation can't double-log.
 */
export function apiLogMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (SKIP.some(rx => rx.test(req.originalUrl))) return next();
    const startedAt = Date.now();
    let captured: unknown;
    let haveBody = false;

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      captured = body; haveBody = true;
      return originalJson(body);
    };
    const originalSend = res.send.bind(res);
    res.send = (body: unknown) => {
      // res.json/res.redirect delegate to res.send — keep the first (parsed) body.
      if (!haveBody) { captured = body; haveBody = true; }
      return originalSend(body);
    };

    let recorded = false;
    res.on('finish', () => {
      if (recorded) return;
      recorded = true;
      const location = res.getHeader('location');
      recordApiLog({
        direction: 'inbound',
        source: 'app',
        target: 'swiftloan-api',
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        requestBody: req.body,
        responseBody: haveBody ? captured : undefined,
        meta: location ? { redirect: String(location) } : undefined,
      });
    });
    next();
  };
}
