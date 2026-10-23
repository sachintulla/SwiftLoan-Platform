-- 20261022120000_admin_timings gave PlatformSetting.updatedAt a database default, but schema.prisma declares it
-- @updatedAt (set by Prisma, no default). CI's "Fail on schema drift" check caught the difference. A new migration
-- rather than an edit, because the earlier one has already been applied (editing it would change its checksum).
ALTER TABLE "PlatformSetting" ALTER COLUMN "updatedAt" DROP DEFAULT;
