-- Install attribution (AppClick) + friend referrals. Additive only.
ALTER TABLE "AppDownload" ADD COLUMN "clickId" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN "matchMethod" TEXT;

CREATE TABLE "AppClick" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ref" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'direct',
    "campaignId" TEXT,
    "platform" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "uaHash" TEXT NOT NULL,
    "osVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "matchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppClick_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AppClick_token_key" ON "AppClick"("token");
CREATE INDEX "AppClick_ipHash_status_createdAt_idx" ON "AppClick"("ipHash", "status", "createdAt");
CREATE INDEX "AppClick_expiresAt_idx" ON "AppClick"("expiresAt");
CREATE INDEX "AppClick_ref_idx" ON "AppClick"("ref");

CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "ReferralCode"("userId");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

CREATE TABLE "FriendReferral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clickId" TEXT,
    "matchMethod" TEXT,
    "status" TEXT NOT NULL DEFAULT 'signed_up',
    "appliedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "rewardStatus" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FriendReferral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FriendReferral_refereeId_key" ON "FriendReferral"("refereeId");
CREATE INDEX "FriendReferral_referrerId_createdAt_idx" ON "FriendReferral"("referrerId", "createdAt");
CREATE INDEX "FriendReferral_status_idx" ON "FriendReferral"("status");
