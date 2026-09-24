/**
 * Hand-off from Step 1 (PAN) to Step 2 (Basics): the verified PAN and the
 * details PAN Comprehensive returned for it, so Step 2 can pre-fill the form.
 *
 * sessionStorage (tab-scoped, cleared when the tab closes) — this is personal
 * data, so it is never written to localStorage. The server is the source of
 * truth: revisiting Step 1 re-verifies from the server's PAN cache (free —
 * no second paid Aurix call), so losing this only costs the pre-fill.
 */
import type { PanPrefill } from './applyApi';

const KEY = 'swiftloan.panPrefill';

export interface PanHandoff {
  pan: string;
  prefill: PanPrefill;
}

export function savePanHandoff(v: PanHandoff) {
  try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ }
}

export function loadPanHandoff(): PanHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PanHandoff) : null;
  } catch {
    return null;
  }
}
