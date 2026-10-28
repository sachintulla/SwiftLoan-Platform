/**
 * Which front end a request came from: the website or the app.
 *
 * Both call the same API, so journey events recorded by those routes used to say channel 'app' even for website visitors,
 * and the website never recorded "application started" or "offers viewed" at all. The website now sends this header on
 * every authenticated call; anything without it is the app (the app never needed to send one).
 */
export const SURFACE_HEADER = 'x-swiftloan-surface';

export type Surface = 'app' | 'website';

export function surfaceOf(req: { headers: Record<string, unknown> }): Surface {
  const v = req.headers[SURFACE_HEADER];
  return String(Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase() === 'website' ? 'website' : 'app';
}
