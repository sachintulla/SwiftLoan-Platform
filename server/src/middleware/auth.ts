import type { Request, Response, NextFunction } from 'express';
import { verifyAccess, AccessPayload } from '../lib/jwt.js';
import { HttpError } from './error.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AccessPayload; }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Missing bearer token');
  try {
    req.user = verifyAccess(token);
    next();
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
}
