-- PAN is now stored ONLY encrypted (AES-256-GCM, env-only PII_ENCRYPTION_KEY). Additive: the plaintext
-- "panNumber" columns stay (unused, omitted from every query) until `npm run pan:encrypt` has moved their
-- values into "panEnc" and nulled them; then they can be dropped in a follow-up migration.
ALTER TABLE "User" ADD COLUMN "panEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "panOnFile" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LoanApplication" ADD COLUMN "panEnc" TEXT;

-- The flag is safe to backfill in SQL; the encryption itself needs the app-side key.
UPDATE "User" SET "panOnFile" = true WHERE "panNumber" IS NOT NULL;
