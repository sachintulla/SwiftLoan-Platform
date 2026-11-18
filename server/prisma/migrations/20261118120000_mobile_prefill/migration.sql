-- Digitap "Mobile to Prefill": what the provider returned for a verified mobile number (lib/mobilePrefill.ts).
-- Additive and idempotent. Apply with `prisma migrate deploy`.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "creditScore" INTEGER;

CREATE TABLE IF NOT EXISTS "MobilePrefill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'digitap',
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "requestId" TEXT,
    "nameSource" TEXT,
    "dataEnc" TEXT,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "hasPan" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MobilePrefill_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MobilePrefill_userId_key" ON "MobilePrefill"("userId");
CREATE INDEX IF NOT EXISTS "MobilePrefill_status_idx" ON "MobilePrefill"("status");

DO $$ BEGIN
  ALTER TABLE "MobilePrefill" ADD CONSTRAINT "MobilePrefill_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
