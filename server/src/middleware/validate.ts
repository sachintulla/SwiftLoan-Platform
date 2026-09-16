import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { HttpError } from './error.js';

// Validate req.body against a Zod schema and replace it with the parsed value.
//
// Every caller across the app shows `HttpError.message` straight in a toast
// (saveProfile, changeLang, changeNotif, ...) — this used to always be the
// literal string "Validation failed" with the actual reason buried in
// `details.fieldErrors`, which nothing ever read. A user typing a malformed
// email saw "Validation failed" with no way to tell what was wrong or which
// field to fix. The message is now built from the first real field error
// (or the first whole-body error, e.g. an unrecognized key on a .strict()
// schema) — "email: Invalid email" instead of an opaque dead end — while
// `details` still carries the full flattened error for anything that wants
// to highlight a specific field.
export const validate =
  (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flat = result.error.flatten();
      const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined>;
      const [field, msgs] = Object.entries(fieldErrors).find(([, m]) => m && m.length) ?? [];
      const message = field && msgs
        ? `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${msgs[0]}`
        : flat.formErrors[0] || 'Validation failed';
      throw new HttpError(400, message, flat);
    }
    req.body = result.data;
    next();
  };
