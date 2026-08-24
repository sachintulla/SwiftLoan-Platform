-- Merge the old CallAttempt + Conversation tables into one, kept under the
-- name CallAttempt. For a phone call these two rows were always a 1:1 pair
-- created within milliseconds of each other (one for dial mechanics, one for
-- the actual content), with real duplicate columns (summary/outcome/
-- transcript/recordingUrl/durationSec existed identically on both). One row
-- now.
--
-- On an environment with existing data, rows must be backfilled from the old
-- CallAttempt table into Conversation BEFORE either DROP below runs — that
-- backfill is a one-time data operation run directly against that database
-- (see scripts/backfill-call-attempt-merge.ts), not embedded in this file,
-- since a fresh environment applying this migration has no old rows to carry
-- forward in the first place.

-- AlterTable: add the old CallAttempt's dial-mechanics + agent-report columns
-- onto Conversation (the table that ends up being renamed to CallAttempt below)
ALTER TABLE "Conversation"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "status" "CallStatus",
  ADD COLUMN "attempt" INTEGER,
  ADD COLUMN "callContext" JSONB,
  ADD COLUMN "rawPayload" JSONB,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "answered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "queuedAt" TIMESTAMP(3),
  ADD COLUMN "outcomeEvidence" TEXT,
  ADD COLUMN "incomeRange" TEXT,
  ADD COLUMN "employment" TEXT,
  ADD COLUMN "preferredChannel" TEXT,
  ADD COLUMN "callbackAt" TIMESTAMP(3);

-- DropColumn: callAttemptId is meaningless once the row IS the call attempt
ALTER TABLE "Conversation" DROP COLUMN "callAttemptId";

-- DropTable: the old CallAttempt table, now fully absorbed into Conversation
DROP TABLE "CallAttempt";

-- Rename Conversation -> CallAttempt (the name this merged table keeps)
ALTER TABLE "Conversation" RENAME TO "CallAttempt";
ALTER TABLE "CallAttempt" RENAME CONSTRAINT "Conversation_pkey" TO "CallAttempt_pkey";
ALTER TABLE "CallAttempt" RENAME CONSTRAINT "Conversation_customerId_fkey" TO "CallAttempt_customerId_fkey";

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename pre-existing Conversation indexes to match the new table name
ALTER INDEX "Conversation_phone_startedAt_idx" RENAME TO "CallAttempt_phone_startedAt_idx";
ALTER INDEX "Conversation_customerId_startedAt_idx" RENAME TO "CallAttempt_customerId_startedAt_idx";
ALTER INDEX "Conversation_channel_startedAt_idx" RENAME TO "CallAttempt_channel_startedAt_idx";
ALTER INDEX "Conversation_providerConversationId_key" RENAME TO "CallAttempt_providerConversationId_key";

-- CreateIndex
CREATE INDEX "CallAttempt_campaignId_status_idx" ON "CallAttempt"("campaignId", "status");
CREATE INDEX "CallAttempt_status_idx" ON "CallAttempt"("status");
CREATE INDEX "CallAttempt_queuedAt_idx" ON "CallAttempt"("queuedAt");
