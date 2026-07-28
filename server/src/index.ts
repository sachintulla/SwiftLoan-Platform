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

// Graceful shutdown (scalability / clean container stops).
async function shutdown(sig: string) {
  console.log(`\n[swiftloan-api] ${sig} received, shutting down…`);
  stopJobs();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
