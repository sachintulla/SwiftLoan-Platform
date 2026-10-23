-- Reminders for website visitors who asked for an OTP but never entered it (additive; existing rows are verified visitors).
ALTER TABLE "JourneyReminder" ADD COLUMN "unverified" BOOLEAN NOT NULL DEFAULT false;
