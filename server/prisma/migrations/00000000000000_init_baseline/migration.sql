-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "ResidenceType" AS ENUM ('own', 'rented', 'family', 'company');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('salaried', 'self_employed', 'business_owner', 'gig_worker', 'student', 'retired', 'other');

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('en', 'hi', 'te', 'hinglish', 'tenglish');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('terms', 'soft_pull', 'data_sharing', 'communications');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('draft', 'pan_pending', 'prequalifying', 'offers_ready', 'handoff', 'under_review', 'approved', 'rejected', 'disbursed', 'closed');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('personal', 'business', 'home', 'education', 'vehicle');

-- CreateEnum
CREATE TYPE "KycMethod" AS ENUM ('aadhaar', 'pan', 'bank', 'selfie');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('active', 'closed', 'defaulted');

-- CreateEnum
CREATE TYPE "RepaymentStatus" AS ENUM ('scheduled', 'paid', 'pending', 'late');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('query', 'grievance');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('started', 'completed', 'skipped', 'abandoned', 'failed');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'contacted', 'qualified', 'converted', 'lost');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin', 'analyst');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('info', 'success', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "JourneyStage" AS ENUM ('lead_captured', 'contacted', 'app_installed', 'registered', 'eligibility_checked', 'offers_viewed', 'offer_selected', 'kyc_started', 'kyc_completed', 'application_submitted', 'approved', 'rejected', 'disbursed', 'lost');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('queued', 'dialing', 'in_progress', 'completed', 'failed', 'no_answer', 'busy', 'cancelled');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('interested', 'not_interested', 'callback_requested', 'wrong_number', 'voicemail', 'unreachable', 'do_not_call', 'installed_app', 'other');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'running', 'paused', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ContactState" AS ENUM ('pending', 'queued', 'called', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "DispatchChannel" AS ENUM ('push', 'whatsapp', 'sms', 'email', 'voice');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "CampaignScheduleType" AS ENUM ('one_time', 'recurring');

