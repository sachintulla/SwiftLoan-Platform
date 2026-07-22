import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (_req: Request, res: Response) =>
  res.status(404).json({ error: 'Not found' });

// Centralised error handler — never leaks stack in prod.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
}

// Wrap async handlers so thrown errors reach errorHandler.
export const ah =
  <T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
