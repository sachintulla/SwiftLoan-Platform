/**
 * WS5 — bulk outbound-calling campaigns. Mounted at /api/admin/campaigns behind
 * requireAdmin.
 *
 * A campaign is: a spreadsheet of contacts + an Ello assistant + a concurrency
 * limit. Starting one marks it live; lib/campaignRunner.ts then dials it on
 * schedule. The HTTP response returns immediately.
 */
import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { canDialNow, nextWindowOpening, formatMinutes } from '../lib/campaignSchedule.js';
import { isCampaignTicking } from '../lib/campaignRunner.js';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { normalisePhone } from '../lib/dialer.js';
import { SEGMENT_KEYS, getSegmentMembers, type SegmentKey } from '../lib/segments.js';
import { scoped } from '../lib/log.js';
import { triggerElloCampaign } from '../lib/integrations.js';

const log = scoped('campaigns');

export const campaignsRouter = Router();
campaignsRouter.use(requireAdmin);
campaignsRouter.use(requireActiveAdmin);
campaignsRouter.use(auditAdmin);



const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'completed', 'failed', 'cancelled'] as const;
type CampaignStatusValue = (typeof CAMPAIGN_STATUSES)[number];

// Spreadsheets are parsed in-process and never written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** contact-state + call-outcome counts for one campaign. */
async function campaignCounts(campaignId: string) {
  const [byState, byOutcome] = await Promise.all([
    prisma.campaignContact.groupBy({ by: ['state'], where: { campaignId }, _count: { _all: true } }),
    prisma.callAttempt.groupBy({ by: ['outcome'], where: { campaignId }, _count: { _all: true } }),
  ]);
  const contacts: Record<string, number> = { pending: 0, queued: 0, called: 0, failed: 0, skipped: 0 };
  byState.forEach((g) => { contacts[g.state] = g._count._all; });
  const outcomes: Record<string, number> = {};
  byOutcome.forEach((g) => { outcomes[g.outcome ?? 'pending'] = g._count._all; });
  return { contacts, outcomes };
}

/* ───────────────────────── schedule validation ───────────────────────── */

/**
 * Schedule fields, shared by create and update. Times are minutes from local
 * midnight (540 = 09:00) so the window is comparable without date arithmetic;
 * the UI presents them as time pickers.
 */
const scheduleShape = {
  // The client's formToPayload() always sends explicit `null` (never omits
  // the key) for a start/end date or assistant name left blank — so these
  // need .nullable(), not just .optional(), or every campaign save with an
  // empty one of these 400s. (assistantId/note below have the same shape for
  // the same reason.)
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  scheduleType: z.enum(['one_time', 'recurring']).optional(),
  timezone: z.string().min(1).max(64).optional(),
  dailyStartMinute: z.number().int().min(0).max(1439).optional(),
  dailyEndMinute: z.number().int().min(0).max(1439).optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  retryStrategy: z.enum(['once', 'n_per_day', 'every_n_days', 'until_answered']).optional(),
  maxAttemptsPerContact: z.number().int().min(1).max(50).optional(),
  attemptsPerDay: z.number().int().min(1).max(24).optional(),
  retryIntervalDays: z.number().int().min(1).max(365).optional(),
  retryIntervalMinutes: z.number().int().min(1).max(10080).optional(),
  stopOnAnswer: z.boolean().optional(),
  assistantName: z.string().max(200).nullable().optional(),
};

/** Cross-field rules Zod cannot express field-by-field. Returns an error string. */
function validateSchedule(b: Record<string, any>): string | null {
  if (b.startAt && b.endAt && new Date(b.endAt) <= new Date(b.startAt)) {
    return 'endAt must be after startAt';
  }
  if (b.dailyStartMinute != null && b.dailyEndMinute != null && b.dailyStartMinute === b.dailyEndMinute) {
    return 'The daily calling window cannot start and end at the same minute';
  }
  if (b.timezone) {
    // Reject an unknown zone here rather than silently falling back to UTC in
    // the scheduler, which would dial at the wrong hours.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: b.timezone });
    } catch {
      return `Unknown timezone "${b.timezone}"`;
    }
  }
  if (b.retryStrategy && b.retryStrategy !== 'once' && b.maxAttemptsPerContact === 1) {
    return `retryStrategy "${b.retryStrategy}" needs maxAttemptsPerContact greater than 1`;
  }
  return null;
}

