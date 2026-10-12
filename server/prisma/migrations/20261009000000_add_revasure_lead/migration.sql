-- CreateTable: RevasureLead — Revasure "Create Lead" integration (third lender
-- group, run in parallel to Aurix + Yubi at prequalify). Records the outbound
-- Create-Lead request/response for the admin dashboard. Additive only.
CREATE TABLE "RevasureLead" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'revasure',
    "sourceLeadId" TEXT NOT NULL,
    "basketId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "httpStatus" INTEGER,
    "leadId" TEXT,
    "message" TEXT,
    "requestBody" JSONB,
    "responseBody" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevasureLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevasureLead_sourceLeadId_key" ON "RevasureLead"("sourceLeadId");

-- CreateIndex
CREATE INDEX "RevasureLead_applicationId_idx" ON "RevasureLead"("applicationId");

-- CreateIndex
CREATE INDEX "RevasureLead_userId_idx" ON "RevasureLead"("userId");
