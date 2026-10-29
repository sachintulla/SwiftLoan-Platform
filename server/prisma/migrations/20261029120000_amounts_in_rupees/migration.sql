-- One unit everywhere: whole rupees.
--
-- Some tables and JSON records stored paise (rupees x 100). The code now reads and writes whole rupees, so
-- convert the existing rows. Rounded, not truncated, though every value the app wrote was already a whole
-- multiple of 100.
--
-- NOT idempotent: Prisma applies a migration exactly once. Deploy it together with the code that expects
-- rupees (new code against unconverted rows, or the reverse, shows amounts 100x off).
--
-- 1. Columns
--   "Lead"."amount"                  website / campaign enquiry amount
--   "CampaignContact"."amount"       amount from an uploaded campaign spreadsheet
--   "PrequalifyingOffer"."amount"    firm pre-approved amount on a lender card
--   "PreApprovedPlan"."maxAmount"    "Up to ₹X" on a market-plan card (Prisma model MarketLoanOffer)
UPDATE "Lead"               SET "amount"    = ROUND("amount"    / 100.0)::int WHERE "amount"    IS NOT NULL;
UPDATE "CampaignContact"    SET "amount"    = ROUND("amount"    / 100.0)::int WHERE "amount"    IS NOT NULL;
UPDATE "PrequalifyingOffer" SET "amount"    = ROUND("amount"    / 100.0)::int;
UPDATE "PreApprovedPlan"    SET "maxAmount" = ROUND("maxAmount" / 100.0)::int WHERE "maxAmount" IS NOT NULL;

-- 2. Amounts copied out of a lead into event records. Only the lead-capture events carried paise
--    (their amount came from Lead.amount); other events, e.g. offer_selected, already held rupees and are left alone.
UPDATE "JourneyEvent"
   SET "metadata" = jsonb_set("metadata", '{amount}', to_jsonb(ROUND(("metadata"->>'amount')::numeric / 100.0)::bigint))
 WHERE "name" = 'lead_captured' AND ("metadata"->>'amount') ~ '^[0-9]+$';

UPDATE "ActivityEvent"
   SET "metadata" = jsonb_set("metadata", '{amount}', to_jsonb(ROUND(("metadata"->>'amount')::numeric / 100.0)::bigint))
 WHERE "eventName" = 'lead_captured' AND ("metadata"->>'amount') ~ '^[0-9]+$';

-- 3. Queued / failed Upshot nudge events: properties.amount was Lead.amount (paise). Converting the stored payload means a
--    retry sends rupees. (The only writer of an amount into these payloads is the lead-stage nudge.)
UPDATE "OutboundRequest"
   SET "payload" = jsonb_set("payload", '{properties,amount}', to_jsonb(ROUND(("payload"->'properties'->>'amount')::numeric / 100.0)::bigint))
 WHERE "kind" = 'upshot_event' AND ("payload"->'properties'->>'amount') ~ '^[0-9]+$';

-- Deliberately NOT converted: "AdminAuditLog" (the audit trail records what an admin saved at the time, so it is
-- left as written) and Aurix's own raw offers in "Offer"."rawOffer" (the lender's response, already in rupees).