/**
 * Derive a URL-safe campaign code from its name.
 *
 * `code` is the attribution key (it lands on Customer.campaignId and every call
 * log), so it must exist and be unique — but making an operator invent one was
 * pure friction, so it is generated here and only accepted from the client when
 * explicitly supplied.
 */
function slugifyCode(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'campaign';
}

/** First free variant of `base` — base, base-2, base-3, … */
async function uniqueCode(base: string): Promise<string> {
  for (let i = 1; i < 200; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const clash = await prisma.campaign.findUnique({ where: { code: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  // Pathological collision count — fall back to something certainly free.
  return `${base}-${Date.now().toString(36)}`;
}

/** Map validated body fields onto Prisma data, omitting anything not supplied. */
function scheduleData(b: Record<string, any>) {
  const d: Record<string, any> = {};
  if (b.startAt !== undefined) d.startAt = b.startAt ? new Date(b.startAt) : null;
  if (b.endAt !== undefined) d.endAt = b.endAt ? new Date(b.endAt) : null;
  for (const k of [
    'scheduleType', 'timezone', 'dailyStartMinute', 'dailyEndMinute', 'daysOfWeek',
    'retryStrategy', 'maxAttemptsPerContact', 'attemptsPerDay', 'retryIntervalDays',
    'retryIntervalMinutes', 'stopOnAnswer', 'assistantName',
  ]) {
    if (b[k] !== undefined) d[k] = b[k];
  }
  return d;
}

// ─────────────────────────── list / create ───────────────────────────

// GET /api/admin/campaigns
campaignsRouter.get('/', ah(async (req, res) => {
  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>);
  const status = req.query.status ? String(req.query.status) : undefined;
  // Soft-deleted campaigns are hidden from the normal list — pass
  // ?deleted=true to see (only) the deleted ones instead, e.g. to restore one.
  const showDeleted = req.query.deleted === 'true';
  const where: Prisma.CampaignWhereInput = {
    deletedAt: showDeleted ? { not: null } : null,
    ...(status && (CAMPAIGN_STATUSES as readonly string[]).includes(status)
      ? { status: status as CampaignStatusValue }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { _count: { select: { contacts: true, calls: true } } },
    }),
  ]);

  // One grouped query for the whole page rather than campaignCounts() per row.
  // At 20 rows that was 40 round-trips per list render; this is 1.
  const ids = rows.map((r) => r.id);
  const grouped = ids.length
    ? await prisma.campaignContact.groupBy({
        by: ['campaignId', 'state'],
        where: { campaignId: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const countsByCampaign = new Map<string, Record<string, number>>();
  for (const id of ids) {
    countsByCampaign.set(id, { pending: 0, queued: 0, called: 0, failed: 0, skipped: 0 });
  }
  for (const g of grouped) {
    const bucket = countsByCampaign.get(g.campaignId);
    if (bucket) bucket[g.state] = g._count._all;
  }

  const items = rows.map((c) => ({ ...c, counts: countsByCampaign.get(c.id)! }));

  return ok(res, items, 'Campaigns', paginate(page, pageSize, total));
}));

// POST /api/admin/campaigns
campaignsRouter.post('/', requireRole(...CAN_WRITE),
  validate(z.object({
    name: z.string().min(1).max(120),
    // Optional: derived from the name when omitted, so the operator never has
    // to invent one. Still accepted for callers that want to set it explicitly.
    code: z.string().min(1).max(60).regex(/^[A-Za-z0-9_-]+$/, 'code may contain letters, digits, - and _ only').optional(),
    concurrency: z.number().int().min(1).max(50).optional(),
    assistantId: z.string().min(1).nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    ...scheduleShape,
  })),
  ah(async (req, res) => {
    const b = req.body as Record<string, any>;
    const invalid = validateSchedule(b);
    if (invalid) return fail(res, 400, invalid);

    // Generated from the name unless the caller supplied one. Uniqueness is
    // resolved here; the P2002 catch below still covers the race where two
    // requests pick the same candidate concurrently.
    const code = b.code ?? (await uniqueCode(slugifyCode(b.name)));

    try {
      const campaign = await prisma.campaign.create({
        data: {
          name: b.name,
          code,
          concurrency: b.concurrency ?? 1,
          assistantId: b.assistantId ?? null,
          note: b.note ?? null,
          createdBy: req.admin?.sub ?? null,
          ...scheduleData(b),
        },
      });
      log.info('campaign created', { id: campaign.id, name: campaign.name, code: campaign.code, createdBy: req.admin?.sub ?? null });
      return created(res, campaign, 'Campaign created');
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return fail(res, 409, `A campaign with code "${code}" already exists`);
      }
      throw e;
    }
  }));

// DELETE /api/admin/campaigns/:id
// Soft delete: sets deletedAt rather than removing the row, so the campaign
// (and every contact/call-history row it's linked to) is never actually
// erased and can always be restored — see the schema comment on
// Campaign.deletedAt. A running campaign must be cancelled or paused first;
// deleting out from under an active dial would leave campaignRunner
// referencing a campaign that's vanished from every normal list.
campaignsRouter.delete('/:id', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');
  if (campaign.deletedAt) return fail(res, 409, 'Campaign is already deleted');
  if (campaign.status === 'running') return fail(res, 409, 'Pause or cancel this campaign before deleting it');

  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { deletedAt: new Date() } });
  log.info('campaign deleted', { id: updated.id, name: campaign.name, deletedBy: req.admin?.sub ?? null });
  return ok(res, { id: updated.id, deletedAt: updated.deletedAt }, 'Campaign deleted');
}));

