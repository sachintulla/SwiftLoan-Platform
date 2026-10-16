-- Anonymous reason captured when an account is deleted. Additive only; no link to User.
CREATE TABLE "AccountDeletionFeedback" (
    "id" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "details" TEXT,
    "source" TEXT NOT NULL DEFAULT 'app',
    "hadApplication" BOOLEAN NOT NULL DEFAULT false,
    "hadActiveLoan" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountDeletionFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountDeletionFeedback_createdAt_idx" ON "AccountDeletionFeedback"("createdAt");
CREATE INDEX "AccountDeletionFeedback_reasonCode_idx" ON "AccountDeletionFeedback"("reasonCode");
