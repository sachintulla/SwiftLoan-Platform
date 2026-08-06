import type { Request, Response, NextFunction } from 'express';
import { verifyAdminAccess, AdminAccessPayload } from '../lib/adminJwt.js';
import { HttpError } from './error.js';
import { prisma } from '../lib/prisma.js';
import { isIdleExpired, touchActivity, writeAuditLog } from '../lib/adminSecurity.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { admin?: AdminAccessPayload; }
  }
}

/** Routes still reachable while a forced password change is outstanding. */
const ALLOWED_WHILE_PASSWORD_PENDING = [
  '/api/admin/auth/change-password',
  '/api/admin/auth/me',
  '/api/admin/auth/logout',
];

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Missing admin bearer token');
  try {
    req.admin = verifyAdminAccess(token);
    next();
  } catch {
    throw new HttpError(401, 'Invalid or expired admin token');
  }
}

/**
 * Account-state checks that need the database: still active, not idle, and no
 * outstanding forced password change.
 *
 * Kept separate from `requireAdmin` (which only validates the JWT) so the token
 * check stays synchronous, and so a deactivated admin loses access immediately
 * rather than when their 15-minute access token happens to expire.
 */
export async function requireActiveAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.admin) throw new HttpError(401, 'Not authenticated');

  const admin = await prisma.adminUser.findUnique({
    where: { id: req.admin.sub },
    select: { id: true, active: true, lastActivityAt: true, mustChangePassword: true },
  });
  if (!admin || !admin.active) throw new HttpError(401, 'Account is disabled');

  if (isIdleExpired(admin.lastActivityAt)) {
    // Cleared so the next sign-in starts a fresh window instead of instantly
    // re-expiring.
    await prisma.adminUser
      .update({ where: { id: admin.id }, data: { lastActivityAt: null } })
      .catch(() => undefined);
    throw new HttpError(440, 'Session timed out due to inactivity — please sign in again');
  }

  const path = req.originalUrl.split('?')[0];
  if (admin.mustChangePassword && !ALLOWED_WHILE_PASSWORD_PENDING.includes(path)) {
    throw new HttpError(428, 'Password change required before continuing');
  }

  void touchActivity(admin.id);
  next();
}

/**
 * Restrict a route to specific admin roles.
 *
 * This existed before but was applied nowhere, so an `analyst` could delete
 * campaigns and rewrite integration API keys.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      throw new HttpError(403, `This action requires one of: ${roles.join(', ')}`);
    }
    next();
  };
}

/** May change operational state (campaigns, customers, rules). */
export const CAN_WRITE = ['super_admin', 'admin'];
/** May touch credentials, admin accounts and anything that spends money. */
export const CAN_ADMINISTER = ['super_admin'];

/**
 * Record every state-changing admin request once its status is known.
 *
 * Runs on `finish` rather than inline so the entry carries the real status
 * code — a rejected attempt is as worth recording as a successful one.
 */
export function auditAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  res.on('finish', () => {
    void writeAuditLog(req, res.statusCode);
  });
  next();
}
