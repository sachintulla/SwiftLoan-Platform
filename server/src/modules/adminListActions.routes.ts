/**
 * Actions on the Loan Pipeline, Revasure and Yubi lists: CSV export and "start a
 * campaign from this list". Mounted at /api/admin/list-actions.
 *
 * Both actions re-run the list's own where-builder (lib/listFilters.ts) with the
 * filters the page sent, so the file and the campaign always match what the
 * operator was looking at. A client never sends a phone list: contacts are always
 * resolved here, from the database.
 *
 * Every route needs CAN_WRITE. Exports are audited as `export.<list>`, and a
 * campaign created here is a draft: nothing is dialled until a super admin starts it.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ah, HttpError } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created } from '../lib/http.js';
import {
  requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE,
} from '../middleware/adminAuth.js';
import { toCsv } from '../lib/csv.js';
import { auditExport, sendCsv, csvFilename } from '../lib/exportAudit.js';
import { doNotContactPhones } from '../lib/doNotContact.js';
import { createDraftCampaign } from './campaigns.routes.js';
import { scoped } from '../lib/log.js';
import {
  EXPORT_LIMIT, CAMPAIGN_FROM_LIST_CAP, LIST_LABELS,
  buildLoanWhere, buildRevasureWhere, buildYubiWhere, findUserIdsBySearch, personsByUserId, searchTerm,
  LOAN_CSV_HEADERS, REVASURE_CSV_HEADERS, YUBI_CSV_HEADERS,
  loanCsvRow, revasureCsvRow, yubiCsvRow,
  pickFilters, planContacts, rupeesToPaise, describeFilterSet,
  type ListKind, type ContactCandidate,
} from '../lib/listFilters.js';

const log = scoped('list-actions');

export const adminListActionsRouter = Router();
adminListActionsRouter.use(requireAdmin);
adminListActionsRouter.use(requireActiveAdmin);
adminListActionsRouter.use(auditAdmin);

/* ─────────────────────────── loading ─────────────────────────── */

/** Rows are read from the database this many at a time. */
const CHUNK = 1000;

/** Page through a query until `limit` rows are loaded or the rows run out. */
async function loadChunks<T>(fetchPage: (skip: number, take: number) => Promise<T[]>, limit: number): Promise<T[]> {
  const out: T[] = [];
  while (out.length < limit) {
    const take = Math.min(CHUNK, limit - out.length);
    const page = await fetchPage(out.length, take);
    out.push(...page);
    if (page.length < take) break;
  }
  return out;
}

interface ExportResult { headers: string[]; rows: unknown[][]; truncated: boolean }

/**
 * One adapter per list. `exportRows` builds the CSV (cap EXPORT_LIMIT, one extra
 * row is read to know whether it was cut). `candidates` reads the rows a campaign
 * would be built from (cap CAMPAIGN_FROM_LIST_CAP + 1, so "too many" is known
 * without reading the whole table).
 */
interface ListSource {
  exportRows(filters: Record<string, string>): Promise<ExportResult>;
  candidates(filters: Record<string, string>): Promise<ContactCandidate[]>;
  count(filters: Record<string, string>): Promise<number>;
}

