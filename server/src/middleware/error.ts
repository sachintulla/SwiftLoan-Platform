import type { Request, Response, NextFunction } from 'express';
import { scoped } from '../lib/log.js';

const log = scoped('error');

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (_req: Request, res: Response) =>
  res.status(404).json({ error: 'Not found' });

/**
 * Centralised error handler — never leaks stack in prod.
 *
 * Previously an HttpError (a validation failure, an auth rejection, a business
 * rule like "phone must be verified") was returned to the client but never
 * logged — only a genuinely unhandled exception was. That meant every 400/401
 * a caller saw was invisible on the server side; tracing "why did this
 * request fail" required reproducing it, not reading a log. Every thrown
 * error is now logged with the route it happened on, at a severity that
 * matches whether it's an expected rejection (4xx) or a real fault (5xx+).
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    const route = `${req.method} ${req.originalUrl}`;
    if (err.status >= 500) log.error(route, { status: err.status, message: err.message });
    else log.warn(route, { status: err.status, message: err.message });
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  log.error(`${req.method} ${req.originalUrl}`, { unhandled: true, error: String((err as Error)?.message ?? err) });
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
}

// Wrap async handlers so thrown errors reach errorHandler.
export const ah =
  <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
