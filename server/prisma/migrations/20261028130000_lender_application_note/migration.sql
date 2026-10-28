-- Admin-only: the lender's own words from its latest status push (journey.reason). Additive and idempotent.
ALTER TABLE "LenderApplication" ADD COLUMN IF NOT EXISTS "lenderNote" TEXT;
ALTER TABLE "LenderApplication" ADD COLUMN IF NOT EXISTS "lenderNoteAt" TIMESTAMP(3);