-- CreateEnum
CREATE TYPE "RetryStrategy" AS ENUM ('once', 'n_per_day', 'every_n_days', 'until_answered');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "dob" TIMESTAMP(3),
    "gender" "Gender",
    "pincode" TEXT,
    "residenceType" "ResidenceType",
    "employment" "EmploymentType",
    "monthlyIncome" INTEGER,
    "company" TEXT,
    "panNumber" TEXT,
    "aadhaarLast4" TEXT,
    "lang" "Lang" NOT NULL DEFAULT 'en',
    "creditScore" INTEGER NOT NULL DEFAULT 750,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "memberVerified" BOOLEAN NOT NULL DEFAULT false,
    "notifyLoanUpdates" BOOLEAN NOT NULL DEFAULT true,
    "notifySecurityAlerts" BOOLEAN NOT NULL DEFAULT true,
    "notifyPromoOffers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'login',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanApplication" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loanType" "LoanType" NOT NULL DEFAULT 'personal',
    "amount" INTEGER NOT NULL,
    "tenureMonths" INTEGER NOT NULL DEFAULT 12,
    "purpose" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'draft',
    "employment" "EmploymentType",
    "monthlyIncome" INTEGER,
    "residenceType" "ResidenceType",
    "panNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LenderPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'account_balance',
    "baseApr" DOUBLE PRECISION NOT NULL,
    "tagline" TEXT,
    "processingFee" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LenderPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "apr" DOUBLE PRECISION NOT NULL,
    "emi" INTEGER NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "processingFee" INTEGER NOT NULL,
    "tag" TEXT,
    "recommended" BOOLEAN NOT NULL DEFAULT false,
    "selected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT,
    "method" "KycMethod" NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "apr" DOUBLE PRECISION NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "emiAmount" INTEGER NOT NULL,
    "accountLast4" TEXT NOT NULL DEFAULT '4291',
    "status" "LoanStatus" NOT NULL DEFAULT 'active',
    "disbursedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstEmiDate" TIMESTAMP(3) NOT NULL,
    "outstanding" INTEGER NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidDate" TIMESTAMP(3),
    "status" "RepaymentStatus" NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TicketType" NOT NULL DEFAULT 'query',
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deviceInfo" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "pagesVisited" INTEGER NOT NULL DEFAULT 0,
    "durationSec" INTEGER,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "screen" TEXT,
    "metadata" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingFunnel" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "stepNumber" INTEGER NOT NULL,
    "stepName" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'started',
    "timeSpentSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingFunnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnonymousLead" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "productInterest" TEXT,
    "amount" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'app',
    "campaignId" TEXT,
    "referrer" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "convertedUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppDownload" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'organic',
    "campaignId" TEXT,
    "referrer" TEXT,
    "matchedUserId" TEXT,
    "contextLoaded" BOOLEAN NOT NULL DEFAULT false,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppDownload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRefreshToken" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'info',
    "entityId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "product" TEXT,
    "amount" INTEGER,
    "summary" TEXT,
    "source" TEXT NOT NULL DEFAULT 'website',
    "transcript" JSONB,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "city" TEXT,
    "firstSource" TEXT NOT NULL DEFAULT 'website',
    "userId" TEXT,
    "campaignId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "referrer" TEXT,
    "currentStage" "JourneyStage" NOT NULL DEFAULT 'lead_captured',
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastNudgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "JourneyStage",
    "screen" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallAttempt" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "phone" TEXT NOT NULL,
    "providerCallId" TEXT,
    "status" "CallStatus" NOT NULL DEFAULT 'queued',
    "outcome" "CallOutcome",
    "summary" TEXT,
    "transcript" JSONB,
    "recordingUrl" TEXT,
    "durationSec" INTEGER,
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "rawPayload" JSONB,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dialedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "assistantId" TEXT,
    "assistantName" TEXT,
    "note" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "scheduleType" "CampaignScheduleType" NOT NULL DEFAULT 'one_time',
    "dailyStartMinute" INTEGER NOT NULL DEFAULT 540,
    "dailyEndMinute" INTEGER NOT NULL DEFAULT 1140,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "retryStrategy" "RetryStrategy" NOT NULL DEFAULT 'once',
    "maxAttemptsPerContact" INTEGER NOT NULL DEFAULT 1,
    "attemptsPerDay" INTEGER NOT NULL DEFAULT 1,
    "retryIntervalDays" INTEGER NOT NULL DEFAULT 1,
    "retryIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "stopOnAnswer" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "calledCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignContact" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "product" TEXT,
    "amount" INTEGER,
    "extra" JSONB,
    "state" "ContactState" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "attemptsToday" INTEGER NOT NULL DEFAULT 0,
    "attemptDayKey" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextEligibleAt" TIMESTAMP(3),
    "answered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "secrets" JSONB NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundRequest" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" "DispatchChannel" NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerRef" TEXT,
    "response" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StallRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "expectedEvent" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 15,
    "upshotEvent" TEXT NOT NULL,
    "channel" "DispatchChannel" NOT NULL DEFAULT 'push',
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 1440,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "firedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StallRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "OtpToken_phone_consumed_idx" ON "OtpToken"("phone", "consumed");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "Consent_userId_type_idx" ON "Consent"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LoanApplication_ref_key" ON "LoanApplication"("ref");

-- CreateIndex
CREATE INDEX "LoanApplication_userId_status_idx" ON "LoanApplication"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LenderPartner_name_key" ON "LenderPartner"("name");

-- CreateIndex
CREATE INDEX "Offer_applicationId_idx" ON "Offer"("applicationId");

