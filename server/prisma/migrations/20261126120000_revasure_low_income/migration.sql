-- Data only (no schema change). Leads Revasure refused for a monthly income below its
-- 10,000 minimum were stored as technical failures. Record them as the customer's real
-- outcome, `low_income` ("Not eligible: low income" in admin). Idempotent.
UPDATE "RevasureLead"
SET "status" = 'low_income',
    "message" = 'Not eligible: monthly income below ₹10,000',
    "lastError" = NULL
WHERE "status" = 'failed'
  AND "httpStatus" = 400
  AND ("message" ILIKE '%monthly_income%' OR "lastError" ILIKE '%monthly_income%');
