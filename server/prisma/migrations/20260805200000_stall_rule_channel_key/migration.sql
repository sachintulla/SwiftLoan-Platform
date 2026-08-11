-- Widen the StallRule uniqueness key to include `channel`.
--
-- With the old two-column key, a voice (call) rule for the same drop-off as an
-- existing push rule violated uniqueness and could never be created — so
-- "push at 15 minutes, call at 45 if still stuck" was unexpressible.
--
-- Index-only change: no table or column is dropped and no row is touched.
-- Widening a unique key can never fail on existing data, since every row that
-- satisfied (trigger, expected) also satisfies (trigger, expected, channel).

-- DropIndex
DROP INDEX "StallRule_triggerEvent_expectedEvent_key";

-- CreateIndex
CREATE UNIQUE INDEX "StallRule_triggerEvent_expectedEvent_channel_key" ON "StallRule"("triggerEvent", "expectedEvent", "channel");
