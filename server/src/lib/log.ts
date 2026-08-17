/**
 * One consistent way to log a stage within a request's lifecycle, across every
 * route module. Before this, each file that logged at all invented its own
 * ad-hoc `console.log('[some-tag] ...')` convention (leadCaller.ts,
 * immediateCallback.ts, webhooks.routes.ts) and most files logged nothing —
 * so tracing what actually happened for a given request meant reading code,
 * not logs.
 *
 * Deliberately console.* under the hood, not a new logging dependency: this
 * is a small service, morgan already covers the HTTP access-log layer (see
 * app.ts), and every environment here already reads stdout/stderr (local
 * terminal, `docker logs` on the dev/prod boxes). A structured/shipped logger
 * is worth adding the day these logs need to go somewhere queryable — not
 * before.
 *
 * Usage: const log = scoped('otp'); log.info('sent', { phone });
 * Never pass a full OTP code, password, token, card/account number, or PAN —
 * these are meant to be safe to leave in plaintext logs indefinitely.
 */
export interface ScopedLog {
  info: (stage: string, meta?: Record<string, unknown>) => void;
  warn: (stage: string, meta?: Record<string, unknown>) => void;
  error: (stage: string, meta?: Record<string, unknown>) => void;
}

function fmt(scope: string, stage: string, meta?: Record<string, unknown>): unknown[] {
  const tag = `[${scope}]`;
  return meta && Object.keys(meta).length ? [tag, stage, meta] : [tag, stage];
}

export function scoped(scope: string): ScopedLog {
  return {
    info: (stage, meta) => console.log(...fmt(scope, stage, meta)),
    warn: (stage, meta) => console.warn(...fmt(scope, stage, meta)),
    error: (stage, meta) => console.error(...fmt(scope, stage, meta)),
  };
}
