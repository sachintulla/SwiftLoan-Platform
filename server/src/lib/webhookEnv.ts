/**
 * A short label identifying WHICH environment received an inbound partner
 * webhook (Aurix/KFT, Yubi). Logged on every receipt so a mis-registered
 * callback URL — a UAT lender posting to prod, or the reverse — is obvious at a
 * glance in the logs / Admin, instead of surfacing as a silent "no matching
 * application".
 *
 * Prefers an explicit APP_ENV when set; otherwise falls back to the public host
 * (from PUBLIC_BASE_URL) and NODE_ENV, which already differ per deployment.
 */
export function webhookEnvTag(reqHost?: string | null): { env: string; host: string | null } {
  const appEnv = process.env.APP_ENV?.trim();
  const nodeEnv = process.env.NODE_ENV || 'development';
  let host: string | null = reqHost ?? null;
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    try { host = new URL(base).host; } catch { host = base; }
  }
  return { env: appEnv || nodeEnv, host };
}
