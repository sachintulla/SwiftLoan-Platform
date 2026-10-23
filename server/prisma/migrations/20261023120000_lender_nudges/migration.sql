-- "You applied with <lender>, install the app to track it" nudges: one row per lender application (additive).
CREATE TABLE "LenderNudge" (
    "id" TEXT NOT NULL,
    "lenderApplicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "lenderName" TEXT,
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

    CONSTRAINT "LenderNudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LenderNudge_lenderApplicationId_key" ON "LenderNudge"("lenderApplicationId");
CREATE INDEX "LenderNudge_status_nextCheckAt_idx" ON "LenderNudge"("status", "nextCheckAt");
CREATE INDEX "LenderNudge_phone_idx" ON "LenderNudge"("phone");
CREATE INDEX "LenderNudge_userId_idx" ON "LenderNudge"("userId");

ALTER TABLE "LenderNudge" ADD CONSTRAINT "LenderNudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