// POST /api/admin/campaigns/:id/restore
campaignsRouter.post('/:id/restore', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');
  if (!campaign.deletedAt) return fail(res, 409, 'Campaign is not deleted');

  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { deletedAt: null } });
  log.info('campaign restored', { id: updated.id, name: campaign.name, restoredBy: req.admin?.sub ?? null });
  return ok(res, { id: updated.id }, 'Campaign restored');
}));

// ─────────────────────────── single campaign ───────────────────────────

// GET /api/admin/campaigns/:id  — campaign + counts + a page of contacts
campaignsRouter.get('/:id', ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');

  const { page, pageSize, skip, take } = pageParams(req.query as Record<string, unknown>, 25);
  const state = req.query.state ? String(req.query.state) : undefined;
  const where: Prisma.CampaignContactWhereInput = {
    campaignId: campaign.id,
    ...(state && ['pending', 'queued', 'called', 'failed', 'skipped'].includes(state)
      ? { state: state as Prisma.CampaignContactWhereInput['state'] }
      : {}),
  };

  const [total, contacts, counts] = await Promise.all([
    prisma.campaignContact.count({ where }),
    prisma.campaignContact.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take }),
    campaignCounts(campaign.id),
  ]);

  return ok(
    res,
    { campaign, counts: counts.contacts, outcomes: counts.outcomes, contacts, running: isCampaignTicking(campaign.id) },
    'Campaign',
    paginate(page, pageSize, total),
  );
}));

// PATCH /api/admin/campaigns/:id
campaignsRouter.patch('/:id', requireRole(...CAN_WRITE),
  validate(z.object({
    name: z.string().min(1).max(120).optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    concurrency: z.number().int().min(1).max(50).optional(),
    assistantId: z.string().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
    ...scheduleShape,
  })),
  ah(async (req, res) => {
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) return fail(res, 404, 'Campaign not found');

    const b = req.body as Record<string, any>;
    // Validate against the MERGED result: a patch that changes only endAt still
    // has to be consistent with the stored startAt.
    const invalid = validateSchedule({
      startAt: b.startAt ?? existing.startAt?.toISOString(),
      endAt: b.endAt ?? existing.endAt?.toISOString(),
      dailyStartMinute: b.dailyStartMinute ?? existing.dailyStartMinute,
      dailyEndMinute: b.dailyEndMinute ?? existing.dailyEndMinute,
      timezone: b.timezone ?? existing.timezone,
      retryStrategy: b.retryStrategy ?? existing.retryStrategy,
      maxAttemptsPerContact: b.maxAttemptsPerContact ?? existing.maxAttemptsPerContact,
    });
    if (invalid) return fail(res, 400, invalid);

    const { startAt, endAt, ...rest } = b;
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: { ...(rest as Prisma.CampaignUpdateInput), ...scheduleData(b) },
    });
    log.info('campaign updated', { id: campaign.id, fields: Object.keys(b) });
    return ok(res, campaign, 'Campaign updated');
  }));

