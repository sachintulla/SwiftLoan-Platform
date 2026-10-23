-- Yubi status poller: throttle field so a failing YMPL status call isn't retried every tick.
ALTER TABLE "PartnerReferral" ADD COLUMN "lastStatusCheckedAt" TIMESTAMP(3);
CREATE INDEX "PartnerReferral_appliedAt_lastStatusCheckedAt_idx" ON "PartnerReferral"("appliedAt", "lastStatusCheckedAt");
