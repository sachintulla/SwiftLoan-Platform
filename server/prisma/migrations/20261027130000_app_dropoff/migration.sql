-- Drop-off messages for website and app: one row per person per drop point (additive). Phase 1 is log-only.
CREATE TABLE "AppDropoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "dropStatus" TEXT NOT NULL,
    "reason" TEXT,
    "token" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "stopReason" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "stepsSent" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppDropoff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppDropoff_status_nextCheckAt_idx" ON "AppDropoff"("status", "nextCheckAt");
CREATE INDEX "AppDropoff_userId_createdAt_idx" ON "AppDropoff"("userId", "createdAt");
CREATE INDEX "AppDropoff_phone_idx" ON "AppDropoff"("phone");

-- One active run per person: two workers arming the same person at once cannot both create one (Prisma cannot express a partial index).
CREATE UNIQUE INDEX "AppDropoff_one_active_per_user" ON "AppDropoff"("userId") WHERE "status" = 'active';

ALTER TABLE "AppDropoff" ADD CONSTRAINT "AppDropoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
