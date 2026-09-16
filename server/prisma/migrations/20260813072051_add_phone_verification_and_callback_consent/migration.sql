-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "callbackCalledAt" TIMESTAMP(3),
ADD COLUMN     "callbackDeclinedAt" TIMESTAMP(3),
ADD COLUMN     "callbackRequestedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Customer_phoneVerified_callbackRequestedAt_callbackCalledAt_idx" ON "Customer"("phoneVerified", "callbackRequestedAt", "callbackCalledAt");
