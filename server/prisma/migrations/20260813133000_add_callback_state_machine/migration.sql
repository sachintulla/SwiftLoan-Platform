-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('requested', 'in_progress', 'connected', 'not_answered');

-- AlterTable
ALTER TABLE "Customer"
  ADD COLUMN "callbackStatus" "CallbackStatus",
  ADD COLUMN "callbackAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "callbackNextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "callbackLastAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_phoneVerified_callbackStatus_callbackNextAttemptA_idx" ON "Customer"("phoneVerified", "callbackStatus", "callbackNextAttemptAt");
