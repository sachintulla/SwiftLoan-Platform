-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "nudgeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nudgeIdleMs" INTEGER NOT NULL DEFAULT 30000,
    "nudgeDropoffMs" INTEGER NOT NULL DEFAULT 18000,
    "nudgeEligibleMs" INTEGER NOT NULL DEFAULT 20000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
