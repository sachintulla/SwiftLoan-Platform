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

export type SegmentKey = 'interested' | 'not_interested' | 'not_picked_up' | 'installed_app_started' | 'rejected';

export const SEGMENT_KEYS: SegmentKey[] = ['interested', 'not_interested', 'not_picked_up', 'installed_app_started', 'rejected'];

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
  rejected: {
    label: 'Rejected by a lender',
    description:
      'Customers whose application was rejected by a lender. It also includes customers declined by our own eligibility check, which have no lender name. Anyone since approved or disbursed is left out, and anyone who asked not to be contacted.',
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
  /** Set only for the `rejected` segment: the lender that turned them down, when we know it. */
  lender?: string | null;
  /** Set only for the `rejected` segment: the reason the lender gave, when there is one. */
  reason?: string | null;
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
 * The `rejected` segment ("Rejected by a lender"). Exported as a pure SQL
 * builder so a test can read the predicate without a database.
 *
 * MEMBER if the customer (through their linked User) has any of:
 *   1. a LoanApplication with status rejected;
 *   2. an Offer the customer applied to whose lenderStatus is rejected;
 *   3. a PartnerReferral (Yubi) they proceeded with (appliedAt set) whose
 *      lastStatus starts with REJECT; or
 *   4. Customer.currentStage = 'rejected' (covers a rejection recorded only on
 *      the journey, with no application row behind it).
 * A Revasure "ineligible" answer is an eligibility result, not a lender
 * rejection, so it is deliberately not a source.
 *
 * EXCLUDED, always:
 *   - anyone with an approved or disbursed LoanApplication, applied Offer or
 *     Yubi PartnerReferral (a customer rejected by one lender and approved by
 *     another is not a win-back target). Yubi status words are the partner's
 *     raw codes (APPROVED, DISBURSED), matched by prefix the way the admin
 *     Yubi page does;
 *   - anyone who ever said do_not_call, and anyone whose stage is 'lost' -
 *     the same rule as interested, not_picked_up and installed_app_started.
 *     This segment does NOT copy the not_interested exception;
 *   - anyone with no phone.
 *
 * Source 1 includes applications rejected by our own eligibility check at
 * prequalification, which carry no lender name. That is intentional and is
 * stated in the segment description, rather than guessed apart without data.
 *
 * activityAt is the latest rejection time (Offer.rejectedAt, else the
 * application's updatedAt, else PartnerReferral.updatedAt, else
 * Customer.stageEnteredAt), so the since/until filters mean "rejected from/to".
 * lender and reason come from the most recent rejection that has one.
 *
 * It has its own WITH clause (rather than LATEST_CALL_CTE) because it needs
 * extra CTEs after the do-not-call one; the dnc definition is the same.
 */
export function rejectedSegmentSql(filters: SegmentFilters): Prisma.Sql {
  const activityExpr = Prisma.sql`lr."rejectedAt"`;
  const extra = extraFilters(filters, activityExpr);
  return Prisma.sql`
    WITH dnc AS (
      SELECT DISTINCT "customerId" FROM "CallAttempt"
      WHERE outcome = 'do_not_call' AND "customerId" IS NOT NULL
    ), rejections AS (
      -- source 1: the application itself was rejected (prequalifyReason is the lender's own decline message)
      SELECT cu.id AS "customerId", la."updatedAt" AS "rejectedAt", NULL::text AS lender, la."prequalifyReason" AS reason
      FROM "LoanApplication" la
      JOIN "Customer" cu ON cu."userId" = la."userId"
      WHERE la.status = 'rejected'::"ApplicationStatus"
      UNION ALL
      -- source 2: a lender application (applied Offer) was rejected
      SELECT cu.id, COALESCE(o."rejectedAt", la."updatedAt"), o."lenderName"::text, o."failureReason"
      FROM "Offer" o
      JOIN "LoanApplication" la ON la.id = o."applicationId"
      JOIN "Customer" cu ON cu."userId" = la."userId"
      WHERE o.applied IS TRUE AND o."lenderStatus" = 'rejected'::"ApplicationStatus"
      UNION ALL
      -- source 3: a Yubi (partner) referral the customer proceeded with was rejected
      SELECT cu.id, pr."updatedAt", pr."appliedLender"::text, NULL::text
      FROM "PartnerReferral" pr
      JOIN "Customer" cu ON cu."userId" = pr."userId"
      WHERE pr."appliedAt" IS NOT NULL AND pr."lastStatus" ILIKE 'REJECT%'
      UNION ALL
      -- source 4: the journey stage says rejected
      SELECT cu.id, cu."stageEnteredAt", NULL::text, NULL::text
      FROM "Customer" cu
      WHERE cu."currentStage" = 'rejected'::"JourneyStage"
    ), latest_rejection AS (
      SELECT "customerId", MAX("rejectedAt") AS "rejectedAt" FROM rejections GROUP BY "customerId"
    )
    SELECT c.id AS "customerId", c.phone, c.name, c.city, ${activityExpr} AS "activityAt",
      (SELECT r.lender FROM rejections r
         WHERE r."customerId" = c.id AND r.lender IS NOT NULL
         ORDER BY r."rejectedAt" DESC NULLS LAST LIMIT 1) AS lender,
      (SELECT r.reason FROM rejections r
         WHERE r."customerId" = c.id AND r.reason IS NOT NULL
         ORDER BY r."rejectedAt" DESC NULLS LAST LIMIT 1) AS reason
    FROM "Customer" c
    JOIN latest_rejection lr ON lr."customerId" = c.id
    WHERE c.phone IS NOT NULL
      AND c.id NOT IN (SELECT "customerId" FROM dnc)
      AND c."currentStage" <> 'lost'::"JourneyStage"
      AND NOT EXISTS (
        SELECT 1 FROM "LoanApplication" la2
        WHERE c."userId" IS NOT NULL AND la2."userId" = c."userId"
          AND la2.status IN ('approved'::"ApplicationStatus", 'disbursed'::"ApplicationStatus")
      )
      AND NOT EXISTS (
        SELECT 1 FROM "Offer" o2
        JOIN "LoanApplication" la3 ON la3.id = o2."applicationId"
        WHERE c."userId" IS NOT NULL AND la3."userId" = c."userId"
          AND o2.applied IS TRUE
          AND o2."lenderStatus" IN ('approved'::"ApplicationStatus", 'disbursed'::"ApplicationStatus")
      )
      AND NOT EXISTS (
        SELECT 1 FROM "PartnerReferral" pr2
        WHERE c."userId" IS NOT NULL AND pr2."userId" = c."userId"
          AND pr2."appliedAt" IS NOT NULL
          AND (pr2."lastStatus" ILIKE 'APPROV%' OR pr2."lastStatus" ILIKE 'DISBURS%')
      )
      ${extra}
  `;
}

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
    case 'rejected':
      return prisma.$queryRaw<SegmentMember[]>(rejectedSegmentSql(filters));
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
