/**
 * Age-eligibility check for a date of birth, shared by every write path that
 * accepts one (users.routes.ts's profilePatch, context.routes.ts's
 * contextSaveFields). The app's own DOB picker (src/components/Calendar.tsx)
 * already refuses to let someone pick an under-18 date, and the voice
 * `setValue` path does the same check before writing state — but neither of
 * those binds a caller that skips the app and posts straight to the API, so
 * this is the real boundary. Loan applicants must be adults; this is a
 * regulatory requirement, not just a UX nicety.
 */
export function isAdult(dob: Date, minAgeYears = 18): boolean {
  if (Number.isNaN(dob.getTime())) return false;
  const today = new Date();
  // A future DOB is never valid (and could never be an adult anyway) —
  // covered by the same single comparison below, no separate check needed.
  const cutoff = new Date(today.getFullYear() - minAgeYears, today.getMonth(), today.getDate());
  return dob.getTime() <= cutoff.getTime();
}
