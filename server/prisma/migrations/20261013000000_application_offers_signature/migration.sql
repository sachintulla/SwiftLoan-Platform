-- Prequalify only calls the lender again when the applicant's details change.
-- Stores the fingerprint of the details the offers were fetched with, and when.
ALTER TABLE "LoanApplication" ADD COLUMN "offersSignature" TEXT,
ADD COLUMN "offersFetchedAt" TIMESTAMP(3);

CREATE INDEX "LoanApplication_userId_offersSignature_idx" ON "LoanApplication"("userId", "offersSignature");
