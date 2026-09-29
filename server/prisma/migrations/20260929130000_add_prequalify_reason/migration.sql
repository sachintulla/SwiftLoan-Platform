-- Why prequalify landed on zero offers: Aurix's own decline message
-- (status=rejected) or a generic retry prompt (status=failed). Null
-- otherwise. See lib in applications.routes.ts.
ALTER TABLE "LoanApplication" ADD COLUMN "prequalifyReason" TEXT;
