/**
 * The message shown to the user when the server refuses a save (profile, About you,
 * Basic details, More details, photo, delete account).
 *
 * The server answers in English only and sends no error code, just a status and a
 * sentence. Screens used to show that sentence as it came, so a user with the app in
 * Telugu or Hindi got an English error. In English nothing changes (the server's own
 * sentence is still the most precise one). In any other language the error is recognised
 * by its STATUS and shown in the app language; one it does not recognise becomes the
 * screen's own translated "could not save" message.
 *
 * The voice agent is a different reader: it should still get the server's real reason,
 * so screens pass the untranslated message to api_context and only the on-screen text
 * goes through here.
 *
 * Pure: no React, no network.
 */
interface HttpFailure { status: number; message: string }
const isHttpFailure = (e: unknown): e is HttpFailure =>
  !!e && typeof e === 'object' && typeof (e as HttpFailure).status === 'number' && typeof (e as HttpFailure).message === 'string';

export function serverErrorText(e: unknown, fallback: string, t: Record<string, string>, lang: string): string {
  // Never reached the server (offline, timed out): the screen's own message, as before.
  if (!isHttpFailure(e)) return fallback;
  if (lang === 'en') return e.message || fallback;
  if (e.status === 429) return t.loginErrTooMany;
  // 409 on a save = "this <field> is already in use by another account" (the field is named in the sentence).
  if (e.status === 409) return /e-?mail/i.test(e.message) ? t.errEmailInUse : t.errDetailInUse;
  // 400 = the server rejected a value ("MonthlyIncome: Number must be…"): its field-by-field wording is English.
  if (e.status === 400) return t.errCheckDetails;
  return fallback;
}

/** What the voice agent is told: the server's real reason when there is one. */
export function serverErrorReason(e: unknown, fallback: string): string {
  return isHttpFailure(e) && e.message ? e.message : fallback;
}
