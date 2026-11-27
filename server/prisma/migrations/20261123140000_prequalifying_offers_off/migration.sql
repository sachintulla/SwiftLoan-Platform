-- Switches off the seven sample "Featured offers" (MoneyView, Zype, IDFC First Bank, Unity, Prefr, FREO x2) that
-- prisma/seed.prequalifying.ts created on 2026-08-31. The app showed them on Home to every signed-in user, but a tap
-- only started the normal application (offers come from Aurix), so the named lenders and rates were not real offers.
-- Owner's decision, 2026-11-23. Data only; rows are kept (inactive) and can be switched back on in Admin ->
-- Pre-Qualifying Offers. Only the untouched seed rows are changed: an offer someone added or edited later is left alone.
-- Idempotent. Apply with `prisma migrate deploy`.
UPDATE "PrequalifyingOffer"
   SET "active" = false, "updatedAt" = now()
 WHERE "active" = true
   AND "createdAt" < '2026-09-01'
   AND "updatedAt" < '2026-09-01';
