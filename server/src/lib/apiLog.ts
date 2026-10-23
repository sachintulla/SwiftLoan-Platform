/**
 * API traffic log — persists every request/response between the app and this
 * API (inbound) and between this API and Aurix/KFT (outbound) to the `ApiLog`
 * table, powering the internal /logs page (see modules/logs.routes.ts).
 *
 * Writes are fire-and-forget: logging must never slow down or fail a real
 * request. Bodies are redacted for the usual sensitive keys (PAN, OTP, tokens,
 * password) and truncated, then kept for 24 hours only (startApiLogRetention).
 */
import type { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma.js';
import { scoped } from './log.js';

const log = scoped('api-log');

const RETENTION_MS = 24 * 60 * 60 * 1000; // keep the last 24 hours
const MAX_BODY = 20_000;                   // cap each stored body

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

/** Record one API log row. Fire-and-forget — never throws into the caller. */
export function recordApiLog(entry: ApiLogEntry): void {
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

/** Delete rows older than 24h. Runs on start and hourly thereafter. */
export async function pruneApiLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_MS);
  const { count } = await prisma.apiLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
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
