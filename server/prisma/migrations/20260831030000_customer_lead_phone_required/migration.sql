-- Customer.phone and Lead.phone become required: every identity in the
-- system (app or website) must resolve to a real phone number. Verified
-- against the live data before this migration was written: 0 Lead rows and
-- 0 Customer rows currently have a null phone (the 3 that did have already
-- been cleaned up as duplicates from a resolveCustomer identity bug).
ALTER TABLE "Customer" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "Lead" ALTER COLUMN "phone" SET NOT NULL;
