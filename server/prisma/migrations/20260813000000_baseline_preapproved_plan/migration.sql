-- Baseline only: PreApprovedPlan already exists in the live database (created
-- outside migration history, likely via `prisma db push` before migrations
-- were adopted). This file's DDL matches the live table exactly (verified via
-- pg_dump) purely so Prisma's drift detector has an accurate reference to diff
-- against — it is applied via `prisma migrate resolve --applied`, never run.

CREATE TABLE "PreApprovedPlan" (
    id text NOT NULL,
    "lenderName" text NOT NULL,
    "logoUrl" text,
    icon text DEFAULT 'account_balance'::text NOT NULL,
    badge text,
    "maxAmount" integer,
    "amountAtApproval" boolean DEFAULT false NOT NULL,
    "rateMin" double precision,
    "rateMax" double precision,
    "rateAtApproval" boolean DEFAULT false NOT NULL,
    "tenureMinMonths" integer,
    "tenureMaxMonths" integer,
    tags text[],
    "displayOrder" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "exploreUrl" text,

    CONSTRAINT "PreApprovedPlan_pkey" PRIMARY KEY (id)
);

CREATE INDEX "PreApprovedPlan_active_displayOrder_idx" ON "PreApprovedPlan" USING btree (active, "displayOrder");
