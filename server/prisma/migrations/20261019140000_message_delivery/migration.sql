-- Delivery tracking for outbound WhatsApp (and SMS) messages. One row per message the provider accepted,
-- updated as the provider's status callbacks arrive (queued, sent, delivered, read, failed + the failure reason).
-- Additive: a new table only.
CREATE TABLE "MessageDelivery" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "providerRef" TEXT,
    "gtrid" TEXT,
    "referenceId" TEXT,
    "phone" TEXT,
    "customerId" TEXT,
    "template" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "failureCode" TEXT,
    "failureReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "events" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageDelivery_providerRef_key" ON "MessageDelivery"("providerRef");
CREATE INDEX "MessageDelivery_channel_createdAt_idx" ON "MessageDelivery"("channel", "createdAt");
CREATE INDEX "MessageDelivery_status_createdAt_idx" ON "MessageDelivery"("status", "createdAt");
CREATE INDEX "MessageDelivery_phone_idx" ON "MessageDelivery"("phone");
CREATE INDEX "MessageDelivery_referenceId_idx" ON "MessageDelivery"("referenceId");
