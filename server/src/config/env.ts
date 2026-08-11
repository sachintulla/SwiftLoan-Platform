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

export const env = {
  port: parseInt(req('PORT', '4000'), 10),
  databaseUrl: req('DATABASE_URL'),
  jwtAccessSecret: secret('JWT_ACCESS_SECRET', 'dev-access'),
  jwtRefreshSecret: secret('JWT_REFRESH_SECRET', 'dev-refresh'),
  accessTtl: parseInt(req('ACCESS_TTL', '900'), 10), // seconds
  refreshTtlDays: parseInt(req('REFRESH_TTL_DAYS', '30'), 10),
  nodeEnv: req('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
};