const SOURCES: Record<ListKind, ListSource> = {
  loans: {
    async exportRows(f) {
      const rows = await prisma.loanApplication.findMany({
        where: buildLoanWhere(f),
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: EXPORT_LIMIT + 1,
        select: {
          ref: true, loanType: true, amount: true, status: true, createdAt: true,
          user: { select: { fullName: true, phone: true } },
          offers: { where: { applied: true }, select: { lenderStatus: true } },
        },
      });
      const truncated = rows.length > EXPORT_LIMIT;
      return { headers: LOAN_CSV_HEADERS, rows: rows.slice(0, EXPORT_LIMIT).map(loanCsvRow), truncated };
    },
    async candidates(f) {
      const where = buildLoanWhere(f);
      const rows = await loadChunks((skip, take) => prisma.loanApplication.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip, take,
        select: {
          loanType: true, amount: true, status: true,
          user: { select: { fullName: true, firstName: true, phone: true } },
        },
      }), CAMPAIGN_FROM_LIST_CAP + 1);
      return rows.map((r) => ({
        name: r.user?.fullName || r.user?.firstName || null,
        phone: r.user?.phone ?? null,
        product: r.loanType,
        amountPaise: rupeesToPaise(r.amount),
        status: r.status,
      }));
    },
    count: (f) => prisma.loanApplication.count({ where: buildLoanWhere(f) }),
  },

  revasure: {
    async exportRows(f) {
      const where = buildRevasureWhere(f, await findUserIdsBySearch(searchTerm(f)));
      const rows = await prisma.revasureLead.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: EXPORT_LIMIT + 1,
        // Explicit select: requestBody and responseBody carry applicant details and never leave the server.
        select: {
          userId: true, sourceLeadId: true, leadId: true, status: true, httpStatus: true,
          message: true, lastError: true, updatedAt: true,
        },
      });
      const truncated = rows.length > EXPORT_LIMIT;
      const kept = rows.slice(0, EXPORT_LIMIT);
      const users = await personsByUserId(kept.map((r) => r.userId));
      return {
        headers: REVASURE_CSV_HEADERS,
        rows: kept.map((r) => revasureCsvRow(r, users.get(r.userId) ?? null)),
        truncated,
      };
    },
    async candidates(f) {
      const where = buildRevasureWhere(f, await findUserIdsBySearch(searchTerm(f)));
      const rows = await loadChunks((skip, take) => prisma.revasureLead.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip, take,
        select: { userId: true, status: true },
      }), CAMPAIGN_FROM_LIST_CAP + 1);
      const users = await personsByUserId(rows.map((r) => r.userId));
      return rows.map((r) => ({
        name: users.get(r.userId)?.name ?? null,
        phone: users.get(r.userId)?.phone ?? null,
        product: null,
        amountPaise: null,
        status: r.status,
      }));
    },
    async count(f) {
      return prisma.revasureLead.count({ where: buildRevasureWhere(f, await findUserIdsBySearch(searchTerm(f))) });
    },
  },

  yubi: {
    async exportRows(f) {
      const where = buildYubiWhere(f, await findUserIdsBySearch(searchTerm(f)));
      const rows = await prisma.partnerReferral.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        take: EXPORT_LIMIT + 1,
        // Explicit select: rawCreate, rawAuth and redirectUrl can hold tokens.
        select: { userId: true, appliedLender: true, lastStatus: true, status: true, appliedAt: true },
      });
      const truncated = rows.length > EXPORT_LIMIT;
      const kept = rows.slice(0, EXPORT_LIMIT);
      const users = await personsByUserId(kept.map((r) => r.userId));
      return {
        headers: YUBI_CSV_HEADERS,
        rows: kept.map((r) => yubiCsvRow(r, users.get(r.userId) ?? null)),
        truncated,
      };
    },
    async candidates(f) {
      const where = buildYubiWhere(f, await findUserIdsBySearch(searchTerm(f)));
      const rows = await loadChunks((skip, take) => prisma.partnerReferral.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip, take,
        select: { userId: true, lastStatus: true, status: true },
      }), CAMPAIGN_FROM_LIST_CAP + 1);
      const users = await personsByUserId(rows.map((r) => r.userId));
      return rows.map((r) => ({
        name: users.get(r.userId)?.name ?? null,
        phone: users.get(r.userId)?.phone ?? null,
        product: null,
        amountPaise: null,
        status: r.lastStatus || r.status,
      }));
    },
    async count(f) {
      return prisma.partnerReferral.count({ where: buildYubiWhere(f, await findUserIdsBySearch(searchTerm(f))) });
    },
  },
};

/* ─────────────────────────── CSV export ─────────────────────────── */

// GET /api/admin/list-actions/{loans|revasure|yubi}.csv?<the list's filters>
async function sendExport(req: Request, res: Response, kind: ListKind) {
  const filters = pickFilters(kind, req.query as Record<string, unknown>);
  const out = await SOURCES[kind].exportRows(filters);
  // Recorded before the file is sent, so a dropped connection cannot leave an export with no trail.
  await auditExport(req, { name: kind, filters, rows: out.rows.length, truncated: out.truncated });
  return sendCsv(res, csvFilename(kind), toCsv(out.headers, out.rows));
}

adminListActionsRouter.get('/loans.csv', requireRole(...CAN_WRITE), ah((req, res) => sendExport(req, res, 'loans')));
adminListActionsRouter.get('/revasure.csv', requireRole(...CAN_WRITE), ah((req, res) => sendExport(req, res, 'revasure')));
adminListActionsRouter.get('/yubi.csv', requireRole(...CAN_WRITE), ah((req, res) => sendExport(req, res, 'yubi')));

