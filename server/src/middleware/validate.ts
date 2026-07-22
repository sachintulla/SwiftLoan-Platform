import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { HttpError } from './error.js';

// Validate req.body against a Zod schema and replace it with the parsed value.
export const validate =
  (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw new HttpError(400, 'Validation failed', result.error.flatten());
    }
    req.body = result.data;
    next();
  };
