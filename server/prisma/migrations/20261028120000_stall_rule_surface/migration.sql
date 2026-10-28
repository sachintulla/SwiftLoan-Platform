-- A stuck-stage rule can now be limited to the website or the app. Every existing rule stays 'all', so nothing changes
-- until someone chooses a side. Widening the unique key cannot fail on existing data: every row that satisfied
-- (trigger, expected, channel) also satisfies (trigger, expected, channel, surface). Idempotent, so a re-run is harmless.

ALTER TABLE "StallRule" ADD COLUMN IF NOT EXISTS "surface" TEXT NOT NULL DEFAULT 'all';

DROP INDEX IF EXISTS "StallRule_triggerEvent_expectedEvent_channel_key";

CREATE UNIQUE INDEX IF NOT EXISTS "StallRule_triggerEvent_expectedEvent_channel_surface_key"
  ON "StallRule"("triggerEvent", "expectedEvent", "channel", "surface");
