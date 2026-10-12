-- Drift fix (CI "Migrations apply cleanly"): schema.prisma dropped
-- Customer.callbackCalledAt when the callback state machine
-- (20260813133000) replaced it, but no migration ever dropped the column, so a
-- database built from migrations diverged from the schema. Nothing reads it.
-- IF EXISTS keeps this a no-op on databases where it was already removed.

-- DropIndex
DROP INDEX IF EXISTS "Customer_phoneVerified_callbackRequestedAt_callbackCalledAt_idx";

-- AlterTable
ALTER TABLE "Customer" DROP COLUMN IF EXISTS "callbackCalledAt";

-- RenameIndex
ALTER INDEX IF EXISTS "Customer_phoneVerified_callbackStatus_callbackNextAttemptA_idx" RENAME TO "Customer_phoneVerified_callbackStatus_callbackNextAttemptAt_idx";
