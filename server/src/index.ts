import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { startJobs, stopJobs } from './jobs/tracking.jobs.js';

const app = createApp();
const server = app.listen(env.port, () => {
  console.log(`[swiftloan-api] listening on http://localhost:${env.port}  (${env.nodeEnv})`);
  // WS4 maintenance jobs (idle sessions, stale loans/onboarding, notifications).
  startJobs().catch((e) => console.warn('[jobs] failed to start:', e?.message));
});

/** Hard deadline for a clean stop before we give up and exit anyway. */
const SHUTDOWN_TIMEOUT_MS = 15_000;
let shuttingDown = false;

// Graceful shutdown (scalability / clean container stops).
async function shutdown(sig: string) {
  if (shuttingDown) return; // a second signal must not re-enter
  shuttingDown = true;
  console.log(`\n[swiftloan-api] ${sig} received, shutting down…`);
  stopJobs();

  // Without a deadline, one lingering keep-alive connection means server.close()
  // never fires its callback, the process hangs, and the orchestrator SIGKILLs
  // us — potentially mid-write, with contacts left marked `queued` and no call
  // placed. Better to force the exit ourselves after a bounded wait.
  const forced = setTimeout(() => {
    console.error('[swiftloan-api] shutdown timed out — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forced.unref();

  server.close(async () => {
    await prisma.$disconnect().catch(() => undefined);
    clearTimeout(forced);
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// An unhandled rejection leaves the process in an unknown state; log loudly
// rather than letting Node's default kill it silently.
process.on('unhandledRejection', (reason) => {
  console.error('[swiftloan-api] unhandled rejection:', reason);
});
