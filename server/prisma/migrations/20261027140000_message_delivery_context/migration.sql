-- What each sent message was and why it went out: language, category, the filled-in variables, and what triggered it.
-- Additive and idempotent (IF NOT EXISTS), so it is safe to re-run.
ALTER TABLE "MessageDelivery" ADD COLUMN IF NOT EXISTS "meta" JSONB;
