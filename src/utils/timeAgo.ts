/**
 * "just now / 5 minutes ago / 1 hour ago / 10 hours ago / 1 day ago / 20 days ago /
 * 1 month ago / 2 years ago" in the current language (`t` from useT()). Templates carry
 * `{n}`; each unit has a One/Many pair so 1 reads "1 hour" and 10 reads "10 hours".
 * Future or unparseable timestamps return '' rather than a wrong label.
 */
export function timeAgo(iso: string | number | null | undefined, t: Record<string, string>, now: number = Date.now()): string {
  if (iso == null || iso === '') return '';
  const ts = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const diff = now - ts;
  if (diff < -60_000) return '';
  const unit = (n: number, one: string, many: string) => (n === 1 ? t[one] : t[many]).replace('{n}', String(n));
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return t.agoJustNow;
  if (mins < 60) return unit(mins, 'agoMinuteOne', 'agoMinuteMany');
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return unit(hours, 'agoHourOne', 'agoHourMany');
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return unit(days, 'agoDayOne', 'agoDayMany');
  const months = Math.floor(days / 30);
  if (months < 12) return unit(months, 'agoMonthOne', 'agoMonthMany');
  const years = Math.floor(days / 365);
  return unit(years, 'agoYearOne', 'agoYearMany');
}
