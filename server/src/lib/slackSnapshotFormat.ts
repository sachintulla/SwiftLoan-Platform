/**
 * Pure formatting + scheduling for the daily Slack snapshot (lib/slackSnapshot.ts
 * does the DB reads and the webhook POST). Kept pure so the message shape, the
 * "top 10" ordering, the rupee formatting and the once-a-day 7 AM IST schedule
 * are all covered by slackSnapshotFormat.test.ts without a database or network.
 *
 * Money is whole rupees everywhere (no paise, no ×100) — see CLAUDE.md.
 */

const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** Every metric the snapshot reports. `total` = all-time; `today` = since 00:00 IST. */
export interface SnapshotMetrics {
  downloads: { total: number; today: number };
  users: { total: number; today: number };
  leads: { total: number; today: number };
  applications: { total: number; today: number };
  applicationWorth: { total: number; today: number };
  offers: { total: number; today: number };
  approvals: { total: number; today: number };
  disbursals: { total: number; today: number };
  disbursedAmount: { total: number; today: number };
  /** Meta (Facebook) ad spend. Not yet wired to the Meta API, so `available` is false and the figures are 0. */
  metaSpend: { total: number; today: number; available: boolean };
  /** Whole-number % of applications that reached disbursal. */
  appToDisbursalPct: number;
}

/** `YYYY-MM-DD` of the India day a timestamp falls in (idempotency key for the once-a-day send). */
export function istDay(nowMs: number): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes past midnight IST for a timestamp (0–1439). */
export function istMinuteOfDay(nowMs: number): number {
  const ist = nowMs + IST_OFFSET_MS;
  return Math.floor((ist - Math.floor(ist / DAY_MS) * DAY_MS) / 60_000);
}

/**
 * Should the snapshot be sent now? True when we have not sent on this India day
 * yet AND the IST clock has reached the target minute (default 07:00 = 420). The
 * ">= target" (rather than "== target") means a process that was asleep at 7 AM
 * still sends the snapshot once when it next ticks that day — never twice, since
 * `lastSentDay` is stamped on send.
 */
export function snapshotDue(nowMs: number, lastSentDay: string | null, targetMinuteIST = 420): boolean {
  if (istMinuteOfDay(nowMs) < targetMinuteIST) return false;
  return istDay(nowMs) !== lastSentDay;
}

/** Whole rupees in Indian compact form: ₹1.2Cr, ₹3.45L, ₹5,000, ₹0. */
export function rupeeCompact(n: number): string {
  const v = Math.round(n || 0);
  if (Math.abs(v) >= 1_00_00_000) return `₹${trim(v / 1_00_00_000)}Cr`;
  if (Math.abs(v) >= 1_00_000) return `₹${trim(v / 1_00_000)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function trim(x: number): string {
  // At most 2 decimals, no trailing zeros (1.20 -> 1.2, 3.00 -> 3).
  return String(Math.round(x * 100) / 100);
}

function count(n: number): string {
  return (n || 0).toLocaleString('en-IN');
}

export interface SnapshotLine { emoji: string; label: string; value: string; today: string }

/**
 * The top-10 headline metrics, in the order the owner asked for them. This is the
 * single source of truth for both the Slack blocks and the plain-text fallback.
 */
export function snapshotLines(m: SnapshotMetrics): SnapshotLine[] {
  const row = (emoji: string, label: string, value: string, today = ''): SnapshotLine => ({ emoji, label, value, today });
  return [
    row('📲', 'App downloads', count(m.downloads.total), m.downloads.today ? `+${count(m.downloads.today)}` : ''),
    row('🙋', 'Users onboarded', count(m.users.total), m.users.today ? `+${count(m.users.today)}` : ''),
    row('📞', 'Leads captured', count(m.leads.total), m.leads.today ? `+${count(m.leads.today)}` : ''),
    row('📝', 'Applications', count(m.applications.total), m.applications.today ? `+${count(m.applications.today)}` : ''),
    row('💰', 'Application worth', rupeeCompact(m.applicationWorth.total), m.applicationWorth.today ? `+${rupeeCompact(m.applicationWorth.today)}` : ''),
    row('🎯', 'Offers received', count(m.offers.total), m.offers.today ? `+${count(m.offers.today)}` : ''),
    row('✅', 'Approvals', count(m.approvals.total), m.approvals.today ? `+${count(m.approvals.today)}` : ''),
    row('🏦', 'Disbursements', count(m.disbursals.total), m.disbursals.today ? `+${count(m.disbursals.today)}` : ''),
    row('💸', 'Disbursed amount', rupeeCompact(m.disbursedAmount.total), m.disbursedAmount.today ? `+${rupeeCompact(m.disbursedAmount.today)}` : ''),
    row('📣', 'Meta ad spend', m.metaSpend.available ? rupeeCompact(m.metaSpend.total) : '₹0 _(not wired yet)_', m.metaSpend.available && m.metaSpend.today ? `+${rupeeCompact(m.metaSpend.today)}` : ''),
  ];
}

/** One-line plain-text summary used as the Slack notification fallback and in logs. */
export function snapshotText(m: SnapshotMetrics, dayLabel: string): string {
  const lines = snapshotLines(m).map((l) => `${l.emoji} ${l.label}: ${l.value}${l.today ? ` (${l.today} today)` : ''}`);
  return [
    `🌅 SwiftLoan daily snapshot — ${dayLabel}`,
    ...lines,
    `🔁 Application → disbursal: ${m.appToDisbursalPct}%`,
  ].join('\n');
}

/** Slack Block Kit payload (blocks + fallback text) for the snapshot. */
export function snapshotBlocks(m: SnapshotMetrics, dayLabel: string): { text: string; blocks: unknown[] } {
  const lines = snapshotLines(m);
  const body = lines
    .map((l) => `${l.emoji}  *${l.label}:*  ${l.value}${l.today ? `   \`${l.today} today\`` : ''}`)
    .join('\n');

  return {
    text: snapshotText(m, dayLabel),
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `🌅 SwiftLoan — daily snapshot`, emoji: true } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `*${dayLabel}* · figures are all-time, with today's change where any` }] },
      { type: 'section', text: { type: 'mrkdwn', text: body } },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `🔁 Application → disbursal conversion: *${m.appToDisbursalPct}%*` },
        ],
      },
    ],
  };
}
