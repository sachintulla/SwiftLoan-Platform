-- One ACTIVE reminder per visitor. Two concurrent website pings after a drop-off each created their own next-cycle row,
-- so the same person was messaged twice (seen in prod: two identical WhatsApps one second apart).
--
-- 1) Retire the duplicates that already exist: keep the oldest active row per user, stop the rest. A stopped row is
--    never picked up by the reminder job, so nothing more is sent from it; its history stays for reference.
UPDATE "JourneyReminder" r
SET "status" = 'stopped', "stopReason" = 'duplicate'
WHERE r."status" = 'active'
  AND EXISTS (
    SELECT 1 FROM "JourneyReminder" o
    WHERE o."userId" = r."userId" AND o."status" = 'active'
      AND (o."createdAt", o."id") < (r."createdAt", r."id")
  );

-- 2) From now on the database refuses a second active row for the same user (a partial index; Prisma cannot express it
--    in schema.prisma, so it lives only in this migration). The app catches the conflict and uses the existing row.
CREATE UNIQUE INDEX "JourneyReminder_one_active_per_user" ON "JourneyReminder" ("userId") WHERE "status" = 'active';
