/**
 * "1 hour ago / 10 hours ago / 1 day ago / 20 days ago / 1 month ago" in the visitor's
 * language (en / hi / te), via the browser's own plural + script rules. Future or
 * unparseable timestamps return '' rather than a wrong label.
 */
export function timeAgo(iso: string | number | null | undefined, lang: string, now: number = Date.now()): string {
  if (iso == null || iso === '') return '';
  const ts = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = now - ts;
  if (diff < -60_000) return '';
  const mins = Math.floor(diff / 60_000);
  let fmt: Intl.RelativeTimeFormat;
  try {
    fmt = new Intl.RelativeTimeFormat(lang, { numeric: 'always' });
  } catch {
    fmt = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
  }
  if (mins < 1) return justNow(lang);
  if (mins < 60) return fmt.format(-mins, 'minute');
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return fmt.format(-hours, 'hour');
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return fmt.format(-days, 'day');
  const months = Math.floor(days / 30);
  if (months < 12) return fmt.format(-months, 'month');
  return fmt.format(-Math.floor(days / 365), 'year');
}

function justNow(lang: string): string {
  return lang === 'hi' ? 'अभी अभी' : lang === 'te' ? 'ఇప్పుడే' : 'just now';
}
