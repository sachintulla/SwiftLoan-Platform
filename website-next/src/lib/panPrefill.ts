/**
 * Hand-off from Step 1 (PAN) to Step 2 (Basics): the details PAN Comprehensive returned for the
 * verified PAN, so Step 2 can pre-fill the form.
 *
 * The PAN itself is NEVER kept in the browser: only a masked form (last four characters) for display.
 * The server holds the real one, encrypted, and attaches it to the application itself.
 * sessionStorage (tab-scoped, cleared when the tab closes) — this is personal data, so it is never
 * written to localStorage.
 */
import type { PanPrefill } from './applyApi';

const KEY = 'swiftloan.panPrefill';

export interface PanHandoff {
  /** Display only, e.g. XXXXXX234A. */
  panMasked: string;
  prefill: PanPrefill;
  aadhaarLinked?: boolean | null;
}

/** XXXXXX234A — only the last four characters survive. */
export const maskPan = (pan: string) => `XXXXXX${pan.trim().toUpperCase().slice(-4)}`;

export function savePanHandoff(v: PanHandoff) {
  try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
}

export function loadPanHandoff(): PanHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as PanHandoff & { pan?: string };
    // A handoff written by an older build may still hold the PAN: drop it, keep only the masked form.
    if (v.pan) {
      const { pan, ...rest } = v;
      const clean = { ...rest, panMasked: v.panMasked ?? maskPan(pan) } as PanHandoff;
      sessionStorage.setItem(KEY, JSON.stringify(clean));
      return clean;
    }
    return v;
  } catch {
    return null;
  }
}
