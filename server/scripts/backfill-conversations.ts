/**
 * Backfill existing CallAttempt rows into the conversation memory.
 *
 *   npm run conversations:backfill
 *   npm run conversations:backfill -- --dry
 *
 * New calls are mirrored automatically by the webhook, but calls placed before
 * WS10 existed are invisible to the agents — which defeats the point on day one,
 * since the whole feature is about remembering what already happened.
 *
 * Idempotent: keyed on `providerConversationId`, using the same
 * `call:<attemptId>` fallback the webhook uses for calls Ello never gave an id.
 */
import { prisma } from '../src/lib/prisma.js';
import { recordConversation, rebuildSummary } from '../src/lib/conversations.js';
import { normalisePhone } from '../src/lib/dialer.js';

const DRY = process.argv.includes('--dry');

async function main() {
  const attempts = await prisma.callAttempt.findMany({ orderBy: { queuedAt: 'asc' } });
  console.log(`${attempts.length} call attempt(s) found${DRY ? ' (dry run)' : ''}`);

  let written = 0;
  let skipped = 0;
  const phones = new Set<string>();

  for (const a of attempts) {
    const phone = normalisePhone(a.phone);
    if (!phone) { skipped++; continue; }

    if (DRY) { phones.add(phone); written++; continue; }

    try {
      await recordConversation({
        phone,
        channel: 'phone_outbound',
        agentRole: a.campaignId ? 'campaign' : 'leadCallback',
        providerConversationId: a.providerCallId ?? `call:${a.id}`,
        callAttemptId: a.id,
        customerId: a.customerId,
        summary: a.summary,
        transcript: a.transcript,
        outcome: a.outcome,
        outcomeSource: a.outcomeSource,
        recordingUrl: a.recordingUrl,
        startedAt: a.dialedAt ?? a.queuedAt,
        endedAt: a.completedAt,
        durationSec: a.durationSec,
        details:
          a.incomeRange || a.employment || a.preferredChannel
            ? {
                incomeRange: a.incomeRange ?? null,
                employment: a.employment ?? null,
                preferredChannel: a.preferredChannel ?? null,
              }
            : null,
      });
      phones.add(phone);
      written++;
    } catch (e) {
      console.warn(`  skip ${a.id}: ${(e as Error).message}`);
      skipped++;
    }
  }

  // recordConversation already rebuilds per write; doing it once more per number
  // at the end is cheap insurance against a mid-loop failure leaving a stale brief.
  if (!DRY) {
    for (const p of phones) await rebuildSummary(p).catch(() => undefined);
  }

  console.log(`\nwritten: ${written}  skipped: ${skipped}  distinct numbers: ${phones.size}`);
  if (!DRY) {
    const total = await prisma.conversationSummary.count();
    console.log(`ConversationSummary rows now: ${total}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
