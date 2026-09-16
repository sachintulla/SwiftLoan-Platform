-- Add the voice-spoken-language preference, distinct from the existing
-- `lang` (app UI-copy language) column. Nullable: unset until the user has
-- explicitly stated a language preference to the voice agent.
ALTER TABLE "User" ADD COLUMN "voiceLang" "Lang";
