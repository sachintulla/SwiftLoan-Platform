-- One-time correction: customers wrongly moved to "Application submitted".
--
-- Why: until the fix in lib/lenderJourneyEvent.ts, every status push from the lender (PAN check, credit-bureau pull,
-- eligibility check) was recorded as the journey event `application_submitted`, and so was the app's status screen
-- opening. Either one moved the customer to the stage "Application submitted", and the stage only moves forward.
-- On the production data of 2026-11-19 that was 696 of 949 customers; about 105 had really applied with a lender.
--
-- What it does (only for the wrong rows; real applications are left alone):
--   1. Timeline: a lender push that was not the customer applying becomes `lender_update`, and a status-screen
--      opening by someone who had not applied becomes `status_viewed`. Neither carries a stage any more. Nothing is
--      deleted. The mirrored analytics row of a lender push is renamed the same way.
--   2. Stage: a customer at "Application submitted" with no real submission left on their timeline goes back to the
--      furthest stage their own timeline supports (never earlier than "OTP verified").
--   It does NOT touch lastNudgedAt or lastActivityAt, and a corrected stage keeps an old "since" time, so no message
--   or call is triggered by running it.
--
-- Run it AFTER the code with the fix is deployed (the old code would re-create the wrong events). Safe to run again.
--
--   Dry run (default, changes nothing, prints what it would do):
--     psql "$DATABASE_URL" -f server/scripts/fix-customer-stages.sql
--   Apply:
--     psql "$DATABASE_URL" -v apply=1 -f server/scripts/fix-customer-stages.sql
--   ($DATABASE_URL without Prisma's "?schema=public" suffix: psql does not accept it.)

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif
\pset pager off

BEGIN;

\echo
\echo '== Before: customers per stage =='
SELECT "currentStage" AS stage, count(*) FROM "Customer" GROUP BY 1 ORDER BY 2 DESC;

-- 1a. Lender pushes recorded as "application submitted" although the customer had not applied with a lender at that
--     moment. Same rule as lib/lenderJourneyEvent.ts: it counts only if the lender's state is one it sends after the
--     customer submitted on the lender's page, or the application already had a lender application / applied offer.
CREATE TEMP TABLE _wrong_lender_push ON COMMIT DROP AS
SELECT e.id, e."customerId", e."occurredAt"
FROM "JourneyEvent" e
WHERE e.name = 'application_submitted'
  AND e.channel = 'system'
  AND e.metadata ? 'state'
  AND lower(regexp_replace(coalesce(e.metadata->>'state', ''), '[^A-Za-z_]', '', 'g'))
      NOT IN ('application_submitted', 'kyc_completed', 'post_lender_redirection_journey')
  AND NOT EXISTS (
    SELECT 1 FROM "LenderApplication" la
    WHERE la."applicationId" = e.metadata->>'applicationId' AND la."appliedAt" <= e."occurredAt")
  AND NOT EXISTS (
    SELECT 1 FROM "Offer" o
    WHERE o."applicationId" = e.metadata->>'applicationId' AND o.applied
      AND (o."appliedAt" IS NULL OR o."appliedAt" <= e."occurredAt"));

-- 1b. The app's status screen opening, recorded as "application submitted" for someone with no lender application
--     at that moment (the server has ignored these since 2026-11-04; older ones are still on the timeline).
CREATE TEMP TABLE _wrong_status_screen ON COMMIT DROP AS
SELECT e.id, e."customerId"
FROM "JourneyEvent" e
JOIN "Customer" c ON c.id = e."customerId"
WHERE e.name = 'application_submitted'
  AND e.channel = 'app'
  AND e.metadata->>'via' = 'app_telemetry'
  AND NOT EXISTS (
    SELECT 1 FROM "LenderApplication" la
    JOIN "LoanApplication" a ON a.id = la."applicationId"
    WHERE a."userId" = c."userId" AND la."appliedAt" <= e."occurredAt");

-- The analytics mirror of a lender push (same account, same instant).
UPDATE "ActivityEvent" ae
SET "eventName" = 'lender_update'
FROM _wrong_lender_push w
JOIN "Customer" c ON c.id = w."customerId"
WHERE ae."userId" = c."userId" AND ae."eventName" = 'application_submitted' AND ae."eventType" = 'system' AND ae.ts = w."occurredAt";

UPDATE "JourneyEvent" SET name = 'lender_update', stage = NULL WHERE id IN (SELECT id FROM _wrong_lender_push);
UPDATE "JourneyEvent" SET name = 'status_viewed', stage = NULL WHERE id IN (SELECT id FROM _wrong_status_screen);

\echo
\echo '== Timeline events corrected =='
SELECT (SELECT count(*) FROM _wrong_lender_push)   AS lender_pushes_renamed,
       (SELECT count(*) FROM _wrong_status_screen) AS status_screens_renamed,
       (SELECT count(*) FROM "JourneyEvent" WHERE name = 'application_submitted') AS real_submissions_left;

-- 2. Customers still at "Application submitted" whose timeline no longer holds a real submission: back to the
--    furthest stage their own events support. Floor = "registered" (OTP verified): never back to a lead stage, which
--    the enquiry caller reads.
CREATE TEMP TABLE _stage_fix ON COMMIT DROP AS
WITH ord(stage, rank) AS (
  VALUES ('lead_captured', 0), ('contacted', 1), ('app_installed', 2), ('registered', 3), ('eligibility_checked', 4),
         ('offers_viewed', 5), ('offer_selected', 6), ('kyc_started', 7), ('kyc_completed', 8),
         ('application_submitted', 9), ('approved', 10), ('disbursed', 11)
),
furthest AS (
  SELECT c.id, greatest(coalesce(max(o.rank), 3), 3) AS rank
  FROM "Customer" c
  LEFT JOIN "JourneyEvent" e ON e."customerId" = c.id AND e.stage IS NOT NULL
  LEFT JOIN ord o ON o.stage = e.stage::text
  WHERE c."currentStage" = 'application_submitted'
  GROUP BY c.id
)
SELECT f.id, o.stage AS new_stage,
       (SELECT min(e."occurredAt") FROM "JourneyEvent" e WHERE e."customerId" = f.id AND e.stage::text = o.stage) AS entered_at
FROM furthest f
JOIN ord o ON o.rank = f.rank
WHERE f.rank < 9;

UPDATE "Customer" c
SET "currentStage" = s.new_stage::"JourneyStage",
    "stageEnteredAt" = coalesce(s.entered_at, c."stageEnteredAt")
FROM _stage_fix s
WHERE c.id = s.id;

\echo
\echo '== Customers moved off "Application submitted", by corrected stage =='
SELECT new_stage, count(*) FROM _stage_fix GROUP BY 1 ORDER BY 2 DESC;

\echo
\echo '== After: customers per stage =='
SELECT "currentStage" AS stage, count(*) FROM "Customer" GROUP BY 1 ORDER BY 2 DESC;

\if :apply
  COMMIT;
  \echo
  \echo 'APPLIED.'
\else
  ROLLBACK;
  \echo
  \echo 'DRY RUN: nothing was changed. Add  -v apply=1  to apply.'
\endif
