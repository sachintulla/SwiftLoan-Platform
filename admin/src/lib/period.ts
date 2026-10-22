// Shared date-range period filter (Any time / Today / Yesterday / Last 7 / Last
// 30 / custom). Ranges are computed in the viewer's own timezone and passed to
// the API as ISO instants, so "Today" means the admin's local/IST day.

export type Period = 'all' | 'today' | 'yesterday' | '7d' | '30d' | 'custom';

export const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Any time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Date range' },
];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

export function computeRange(period: Period, cFrom = '', cTo = ''): { from?: string; to?: string } {
  const now = new Date();
  if (period === 'all') return {};
  if (period === 'today') return { from: startOfDay(now).toISOString(), to: now.toISOString() };
  if (period === 'yesterday') {
    const s = startOfDay(now); const y = new Date(s); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: s.toISOString() };
  }
  if (period === '7d') { const f = new Date(now); f.setDate(f.getDate() - 7); return { from: f.toISOString(), to: now.toISOString() }; }
  if (period === '30d') { const f = new Date(now); f.setDate(f.getDate() - 30); return { from: f.toISOString(), to: now.toISOString() }; }
  const out: { from?: string; to?: string } = {};
  if (cFrom) out.from = new Date(`${cFrom}T00:00:00`).toISOString();
  if (cTo) out.to = new Date(`${cTo}T23:59:59.999`).toISOString();
  return out;
}