// GET /api/admin/campaigns/:id/schedule-preview
// Answers "is this campaign dialling right now, and if not why?" — the first
// question an operator asks when a campaign looks idle.
campaignsRouter.get('/:id/schedule-preview', ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');

  const now = new Date();
  const gate = canDialNow(campaign, now);
  const [eligibleNow, remaining] = await Promise.all([
    prisma.campaignContact.count({
      where: {
        campaignId: campaign.id,
        state: { in: ['pending', 'called', 'failed'] },
        OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: now } }],
        attempts: { lt: campaign.maxAttemptsPerContact },
        ...(campaign.stopOnAnswer ? { answered: false } : {}),
      },
    }),
    prisma.campaignContact.count({
      where: {
        campaignId: campaign.id,
        state: { not: 'skipped' },
        attempts: { lt: campaign.maxAttemptsPerContact },
        ...(campaign.stopOnAnswer ? { answered: false } : {}),
      },
    }),
  ]);

  return ok(res, {
    canDial: gate.canDial,
    reason: gate.reason ?? null,
    detail: gate.detail ?? null,
    nextOpening: gate.canDial ? null : nextWindowOpening(campaign, now).toISOString(),
    window: {
      start: formatMinutes(campaign.dailyStartMinute),
      end: formatMinutes(campaign.dailyEndMinute),
      timezone: campaign.timezone,
      wrapsMidnight: campaign.dailyEndMinute < campaign.dailyStartMinute,
      daysOfWeek: campaign.daysOfWeek,
    },
    eligibleNow,
    remaining,
    lastRunAt: campaign.lastRunAt,
  }, 'Schedule preview');
}));

// DELETE /api/admin/campaigns/:id  — contacts cascade via the schema relation.
campaignsRouter.delete('/:id', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!existing) return fail(res, 404, 'Campaign not found');
  await prisma.campaign.delete({ where: { id: existing.id } });
  log.warn('campaign deleted', { id: existing.id, name: existing.name });
  return ok(res, { id: existing.id }, 'Campaign deleted');
}));

// ─────────────────────────── contact upload ───────────────────────────

/** Header aliases → our canonical contact fields. Compared case/space-insensitively. */
const COLUMN_ALIASES: Record<string, string> = {
  name: 'name', fullname: 'name', customername: 'name', contactname: 'name', leadname: 'name',
  phone: 'phone', mobile: 'phone', mobilenumber: 'phone', phonenumber: 'phone', contact: 'phone',
  contactnumber: 'phone', msisdn: 'phone',
  email: 'email', emailid: 'email', emailaddress: 'email',
  city: 'city', location: 'city',
  product: 'product', loantype: 'product', producttype: 'product', productinterest: 'product',
  amount: 'amount', loanamount: 'amount', requestedamount: 'amount',
};

function canonHeader(h: string): string {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Rupees (or paise-looking) input → paise int, or null. */
function parseAmount(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100); // spreadsheets are authored in rupees
}

