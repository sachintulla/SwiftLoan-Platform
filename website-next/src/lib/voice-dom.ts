/**
 * DOM helpers behind the voice widget's screen-driving tools.
 *
 * The /apply funnel and /account pages were built without `name`/`id`/`data-*`
 * hooks — controls are only identifiable by what a person would call them: the
 * wrapping <label>'s text, a placeholder, an aria-label, a button's text. So the
 * agent works the same way a visitor does: by label. That also means a redesign
 * that keeps the wording keeps the voice flow working, with no id contract to
 * silently break (which is exactly what happened to the old #leadForm ids).
 *
 * Everything here is synchronous DOM reading/writing except `setSliderTo`, which
 * has to wait a frame between keystrokes for React to commit.
 */

export type ControlKind =
  | 'text'
  | 'date'
  | 'select'
  | 'chip'
  | 'checkbox'
  | 'switch'
  | 'slider'
  | 'button'
  | 'link';

export interface ScreenControl {
  kind: ControlKind;
  label: string;
  /** Question a chip belongs to (e.g. "Gender"), so "Other" is unambiguous. */
  group?: string;
  /** Current value. Never present for sensitive fields. */
  value?: string | number | boolean;
  /** Chips and radios: is this the chosen one. */
  selected?: boolean;
  enabled: boolean;
  /** Text fields: already has content (sensitive fields show only this). */
  filled?: boolean;
  /** The visitor must type this themselves — voice tools refuse it. */
  sensitive?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
}

/** Elements that belong to the voice widget itself, never to the page. */
const WIDGET_SELECTOR = '.sl-voice-launcher, .sl-fab-anchor, #sl-voice-error';

/**
 * Fields the visitor must type themselves.
 *
 * `\bpin\b` rather than /pin/ so "Pincode" (a postal code, which voice may fill)
 * is not caught. OTP digit boxes carry only `aria-label="Digit N of 6"` and
 * autocomplete="off" except the first, and the PAN box has no name/id/label
 * attribute at all — only its "PAN number" wrapper label and an ABCDE1234F
 * placeholder — so each needs its own rule.
 */
const SENSITIVE_RE =
  /\b(pan|aadhaar|aadhar|otp|password|passcode|pin|cvv|cvc|ssn)\b|verification code|one[- ]time|digit \d of \d/i;
const PAN_PLACEHOLDER_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[*:]/g, ' ')
    .replace(/[^\p{L}\p{N}₹%&+ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(s: string | null | undefined, max = 90): string {
  const t = (s ?? '').replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest(WIDGET_SELECTOR)) return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Topmost open modal layer, if any — while one is up, only its contents are usable.
 *
 * Real dialogs carry a role; the home page's OTP and callback popups and the
 * logout confirmation are plain full-screen overlays (`fixed inset-0`) with no
 * ARIA at all, so those are recognised by that shape too.
 */
export function activeDialog(): HTMLElement | null {
  const dialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog[open], .fixed.inset-0'),
  ).filter((d) => !d.closest(WIDGET_SELECTOR) && isVisible(d));
  return dialogs.length ? dialogs[dialogs.length - 1]! : null;
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
}

/** The first <span> of a wrapping <label> is its caption (see Field in apply/primitives). */
function wrapperCaption(el: Element): string {
  const wrap = el.closest('label');
  if (!wrap) return '';
  const span = wrap.querySelector(':scope > span');
  return span?.textContent ?? '';
}

export function labelOf(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return clean(aria);
  const lb = labelledBy(el);
  if (lb) return clean(lb);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      // A consent checkbox's label IS its wording — the agent has to read it.
      const wrap = el.closest('label');
      if (wrap) return clean(wrap.textContent, 200);
    }
    const cap = wrapperCaption(el);
    if (cap) return clean(cap);
    if (el.id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (forLabel) return clean(forLabel.textContent);
    }
    const ph = el.getAttribute('placeholder');
    if (ph) return clean(ph);
    return clean(el.getAttribute('name') ?? el.type);
  }

  if (el.getAttribute('role') === 'switch' || el.getAttribute('role') === 'slider') {
    // No aria-label: the caption is the first line of the nearest ancestor that
    // has any text of its own (e.g. a settings row "Loan updates / Status changes…").
    for (let n: Element | null = el.parentElement, i = 0; n && i < 3; n = n.parentElement, i++) {
      const first = visibleText(n).split(' · ')[0];
      if (first) return clean(first);
    }
    return '';
  }

  const text = clean(visibleText(el));
  // Identical buttons repeat across cards ("Select this offer" ×3). Name the card
  // so each is addressable: "Select this offer (HDFC Bank)".
  const card = el.closest('article');
  const title = card?.querySelector('h1, h2, h3')?.textContent?.trim();
  if (card && title && text && !text.includes(title)) return `${text} (${clean(title, 50)})`;
  return text;
}

