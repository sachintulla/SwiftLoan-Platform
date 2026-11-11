-- SwiftLoan no longer stores or captures credit scores. The column only ever
-- held the default 750 (no bureau is integrated) or a score copied from the
-- Aurix bureau_score webhook field, which is no longer read.
ALTER TABLE "User" DROP COLUMN IF EXISTS "creditScore";
