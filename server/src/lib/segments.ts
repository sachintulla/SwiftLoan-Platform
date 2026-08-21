/**
 * Admin campaign segmentation — default customer segments an admin can pick
 * from when populating a campaign, instead of hand-uploading a spreadsheet.
 *
 * Each segment is computed live off `Customer` + the latest `CallAttempt` for
 * that customer (or off real in-app behaviour for the "installed app"
 * segment) — nothing is pre-materialised, so counts always reflect the
 * current DB. "Latest call outcome" needs one row per customer ordered by
 * `startedAt DESC`, which Prisma's query builder can't express without a
 * window function — hence the raw SQL (`DISTINCT ON`, Postgres-only, but this
 * app is Postgres-only anyway). Every value interpolated below is a hardcoded
 * enum literal, never user input, so this is not an injection surface.
 *
 * Hard rule, non-negotiable: a customer who ever had a `do_not_call` outcome
 * on ANY call is excluded from every segment, forever — segmentation must
 * never be a backdoor for re-contacting someone who withdrew consent.
 */
import { prisma } from './prisma.js';

export type SegmentKey = 'interested' | 'not_interested' | 'not_picked_up' | 'installed_app_started';

export const SEGMENT_KEYS: SegmentKey[] = ['interested', 'not_interested', 'not_picked_up', 'installed_app_started'];

export const SEGMENT_DEFS: Record<SegmentKey, { label: string; description: string }> = {
  interested: {
    label: 'Interested',
    description: 'Most recent call outcome was "interested".',
  },
  not_interested: {
    label: 'Not interested',
    description: 'Most recent call outcome was "not interested".',
  },
  not_picked_up: {
    label: "Didn't pick up",
    description: 'Most recent call outcome was "unreachable" — rang, no answer.',
  },
  installed_app_started: {
    label: 'Installed the app & started',
    description: 'Said they installed the app on a call, or has real in-app onboarding activity.',
  },
};

export interface SegmentMember {
  customerId: string;
  phone: string;
  name: string | null;
  city: string | null;
}

/**
 * One row per customer's most recent call outcome. LEFT JOIN'd against
 * Customer everywhere below so a customer never called at all still shows up
 * for the app-behaviour segment (`installed_app_started`) with a null outcome.
 */
async function segmentQuery(key: SegmentKey): Promise<SegmentMember[]> {
  switch (key) {
    case 'interested':
      return prisma.$queryRaw<SegmentMember[]>`
        WITH latest_call AS (
          SELECT DISTINCT ON ("customerId") "customerId", outcome
          FROM "CallAttempt"
          WHERE "customerId" IS NOT NULL
          ORDER BY "customerId", "startedAt" DESC
        ), dnc AS (
          SELECT DISTINCT "customerId" FROM "CallAttempt"
          WHERE outcome = 'do_not_call' AND "customerId" IS NOT NULL
        )
        SELECT c.id AS "customerId", c.phone, c.name, c.city
        FROM "Customer" c
        JOIN latest_call lc ON lc."customerId" = c.id
        WHERE lc.outcome = 'interested'::"CallOutcome"
          AND c.phone IS NOT NULL
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
      `;
    case 'not_interested':
      return prisma.$queryRaw<SegmentMember[]>`
        WITH latest_call AS (
          SELECT DISTINCT ON ("customerId") "customerId", outcome
          FROM "CallAttempt"
          WHERE "customerId" IS NOT NULL
          ORDER BY "customerId", "startedAt" DESC
        ), dnc AS (
          SELECT DISTINCT "customerId" FROM "CallAttempt"
          WHERE outcome = 'do_not_call' AND "customerId" IS NOT NULL
        )
        SELECT c.id AS "customerId", c.phone, c.name, c.city
        FROM "Customer" c
        JOIN latest_call lc ON lc."customerId" = c.id
        WHERE lc.outcome = 'not_interested'::"CallOutcome"
          AND c.phone IS NOT NULL
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
      `;
    case 'not_picked_up':
      return prisma.$queryRaw<SegmentMember[]>`
        WITH latest_call AS (
          SELECT DISTINCT ON ("customerId") "customerId", outcome
          FROM "CallAttempt"
          WHERE "customerId" IS NOT NULL
          ORDER BY "customerId", "startedAt" DESC
        ), dnc AS (
          SELECT DISTINCT "customerId" FROM "CallAttempt"
          WHERE outcome = 'do_not_call' AND "customerId" IS NOT NULL
        )
        SELECT c.id AS "customerId", c.phone, c.name, c.city
        FROM "Customer" c
        JOIN latest_call lc ON lc."customerId" = c.id
        WHERE lc.outcome = 'unreachable'::"CallOutcome"
          AND c.phone IS NOT NULL
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
      `;
    case 'installed_app_started':
      return prisma.$queryRaw<SegmentMember[]>`
        WITH latest_call AS (
          SELECT DISTINCT ON ("customerId") "customerId", outcome
          FROM "CallAttempt"
          WHERE "customerId" IS NOT NULL
          ORDER BY "customerId", "startedAt" DESC
        ), dnc AS (
          SELECT DISTINCT "customerId" FROM "CallAttempt"
          WHERE outcome = 'do_not_call' AND "customerId" IS NOT NULL
        )
        SELECT c.id AS "customerId", c.phone, c.name, c.city
        FROM "Customer" c
        LEFT JOIN latest_call lc ON lc."customerId" = c.id
        WHERE c.phone IS NOT NULL
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
          AND (
            lc.outcome = 'installed_app'::"CallOutcome"
            OR EXISTS (
              SELECT 1 FROM "OnboardingFunnel" ob
              WHERE ob."userId" = c."userId" AND c."userId" IS NOT NULL
            )
          )
      `;
  }
}

export async function getSegmentMembers(key: SegmentKey): Promise<SegmentMember[]> {
  return segmentQuery(key);
}

export async function getSegmentCounts(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENT_KEYS.map(async (key) => [key, (await segmentQuery(key)).length] as const),
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}