/**
 * Text as a person reads it. `textContent` glues sibling blocks together
 * ("SLPersonal LoanRef SL-4258₹3,00,000Active" for an application row);
 * `innerText` follows layout, so each block lands on its own line.
 */
function visibleText(el: Element): string {
  const raw = el instanceof HTMLElement ? el.innerText || el.textContent || '' : el.textContent || '';
  return raw
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(' · ');
}

/** Question text a chip answers ("Gender", "Employment type", "Tenure"). */
export function groupOf(el: Element): string | undefined {
  const radio = el.closest('[role="radiogroup"], [role="group"]');
  const radioLabel = radio?.getAttribute('aria-label');
  if (radioLabel) return clean(radioLabel);
  const cap = wrapperCaption(el);
  if (cap) return clean(cap);
  return undefined;
}

export function isSensitive(el: Element): boolean {
  const attrs = [
    el.getAttribute('name'),
    el.getAttribute('id'),
    el.getAttribute('placeholder'),
    el.getAttribute('aria-label'),
    wrapperCaption(el),
  ]
    .filter(Boolean)
    .join(' ');
  if (SENSITIVE_RE.test(attrs)) return true;
  const ph = el.getAttribute('placeholder') ?? '';
  if (PAN_PLACEHOLDER_RE.test(ph.replace(/\s/g, ''))) return true;
  const ac = el.getAttribute('autocomplete');
  if (ac && /one-time-code|cc-|password/.test(ac)) return true;
  if (el instanceof HTMLInputElement && el.type === 'password') return true;
  return false;
}

function sliderNumbers(el: Element) {
  const n = (k: string) => {
    const v = Number(el.getAttribute(k));
    return Number.isFinite(v) ? v : undefined;
  };
  return { value: n('aria-valuenow'), min: n('aria-valuemin'), max: n('aria-valuemax') };
}

/** What a control looks like to the agent. */
export function describeControl(el: Element): ScreenControl | null {
  const role = el.getAttribute('role');
  const label = labelOf(el);
  if (!label) return null;

  if (el instanceof HTMLInputElement) {
    if (el.type === 'hidden' || el.type === 'file' || el.type === 'submit') return null;
    if (el.type === 'checkbox') {
      return { kind: 'checkbox', label, value: el.checked, enabled: !el.disabled, required: el.required };
    }
    const sensitive = isSensitive(el);
    return {
      kind: el.type === 'date' ? 'date' : 'text',
      label,
      enabled: !el.disabled,
      filled: el.value.length > 0,
      sensitive: sensitive || undefined,
      required: el.required || undefined,
      ...(sensitive ? {} : { value: el.value }),
    };
  }
  if (el instanceof HTMLTextAreaElement) {
    return { kind: 'text', label, value: el.value, filled: el.value.length > 0, enabled: !el.disabled };
  }
  if (el instanceof HTMLSelectElement) {
    return {
      kind: 'select',
      label,
      value: el.selectedOptions[0]?.textContent?.trim() ?? '',
      enabled: !el.disabled,
    };
  }
  if (role === 'slider') {
    const s = sliderNumbers(el);
    return { kind: 'slider', label, value: s.value, min: s.min, max: s.max, enabled: true };
  }
  if (role === 'switch') {
    return { kind: 'switch', label, value: el.getAttribute('aria-checked') === 'true', enabled: !(el as HTMLButtonElement).disabled };
  }
  if (role === 'radio' || el.hasAttribute('aria-pressed') || isChip(el)) {
    const selected = el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-pressed') === 'true' || isChipSelected(el);
    return { kind: 'chip', label, group: groupOf(el), selected, enabled: !(el as HTMLButtonElement).disabled };
  }
  if (el instanceof HTMLAnchorElement) {
    return { kind: 'link', label, enabled: true };
  }
  if (el instanceof HTMLButtonElement) {
    return { kind: 'button', label, enabled: !el.disabled };
  }
  return null;
}

