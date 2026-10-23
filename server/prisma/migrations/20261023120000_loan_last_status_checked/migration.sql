-- Scheduled lender status poller + admin "Pull latest status": throttle field.
ALTER TABLE "LoanApplication" ADD COLUMN "lastStatusCheckedAt" TIMESTAMP(3);
CREATE INDEX "LoanApplication_status_lastStatusCheckedAt_idx" ON "LoanApplication"("status", "lastStatusCheckedAt");
