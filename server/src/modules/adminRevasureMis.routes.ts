/**
 * Admin "Revasure MIS status upload" API. Mounted at /api/admin/revasure/mis.
 *
 * Revasure has NO status API, so the admin periodically uploads their MIS sheet
 * (Excel/CSV). We parse it (lib/revasureMis.ts) and match each row to a
 * RevasureLead by the applicant's MOBILE NUMBER against the SwiftLoan customer
 * database, then write the row's status/amounts onto the lead.
 *
 *   POST /preview   multipart "file"  → parse + match, NO writes (review step)
 *   POST /apply     multipart "file"  → parse + match + WRITE, records the upload
 *   GET  /uploads                     → recent upload history (counts)
 *
 * Only Revasure uses this (it's the one lender with no status callback). Every
 * call is recorded in the admin audit log (auditAdmin). Writes require CAN_WRITE.
 */
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { ok, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE } from '../middleware/adminAuth.js';
import { parseMisBuffer, type MisRow } from '../lib/revasureMis.js';

export const adminRevasureMisRouter = Router();
adminRevasureMisRouter.use(requireAdmin);
adminRevasureMisRouter.use(requireActiveAdmin);
adminRevasureMisRouter.use(auditAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

type Outcome =
  | 'update'          // matched a lead and a field changed
  | 'no_change'       // matched a lead but every field already equal
  | 'missing_mobile'  // no mobile in the row
  | 'invalid_mobile'  // mobile present but not a valid 10-digit number
  | 'missing_status'  // no status in the row
  | 'no_customer'     // mobile valid but no SwiftLoan user has it
  | 'no_lead';        // customer exists but has no Revasure lead

interface Change { field: string; from: unknown; to: unknown }

interface ReportRow {
  rowNumber: number;
  name: string | null;
  mobile: string | null;
  loanAmount: number | null;
  status: string | null;
  statusKnown: boolean;
  outcome: Outcome;
  matched: boolean;
  customer: { id: string; name: string | null; phone: string | null } | null;
  leadId: string | null;
  changes: Change[];
  warnings: string[];
}

interface Report {
  rows: ReportRow[];
  summary: {
    totalRows: number;
    matched: number;     // rows resolved to a lead (update + no_change)
    toUpdate: number;    // rows with at least one field change
    noChange: number;
    unmatched: number;   // everything else
  };
}

const fullName = (u: { fullName: string | null; firstName: string | null; lastName: string | null }) =>
  (u.fullName || [u.firstName, u.lastName].filter(Boolean).join(' ')).trim() || null;

/**
 * Parse the buffer, match every row to a RevasureLead by mobile, and compute the
 * change set. DB-read only — never writes. The `leadFor` map is returned so the
 * apply path can reuse the exact matches without re-querying.
 */
async function buildReport(buffer: Buffer): Promise<{ report: Report; error?: string; leadFor: Map<number, { leadId: string; patch: Record<string, unknown>; changed: boolean }> }> {
  const parsed = parseMisBuffer(buffer);
  const leadFor = new Map<number, { leadId: string; patch: Record<string, unknown>; changed: boolean }>();
  if (parsed.error) return { report: emptyReport(), error: parsed.error, leadFor };

  const mobiles = Array.from(new Set(parsed.rows.map((r) => r.mobile).filter((m): m is string => !!m)));
  const users = mobiles.length
    ? await prisma.user.findMany({ where: { phone: { in: mobiles } }, select: { id: true, phone: true, fullName: true, firstName: true, lastName: true } })
    : [];
  const userByPhone = new Map(users.map((u) => [u.phone, u]));
  const userIds = users.map((u) => u.id);

  const leads = userIds.length
    ? await prisma.revasureLead.findMany({
        where: { userId: { in: userIds } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, userId: true,
          misStatus: true, misRemark: true, misApprovedAmount: true,
          misDisbursedAmount: true, misDisbursementDate: true,
        },
      })
    : [];
  const leadsByUser = new Map<string, typeof leads>();
  for (const l of leads) {
    const arr = leadsByUser.get(l.userId) ?? [];
    arr.push(l);
    leadsByUser.set(l.userId, arr);
  }

  // Flag mobiles that appear more than once in the sheet (last row wins on apply).
  const mobileCounts = new Map<string, number>();
  for (const r of parsed.rows) if (r.mobile) mobileCounts.set(r.mobile, (mobileCounts.get(r.mobile) ?? 0) + 1);

  const rows: ReportRow[] = parsed.rows.map((r) => buildRow(r, userByPhone, leadsByUser, mobileCounts, leadFor));

  const matched = rows.filter((r) => r.outcome === 'update' || r.outcome === 'no_change').length;
  const toUpdate = rows.filter((r) => r.outcome === 'update').length;
  const noChange = rows.filter((r) => r.outcome === 'no_change').length;
  return {
    report: { rows, summary: { totalRows: rows.length, matched, toUpdate, noChange, unmatched: rows.length - matched } },
    leadFor,
  };
}

function emptyReport(): Report {
  return { rows: [], summary: { totalRows: 0, matched: 0, toUpdate: 0, noChange: 0, unmatched: 0 } };
}

function buildRow(
  r: MisRow,
  userByPhone: Map<string | null, { id: string; phone: string | null; fullName: string | null; firstName: string | null; lastName: string | null }>,
  leadsByUser: Map<string, { id: string; misStatus: string | null; misRemark: string | null; misApprovedAmount: number | null; misDisbursedAmount: number | null; misDisbursementDate: Date | null }[]>,
  mobileCounts: Map<string, number>,
  leadFor: Map<number, { leadId: string; patch: Record<string, unknown>; changed: boolean }>,
): ReportRow {
  const base: ReportRow = {
    rowNumber: r.rowNumber,
    name: r.rawName,
    mobile: r.mobile,
    loanAmount: r.loanAmount,
    status: r.status?.label ?? null,
    statusKnown: r.status?.known ?? false,
    outcome: 'no_customer',
    matched: false,
    customer: null,
    leadId: null,
    changes: [],
    warnings: [],
  };

  // A row needs a valid mobile (the only match key) and a status to apply.
  if (!r.mobile) { base.outcome = 'missing_mobile'; return base; }
  if (!r.status) { base.outcome = 'missing_status'; return base; }

  const user = userByPhone.get(r.mobile);
  if (!user) { base.outcome = 'no_customer'; return base; }
  base.customer = { id: user.id, name: fullName(user), phone: user.phone };

  const userLeads = leadsByUser.get(user.id) ?? [];
  if (userLeads.length === 0) { base.outcome = 'no_lead'; return base; }
  const lead = userLeads[0]; // most recent (ordered desc)
  base.leadId = lead.id;
  if (userLeads.length > 1) base.warnings.push(`Customer has ${userLeads.length} Revasure leads; applying to the most recent.`);
  if ((mobileCounts.get(r.mobile) ?? 0) > 1) base.warnings.push('This mobile appears more than once in the sheet; the last row wins.');
  if (r.status && !r.status.known) base.warnings.push(`Unrecognised status "${r.status.label}" — stored as-is.`);

  // Compute the change set vs the lead's current MIS fields.
  const disbIso = r.disbursementDate ? r.disbursementDate.toISOString() : null;
  const curDisbIso = lead.misDisbursementDate ? lead.misDisbursementDate.toISOString() : null;
  const changes: Change[] = [];
  const patch: Record<string, unknown> = {};
  const consider = (field: string, from: unknown, to: unknown, patchVal: unknown) => {
    // Only overwrite with a non-null value; a blank cell never wipes an existing field.
    if (to == null) return;
    if (from !== to) changes.push({ field, from, to });
    patch[field] = patchVal;
  };
  consider('misStatus', lead.misStatus, r.status.label, r.status.label);
  consider('misRemark', lead.misRemark, r.remark, r.remark);
  consider('misApprovedAmount', lead.misApprovedAmount, r.approvedAmount, r.approvedAmount);
  consider('misDisbursedAmount', lead.misDisbursedAmount, r.disbursedAmount, r.disbursedAmount);
  consider('misDisbursementDate', curDisbIso, disbIso, r.disbursementDate);

  base.changes = changes;
  base.matched = true;
  base.outcome = changes.length ? 'update' : 'no_change';
  leadFor.set(r.rowNumber, { leadId: lead.id, patch, changed: changes.length > 0 });
  return base;
}

// POST /preview — parse + match, no writes.
adminRevasureMisRouter.post('/preview', requireRole(...CAN_WRITE), upload.single('file'), ah(async (req, res) => {
  const file = req.file;
  if (!file?.buffer?.length) return fail(res, 400, 'No file uploaded (expected multipart field "file")');
  const { report, error } = await buildReport(file.buffer);
  if (error) return fail(res, 400, error);
  return ok(res, { fileName: file.originalname ?? null, ...report }, 'Preview ready');
}));

// POST /apply — parse + match + write, and record the upload.
adminRevasureMisRouter.post('/apply', requireRole(...CAN_WRITE), upload.single('file'), ah(async (req, res) => {
  const file = req.file;
  if (!file?.buffer?.length) return fail(res, 400, 'No file uploaded (expected multipart field "file")');
  const { report, error, leadFor } = await buildReport(file.buffer);
  if (error) return fail(res, 400, error);

  const toWrite = Array.from(leadFor.values()).filter((x) => x.changed);
  const upload_ = await prisma.$transaction(async (tx) => {
    const rec = await tx.revasureMisUpload.create({
      data: {
        fileName: file.originalname ?? null,
        uploadedBy: req.admin?.email ?? null,
        totalRows: report.summary.totalRows,
        matchedRows: report.summary.matched,
        updatedRows: toWrite.length,
        unmatchedRows: report.summary.unmatched,
      },
    });
    const now = new Date();
    for (const { leadId, patch } of toWrite) {
      await tx.revasureLead.update({
        where: { id: leadId },
        data: { ...patch, misUpdatedAt: now, misUploadId: rec.id },
      });
    }
    return rec;
  });

  return ok(res, { uploadId: upload_.id, fileName: file.originalname ?? null, ...report }, `Applied ${toWrite.length} update(s)`);
}));

// GET /uploads — recent upload history.
adminRevasureMisRouter.get('/uploads', ah(async (req, res) => {
  const { page, pageSize, skip } = pageParams(req.query, 20);
  const [rows, total] = await Promise.all([
    prisma.revasureMisUpload.findMany({ orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    prisma.revasureMisUpload.count(),
  ]);
  return ok(res, { rows }, 'OK', paginate(page, pageSize, total));
}));