/**
 * Chips are plain `type="button"` pills inside a label-wrapped group (ChipGroup).
 * They have no ARIA state, so "selected" has to be read off the styling hook the
 * component applies to the chosen one.
 */
function isChip(el: Element): boolean {
  return (
    el instanceof HTMLButtonElement &&
    el.type === 'button' &&
    !!el.closest('label') &&
    el.classList.contains('rounded-full') &&
    !!wrapperCaption(el)
  );
}
function isChipSelected(el: Element): boolean {
  return el.classList.contains('bg-accent') || /\bborder-primary\b/.test(el.className);
}

const CONTROL_SELECTOR = [
  'input:not([type=hidden]):not([type=file])',
  'textarea',
  'select',
  'button',
  'a[href]',
  '[role="slider"]',
  '[role="switch"]',
  '[role="radio"]',
].join(',');

/** Where to look: the open dialog if there is one, else the page content. */
export function scopeRoot(): ParentNode {
  const dlg = activeDialog();
  if (dlg) return dlg;
  return document.querySelector('main') ?? document.body;
}

/** Chrome we never offer as a "control": site header/footer and the account rail. */
function isChrome(el: Element): boolean {
  return !!el.closest('header, footer, nav');
}

export function collectControls(root: ParentNode = scopeRoot(), limit = 40): ScreenControl[] {
  const inDialog = root !== document.body && root instanceof Element && root === activeDialog();
  const out: ScreenControl[] = [];
  const seen = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll(CONTROL_SELECTOR))) {
    if (!isVisible(el)) continue;
    if (!inDialog && isChrome(el)) continue;
    // A Radix slider renders a hidden <input> next to its thumb; the thumb is the control.
    if (el instanceof HTMLInputElement && el.closest('[data-orientation]') && el.getAttribute('aria-hidden')) continue;
    const c = describeControl(el);
    if (!c) continue;
    const key = `${c.kind}|${c.group ?? ''}|${c.label}`;
    const at = seen.get(key);
    if (at !== undefined) {
      // Same control rendered twice (the home page has two "Mobile" fields):
      // report the one the visitor has actually touched.
      const prev = out[at]!;
      if (!prev.filled && !prev.selected && (c.filled || c.selected)) out[at] = c;
      continue;
    }
    seen.set(key, out.length);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** Visible error / helper text the app is showing (why Continue is disabled, a failed OTP…). */
export function collectMessages(root: ParentNode = scopeRoot()): string[] {
  const msgs: string[] = [];
  const sel = '[role="alert"], [role="status"], .text-danger, p.text-danger';
  for (const el of Array.from(root.querySelectorAll(sel))) {
    if (!isVisible(el)) continue;
    const t = clean(el.textContent, 220);
    if (t && !msgs.includes(t)) msgs.push(t);
    if (msgs.length >= 4) break;
  }
  // The "Required to continue: …" hint under a disabled primary button.
  for (const p of Array.from(root.querySelectorAll('p'))) {
    const t = clean(p.textContent, 220);
    if (/^required to continue/i.test(t) && isVisible(p) && !msgs.includes(t)) {
      msgs.push(t);
      break;
    }
  }
  // "Required to continue:" arrives as its own fragment as well as inside the full
  // sentence; keep only the full one.
  return msgs.filter((m) => !msgs.some((o) => o !== m && o.startsWith(m)));
}

/** Card-like blocks (offer cards): heading plus the figures printed on them. */
export function collectCards(root: ParentNode = scopeRoot(), limit = 8): Array<{ title: string; text: string }> {
  const out: Array<{ title: string; text: string }> = [];
  for (const el of Array.from(root.querySelectorAll('article'))) {
    if (!isVisible(el)) continue;
    const title = clean(el.querySelector('h1, h2, h3')?.textContent, 60);
    const text = clean(visibleText(el), 420);
    if (title || text) out.push({ title, text });
    if (out.length >= limit) break;
  }
  return out;
}

/** The comparison table, row by row — the figures a visitor asks about. */
export function collectTables(root: ParentNode = scopeRoot(), maxRows = 14): string[][] {
  const out: string[][] = [];
  const table = Array.from(root.querySelectorAll('table')).find(isVisible);
  if (!table) return out;
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('th, td')).map((c) => clean(visibleText(c), 60));
    if (cells.some(Boolean)) out.push(cells);
    if (out.length >= maxRows) break;
  }
  return out;
}

