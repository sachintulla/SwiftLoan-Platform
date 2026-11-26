-- Clears the admin Notifications backlog (production, 2026-11-23: 1,813 rows, all unread, none ever read,
-- so the sidebar badge was permanent noise).
--   (a) deletes the "app_nudge" ("User needs help") rows: that type is no longer created (lib/appNudge.ts);
--   (b) marks every other notification that is unread right now as read.
-- Data only: no table, column or enum changes ("type" is plain text). Idempotent: a second run changes nothing
-- that the first already handled. Deploy together with the code that stopped creating app_nudge rows.
-- Apply with `prisma migrate deploy`.

DELETE FROM "Notification" WHERE "type" = 'app_nudge';

UPDATE "Notification" SET "read" = true WHERE "read" = false;
