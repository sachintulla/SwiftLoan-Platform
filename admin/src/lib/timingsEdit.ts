// Shared by the Timings page and Stage outreach: how a timing setting is shown, edited and checked. Pure (no React, no network).

export type Kind = 'number' | 'minuteOfDay' | 'boolean' | 'schedule' | 'phones';
export type Source = 'override' | 'env' | 'default';
export interface SchedRow { channel: 'sms' | 'whatsapp'; afterMinutes: number }
export interface Item {
  key: string; group: string; label: string; help: string; warn?: string; env?: string;
  kind: Kind; unit: string; def: unknown; effective: unknown; source: Source;
  min?: number; max?: number; maxRows?: number; maxMinutes?: number; maxItems?: number;
  updatedAt: string | null; updatedBy: string | null;
}
export type TimeUnit = 'minutes' | 'hours' | 'days';
export interface UiRow { channel: 'sms' | 'whatsapp'; amount: string; unit: TimeUnit }
export type Draft = string | boolean | UiRow[];


/** Changes to these get a review step before they are saved. */
export const sensitive = (key: string) =>
  key.startsWith('auth.') || key.startsWith('calling.') || key === 'install.sendEnabled' || key === 'applied.sendEnabled' || key === 'calls.maxPerHour' || key === 'pan.dailyLimit';


export const FACTOR: Record<TimeUnit, number> = { minutes: 1, hours: 60, days: 1440 };
export const UNIT_SHORT: Record<string, string> = { seconds: 'sec', minutes: 'min', hours: 'hours', days: 'days', count: '' };

export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const parseHhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

export function rowsToUi(rows: SchedRow[]): UiRow[] {
  return rows.map((r) => {
    const unit: TimeUnit = r.afterMinutes > 0 && r.afterMinutes % 1440 === 0 ? 'days' : r.afterMinutes > 0 && r.afterMinutes % 60 === 0 ? 'hours' : 'minutes';
    return { channel: r.channel, unit, amount: String(r.afterMinutes / FACTOR[unit]) };
  });
}
export const uiToRows = (ui: UiRow[]): SchedRow[] => ui.map((r) => ({ channel: r.channel, afterMinutes: Number(r.amount) * FACTOR[r.unit] }));

export function toDraft(it: Item): Draft {
  switch (it.kind) {
    case 'boolean': return Boolean(it.effective);
    case 'minuteOfDay': return hhmm(Number(it.effective));
    case 'phones': return (it.effective as string[]).join('\n');
    case 'schedule': return rowsToUi(it.effective as SchedRow[]);
    default: return String(it.effective);
  }
}
/** What would be saved for this draft (NaN means "not valid yet"). */
export function toValue(it: Item, d: Draft): unknown {
  switch (it.kind) {
    case 'boolean': return Boolean(d);
    case 'minuteOfDay': return parseHhmm(String(d));
    case 'phones': return String(d).split(/[\s,;]+/).filter(Boolean);
    case 'schedule': return uiToRows(d as UiRow[]);
    default: return d === '' ? NaN : Number(d);
  }
}
export const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function localError(it: Item, v: unknown): string | null {
  if (it.kind === 'number' || it.kind === 'minuteOfDay') {
    const n = v as number;
    if (!Number.isFinite(n) || !Number.isInteger(n)) return 'Enter a whole number';
    if (it.min !== undefined && n < it.min) return `At least ${it.min}`;
    if (it.max !== undefined && n > it.max) return `At most ${it.max}`;
  }
  if (it.kind === 'schedule') {
    const rows = v as SchedRow[];
    if (rows.length < 1) return 'Add at least one message';
    let prev = -1;
    for (let i = 0; i < rows.length; i++) {
      const m = rows[i].afterMinutes;
      if (!Number.isFinite(m) || !Number.isInteger(m) || m < 0) return `Message ${i + 1}: enter a whole number`;
      if (it.maxMinutes !== undefined && m > it.maxMinutes) return `Message ${i + 1}: too long (30 days at most)`;
      if (m < prev) return `Message ${i + 1}: must not be earlier than the one above`;
      prev = m;
    }
  }
  return null;
}

export function spanText(m: number): string {
  if (!Number.isFinite(m)) return '–';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mi = m % 60;
  const parts = [d && `${d} day${d > 1 ? 's' : ''}`, h && `${h} h`, mi && `${mi} min`].filter(Boolean);
  return parts.length ? parts.join(' ') : 'straight away';
}

/** A value in words, for the "default" line and the review dialog. */
export function show(it: Item, v: unknown): string {
  switch (it.kind) {
    case 'boolean': return v ? 'On' : 'Off';
    case 'minuteOfDay': return Number.isFinite(v as number) ? hhmm(Number(v)) : '–';
    case 'phones': { const n = (v as string[]).length; return n ? `${n} number${n === 1 ? '' : 's'}` : 'everyone'; }
    case 'schedule': {
      const rows = v as SchedRow[];
      const sms = rows.filter((r) => r.channel === 'sms').length;
      return `${sms} SMS + ${rows.length - sms} WhatsApp over ${spanText(rows[rows.length - 1]?.afterMinutes ?? 0)}`;
    }
    default: return Number.isFinite(v as number) ? `${v} ${UNIT_SHORT[it.unit] ?? ''}`.trim() : '–';
  }
}