export function pageHeading(): string {
  const dlg = activeDialog();
  const heads = Array.from((dlg ?? document).querySelectorAll('h1, h2')).filter(isVisible);
  // The apply shell's marketing side rail has its own h1 ("Smarter borrowing
  // starts here"); the page's heading is the first one outside rails and chrome.
  const h = heads.find((x) => !x.closest('aside, header, nav, footer')) ?? heads[0];
  return clean(h?.textContent, 120);
}

/** "Step 2 of 3" style marker, if the shell shows one. */
export function stepMarker(): string | null {
  const m = document.body.innerText.match(/Step \d of \d/i);
  return m ? m[0] : null;
}

// ── Finding controls ──────────────────────────────────────────────────────

export interface Match<T extends Element> {
  el: T | null;
  /** More than one equally good candidate — the caller should ask which. */
  ambiguous?: string[];
}

function rank(candidate: string, want: string): number {
  const c = norm(candidate);
  if (!c || !want) return 0;
  if (c === want) return 4;
  if (c.startsWith(want) || want.startsWith(c)) return 3;
  if (c.includes(want)) return 2;
  const wantWords = want.split(' ').filter((w) => w.length > 2);
  if (wantWords.length && wantWords.every((w) => c.includes(w))) return 1;
  return 0;
}

function pick<T extends Element>(items: { el: T; label: string; shown?: string }[], wantRaw: string): Match<T> {
  const want = norm(wantRaw);
  let best = 0;
  let winners: { el: T; label: string; shown?: string }[] = [];
  for (const it of items) {
    const r = rank(it.label, want);
    if (r > best) {
      best = r;
      winners = [it];
    } else if (r === best && r > 0) {
      winners.push(it);
    }
  }
  if (!winners.length) return { el: null };
  if (winners.length > 1) return { el: null, ambiguous: winners.map((w) => w.shown ?? w.label) };
  return { el: winners[0]!.el };
}

function visibleIn<T extends Element>(selector: string, root: ParentNode = scopeRoot()): T[] {
  return Array.from(root.querySelectorAll(selector)).filter(isVisible) as T[];
}

export function findTextField(label: string): Match<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> {
  const els = visibleIn<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select',
  );
  return pick(
    els.map((el) => ({ el, label: labelOf(el) })),
    label,
  );
}

export function findChip(option: string, group?: string): Match<HTMLElement> {
  const all = visibleIn<HTMLElement>('button, [role="radio"]').filter((el) => describeControl(el)?.kind === 'chip');
  const wantGroup = group ? norm(group) : null;
  const pool = wantGroup ? all.filter((el) => rank(groupOf(el) ?? '', wantGroup) > 0) : all;
  return pick(
    // Ranked on the option text alone, but a clash is reported with its question
    // ("Gender: Other"), since the bare word means nothing.
    pool.map((el) => ({ el, label: labelOf(el), shown: `${groupOf(el) ?? '?'}: ${labelOf(el)}` })),
    option,
  );
}

export function findToggle(label: string): Match<HTMLElement> {
  const els = visibleIn<HTMLElement>('input[type=checkbox], [role="switch"]');
  return pick(
    els.map((el) => ({ el, label: labelOf(el) })),
    label,
  );
}

