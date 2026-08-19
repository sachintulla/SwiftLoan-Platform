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
import { tickCampaign, isCampaignTicking } from '../lib/campaignRunner.js';
import { prisma } from '../lib/prisma.js';
import { ah } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { ok, created, fail, pageParams, paginate } from '../lib/http.js';
import { requireAdmin, requireActiveAdmin, auditAdmin, requireRole, CAN_WRITE, CAN_ADMINISTER } from '../middleware/adminAuth.js';
import { normalisePhone } from '../lib/dialer.js';
import { scoped } from '../lib/log.js';

const log = scoped('campaigns');

export const campaignsRouter = Router();
campaignsRouter.use(requireAdmin);
campaignsRouter.use(requireActiveAdmin);
campaignsRouter.use(auditAdmin);



const CAMPAIGN_STATUSES = ['draft', 'running', 'paused', 'completed', 'failed'] as const;
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
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
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
  assistantName: z.string().max(200).optional(),
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
  const where: Prisma.CampaignWhereInput =
    status && (CAMPAIGN_STATUSES as readonly string[]).includes(status)
      ? { status: status as CampaignStatusValue }
      : {};

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
    assistantId: z.string().min(1).optional(),
    note: z.string().max(2000).optional(),
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

// ─────────────────────────── run control ───────────────────────────

// POST /api/admin/campaigns/:id/start
campaignsRouter.post('/:id/start', requireRole(...CAN_ADMINISTER), ah(async (req, res) => {
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return fail(res, 404, 'Campaign not found');
  if (campaign.status === 'running' || isCampaignTicking(campaign.id)) {
    return fail(res, 409, 'Campaign is already running');
  }

  const pending = await prisma.campaignContact.count({ where: { campaignId: campaign.id, state: 'pending' } });
  if (pending === 0) return fail(res, 400, 'No pending contacts to dial');

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'running', startedAt: campaign.startedAt ?? new Date(), completedAt: null },
  });

  // "Start" now means "this campaign is live", not "dial everyone immediately".
  // The scheduler (campaignRunner, every minute) owns dialling so the daily
  // window, weekday filter and retry cadence are actually honoured — starting a
  // 09:00–19:00 campaign at midnight must not blast the whole list at midnight.
  const gate = canDialNow(updated, new Date());
  log.info('campaign started', {
    id: updated.id, name: updated.name, startedBy: req.admin?.sub ?? null,
    pendingContacts: pending, concurrency: updated.concurrency, dialingNow: gate.canDial,
  });
  if (gate.canDial) {
    // Inside the window: tick once now so the operator sees movement instead of
    // waiting up to a minute for the scheduler.
    void tickCampaign(updated.id).catch((e) => log.error('tick failed', { id: updated.id, error: String(e) }));
  }

  return ok(
    res,
    {
      id: updated.id,
      status: updated.status,
      queued: pending,
      concurrency: updated.concurrency,
      dialingNow: gate.canDial,
      reason: gate.reason ?? null,
      detail: gate.detail ?? null,
      nextOpening: gate.canDial ? null : nextWindowOpening(updated, new Date()).toISOString(),
    },
    gate.canDial
      ? `Started — dialling ${pending} contact(s)`
      : `Started — waiting for the calling window (${gate.detail ?? gate.reason})`,
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
