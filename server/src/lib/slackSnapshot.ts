/**
 * Daily Slack snapshot: at 07:00 IST, post the headline numbers (downloads, users
 * onboarded, applications + their worth, offers, approvals, disbursements, Meta
 * spend, conversion) to a Slack channel so the team sees the business at a glance
 * each morning.
 *
 * Wiring:
 *   • SLACK_SNAPSHOT_WEBHOOK  — the channel's Incoming-Webhook URL. UNSET = log-only
 *                               (the snapshot is computed and logged, nothing is posted),
 *                               so this ships safely before the webhook exists.
 *   • SLACK_SNAPSHOT_AT_IST   — minutes past midnight IST to send (default 420 = 07:00).
 *
 * The send is once per India day, guarded by a PlatformSetting marker so a restart
 * or the minute-tick cadence can never double-post. Pure formatting + the schedule
 * predicate live in slackSnapshotFormat.ts (unit-tested); this file is the DB reads
 * and the webhook POST.
 */
import { prisma } from './prisma.js';
import { scoped } from './log.js';
import {
  SnapshotMetrics, snapshotBlocks, snapshotText, snapshotDue, istDay,
} from './slackSnapshotFormat.js';

const log = scoped('slack-snapshot');
const LAST_SENT_KEY = 'slack.snapshot.lastSentDay';

const APPROVED_STATUSES = ['approved', 'disbursed', 'closed'];
// Applications that have reached (at least) the offers stage — "offers received".
const OFFERS_STATUSES = ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed', 'closed'];

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;
function istMidnight(nowMs: number): Date {
  const ist = nowMs + IST_OFFSET_MS;
  return new Date(Math.floor(ist / DAY_MS) * DAY_MS - IST_OFFSET_MS);
}

/** Read every figure the snapshot needs. One call for the whole set. */
export async function gatherSnapshot(now: Date = new Date()): Promise<SnapshotMetrics> {
  const since = istMidnight(now.getTime()); // start of the current India day
  const createdToday = { createdAt: { gte: since } };
  const disbursedToday = { disbursedAt: { gte: since } };

  const sumStatuses = (groups: Array<{ status: string; _count: { _all: number } }>, statuses: string[]) =>
    groups.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + g._count._all, 0);

  const [
    dl, dlT, users, usersT, leads, leadsT, apps, appsT,
    worth, worthT, statusAll, statusToday,
    loans, loansT, disbAmt, disbAmtT,
  ] = await Promise.all([
    prisma.appDownload.count(),
    prisma.appDownload.count({ where: { installedAt: { gte: since } } }),
    prisma.user.count(),
    prisma.user.count({ where: createdToday }),
    prisma.lead.count(),
    prisma.lead.count({ where: createdToday }),
    prisma.loanApplication.count(),
    prisma.loanApplication.count({ where: createdToday }),
    prisma.loanApplication.aggregate({ _sum: { amount: true } }),
    prisma.loanApplication.aggregate({ _sum: { amount: true }, where: createdToday }),
    prisma.loanApplication.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.loanApplication.groupBy({ by: ['status'], where: createdToday, _count: { _all: true } }),
    prisma.loan.count(),
    prisma.loan.count({ where: disbursedToday }),
    prisma.loan.aggregate({ _sum: { principal: true } }),
    prisma.loan.aggregate({ _sum: { principal: true }, where: disbursedToday }),
  ]);

  const apps10 = apps; // base for the conversion %
  const disbursedCount = sumStatuses(statusAll, ['disbursed', 'closed']);

  return {
    downloads: { total: dl, today: dlT },
    users: { total: users, today: usersT },
    leads: { total: leads, today: leadsT },
    applications: { total: apps, today: appsT },
    applicationWorth: { total: worth._sum.amount ?? 0, today: worthT._sum.amount ?? 0 },
    offers: { total: sumStatuses(statusAll, OFFERS_STATUSES), today: sumStatuses(statusToday, OFFERS_STATUSES) },
    approvals: { total: sumStatuses(statusAll, APPROVED_STATUSES), today: sumStatuses(statusToday, APPROVED_STATUSES) },
    disbursals: { total: loans, today: loansT },
    disbursedAmount: { total: disbAmt._sum.principal ?? 0, today: disbAmtT._sum.principal ?? 0 },
    // Meta spend is not yet pulled from the Meta API (we only SEND events to Meta,
    // we don't read ad-account cost). Report 0 and mark it unavailable until wired.
    metaSpend: { total: 0, today: 0, available: false },
    appToDisbursalPct: apps10 > 0 ? Math.round((disbursedCount / apps10) * 100) : 0,
  };
}

/** POST a Slack Block Kit payload to the webhook. Returns true on a 2xx. */
async function postToSlack(webhook: string, payload: { text: string; blocks: unknown[] }): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    if (!res.ok) {
      log.warn('slack webhook rejected', { status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) });
      return false;
    }
    return true;
  } catch (e) {
    log.warn('slack webhook failed', { error: String((e as Error)?.message ?? e) });
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Build and send the snapshot now (ignores the once-a-day schedule). Used by the
 * admin "send test" endpoint and internally by the daily tick. Returns what was
 * sent so the caller can echo it. Never throws.
 */
export async function sendSnapshotNow(now: Date = new Date()): Promise<{ sent: boolean; logOnly: boolean; text: string }> {
  const metrics = await gatherSnapshot(now);
  const dayLabel = new Date(now.getTime() + IST_OFFSET_MS).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  const payload = snapshotBlocks(metrics, dayLabel);
  const text = snapshotText(metrics, dayLabel);
  const webhook = (process.env.SLACK_SNAPSHOT_WEBHOOK ?? '').trim();

  if (!webhook) {
    log.info('snapshot (log-only, no SLACK_SNAPSHOT_WEBHOOK set)\n' + text);
    return { sent: false, logOnly: true, text };
  }
  const sent = await postToSlack(webhook, payload);
  if (sent) log.info('snapshot posted to Slack', { day: dayLabel });
  return { sent, logOnly: false, text };
}

/**
 * Minute-tick job: send the snapshot once per India day, from 07:00 IST (or
 * SLACK_SNAPSHOT_AT_IST). Stamps the India day in PlatformSetting after a
 * successful send / log-only run so it never repeats. Never throws.
 */
export async function slackSnapshotTick(now: Date = new Date()): Promise<void> {
  try {
    const target = Number.parseInt(process.env.SLACK_SNAPSHOT_AT_IST ?? '', 10);
    const targetMinute = Number.isFinite(target) ? target : 420;

    const row = await prisma.platformSetting.findUnique({ where: { key: LAST_SENT_KEY } });
    const lastSentDay = typeof row?.value === 'string' ? row.value : null;
    if (!snapshotDue(now.getTime(), lastSentDay, targetMinute)) return;

    const result = await sendSnapshotNow(now);
    // A failed webhook post is NOT stamped, so the next tick retries it today.
    if (result.sent || result.logOnly) {
      const day = istDay(now.getTime());
      await prisma.platformSetting.upsert({
        where: { key: LAST_SENT_KEY },
        create: { key: LAST_SENT_KEY, value: day, updatedBy: 'slack-snapshot' },
        update: { value: day, updatedBy: 'slack-snapshot' },
      });
    }
  } catch (e) {
    log.warn('tick failed', { error: String((e as Error)?.message ?? e) });
  }
}
