import type { Request, Response, NextFunction } from 'express';
import { verifyAdminAccess, AdminAccessPayload } from '../lib/adminJwt.js';
import { HttpError } from './error.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { admin?: AdminAccessPayload; }
  }
}

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

// Restrict a route to specific admin roles.
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin || !roles.includes(req.admin.role)) throw new HttpError(403, 'Insufficient permissions');
    next();
  };
}
