-- One AppDownload row per device: install id (dedups retried reports), device key (dedups
-- reinstalls), where it was installed from, and app/device details. Additive and idempotent.
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "installId" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "lastInstallId" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "deviceKey" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "installSource" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "deviceModel" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "osVersion" TEXT;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "reinstallCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "lastReinstalledAt" TIMESTAMP(3);
ALTER TABLE "AppDownload" ADD COLUMN IF NOT EXISTS "matchedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "AppDownload_installId_key" ON "AppDownload"("installId");
CREATE UNIQUE INDEX IF NOT EXISTS "AppDownload_platform_deviceKey_key" ON "AppDownload"("platform", "deviceKey");
CREATE INDEX IF NOT EXISTS "AppDownload_installSource_idx" ON "AppDownload"("installSource");
CREATE INDEX IF NOT EXISTS "AppDownload_lastInstallId_idx" ON "AppDownload"("lastInstallId");
