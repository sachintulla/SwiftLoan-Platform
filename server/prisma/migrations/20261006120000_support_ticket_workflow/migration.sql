-- Support tickets: category, linked application, admin workflow fields and a
-- human-friendly ticket number. Additive only — existing rows keep working
-- (they get category 'other' and sequential ticket numbers).
ALTER TABLE "SupportTicket"
  ADD COLUMN "ticketNo"      SERIAL NOT NULL,
  ADD COLUMN "category"      TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN "applicationId" TEXT,
  ADD COLUMN "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "resolvedAt"    TIMESTAMP(3),
  ADD COLUMN "adminNote"     TEXT,
  ADD COLUMN "emailSentAt"   TIMESTAMP(3),
  ADD COLUMN "emailError"    TEXT;

CREATE UNIQUE INDEX "SupportTicket_ticketNo_key" ON "SupportTicket"("ticketNo");
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");
