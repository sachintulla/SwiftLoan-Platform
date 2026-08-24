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
 * `do_not_call` (a customer who ever asked never to be called again) is
 * excluded from `interested`, `not_picked_up` and `installed_app_started` —
 * segmentation must not be a backdoor for re-contacting someone who withdrew
 * consent via those buckets. `not_interested` is the one deliberate exception:
 * per an explicit product decision, do-not-call customers are folded into it
 * on purpose (see that case below) rather than disappearing from segmentation
 * entirely, which does make them selectable for a future campaign — a known,
 * accepted tradeoff, not an oversight.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export type SegmentKey = 'interested' | 'not_interested' | 'not_picked_up' | 'installed_app_started';

export const SEGMENT_KEYS: SegmentKey[] = ['interested', 'not_interested', 'not_picked_up', 'installed_app_started'];

export const SEGMENT_DEFS: Record<SegmentKey, { label: string; description: string }> = {
  interested: {
    label: 'Interested',
    description: 'Verified their phone (website eligibility check or the app) and have not asked to never be called.',
  },
  not_interested: {
    label: 'Not interested',
    description: 'Started checking eligibility but never verified the OTP, or verified but asked to never be called again.',
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
  /** Only include members whose activityAt falls on or after this date (YYYY-MM-DD). */
  since?: string;
  /** Only include members whose activityAt falls on or before this date (YYYY-MM-DD), inclusive of the whole day. */
  until?: string;
}

/** Shared WHERE-clause tail: search + a date range, appended to every segment query. */
function extraFilters(filters: SegmentFilters, activityColumn: Prisma.Sql): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filters.search && filters.search.trim()) {
    const like = `%${filters.search.trim()}%`;
    parts.push(Prisma.sql`(c.name ILIKE ${like} OR c.phone ILIKE ${like})`);
  }
  if (filters.since) {
    parts.push(Prisma.sql`${activityColumn} >= ${filters.since}::date`);
  }
  if (filters.until) {
    // Inclusive of the whole "until" day — activity any time before the next day.
    parts.push(Prisma.sql`${activityColumn} < (${filters.until}::date + interval '1 day')`);
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
    case 'interested': {
      // "Interested" is no longer about what anyone said on a call — it's
      // reachability: phone proven (via the website's OTP challenge OR the
      // app's own OTP verify, either counts) and not on the do-not-call list.
      // A customer who has never been called at all is still Interested as
      // long as they're verified and haven't opted out.
      const activityExpr = Prisma.sql`COALESCE(c."phoneVerifiedAt", lc."startedAt", c."firstSeenAt")`;
      const extra = extraFilters(filters, activityExpr);
      return prisma.$queryRaw<SegmentMember[]>`
        ${LATEST_CALL_CTE}
        SELECT c.id AS "customerId", c.phone, c.name, c.city, ${activityExpr} AS "activityAt"
        FROM "Customer" c
        LEFT JOIN latest_call lc ON lc."customerId" = c.id
        WHERE c.phone IS NOT NULL
          AND (c."phoneVerified" IS TRUE OR c."userId" IS NOT NULL)
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
          ${extra}
      `;
    }
    case 'not_picked_up': {
      const extra = extraFilters(filters, Prisma.sql`lc."startedAt"`);
      return prisma.$queryRaw<SegmentMember[]>`
        ${LATEST_CALL_CTE}
        SELECT c.id AS "customerId", c.phone, c.name, c.city, lc."startedAt" AS "activityAt"
        FROM "Customer" c
        JOIN latest_call lc ON lc."customerId" = c.id
        WHERE lc.outcome = 'unreachable'::"CallOutcome"
          AND c.phone IS NOT NULL
          AND c.id NOT IN (SELECT "customerId" FROM dnc)
          ${extra}
      `;
    }
    case 'not_interested': {
      // Two groups, both deliberate:
      //  1. Never verified at all — e.g. clicked "Check eligibility" on the
      //     website and dropped off before entering the OTP. No CallAttempt
      //     row to match on, so this must be a LEFT JOIN, not the inner join
      //     `not_picked_up` uses — otherwise they'd be invisible to every
      //     segment (installed_app_started won't catch them either).
      //  2. Verified, but asked to never be called again (do_not_call). This
      //     is the one explicit, confirmed exception to the do-not-call
      //     exclusion every other segment enforces — see the module comment
      //     above. It makes them selectable for a future campaign; that is
      //     the accepted tradeoff, not an oversight.
      const activityExpr = Prisma.sql`COALESCE(lc."startedAt", c."phoneVerifiedAt", c."firstSeenAt")`;
      const extra = extraFilters(filters, activityExpr);
      return prisma.$queryRaw<SegmentMember[]>`
        ${LATEST_CALL_CTE}
        SELECT c.id AS "customerId", c.phone, c.name, c.city, ${activityExpr} AS "activityAt"
        FROM "Customer" c
        LEFT JOIN latest_call lc ON lc."customerId" = c.id
        WHERE c.phone IS NOT NULL
          AND (
            (c."phoneVerified" IS NOT TRUE AND c."userId" IS NULL)
            OR c.id IN (SELECT "customerId" FROM dnc)
          )
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
