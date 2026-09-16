-- Merge ContextSession + AnonymousLead (created in lockstep on every website
-- submission, with no update path) into one Lead table.
--
-- On an environment with existing data (this repo's dev DB at the time this
-- migration was written), the rows must be backfilled from the two old
-- tables BEFORE they are dropped — that backfill is a one-time data
-- operation run directly against that database, not embedded in this file,
-- since a fresh environment applying this migration has no old rows to
-- migrate in the first place.

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "productInterest" TEXT,
    "amount" INTEGER,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "campaignId" TEXT,
    "referrer" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "convertedUserId" TEXT,
    "transcript" JSONB,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lead_token_key" ON "Lead"("token");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_phone_createdAt_idx" ON "Lead"("phone", "createdAt");

-- DropTable
DROP TABLE "ContextSession";

-- DropTable
DROP TABLE "AnonymousLead";
