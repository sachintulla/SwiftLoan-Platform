/**
 * A local, browser-side copy of what the applicant typed on Step 1 — separate
 * from the server (the real source of truth, already saved via patchProfile/
 * createApplication by the time anyone reaches this). This exists so
 * "Update details" from the empty-offers screen can repaint the form
 * instantly without waiting on a network round trip, and still works if that
 * fetch is slow or briefly fails.
 *
 * Scoped by phone number: without this, a second applicant on the same
 * browser (a shared/test device, or just switching numbers mid-testing)
 * would see the FIRST applicant's name/address/etc. prefilled into their own
 * form the moment they reach Step 1, before the server overlay (scoped to
 * their own login) has a chance to load and correct it.
 */
export interface ApplyDraft {
  phone?: string;
  amount?: number;
  purpose?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  gender?: string;
  qualification?: string;
  email?: string;
  pincode?: string;
  addr1?: string;
  city?: string;
  state?: string;
  residence?: string;
  employment?: string;
  income?: string;
  company?: string;
  salaryMode?: string;
}

const KEY = 'sl_apply_draft';

/** Returns the saved draft only if it belongs to this phone number. */
export function loadDraft(phone: string): ApplyDraft {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const draft = JSON.parse(raw) as ApplyDraft;
    return draft.phone === phone ? draft : {};
  } catch {
    return {};
  }
}

export function saveDraft(phone: string, draft: Omit<ApplyDraft, 'phone'>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, phone }));
  } catch {
    /* localStorage unavailable (private mode) — the server copy still has it */
  }
}
