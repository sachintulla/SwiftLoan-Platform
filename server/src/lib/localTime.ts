/**
 * Local wall-clock parts for an instant in an IANA time zone (used for calling hours).
 */
/**
 * Local wall-clock parts for an instant in an IANA zone.
 *
 * Uses Intl rather than a timezone library: it is built in, always current with
 * the platform's tzdata, and handles DST without us storing offsets. Getting
 * this wrong is not academic — a naive `getHours()` would evaluate a 09:00–19:00
 * IST window against the server's own zone and dial customers at night.
 */
export function localParts(at: Date, timeZone: string): { minutes: number; weekday: number; dayKey: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    }).formatToParts(at);
  } catch {
    // Unknown zone — fall back to UTC rather than throwing inside a job tick.
    return localParts(at, 'UTC');
  }

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // 'en-US' with hour12:false renders midnight as '24' in some ICU versions.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    minutes: hour * 60 + minute,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    dayKey: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