-- CreateIndex
CREATE INDEX "KycVerification_userId_idx" ON "KycVerification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KycVerification_userId_method_applicationId_key" ON "KycVerification"("userId", "method", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_ref_key" ON "Loan"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "Loan_applicationId_key" ON "Loan"("applicationId");

-- CreateIndex
CREATE INDEX "Loan_userId_status_idx" ON "Loan"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Repayment_ref_key" ON "Repayment"("ref");

-- CreateIndex
CREATE INDEX "Repayment_loanId_status_idx" ON "Repayment"("loanId", "status");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_idx" ON "SupportTicket"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_ts_idx" ON "ActivityEvent"("userId", "ts");

-- CreateIndex
CREATE INDEX "ActivityEvent_eventName_ts_idx" ON "ActivityEvent"("eventName", "ts");

-- CreateIndex
CREATE INDEX "ActivityEvent_sessionId_idx" ON "ActivityEvent"("sessionId");

-- CreateIndex
CREATE INDEX "OnboardingFunnel_userId_idx" ON "OnboardingFunnel"("userId");

-- CreateIndex
CREATE INDEX "OnboardingFunnel_stepNumber_status_idx" ON "OnboardingFunnel"("stepNumber", "status");

-- CreateIndex
CREATE INDEX "AnonymousLead_status_idx" ON "AnonymousLead"("status");

-- CreateIndex
CREATE INDEX "AnonymousLead_source_idx" ON "AnonymousLead"("source");

-- CreateIndex
CREATE INDEX "AnonymousLead_createdAt_idx" ON "AnonymousLead"("createdAt");

-- CreateIndex
CREATE INDEX "AppDownload_source_idx" ON "AppDownload"("source");

-- CreateIndex
CREATE INDEX "AppDownload_platform_idx" ON "AppDownload"("platform");

-- CreateIndex
CREATE INDEX "AppDownload_installedAt_idx" ON "AppDownload"("installedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRefreshToken_tokenHash_key" ON "AdminRefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminRefreshToken_adminId_idx" ON "AdminRefreshToken"("adminId");

-- CreateIndex
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification"("read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ContextSession_token_key" ON "ContextSession"("token");

-- CreateIndex
CREATE INDEX "ContextSession_createdAt_idx" ON "ContextSession"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE INDEX "Customer_currentStage_stageEnteredAt_idx" ON "Customer"("currentStage", "stageEnteredAt");

-- CreateIndex
CREATE INDEX "Customer_lastActivityAt_idx" ON "Customer"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Customer_campaignId_idx" ON "Customer"("campaignId");

-- CreateIndex
CREATE INDEX "Customer_firstSource_idx" ON "Customer"("firstSource");

-- CreateIndex
CREATE INDEX "JourneyEvent_customerId_occurredAt_idx" ON "JourneyEvent"("customerId", "occurredAt");

-- CreateIndex
CREATE INDEX "JourneyEvent_name_occurredAt_idx" ON "JourneyEvent"("name", "occurredAt");

-- CreateIndex
CREATE INDEX "JourneyEvent_channel_occurredAt_idx" ON "JourneyEvent"("channel", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CallAttempt_providerCallId_key" ON "CallAttempt"("providerCallId");

-- CreateIndex
CREATE INDEX "CallAttempt_customerId_queuedAt_idx" ON "CallAttempt"("customerId", "queuedAt");

-- CreateIndex
CREATE INDEX "CallAttempt_campaignId_status_idx" ON "CallAttempt"("campaignId", "status");

-- CreateIndex
CREATE INDEX "CallAttempt_status_idx" ON "CallAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_code_key" ON "Campaign"("code");

-- CreateIndex
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");

-- CreateIndex
CREATE INDEX "Campaign_createdAt_idx" ON "Campaign"("createdAt");

-- CreateIndex
CREATE INDEX "CampaignContact_campaignId_state_idx" ON "CampaignContact"("campaignId", "state");

-- CreateIndex
CREATE INDEX "CampaignContact_campaignId_state_nextEligibleAt_idx" ON "CampaignContact"("campaignId", "state", "nextEligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignContact_campaignId_phone_key" ON "CampaignContact"("campaignId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_provider_key" ON "IntegrationConfig"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundRequest_idempotencyKey_key" ON "OutboundRequest"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OutboundRequest_status_createdAt_idx" ON "OutboundRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundRequest_customerId_idx" ON "OutboundRequest"("customerId");

-- CreateIndex
CREATE INDEX "StallRule_enabled_idx" ON "StallRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "StallRule_triggerEvent_expectedEvent_key" ON "StallRule"("triggerEvent", "expectedEvent");

-- AddForeignKey
ALTER TABLE "OtpToken" ADD CONSTRAINT "OtpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanApplication" ADD CONSTRAINT "LoanApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "LenderPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "LoanApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRefreshToken" ADD CONSTRAINT "AdminRefreshToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallAttempt" ADD CONSTRAINT "CallAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

