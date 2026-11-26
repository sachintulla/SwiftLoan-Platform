-- Additive and idempotent. WhatsApp delivery reports from Vox carry WhatsApp's own message id; once a report is linked to the
-- message it belongs to, that id is kept in "gtrid" and every later report looks it up there.
CREATE INDEX IF NOT EXISTS "MessageDelivery_gtrid_idx" ON "MessageDelivery"("gtrid");
