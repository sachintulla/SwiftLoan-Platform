import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { HttpError } from './error.js';

/**
 * CSRF defense-in-depth for the cookie-authenticated website routes
 * (/api/website/auth/refresh + /logout).
 *
 * The session cookie (sl_web_refresh) is already httpOnly + Secure + SameSite=Lax
 * and path-scoped, so a browser will not attach it to any cross-site POST — which
 * is the real CSRF mitigation. This guard adds a second, independent check: a
 * state-changing request must carry an Origin (or, failing that, a Referer) whose
 * origin is on the allow-list (env.websiteOrigins). Non-mutating methods (GET /
 * HEAD / OPTIONS) are never guarded. The legitimate caller is the website SPA,
 * which always sends its own Origin, so this never blocks real traffic.
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The origin ("scheme://host[:port]") of a URL string, or null if unparseable. */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Pure decision: is this request's claimed origin acceptable? Returns an outcome
 * so it can be unit-tested without Express. Only mutating methods are checked.
 */
export function originAllowed(
  method: string,
  origin: string | undefined,
  referer: string | undefined,
  allowed: readonly string[],
): { ok: true } | { ok: false; reason: string } {
  if (!MUTATING.has(method.toUpperCase())) return { ok: true };
  const claimed = originOf(origin) ?? originOf(referer);
  if (!claimed) return { ok: false, reason: 'no Origin or Referer header' };
  if (!allowed.includes(claimed)) return { ok: false, reason: `origin ${claimed} not allowed` };
  return { ok: true };
}

/** Express middleware wrapping originAllowed against env.websiteOrigins. */
export function requireKnownOrigin(req: Request, _res: Response, next: NextFunction) {
  const verdict = originAllowed(
    req.method,
    req.get('origin') ?? undefined,
    req.get('referer') ?? undefined,
    env.websiteOrigins,
  );
  if (!verdict.ok) throw new HttpError(403, 'Request blocked (cross-site)');
  next();
}
