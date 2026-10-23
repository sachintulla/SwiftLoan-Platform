-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "providerCampaignId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_providerCampaignId_key" ON "Campaign"("providerCampaignId");