// POST /api/admin/campaigns/:id/contacts/upload  (multipart, field name "file")
campaignsRouter.post('/:id/contacts/upload', upload.single('file'), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');

  const file = req.file;
  if (!file?.buffer?.length) return fail(res, 400, 'No file uploaded (expected multipart field "file")');

  let rows: Record<string, unknown>[];
  try {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return fail(res, 400, 'Spreadsheet has no sheets');
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: null });
  } catch (e: any) {
    return fail(res, 400, `Could not parse the spreadsheet: ${e?.message ?? e}`);
  }

  const errors: { row: number; reason: string }[] = [];
  const seen = new Set<string>();
  const data: Prisma.CampaignContactCreateManyInput[] = [];
  let skipped = 0;

  rows.forEach((row, i) => {
    const mapped: Record<string, unknown> = {};
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const target = COLUMN_ALIASES[canonHeader(key)];
      if (target && mapped[target] == null) mapped[target] = value;
      else if (!target) extra[key] = value; // keep unmapped columns verbatim
    }

    const phone = normalisePhone(mapped.phone);
    if (!phone) {
      skipped++;
      errors.push({ row: i + 2, reason: mapped.phone ? 'Not a valid 10-digit mobile number' : 'Missing phone' });
      return;
    }
    if (seen.has(phone)) {
      skipped++;
      errors.push({ row: i + 2, reason: 'Duplicate phone within this file' });
      return;
    }
    seen.add(phone);

    const str = (v: unknown) => (v == null || v === '' ? null : String(v).trim() || null);
    data.push({
      campaignId: campaign.id,
      phone,
      name: str(mapped.name),
      email: str(mapped.email),
      city: str(mapped.city),
      product: str(mapped.product),
      amount: parseAmount(mapped.amount),
      extra: Object.keys(extra).length ? (extra as Prisma.InputJsonValue) : Prisma.DbNull,
    });
  });

  // @@unique([campaignId, phone]) + skipDuplicates gives us cross-upload dedup
  // for free, so re-uploading a corrected file is safe.
  const result = data.length
    ? await prisma.campaignContact.createMany({ data, skipDuplicates: true })
    : { count: 0 };
  const duplicates = data.length - result.count;

  const totalContacts = await prisma.campaignContact.count({ where: { campaignId: campaign.id } });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { totalContacts } });

  log.info('contacts uploaded', { campaignId: campaign.id, inserted: result.count, skipped, duplicates, totalContacts });
  return ok(
    res,
    { inserted: result.count, skipped, duplicates, totalContacts, errors: errors.slice(0, 200) },
    `Imported ${result.count} contact(s)`,
  );
}));

// POST /api/admin/campaigns/:id/contacts/from-segments
//   { selections: Array<{ key: SegmentKey; phones?: string[] }> }
// Populates this campaign's contacts from the union of the chosen segments
// (deduped by phone) instead of a spreadsheet. Each selection may optionally
// carry a `phones` allowlist — the admin cherry-picking specific people out
// of a large segment in the UI, rather than taking the whole thing. That
// allowlist is only ever used to FILTER the segment's own live query result;
// it can never add a phone the segment query didn't already return, so a
// do-not-call exclusion (baked into every segment query in segments.ts)
// can't be bypassed by a client sending an arbitrary phone list.
campaignsRouter.post('/:id/contacts/from-segments', requireRole(...CAN_WRITE), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');

  const rawSelections = Array.isArray(req.body?.selections) ? req.body.selections : [];
  const selections: { key: SegmentKey; phones: Set<string> | null }[] = rawSelections
    .map((s: any) => ({
      key: String(s?.key ?? ''),
      phones: Array.isArray(s?.phones) ? new Set(s.phones.map(String)) as Set<string> : null,
    }))
    .filter((s: { key: string; phones: Set<string> | null }) => (SEGMENT_KEYS as string[]).includes(s.key));
  if (selections.length === 0) return fail(res, 400, 'Pick at least one segment');

  const byPhone = new Map<string, { phone: string; name: string | null; city: string | null }>();
  for (const { key, phones } of selections) {
    const members = await getSegmentMembers(key);
    for (const m of members) {
      if (phones && !phones.has(m.phone)) continue;
      if (!byPhone.has(m.phone)) byPhone.set(m.phone, m);
    }
  }

  const data: Prisma.CampaignContactCreateManyInput[] = Array.from(byPhone.values()).map((m) => ({
    campaignId: campaign.id,
    phone: m.phone,
    name: m.name,
    city: m.city,
    extra: Prisma.DbNull,
  }));

  // @@unique([campaignId, phone]) + skipDuplicates — safe to run again after
  // adding more segments, or after new customers enter a segment later.
  const result = data.length
    ? await prisma.campaignContact.createMany({ data, skipDuplicates: true })
    : { count: 0 };
  const duplicates = data.length - result.count;

  const totalContacts = await prisma.campaignContact.count({ where: { campaignId: campaign.id } });
  await prisma.campaign.update({ where: { id: campaign.id }, data: { totalContacts } });

  const validKeys = selections.map((s) => s.key);
  log.info('contacts added from segments', { campaignId: campaign.id, segments: validKeys, matched: data.length, inserted: result.count, duplicates, totalContacts });
  return ok(
    res,
    { matched: data.length, inserted: result.count, duplicates, totalContacts, segments: validKeys },
    `Added ${result.count} contact(s) from ${validKeys.length} segment(s)`,
  );
}));

