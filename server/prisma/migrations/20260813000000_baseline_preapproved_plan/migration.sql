-- Baseline for PreApprovedPlan, made IDEMPOTENT so it can also run on an empty database.
--
-- Originally this was "resolve, never run": the table already existed in the live
-- database (created via `prisma db push` before migrations were adopted), and the DDL
-- sat here purely as a drift reference. But the immediately preceding migration
-- (20260812161005) also creates the table, with IF NOT EXISTS. So on a FRESH database
-- the table exists by the time this file runs, and a bare CREATE TABLE aborted the
-- whole deploy:
--
--   Error: P3018 ... 42P07 relation "PreApprovedPlan" already exists
--
-- i.e. `prisma migrate deploy` could not bootstrap a new environment at all — it had to
-- be nursed through with `prisma migrate resolve --applied`. Adding IF NOT EXISTS keeps
-- the drift reference intact, is a no-op on databases where it is already marked
-- applied, and lets a brand-new database deploy end to end unattended. The column set
-- here is identical to the one in 20260812161005, so either path yields the same shape.
--
-- Original note follows:
-- Baseline only: PreApprovedPlan already exists in the live database (created
-- outside migration history, likely via `prisma db push` before migrations
-- were adopted). This file's DDL matches the live table exactly (verified via
-- pg_dump) purely so Prisma's drift detector has an accurate reference to diff
-- against — it is applied via `prisma migrate resolve --applied`, never run.

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
