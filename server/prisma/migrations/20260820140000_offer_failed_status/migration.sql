-- Add 'failed' to ApplicationStatus (used for per-lender applications whose
-- lender web flow errored out and could not complete).
ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'failed';

-- Capture the reason a per-lender application failed.
ALTER TABLE "Offer" ADD COLUMN "failureReason" TEXT;