// ─────────────────────────── run control ───────────────────────────

// POST /api/admin/campaigns/:id/start
// Hands this campaign's pending contacts to Ello's own batch dialler — Ello
// owns the actual dialling from here (and this campaign now shows up in
// Ello's own dashboard), not our campaignRunner. Deliberately the ONLY way to
// run a campaign now (send-to-ello used to be a separate route callers had to
// know to use instead of this one — folded in here so there is one answer to
// "how do I start a campaign", not two overlapping ones).
//
// This does cost something: Ello has no equivalent of our own recurring daily
// window/weekday filter, retry cadence, or concurrency limit, so none of
// those apply once a campaign is handed off — the closest we can still honour
// is a one-time scheduleTime for "wait until the window opens" when it isn't
// open right now. campaignRunner.ts / campaignScheduler are left in place
// (harmless — they only ever act on 'pending' contacts, and contacts are
// flipped to 'queued' below before this returns) rather than ripped out, in
// case a future path still needs a purely-local dial.
campaignsRouter.post('/:id/start', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');
  if (campaign.status === 'running') return fail(res, 409, 'Campaign is already running');
  if (!campaign.assistantId) return fail(res, 400, 'This campaign has no agent assigned');

  const contacts = await prisma.campaignContact.findMany({
    where: { campaignId: campaign.id, state: 'pending' },
    select: { phone: true, name: true, city: true, product: true, amount: true, extra: true },
  });
  if (contacts.length === 0) return fail(res, 400, 'No pending contacts to dial');

  // canDialNow() gates on status === 'running' — true once this request
  // finishes, not yet (`campaign` here is still 'draft'/'paused', fetched
  // before the transaction below flips it). Check against the running-to-be
  // status directly, or every start would defer to "tomorrow" regardless of
  // the actual time of day.
  const gate = canDialNow({ ...campaign, status: 'running' }, new Date());
  const scheduleTime = gate.canDial ? null : nextWindowOpening(campaign, new Date()).toISOString();

  const result = await triggerElloCampaign({
    campaignName: campaign.name,
    assistantId: campaign.assistantId,
    recipients: contacts.map((c) => ({
      phone: c.phone,
      name: c.name,
      city: c.city,
      product: c.product,
      amount: c.amount,
      extra: (c.extra as Record<string, unknown> | null) ?? null,
    })),
    scheduleTime,
  });

  log.info('campaign started (sent to Ello)', {
    id: campaign.id, name: campaign.name, startedBy: req.admin?.sub ?? null,
    contacts: contacts.length, ok: result.ok, status: result.status,
    providerCampaignId: result.providerCampaignId, dialingNow: gate.canDial,
  });

  if (!result.ok) return fail(res, 502, result.error || `Ello returned HTTP ${result.status}`);

  // Move these out of 'pending' immediately: our own campaignScheduler's
  // `WHERE state = 'pending'` query must never also pick them up (that would
  // double-dial every contact), and `queued` also fixes the dashboard reading
  // "Pending" forever between now and the first webhook arriving.
  // providerCampaignId lets campaign.started/ended and per-call webhooks (for
  // calls Ello places itself, which never touch our own dialer.ts) find their
  // way back to this campaign.
  const [updated] = await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: 'running',
        startedAt: campaign.startedAt ?? new Date(),
        completedAt: null,
        providerCampaignId: result.providerCampaignId ?? undefined,
      },
    }),
    prisma.campaignContact.updateMany({
      where: { campaignId: campaign.id, phone: { in: contacts.map((c) => c.phone) } },
      data: { state: 'queued' },
    }),
  ]);

  return ok(
    res,
    {
      id: updated.id,
      status: updated.status,
      queued: contacts.length,
      providerCampaignId: result.providerCampaignId ?? null,
      dialingNow: gate.canDial,
      reason: gate.reason ?? null,
      detail: gate.detail ?? null,
      nextOpening: gate.canDial ? null : scheduleTime,
    },
    gate.canDial
      ? `Sent ${contacts.length} contact(s) to Ello — dialling now`
      : `Sent to Ello, scheduled for the next window (${gate.detail ?? gate.reason})`,
  );
}));