export function findSlider(label?: string): Match<HTMLElement> {
  const els = visibleIn<HTMLElement>('[role="slider"]');
  if (!els.length) return { el: null };
  if (!label) return els.length === 1 ? { el: els[0]! } : { el: null, ambiguous: els.map((e) => labelOf(e)) };
  const named = pick(
    els.map((el) => ({ el, label: labelOf(el) })),
    label,
  );
  // Sliders often have no accessible name; a lone slider is unambiguous anyway.
  if (!named.el && !named.ambiguous && els.length === 1) return { el: els[0]! };
  return named;
}

export function findPressable(label: string): Match<HTMLElement> {
  const els = visibleIn<HTMLElement>('button, a[href], [role="button"]').filter((el) => {
    if (el.closest('[role="radiogroup"]')) return false;
    return describeControl(el)?.kind !== 'chip';
  });
  return pick(
    els
      .map((el) => ({ el, label: labelOf(el) }))
      .filter((x) => x.label),
    label,
  );
}

// ── Writing ───────────────────────────────────────────────────────────────

/** Write through React's value tracking, the same way a real keystroke would. */
export function writeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Choose a <select> option by its visible text (or value). */
export function selectByText(el: HTMLSelectElement, text: string): string | null {
  const want = norm(text);
  const opt =
    Array.from(el.options).find((o) => norm(o.textContent) === want || norm(o.value) === want) ??
    Array.from(el.options).find((o) => norm(o.textContent).includes(want));
  if (!opt) return null;
  writeValue(el, opt.value);
  return opt.textContent?.trim() ?? opt.value;
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 20));

function pressKey(el: HTMLElement, k: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/**
 * Move a Radix slider to `target` by keyboard.
 *
 * Radix sliders are driven by React state with no native range input behind
 * them, so there is nothing to write a value to. Arrow keys are the one input
 * they all honour: the thumb is focused, then PageUp/PageDown (×10 steps) and
 * Arrow (×1 step) walk it. The step size is discovered by pressing a key once,
 * not assumed, so the same code serves a ₹25,000-step amount slider and a
 * ₹500-step EMI-budget slider.
 */
export async function setSliderTo(thumb: HTMLElement, target: number): Promise<{ value: number; min?: number; max?: number }> {
  thumb.focus();
  await nextFrame();
  const read = () => sliderNumbers(thumb);
  let { min, max } = read();
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const goal = clamp(target);

  let cur = read().value ?? 0;
  if (cur === goal) return { value: cur, min, max };

  if (goal === min) pressKey(thumb, 'Home');
  else if (goal === max) pressKey(thumb, 'End');
  if (goal === min || goal === max) {
    await nextFrame();
    return { value: read().value ?? goal, min, max };
  }

  // Probe the step with one Arrow press toward the goal.
  const dir = goal > cur ? 'ArrowRight' : 'ArrowLeft';
  pressKey(thumb, dir);
  await nextFrame();
  let next = read().value ?? cur;
  const step = Math.abs(next - cur);
  if (!step) return { value: next, min, max };
  cur = next;

  for (let guard = 0; guard < 220 && cur !== goal; guard++) {
    const remaining = Math.round((goal - cur) / step);
    if (remaining === 0) break;
    const k =
      Math.abs(remaining) >= 10 ? (remaining > 0 ? 'PageUp' : 'PageDown') : remaining > 0 ? 'ArrowRight' : 'ArrowLeft';
    pressKey(thumb, k);
    await nextFrame();
    next = read().value ?? cur;
    if (next === cur) break; // hit a bound
    cur = next;
  }
  ({ min, max } = read());
  return { value: cur, min, max };
}

/** Wait until the DOM settles after a click (route change, modal, state commit). */
export function settle(ms = 450): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * After a route change the new page often shows "Loading…" while it fetches.
 * Reporting arrival then would have the agent describe an empty screen, so wait
 * (bounded) for the placeholder to clear.
 */
export async function waitUntilLoaded(maxMs = 3000): Promise<void> {
  const loading = () =>
    /\bloading\b[^.\n]{0,40}…|please wait…|(checking|verifying|saving|applying|confirming|submitting|sending|finding)…/i.test(document.body.innerText);
  const t0 = Date.now();
  await settle(150);
  while (loading() && Date.now() - t0 < maxMs) await settle(150);
}
