-- Website drop-off recovery: remembers the last step a verified website visitor reached and runs the
-- install-link reminder schedule. Additive only: a new table, no existing table or column is touched.
CREATE TABLE "JourneyReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "firstName" TEXT,
    "lastStep" TEXT NOT NULL DEFAULT 'otp_only',
    "status" TEXT NOT NULL DEFAULT 'active',
    "stopReason" TEXT,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "startAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "droppedAt" TIMESTAMP(3),
    "stepsSent" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JourneyReminder_token_key" ON "JourneyReminder"("token");
CREATE INDEX "JourneyReminder_status_startAt_idx" ON "JourneyReminder"("status", "startAt");
CREATE INDEX "JourneyReminder_userId_idx" ON "JourneyReminder"("userId");
CREATE INDEX "JourneyReminder_phone_idx" ON "JourneyReminder"("phone");

ALTER TABLE "JourneyReminder" ADD CONSTRAINT "JourneyReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
