-- Baseline: PreApprovedPlan predates the migration history (created via
-- `prisma db push`). Live databases mark this migration applied with
-- `prisma migrate resolve --applied`. IF NOT EXISTS also makes it safe on a
-- fresh database, where 20260812161005_aurix_offers_and_applicant_fields has
-- already created the table (CI "Migrations apply cleanly").

CREATE TABLE IF NOT EXISTS "PreApprovedPlan" (
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

CREATE INDEX IF NOT EXISTS "PreApprovedPlan_active_displayOrder_idx" ON "PreApprovedPlan" USING btree (active, "displayOrder");
