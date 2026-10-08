-- CreateTable: PartnerReferral — Yubi Markets (YMPL) alternative-offers facility.
CREATE TABLE "PartnerReferral" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ympl',
    "clientReferralId" TEXT NOT NULL,
    "ymplReferralId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "redirectUrl" TEXT,
    "returnRedirectionUrl" TEXT,
    "lastError" TEXT,
    "rawCreate" JSONB,
    "rawAuth" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerReferral_clientReferralId_key" ON "PartnerReferral"("clientReferralId");

-- CreateIndex
CREATE INDEX "PartnerReferral_applicationId_idx" ON "PartnerReferral"("applicationId");

-- CreateIndex
CREATE INDEX "PartnerReferral_userId_idx" ON "PartnerReferral"("userId");
