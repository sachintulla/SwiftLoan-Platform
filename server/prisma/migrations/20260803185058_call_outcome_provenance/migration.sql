-- AlterTable
ALTER TABLE "CallAttempt" ADD COLUMN     "callContext" JSONB,
ADD COLUMN     "callbackAt" TIMESTAMP(3),
ADD COLUMN     "employment" TEXT,
ADD COLUMN     "incomeRange" TEXT,
ADD COLUMN     "outcomeEvidence" TEXT,
ADD COLUMN     "outcomeSource" TEXT,
ADD COLUMN     "preferredChannel" TEXT;