// POST /api/admin/campaigns/:id/pause — the dialer loop checks status between items.
campaignsRouter.post('/:id/pause', requireRole(...CAN_WRITE), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');
  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } });
  log.info('campaign paused', { id: updated.id, name: campaign.name, pausedBy: req.admin?.sub ?? null });
  return ok(res, { id: updated.id, status: updated.status }, 'Campaign paused');
}));

// POST /api/admin/campaigns/:id/cancel
// Unlike pause (resumable), this is terminal: every not-yet-dialled contact is
// marked `skipped` so nothing here can ever be picked up again, by us or by a
// later "resume". For a campaign never sent to Ello (no providerCampaignId),
// that fully stops it — campaignRunner only ever looks at `status: 'running'`
// rows. For one sent to Ello (send-to-ello), this only stops OUR side of the
// bookkeeping: Ello is dialling the list on its own infrastructure now, and
// there is no confirmed public API to cancel a campaign already running
// there (their dashboard has a Cancel button, but it isn't in their
// documented API) — surfaced back to the caller as a warning rather than
// silently claiming a cancellation that didn't actually happen on their end.
campaignsRouter.post('/:id/cancel', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');
  if (campaign.status === 'cancelled' || campaign.status === 'completed') {
    return fail(res, 409, `Campaign is already ${campaign.status}`);
  }

  const [updated] = await prisma.$transaction([
    prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'cancelled', completedAt: new Date() } }),
    prisma.campaignContact.updateMany({
      where: { campaignId: campaign.id, state: { in: ['pending', 'queued'] } },
      data: { state: 'skipped' },
    }),
  ]);

  log.info('campaign cancelled', {
    id: updated.id, name: campaign.name, cancelledBy: req.admin?.sub ?? null,
    hadProviderCampaign: !!campaign.providerCampaignId,
  });

  return ok(
    res,
    { id: updated.id, status: updated.status, elloSideNotCancelled: !!campaign.providerCampaignId },
    campaign.providerCampaignId
      ? 'Cancelled here — this campaign was sent to Ello, so also cancel it from Ello\'s own dashboard'
      : 'Campaign cancelled',
  );
}));

// GET /api/admin/campaigns/:id/stats
campaignsRouter.get('/:id/stats', ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');

  const [counts, byStatus] = await Promise.all([
    campaignCounts(campaign.id),
    prisma.callAttempt.groupBy({ by: ['status'], where: { campaignId: campaign.id }, _count: { _all: true } }),
  ]);
  const callsByStatus: Record<string, number> = {};
  byStatus.forEach((g) => { callsByStatus[g.status ?? 'queued'] = g._count._all; });

  return ok(res, {
    campaign: {
      id: campaign.id, name: campaign.name, code: campaign.code, status: campaign.status,
      totalContacts: campaign.totalContacts, queuedCount: campaign.queuedCount,
      calledCount: campaign.calledCount, failedCount: campaign.failedCount,
    },
    contactsByState: counts.contacts,
    callsByOutcome: counts.outcomes,
    callsByStatus,
    running: isCampaignTicking(campaign.id),
  }, 'Campaign stats');
}));
