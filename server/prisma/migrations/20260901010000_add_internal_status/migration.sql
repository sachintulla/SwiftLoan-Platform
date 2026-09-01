-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "InternalStatus" AS ENUM ('just_applied', 'success', 'failed', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "LenderApplication"
  ADD COLUMN IF NOT EXISTS "internalStatus" "InternalStatus" NOT NULL DEFAULT 'just_applied';
