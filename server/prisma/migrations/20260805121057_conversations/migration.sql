-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "phone" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "agentRole" TEXT,
    "providerConversationId" TEXT,
    "callAttemptId" TEXT,
    "summary" TEXT,
    "transcript" JSONB,
    "outcome" "CallOutcome",
    "outcomeSource" TEXT,
    "details" JSONB,
    "recordingUrl" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "phone" TEXT NOT NULL,
    "customerId" TEXT,
    "summary" TEXT NOT NULL,
    "conversationCount" INTEGER NOT NULL DEFAULT 0,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstAt" TIMESTAMP(3),
    "lastAt" TIMESTAMP(3),
    "lastChannel" TEXT,
    "lastAgentRole" TEXT,
    "lastOutcome" "CallOutcome",
    "lastOutcomeSource" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_providerConversationId_key" ON "Conversation"("providerConversationId");

-- CreateIndex
CREATE INDEX "Conversation_phone_startedAt_idx" ON "Conversation"("phone", "startedAt");

-- CreateIndex
CREATE INDEX "Conversation_customerId_startedAt_idx" ON "Conversation"("customerId", "startedAt");

-- CreateIndex
CREATE INDEX "Conversation_channel_startedAt_idx" ON "Conversation"("channel", "startedAt");

-- CreateIndex
CREATE INDEX "ConversationSummary_lastAt_idx" ON "ConversationSummary"("lastAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