/* ─────────────────────────── campaign from a list ─────────────────────────── */

const campaignBody = z.object({
  filters: z.record(z.string(), z.string().max(200)).default({}),
  name: z.string().trim().min(1).max(120).optional(),
  dryRun: z.boolean().optional(),
});

/** A refusal. The machine-readable code sits in data.code, the same as the other admin outreach routes. */
function refuse(res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ success: false, data: { code, ...extra }, message, error: message });
}

// POST /api/admin/list-actions/{loans|revasure|yubi}/campaign
//   { filters, name?, dryRun? }
// dryRun returns counts only. A real run creates a DRAFT campaign and its contacts;
// it never starts anything (starting is super-admin only, on the campaign itself).
function campaignHandler(kind: ListKind) {
  return ah(async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof campaignBody>;
    const dryRun = body.dryRun === true;
    if (!dryRun && !body.name) throw new HttpError(400, 'Name: give the campaign a name');

    const filters = pickFilters(kind, body.filters);
    const source = SOURCES[kind];

    const rows = await source.candidates(filters);
    if (rows.length > CAMPAIGN_FROM_LIST_CAP) {
      const matched = await source.count(filters);
      if (dryRun) {
        return ok(res, {
          matched, withPhone: 0, noPhone: 0, duplicates: 0, excludedDoNotContact: 0, willAdd: 0, capped: true,
        }, 'Too many customers match');
      }
      return refuse(res, 422, 'too_many',
        `${matched} rows match, and a campaign from a list can take at most ${CAMPAIGN_FROM_LIST_CAP}. Narrow the filters and try again.`,
        { matched });
    }

    // Same number, the same way, for everyone: dedupe by mobile, then drop anyone who asked not to be contacted.
    const plan = planContacts(rows);
    const blocked = await doNotContactPhones(plan.contacts.map((c) => c.phone));
    const contacts = plan.contacts.filter((c) => !blocked.has(c.phone));
    const excludedDoNotContact = plan.contacts.length - contacts.length;

    const counts = {
      matched: rows.length,
      noPhone: plan.noPhone,
      duplicates: plan.duplicates,
      excludedDoNotContact,
    };

    if (dryRun) {
      return ok(res, { ...counts, withPhone: plan.withPhone, willAdd: contacts.length, capped: false }, 'Preview');
    }
    if (contacts.length === 0) {
      return refuse(res, 400, 'nothing_to_add', 'No one on this list can be added. Everyone is missing a mobile number, repeated, or asked not to be contacted.', counts);
    }

    let campaign: Awaited<ReturnType<typeof createDraftCampaign>>;
    try {
      campaign = await createDraftCampaign({
        name: body.name!,
        note: `Created from ${LIST_LABELS[kind]}. Filters: ${describeFilterSet(filters)}.`,
        createdBy: req.admin?.sub ?? null,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return refuse(res, 409, 'code_taken', 'A campaign with that code already exists. Try a different name.');
      }
      throw e;
    }

    let inserted = 0;
    try {
      for (let i = 0; i < contacts.length; i += 500) {
        const result = await prisma.campaignContact.createMany({
          data: contacts.slice(i, i + 500).map((c): Prisma.CampaignContactCreateManyInput => ({
            campaignId: campaign.id,
            phone: c.phone,
            name: c.name,
            product: c.product,
            amount: c.amountPaise,
            extra: { sourceList: kind, status: c.status },
          })),
          skipDuplicates: true,
        });
        inserted += result.count;
      }
    } finally {
      // Keep the count right even if a slice failed part-way, so the draft shows what it really holds.
      const totalContacts = await prisma.campaignContact.count({ where: { campaignId: campaign.id } });
      await prisma.campaign.update({ where: { id: campaign.id }, data: { totalContacts } });
    }

    log.info('campaign created from list', { list: kind, campaignId: campaign.id, ...counts, inserted, by: req.admin?.sub ?? null });
    return created(res, { campaignId: campaign.id, campaignCode: campaign.code, ...counts, inserted }, 'Draft campaign created');
  });
}

adminListActionsRouter.post('/loans/campaign', requireRole(...CAN_WRITE), validate(campaignBody), campaignHandler('loans'));
adminListActionsRouter.post('/revasure/campaign', requireRole(...CAN_WRITE), validate(campaignBody), campaignHandler('revasure'));
adminListActionsRouter.post('/yubi/campaign', requireRole(...CAN_WRITE), validate(campaignBody), campaignHandler('yubi'));
