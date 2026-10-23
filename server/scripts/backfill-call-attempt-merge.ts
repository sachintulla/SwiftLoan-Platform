/**
 * One-time backfill for the CallAttempt -> Conversation merge (see
 * prisma/migrations/20260819120338_merge_call_attempt_into_conversation).
 * Run once, against a database that still has the old CallAttempt table (it
 * hasn't been dropped yet), after Conversation's new columns have been added.
 *
 * The two old tables were never linked by a real foreign key — Conversation's
 * `callAttemptId` was always null in practice, because the webhook that would
 * have set it (POST /api/webhooks/ello/call-outcome) has never once fired.
 * The only conversations we actually have came from the agent's
 * `save_conversation` tool call, which carries no id linking it back to the
 * CallAttempt it belongs to. So each CallAttempt is matched here to the
 * closest unclaimed Conversation for the same phone within a generous time
 * window; anything left unmatched (failed/never-answered calls, which never
 * got a save_conversation call at all) becomes its own new row.
 */
import { prisma } from '../src/lib/prisma.js';

interface OldCallAttempt {
  id: string;
  customerId: string;
  campaignId: string | null;
  phone: string;
  providerCallId: string | null;
  status: string;
  outcome: string | null;
  outcomeSource: string | null;
  outcomeEvidence: string | null;
  summary: string | null;
  incomeRange: string | null;
  employment: string | null;
  preferredChannel: string | null;
  callbackAt: Date | null;
  callContext: unknown;
  transcript: unknown;
  recordingUrl: string | null;
  durationSec: number | null;
  answered: boolean;
  attempt: number;
  error: string | null;
  rawPayload: unknown;
  queuedAt: Date;
  dialedAt: Date | null;
  completedAt: Date | null;
}

// Match window: save_conversation fires within seconds of a call ending, and
// a website form + immediate-callback dial can be minutes apart from the
// conversation that resulted — 15 minutes comfortably covers every real
// pairing seen in this database without risking a false match across two
// genuinely different calls to the same number.
const MATCH_WINDOW_MS = 15 * 60_000;

async function main() {
  const attempts = await prisma.$queryRaw<OldCallAttempt[]>`
    SELECT id, "customerId", "campaignId", phone, "providerCallId", status, outcome,
           "outcomeSource", "outcomeEvidence", summary, "incomeRange", employment,
           "preferredChannel", "callbackAt", "callContext", transcript, "recordingUrl",
           "durationSec", answered, attempt, error, "rawPayload", "queuedAt", "dialedAt", "completedAt"
    FROM "CallAttempt" ORDER BY "queuedAt" ASC
  `;

  // Candidate Conversation rows to match against: phone_outbound/phone_inbound
  // only (a website-widget chat should never absorb a call's dial data).
  const conversations = await prisma.conversation.findMany({
    where: { channel: { in: ['phone_outbound', 'phone_inbound'] } },
    orderBy: { startedAt: 'asc' },
  });
  const claimed = new Set<string>();

  let merged = 0;
  let created = 0;

  for (const a of attempts) {
    const anchor = a.dialedAt ?? a.queuedAt;
    let best: (typeof conversations)[number] | null = null;
    let bestDelta = Infinity;
    for (const c of conversations) {
      if (claimed.has(c.id) || c.phone !== a.phone) continue;
      const delta = Math.abs(c.startedAt.getTime() - anchor.getTime());
      if (delta < bestDelta && delta <= MATCH_WINDOW_MS) {
        best = c;
        bestDelta = delta;
      }
    }

    const dialFields = {
      campaignId: a.campaignId,
      status: a.status as any,
      attempt: a.attempt,
      callContext: (a.callContext as any) ?? undefined,
      rawPayload: (a.rawPayload as any) ?? undefined,
      error: a.error,
      answered: a.answered,
      queuedAt: a.queuedAt,
      outcomeEvidence: a.outcomeEvidence,
      incomeRange: a.incomeRange,
      employment: a.employment,
      preferredChannel: a.preferredChannel,
      callbackAt: a.callbackAt,
    };

    if (best) {
      claimed.add(best.id);
      // The matched Conversation row (from save_conversation) already has the
      // real summary/outcome/transcript the agent reported — keep those.
      // Only fill in what it's missing, plus every dial-mechanics field,
      // which it never had at all.
      await prisma.conversation.update({
        where: { id: best.id },
        data: {
          ...dialFields,
          providerConversationId: best.providerConversationId ?? a.providerCallId ?? undefined,
          summary: best.summary ?? a.summary ?? undefined,
          outcome: (best.outcome as any) ?? (a.outcome as any) ?? undefined,
          outcomeSource: best.outcomeSource ?? a.outcomeSource ?? undefined,
          transcript: (best.transcript as any) ?? (a.transcript as any) ?? undefined,
          recordingUrl: best.recordingUrl ?? a.recordingUrl ?? undefined,
          durationSec: best.durationSec ?? a.durationSec ?? undefined,
          endedAt: best.endedAt ?? a.completedAt ?? undefined,
        },
      });
      merged++;
    } else {
      // No matching conversation — this call never got a save_conversation
      // report (failed, never answered, or provider never dialled at all).
      // It still needs its own row so the call history isn't lost.
      await prisma.conversation.create({
        data: {
          id: a.id, // keep the CallAttempt id stable — nothing else references it
          customerId: a.customerId,
          phone: a.phone,
          channel: 'phone_outbound',
          providerConversationId: a.providerCallId,
          ...dialFields,
          summary: a.summary,
          outcome: a.outcome as any,
          outcomeSource: a.outcomeSource,
          transcript: a.transcript as any,
          recordingUrl: a.recordingUrl,
          durationSec: a.durationSec,
          startedAt: a.dialedAt ?? a.queuedAt,
          endedAt: a.completedAt,
          createdAt: a.queuedAt,
        },
      });
      created++;
    }
  }

  const total = await prisma.conversation.count();
  console.log('Backfill complete', {
    oldCallAttempts: attempts.length,
    mergedIntoExistingConversation: merged,
    createdAsNewConversation: created,
    totalConversationRowsNow: total,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
