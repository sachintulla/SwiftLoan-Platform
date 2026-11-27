/**
 * Database side of the customer's real status (rules: customerStatus.ts). Three grouped reads for any number of
 * customers, so a list page costs the same as one row. Arrays are passed as ONE parameter each (`= ANY($1)`), so the
 * "whole list" read used by the status filter and the export is not limited by the number of bind parameters.
 */
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { deriveCustomerStatus, type CustomerFacts, type CustomerStatus, type CustomerStatusKey, type LenderApplicationFact } from './customerStatus.js';
import { yubiAsLenderFact } from './yubiStatus.js';

export interface StatusSubject {
  id: string;
  userId: string | null;
  phone: string | null;
  currentStage: string;
}

interface UserRow { id: string; phone: string | null; phoneVerified: boolean; panOnFile: boolean }
interface ApplicationRow { userId: string; status: string; prequalifyReason: string | null; offerCount: number }
interface LenderRow { userId: string; status: string; lenderName: string | null }
interface YubiRow { userId: string; lastStatus: string | null; appliedLender: string | null }

/** `yubi: false` reads the Aurix side only (the lender chart shows Yubi in its own column, so it must not be counted twice). */
export interface StatusOptions { yubi?: boolean }

/** The stored facts behind each customer's status, keyed by customer id. */
export async function loadCustomerFacts(customers: StatusSubject[], opts: StatusOptions = {}): Promise<Map<string, CustomerFacts>> {
  const out = new Map<string, CustomerFacts>();
  if (!customers.length) return out;

  const userIds = [...new Set(customers.map((c) => c.userId).filter((v): v is string => !!v))];
  // The PHONE is the strong identity (same rule as the customer page): the account registered with the customer's number
  // wins, which also heals a customer linked to an older account id. The id link is the fallback.
  const phones = [...new Set(customers.map((c) => c.phone).filter((v): v is string => !!v))];

  const users = userIds.length || phones.length
    ? await prisma.$queryRaw<UserRow[]>(Prisma.sql`
        SELECT id, phone, "phoneVerified", "panOnFile"
        FROM "User"
        WHERE id = ANY(${userIds}::text[]) OR phone = ANY(${phones}::text[])`)
    : [];
  const ids = users.map((u) => u.id);

  const [applications, lenderApps, yubiRows] = ids.length
    ? await Promise.all([
        // Each person's most recent application, with how many offers it holds.
        prisma.$queryRaw<ApplicationRow[]>(Prisma.sql`
          SELECT DISTINCT ON (a."userId") a."userId", a.status::text AS status, a."prequalifyReason",
                 (SELECT count(*)::int FROM "Offer" o WHERE o."applicationId" = a.id) AS "offerCount"
          FROM "LoanApplication" a
          WHERE a."userId" = ANY(${ids}::text[])
          ORDER BY a."userId", a."createdAt" DESC`),
        prisma.$queryRaw<LenderRow[]>(Prisma.sql`
          SELECT a."userId", la.status::text AS status, la."lenderName"
          FROM "LenderApplication" la
          JOIN "LoanApplication" a ON a.id = la."applicationId"
          WHERE a."userId" = ANY(${ids}::text[])
          ORDER BY la."appliedAt" DESC`),
        // Yubi referrals of people who WENT to Yubi (appliedAt set; the background pre-check rows are not journeys).
        // Yubi reports the lender's decision, so a disbursed / approved / rejected referral is a lender outcome too.
        opts.yubi === false
          ? Promise.resolve([] as YubiRow[])
          : prisma.$queryRaw<YubiRow[]>(Prisma.sql`
              SELECT r."userId", r."lastStatus", r."appliedLender"
              FROM "PartnerReferral" r
              WHERE r."userId" = ANY(${ids}::text[]) AND r."appliedAt" IS NOT NULL AND r."lastStatus" IS NOT NULL`),
      ])
    : [[], [], []];

  const userById = new Map(users.map((u) => [u.id, u]));
  const userByPhone = new Map(users.filter((u) => u.phone).map((u) => [u.phone as string, u]));
  const appByUser = new Map(applications.map((a) => [a.userId, a]));
  const lenderByUser = new Map<string, LenderApplicationFact[]>();
  for (const la of lenderApps) {
    const list = lenderByUser.get(la.userId) ?? [];
    list.push({ status: la.status, lenderName: la.lenderName });
    lenderByUser.set(la.userId, list);
  }
  for (const y of yubiRows) {
    const fact = yubiAsLenderFact(y.lastStatus, y.appliedLender);
    if (!fact) continue;
    const list = lenderByUser.get(y.userId) ?? [];
    list.push(fact);
    lenderByUser.set(y.userId, list);
  }

  for (const c of customers) {
    const u = (c.phone ? userByPhone.get(c.phone) : null) ?? (c.userId ? userById.get(c.userId) : null) ?? null;
    if (!u) {
      out.set(c.id, { stage: c.currentStage, accountDeleted: !!c.userId, account: null });
      continue;
    }
    const a = appByUser.get(u.id);
    out.set(c.id, {
      stage: c.currentStage,
      account: {
        phoneVerified: u.phoneVerified,
        panOnFile: u.panOnFile,
        application: a ? { status: a.status, prequalifyReason: a.prequalifyReason, offerCount: Number(a.offerCount) || 0 } : null,
        lenderApplications: lenderByUser.get(u.id) ?? [],
      },
    });
  }
  return out;
}

/** Each customer's real status, keyed by customer id. */
export async function loadCustomerStatuses(customers: StatusSubject[], opts: StatusOptions = {}): Promise<Map<string, CustomerStatus>> {
  const facts = await loadCustomerFacts(customers, opts);
  const out = new Map<string, CustomerStatus>();
  for (const [id, f] of facts) out.set(id, deriveCustomerStatus(f));
  return out;
}

/**
 * The ids of the customers matching `where` whose real status is `key`, newest activity first. The status is not a
 * column (it is decided by several tables), so the filter reads the slim list and decides in memory; the caller pages
 * over the returned ids. `counts` is how the same slice splits across every status, for the filter's numbers.
 */
export async function customerIdsByStatus(
  where: Prisma.CustomerWhereInput,
  key: CustomerStatusKey | null,
  opts: StatusOptions = {},
): Promise<{ ids: string[]; counts: Record<string, number> }> {
  const all = await prisma.customer.findMany({
    where,
    orderBy: { lastActivityAt: 'desc' },
    select: { id: true, userId: true, phone: true, currentStage: true },
  });
  const statuses = await loadCustomerStatuses(all, opts);
  const counts: Record<string, number> = {};
  const ids: string[] = [];
  for (const c of all) {
    const k = statuses.get(c.id)?.key;
    if (!k) continue;
    counts[k] = (counts[k] ?? 0) + 1;
    if (!key || k === key) ids.push(c.id);
  }
  return { ids, counts };
}
