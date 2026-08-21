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
 * app is Postgres-only anyway). Every value interpolated below goes through
 * Prisma.sql's own parameter binding (tagged templates), never string
 * concatenation, so this is not an injection surface even though `search` is
 * real user input.
 *
 * Hard rule, non-negotiable: a customer who ever had a `do_not_call` outcome
 * on ANY call is excluded from every segment, forever — segmentation must
 * never be a backdoor for re-contacting someone who withdrew consent.
 */
import { Prisma } from '@prisma/client';
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
  /** When this customer last did the thing that put them in this segment
   *  (their latest call, or their latest onboarding activity). Null only if
   *  a customer somehow qualifies with no dated activity at all. */
  activityAt: Date | null;
}

export interface SegmentFilters {
  /** Matches against name or phone, case-insensitive, substring. */
  search?: string;
  /** Only include members whose activityAt is within the last N days. */
  sinceDays?: number;
}

/** Shared WHERE-clause tail: search + recency, appended to every segment query. */
function extraFilters(filters: SegmentFilters, activityColumn: Prisma.Sql): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.search && filters.search.trim()) {
    const like = `%${filters.search.trim()}%`;
    parts.push(Prisma.sql`(c.name ILIKE ${like} OR c.phone ILIKE ${like})`);
  }
  if (filters.sinceDays != null && Number.isFinite(filters.sinceDays)) {
    parts.push(Prisma.sql`${activityColumn} >= NOW() - (${Math.max(0, filters.sinceDays)} || ' days')::interval`);
  }
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
}

const LATEST_CALL_CTE = Prisma.sql`
  WITH latest_call AS (
    SELECT DISTINCT ON ("customerId") "customerId", outcome, "startedAt"
    FROM "CallAttempt"
    WHERE "customerId" IS NOT NULL
    ORDER BY "customerId", "startedAt" DESC
  ), dnc AS (
    SELECT DISTINCT "customerId" FROM "CallAttempt"
    WHERE outcome = 'do_not_call' AND "customerId" IS NOT NULL
  )
`;

/**
 * One row per customer's most recent call outcome. LEFT JOIN'd against
 * Customer for `installed_app_started` so a customer never called at all
 * still shows up there (app-behaviour is independent of ever being called).
 */
async function segmentQuery(key: SegmentKey, filters: SegmentFilters): Promise<SegmentMember[]> {
  switch (key) {
    case 'interested':
    case 'not_interested':
    case 'not_picked_up': {
      const outcome = key === 'interested' ? 'interested' : key === 'not_interested' ? 'not_interested' : 'unreachable';
      const extra = extraFilters(filters, Prisma.sql`lc."startedAt"`);
      return prisma.$queryRaw<SegmentMember[]>`
        ${LATEST_CALL_CTE}
        SELECT c.id AS "customerId", c.phone, c.name, c.city, lc."startedAt" AS "activityAt"
        FROM "Customer" c
        JOIN latest_call lc ON lc."customerId" = c.id
        WHERE lc.outcome = ${outcome}::"CallOutcome"
          AND c.phone IS NOT NULL
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
          ${extra}
      `;
    }
    case 'installed_app_started': {
      // activityAt here is whichever real signal actually qualified them —
      // the app-onboarding activity if present, else the call where they
      // said they'd installed it.
      const activityExpr = Prisma.sql`COALESCE(
        (SELECT MAX(ob."createdAt") FROM "OnboardingFunnel" ob WHERE ob."userId" = c."userId"),
        lc."startedAt"
      )`;
      const extra = extraFilters(filters, activityExpr);
      return prisma.$queryRaw<SegmentMember[]>`
        ${LATEST_CALL_CTE}
        SELECT c.id AS "customerId", c.phone, c.name, c.city, ${activityExpr} AS "activityAt"
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
          ${extra}
      `;
    }
  }
}

export async function getSegmentMembers(key: SegmentKey, filters: SegmentFilters = {}): Promise<SegmentMember[]> {
  return segmentQuery(key, filters);
}

export async function getSegmentCounts(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENT_KEYS.map(async (key) => [key, (await segmentQuery(key, {})).length] as const),
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}
