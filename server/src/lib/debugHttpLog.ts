/**
 * Opt-in verbose HTTP logging — prints every request/response BODY (not just
 * morgan's method/path/status line) to stdout, so it shows up wherever the
 * process's own output is already being watched (pm2 logs, docker logs -f,
 * journalctl -f, a plain foreground terminal). Gated behind
 * env.debugHttpLogs (DEBUG_HTTP_LOGS=true) — never on by default, since these
 * bodies carry real PII (name, DOB, income, loan details, phone numbers,
 * OTPs). Sensitive field names are redacted regardless.
 */
import type { Request, Response, NextFunction } from 'express';

// Exact key names (case-insensitive), not a substring match — a loose
// `/pan/i` regex also caught `panOnFile` (a harmless boolean), redacting data
// that wasn't sensitive at all. `.toLowerCase()` on the actual key is checked
// against this set instead.
const SENSITIVE_KEYS = new Set([
  'pan', 'pannumber', 'aadhaar', 'aadhaarlast4', 'aadhaarnumber',
  'password', 'passwordhash', 'otp', 'otpcode', 'code', 'codehash',
  'token', 'accesstoken', 'refreshtoken', 'idtoken', 'secret', 'apikey',
  'api_key', 'cvv', 'pin', 'authorization',
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : redact(v);
    }
    return out;
  }
  return value;
}

function short(value: unknown, max = 2000): string {
  const s = JSON.stringify(value);
  if (!s) return String(s);
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
}

export function debugHttpLog() {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      console.log(
        `[debug-http] ${req.method} ${req.originalUrl} req=${short(redact(req.body))} -> ${res.statusCode} res=${short(redact(body))}`,
      );
      return originalJson(body);
    };
    next();
  };
}
