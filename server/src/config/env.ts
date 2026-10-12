import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
}

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * A secret that must be real in production.
 *
 * These previously fell back to `'dev-access'` / `'dev-refresh'` — values that
 * are public in this repository. A missing env var in production meant the
 * server booted anyway with a known signing key, so anyone who read the source
 * could forge an admin token. Now it refuses to start.
 */
function secret(name: string, devFallback: string): string {
  const v = process.env[name];
  if (!IS_PROD) return v ?? devFallback;

  if (!v) throw new Error(`${name} must be set in production — refusing to start with a default secret`);
  if (v.length < 32) throw new Error(`${name} must be at least 32 characters (got ${v.length})`);
  if (v === devFallback || /^(change-?me|placeholder|secret|test)/i.test(v)) {
    throw new Error(`${name} is a placeholder value — set a real secret`);
  }
  return v;
}

// Access-token TTL may be written as plain seconds ("900") OR a duration string
// ("15m", "1h", "30s"). parseInt('15m') returns 15 — i.e. fifteen SECONDS — a
// real bug that expired access tokens in 15s (constant refresh, 401s on slow
// calls). Parse the unit explicitly; fall back to 900s (15 min) if unparseable.
function durationSeconds(v: string, fallback = 900): number {
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10); // bare number = seconds
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  let total = 0, matched = false;
  for (const m of s.matchAll(/(\d+)\s*([smhd])/gi)) { total += parseInt(m[1], 10) * units[m[2].toLowerCase()]; matched = true; }
  return matched ? total : fallback;
}

export const env = {
  port: parseInt(req('PORT', '4000'), 10),
  databaseUrl: req('DATABASE_URL'),
  jwtAccessSecret: secret('JWT_ACCESS_SECRET', 'dev-access'),
  jwtRefreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh'),
  accessTtl: durationSeconds(req('ACCESS_TTL', '900')), // seconds (accepts "900" or "15m")
  refreshTtlDays: parseInt(req('REFRESH_TTL_DAYS', '30'), 10),
  nodeEnv: req('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
  // Off by default: prints every request/response BODY (not just morgan's
  // method/path/status line) to stdout, sensitive fields redacted. Opt in
  // with DEBUG_HTTP_LOGS=true only while actively debugging — these bodies
  // include real PII (name, DOB, income, loan details, phone numbers).
  debugHttpLogs: process.env.DEBUG_HTTP_LOGS === 'true',
};
