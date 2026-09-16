-- AlterEnum
ALTER TYPE "CampaignStatus" ADD VALUE 'cancelled';

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "deletedAt" TIMESTAMP(3);
