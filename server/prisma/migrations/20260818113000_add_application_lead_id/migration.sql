-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN "leadId" TEXT;

-- CreateIndex
CREATE INDEX "LoanApplication_leadId_idx" ON "LoanApplication"("leadId");
