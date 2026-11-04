/**
 * LOCAL TEST ONLY: runs just the website install-reminder job once a minute against the database in .env, while the
 * server itself runs with NUDGES_DISABLED=true (so no other job — calls, WhatsApp drop-offs, stall rules — runs).
 *   cd server && node --env-file=.env --import tsx scripts/local-install-reminder-runner.mts
 */
import { startTimingsRefresh } from '../src/lib/timingsStore.js';
import { installReminderTick } from '../src/lib/installReminder.js';
import { prisma } from '../src/lib/prisma.js';
import { trustExtraCaForFetch } from '../src/lib/devCa.js';

const url = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error('refusing: DATABASE_URL is not a local database');
  process.exit(1);
}

// Same as src/index.ts: behind a TLS-inspecting proxy, outbound fetch (Vox) needs the extra CA from .env.
await trustExtraCaForFetch();
await startTimingsRefresh(15_000);

async function tick() {
  const out = await installReminderTick(new Date());
  const rows = await prisma.journeyReminder.findMany({
    where: { status: 'active' }, select: { phone: true, lastStep: true, unverified: true, droppedAt: true, stepsSent: true, history: true, nextCheckAt: true },
  });
  console.log(new Date().toISOString(), JSON.stringify(out), JSON.stringify(rows));
}

await tick();
setInterval(() => void tick().catch((e) => console.error('tick failed', e)), 60_000);
