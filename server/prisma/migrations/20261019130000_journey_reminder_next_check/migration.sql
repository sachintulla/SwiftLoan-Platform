-- The install-reminder job used to look at the 200 OLDEST active reminders every minute, so with more than
-- 200 active visitors the newer ones were never reached. Each row now says when it next needs attention,
-- and the job only picks up rows that are due.
ALTER TABLE "JourneyReminder" ADD COLUMN "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX "JourneyReminder_status_nextCheckAt_idx" ON "JourneyReminder"("status", "nextCheckAt");
