import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
}

export const env = {
  port: parseInt(req('PORT', '4000'), 10),
  databaseUrl: req('DATABASE_URL'),
  jwtAccessSecret: req('JWT_ACCESS_SECRET', 'dev-access'),
  jwtRefreshSecret: req('JWT_REFRESH_SECRET', 'dev-refresh'),
  accessTtl: parseInt(req('ACCESS_TTL', '900'), 10), // seconds
  refreshTtlDays: parseInt(req('REFRESH_TTL_DAYS', '30'), 10),
  nodeEnv: req('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
};
