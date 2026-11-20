/**
 * The message shown under the login form when sending or verifying the OTP fails.
 *
 * The server answers in English only ("Invalid or expired OTP"), and the screen used to
 * show that text as it came, so a user who had the app in Telugu or Hindi got an English
 * error. The known answers are now matched by what they MEAN (the HTTP status of the
 * step), never by the server's wording, and shown in the app language. The English
 * strings are the server's own words, so English reads exactly as before.
 *
 * Pure: no React, no network.
 */
export type LoginStep = 'send' | 'verify';

/** Just the part of ApiError this needs (kept structural so this file imports nothing). */
interface HttpFailure { status: number; message: string }
const isHttpFailure = (e: unknown): e is HttpFailure =>
  !!e && typeof e === 'object' && typeof (e as HttpFailure).status === 'number' && typeof (e as HttpFailure).message === 'string';

export function loginErrorText(e: unknown, step: LoginStep, t: Record<string, string>, lang: string): string {
  const fallback = step === 'send' ? t.mobileErrSend : t.mobileErrVerify;
  // Never reached the server (offline, timed out): the app's own message, as before.
  if (!isHttpFailure(e)) return fallback;
  if (e.status === 429) return t.loginErrTooMany;
  if (step === 'verify' && e.status === 400) return t.loginErrOtpInvalid;
  if (step === 'send' && e.status === 502) return t.loginErrSendFailed;
  // Anything else: the server's own sentence is only readable in English.
  return lang === 'en' && e.message ? e.message : fallback;
}
