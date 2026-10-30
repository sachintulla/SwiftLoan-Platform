-- Revasure MIS status upload (admin uploads their status sheet; matched to a
-- RevasureLead by the applicant's mobile number). Additive only.

-- MIS fields on each lead (independent of the lead-creation `status`).
ALTER TABLE "RevasureLead" ADD COLUMN "misStatus" TEXT;
ALTER TABLE "RevasureLead" ADD COLUMN "misRemark" TEXT;
ALTER TABLE "RevasureLead" ADD COLUMN "misApprovedAmount" INTEGER;
ALTER TABLE "RevasureLead" ADD COLUMN "misDisbursedAmount" INTEGER;
ALTER TABLE "RevasureLead" ADD COLUMN "misDisbursementDate" TIMESTAMP(3);
ALTER TABLE "RevasureLead" ADD COLUMN "misUpdatedAt" TIMESTAMP(3);
ALTER TABLE "RevasureLead" ADD COLUMN "misUploadId" TEXT;

CREATE INDEX "RevasureLead_misUploadId_idx" ON "RevasureLead"("misUploadId");

-- One row per uploaded MIS file (audit trail + counts).
CREATE TABLE "RevasureMisUpload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT,
    "uploadedBy" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "matchedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "unmatchedRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevasureMisUpload_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevasureMisUpload_createdAt_idx" ON "RevasureMisUpload"("createdAt");
