/**
 * CSV export of the Applications, Revasure and Yubi lists. Mounted at /api/admin/list-actions.
 *
 * The export re-runs the list's own where-builder (lib/listFilters.ts) with the filters the page sent,
 * so the file always matches what the operator was looking at.
 *
 * Every route needs CAN_WRITE. Exports are audited as `export.<list>`.
 */
import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import {
  requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE,
} from '../middleware/adminAuth.js';
import { toCsv } from '../lib/csv.js';
import { auditExport, sendCsv, csvFilename } from '../lib/exportAudit.js';
import {
  EXPORT_LIMIT,
  buildLoanWhere, buildRevasureWhere, buildYubiWhere, findUserIdsBySearch, personsByUserId, searchTerm,
  LOAN_CSV_HEADERS, REVASURE_CSV_HEADERS, YUBI_CSV_HEADERS,
  loanCsvRow, revasureCsvRow, yubiCsvRow,
  pickFilters,
  type ListKind,
} from '../lib/listFilters.js';

export const adminListActionsRouter = Router();
adminListActionsRouter.use(requireAdmin);
adminListActionsRouter.use(requireActiveAdmin);
adminListActionsRouter.use(auditAdmin);

interface ExportResult { headers: string[]; rows: unknown[][]; truncated: boolean }

/** One adapter per list. `exportRows` builds the CSV (cap EXPORT_LIMIT, one extra row is read to know whether it was cut). */
interface ListSource {
  exportRows(filters: Record<string, string>): Promise<ExportResult>;
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
