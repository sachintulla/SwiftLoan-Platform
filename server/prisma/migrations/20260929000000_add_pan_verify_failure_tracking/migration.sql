-- PAN verification attempt tracking (lib/panVerification.ts). A "not found"
-- or a real Aurix error is tracked here, never as a PanRecord row, so a
-- retry is always a fresh paid Aurix call. No PII — Aurix's own status text.
ALTER TABLE "User" ADD COLUMN "panVerifyLastStatus" TEXT;
ALTER TABLE "User" ADD COLUMN "panVerifyLastMessage" TEXT;
ALTER TABLE "User" ADD COLUMN "panVerifyLastAttemptAt" TIMESTAMP(3);
-- Rolling 24h window for PAN_DAILY_LIMIT — every paid pan_comprehensive call
-- counts, success or failure (Aurix bills either way).
ALTER TABLE "User" ADD COLUMN "panVerifyAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "panVerifyWindowStartAt" TIMESTAMP(3);
