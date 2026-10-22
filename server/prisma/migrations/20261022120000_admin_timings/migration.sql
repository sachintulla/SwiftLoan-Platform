-- Admin-editable timings: one row per overridden setting (additive).
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- The in-app voice-assistant bubble: three more timings the admin can change (existing rows keep today's behaviour).
ALTER TABLE "AppConfig" ADD COLUMN "nudgeStartMs" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN "nudgeRotateMs" INTEGER NOT NULL DEFAULT 3000,
ADD COLUMN "nudgeSnoozeMs" INTEGER NOT NULL DEFAULT 600000;
