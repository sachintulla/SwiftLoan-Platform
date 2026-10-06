// Generic registry of on-screen, voice-addressable targets. SwiftLoan's shared
// primitives (Controls.tsx, Frame.tsx's Screen) register themselves here; the
// single perform_ui_action tool (see tools.ts) dispatches against whatever is
// registered for the CURRENT screen. This is what lets one generic tool cover
// tap/fill/toggle/scroll across all 25 screens with no per-screen tool authoring.
import { SCREEN_INFO } from './screenInfo';

export type TargetKind = 'button' | 'field' | 'toggle' | 'chips' | 'consent' | 'scroll' | 'slider' | 'date';

export interface ActionTarget {
  kind: TargetKind;
  label: string;
  sensitive?: boolean;
  /**
   * Present but not pressable yet (e.g. "Send OTP" before terms are accepted).
   * Disabled controls are still registered so the agent can see they exist and be
   * told *why* they failed — hiding them left it with "not_found" and no way to
   * work out that it needed to tick the terms box first.
   */
  disabled?: boolean;
  /**
   * Chips only: the field this option belongs to ("Gender", "Employment"...). Option
   * labels repeat across groups on one screen ("Other" appears in four on `basic`),
   * so the agent needs the group to say which one it means.
   */
  group?: string;
  /** Sliders: which quantity this is, whatever language the label is in. */
  role?: 'amount' | 'tenure' | 'rate';
  /** Sliders: bounds, so the agent knows the limits it is working within. */
  min?: number;
  max?: number;
  step?: number;
  onTap?: () => void;
  /**
   * This screen's main forward action (Continue/Next/Get Started/Send OTP/...).
   * Set by the shared PrimaryButton component so `continue_next` (tools.ts) can
   * find it by role instead of by matching its label text against a hardcoded
   * English keyword list — that keyword match silently fails on any non-English
   * screen (Hindi/Telugu labels never contain "continue" or "send otp"),
   * confirmed live via repeated `continue_next` -> "not_found" on Telugu screens.
   */
  primary?: boolean;
  // Numbers are included for sliders (loan amount / tenure / rate); dates travel
  // as YYYY-MM-DD strings.
  /** Returns `false` when the value was rejected (e.g. an under-18 date of birth). */
  setValue?: (v: string | boolean | number) => void | boolean;
  getValue?: () => string | boolean | number | undefined;
  scrollBy?: (amount: 'small' | 'page' | 'top' | 'bottom', direction?: 'up' | 'down') => void;
}

const targetsByScreen = new Map<string, Map<string, ActionTarget>>();
let currentScreen = '';

// Fires when the *set* of explicitly self-registered targets changes — a control
// appearing or disappearing on any screen, OR one of them changing state (checked,
// selected, enabled/disabled, slider/date value, text field going empty<->filled;
// see stateOf below) — but never on a mere handler refresh. This is what lets a
// control that registers late — e.g. a screen's own async load() finishing
// well after the auto-discovered scan already settled, confirmed live to run
// 500ms-1.5s on profile's notification toggles — extend the agent's debounced
// page_context send itself instead of the send guessing a fixed wait long
// enough to always outlast an unpredictable network fetch.
//
// Deferred to a microtask rather than checked at each call: React runs a
// component's effect cleanup (unregister) and its re-run (register) back to
// back on every re-render whenever any dependency changes — for a Field that
// includes `value`, that's every keystroke, re-registering the same id under
// a fresh closure. Reacting to the individual add/remove would see the
// delete as a removal and the immediate re-add as new, firing twice per
// keystroke — exactly the spam this file's other dedup logic (the
// `elementsSig` comment above) exists to prevent. Comparing a full signature
// of every screen's targets once all of a commit's synchronous effects have
// run absorbs that delete-then-immediately-re-add into a net no-op.
const targetSetListeners = new Set<() => void>();
export function onTargetSetChanged(cb: () => void): () => void {
  targetSetListeners.add(cb);
  return () => targetSetListeners.delete(cb);
}
let targetSetCheckScheduled = false;
let lastTargetSetSignature = '';

// What the agent should be told about, per explicitly registered control: its
// identity, whether it is enabled, and its STATE — checked (toggle/consent),
// selected (chips), value (slider/date), or just filled/empty (text fields, so a
// prefill landing is noticed without a send per keystroke; the typed text itself
// is picked up on blur / keyboard hide). Before this only the id set was
// compared, so ticking a box, picking a chip or enabling a button by hand never
// reached the agent, which then asked the user to do what was already done.
function stateOf(t: ActionTarget): string {
  let v: string | boolean | number | undefined;
  try { v = t.getValue?.(); } catch { v = undefined; }
  if (t.kind === 'field') return t.sensitive ? 'f' : String(v ?? '').trim() ? 'filled' : 'empty';
  if (v === undefined) return '';
  return String(v);
}
function targetSetSignature(): string {
  return Array.from(targetsByScreen.entries())
    .map(([screen, m]) =>
      `${screen}:${Array.from(m.entries())
        .map(([id, t]) => `${id}${t.disabled ? '!' : ''}=${stateOf(t)}`)
        .sort()
        .join(',')}`,
    )
    .sort()
    .join('|');
}
function scheduleTargetSetCheck(): void {
  if (targetSetCheckScheduled) return;
  targetSetCheckScheduled = true;
  Promise.resolve().then(() => {
    targetSetCheckScheduled = false;
    const sig = targetSetSignature();
    if (sig === lastTargetSetSignature) return;
    lastTargetSetSignature = sig;
    targetSetListeners.forEach(cb => cb());
  });
}

/** Ask for a fresh page_context (debounced by the agent) — e.g. a field was just committed. */
export function requestContextRefresh(): void {
  targetSetListeners.forEach(cb => cb());
}

// Auto-discovered elements from the rendered element tree (see screenGraph.ts),
// kept separate from explicit registrations so a re-render can replace the whole
// auto set without clobbering primitives that registered themselves.
const autoByScreen = new Map<string, Map<string, ActionTarget>>();
const screenTexts = new Map<string, string[]>();

// Signature of the last published graph per screen. Screens re-render on every
// keystroke/slider drag, and each render produces fresh closures — so without
// this the caller would fire a client-tools-update over the WebSocket on every
// keypress. Handlers are always refreshed; only the *notification* is deduped.
const lastSignature = new Map<string, string>();

// Elements-only half of the signature above, tracked separately so a controls
// change can always publish immediately while a *text-only* change (e.g. an
// animated greeting carousel re-rendering every couple seconds, or a slow
// count-up) can be throttled instead — see TEXT_CHANGE_THROTTLE_MS below.
const lastElementsSignature = new Map<string, string>();
const lastPublishAt = new Map<string, number>();

// Caps how often text-only churn can re-notify the agent per screen. Real
// control changes (a new button appearing, tapping something) always bypass
// this and publish immediately; this only bounds screens whose *decorative*
// text keeps changing on a timer, which would otherwise push a
// client-tools-update over the live socket forever, competing with real
// requests/responses on the same connection.
const TEXT_CHANGE_THROTTLE_MS = 4000;

// Waiters for the next graph publish. Used by tools.ts to report post-action
// state as soon as React has actually re-rendered, instead of guessing a delay.
let publishWaiters: Array<() => void> = [];

/**
 * Resolves on the next screen-graph publish, or after `timeoutMs` if the action
 * caused no re-render at all (e.g. tapping something inert). Deliberately fires on
 * every publish *attempt*, not only when the control set changed: typing into a
 * field re-renders without altering the set, and those actions need the fast path
 * just as much as navigation does.
 */
export function waitForNextPublish(timeoutMs: number): Promise<void> {
  return new Promise<void>(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      publishWaiters = publishWaiters.filter(w => w !== finish);
      resolve();
    };
    publishWaiters.push(finish);
    setTimeout(finish, timeoutMs);
  });
}

/** Drop a screen's auto-discovered controls and texts (e.g. when leaving it). */
export function clearScreenGraph(screen: string): void {
  autoByScreen.delete(screen);
  screenTexts.delete(screen);
  lastSignature.delete(screen);
  lastNotifiedSignature.delete(screen);
  lastElementsSignature.delete(screen);
  lastPublishAt.delete(screen);
  throttledChanges.delete(screen);
  const t = trailingTimers.get(screen);
  if (t) { clearTimeout(t); trailingTimers.delete(screen); }
}

// Text-only changes inside the throttle window are no longer simply forgotten: a
// one-off change (an error line under a field, a readout, async text landing right
// after the screen loaded) used to be dropped for good because its signature was
// stored as "already seen" and nothing re-fired. They now get ONE trailing refresh
// when the window ends — unless the text keeps changing (a carousel / count-up),
// which is exactly the churn the throttle exists to absorb.
const lastNotifiedSignature = new Map<string, string>();
const throttledChanges = new Map<string, number>();
const trailingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_ONE_OFF_CHANGES = 2;

/**
 * Screens where the agent is told ONLY the available buttons — no screen text. Home is a dashboard
 * whose text (hero headline, offer cards, counters) keeps changing as data loads; every change was
 * a new context send, and a send that lands while the agent is speaking is treated by Ello as a
 * barge-in, so it cut itself off and regenerated (three sends in two seconds after login).
 */
export const BUTTONS_ONLY_SCREENS = new Set<string>(['home']);

/** Returns true when the set of addressable controls actually changed. */
export function publishScreenGraph(
  screen: string,
  elements: Array<{ id: string } & ActionTarget>,
  texts: string[],
): boolean {
  if (BUTTONS_ONLY_SCREENS.has(screen)) texts = [];
  const m = new Map<string, ActionTarget>();
  for (const { id, ...target } of elements) m.set(id, target);
  autoByScreen.set(screen, m);
  screenTexts.set(screen, texts);

  // Wake anyone waiting on post-action state before the changed-check, so a
  // re-render that leaves the control set identical still releases them promptly.
  if (publishWaiters.length) {
    const waiters = publishWaiters;
    publishWaiters = [];
    waiters.forEach(w => w());
  }

  // Signature must include the visible texts, not just the interactive controls:
  // on data screens (e.g. offers) the buttons are unchanged while async-loaded
  // content arrives, so a controls-only signature would never re-notify the agent
  // and it would keep describing stale/placeholder data.
  //
  // Discovered checkbox/toggle values and enabled state are folded in too (ticking
  // consent is one discrete flip, nothing like a keystroke stream). Explicitly
  // registered controls have their state tracked separately by stateOf() above.
  const elementsSig = elements
    .map(e => {
      const stateful = e.kind === 'toggle' || e.kind === 'consent' || e.kind === 'chips';
      return `${e.kind}|${e.label}${e.disabled ? '!' : ''}${stateful ? `|${e.getValue?.()}` : ''}`;
    })
    .join('~');
  const sig = elementsSig + '§' + texts.join('¶');
  if (lastSignature.get(screen) === sig) return false;

  const controlsChanged = lastElementsSignature.get(screen) !== elementsSig;
  const now = Date.now();
  const sinceLastPublish = now - (lastPublishAt.get(screen) ?? 0);
  if (!controlsChanged && sinceLastPublish < TEXT_CHANGE_THROTTLE_MS) {
    // Text-only churn inside the throttle window. Remember the signature so this
    // exact frame isn't re-flagged, and arrange a single trailing refresh for a
    // genuine one-off change (see the note above).
    lastSignature.set(screen, sig);
    const n = (throttledChanges.get(screen) ?? 0) + 1;
    throttledChanges.set(screen, n);
    if (n <= MAX_ONE_OFF_CHANGES && !trailingTimers.has(screen)) {
      trailingTimers.set(
        screen,
        setTimeout(() => {
          trailingTimers.delete(screen);
          const changes = throttledChanges.get(screen) ?? 0;
          throttledChanges.set(screen, 0);
          if (changes > MAX_ONE_OFF_CHANGES) return; // it kept changing: animation, stay quiet
          if (screen !== currentScreen) return;
          const latest = lastSignature.get(screen);
          if (latest && latest !== lastNotifiedSignature.get(screen)) {
            lastNotifiedSignature.set(screen, latest);
            lastPublishAt.set(screen, Date.now());
            requestContextRefresh();
          }
        }, TEXT_CHANGE_THROTTLE_MS - sinceLastPublish + 50),
      );
    }
    return false;
  }

  lastSignature.set(screen, sig);
  lastNotifiedSignature.set(screen, sig);
  lastElementsSignature.set(screen, elementsSig);
  lastPublishAt.set(screen, now);
  throttledChanges.set(screen, 0);
  return true;
}

export function getScreenTexts(screen: string): string[] {
  return screenTexts.get(screen) ?? [];
}

function screenMap(screen: string): Map<string, ActionTarget> {
  let m = targetsByScreen.get(screen);
  if (!m) {
    m = new Map();
    targetsByScreen.set(screen, m);
  }
  return m;
}

// Set once per navigation from store.ts's existing screen-change effect — the
// only non-React reader of "what screen is active right now" (tools.ts's
// handler runs outside React, on an async WS event, well after any render).
export function setCurrentScreen(screen: string): void {
  currentScreen = screen;
}

export function getCurrentScreen(): string {
  return currentScreen;
}

export function registerTarget(screen: string, id: string, target: ActionTarget): () => void {
  screenMap(screen).set(id, target);
  scheduleTargetSetCheck();
  return () => {
    targetsByScreen.get(screen)?.delete(id);
    scheduleTargetSetCheck();
  };
}

/** Explicit registrations win over auto-discovered ones with the same id. */
function mergedTargets(screen: string): Map<string, ActionTarget> {
  const merged = new Map<string, ActionTarget>(autoByScreen.get(screen) ?? []);
  for (const [id, t] of targetsByScreen.get(screen) ?? []) merged.set(id, t);
  return merged;
}

/**
 * What the agent is told about one control. Chips report `selected` (and their
 * `group`); toggles/consents/sliders/dates/fields report `value`; sensitive fields
 * report only whether they are `filled`, never the text itself.
 */
export function describeTarget(t: { kind: TargetKind; label: string } & ActionTarget): Record<string, unknown> {
  const out: Record<string, unknown> = { kind: t.kind, label: t.label };
  if (t.group) out.group = t.group;
  if (t.min !== undefined) out.min = t.min;
  if (t.max !== undefined) out.max = t.max;
  if (t.step !== undefined) out.step = t.step;
  if (t.disabled) out.enabled = false;
  if (t.sensitive) out.sensitive = true;
  if (t.getValue) {
    let v: string | boolean | number | undefined;
    try { v = t.getValue(); } catch { v = undefined; }
    if (t.kind === 'chips') out.selected = !!v;
    else if (t.sensitive) out.filled = String(v ?? '').trim().length > 0;
    else if (v !== undefined) out.value = v;
  }
  return out;
}

export function listTargets(screen: string): Array<{ id: string } & ActionTarget> {
  return Array.from(mergedTargets(screen).entries()).map(([id, t]) => ({ id, ...t }));
}

// Lookup order, scoped to the given screen only (docs/USE_CASES.md notes some
// labels repeat across screens, so cross-screen matching would be ambiguous):
// exact id -> case-insensitive exact label -> substring either direction.
/**
 * The language cards are labelled in their own scripts (English / हिन्दी / తెలుగు), but users and
 * the model say "Telugu" or "Hindi". Plain text matching could not connect them, so
 * "select Telugu" came back not_found and the agent had to apologise on the language screen.
 * Maps a spoken name (any case) to every spelling a label may use, both ways.
 */
const LANGUAGE_NAME_ALIASES: string[][] = [
  ['english', 'inglish', 'इंग्लिश', 'अंग्रेज़ी', 'అంగ్లం', 'ఇంగ్లీష్'],
  ['hindi', 'हिन्दी', 'हिंदी', 'హిందీ'],
  ['telugu', 'తెలుగు', 'तेलुगु', 'तेलगू'],
];
function queryVariants(q: string): string[] {
  const group = LANGUAGE_NAME_ALIASES.find(g => g.includes(q));
  return group ? [q, ...group.filter(x => x !== q)] : [q];
}

export function findTarget(screen: string, query: string, kind?: TargetKind, group?: string): ActionTarget | null {
  const m = mergedTargets(screen);
  if (!m.size) return null;
  if (m.has(query)) return m.get(query)!;

  const q = query.trim().toLowerCase();
  if (!q) return null;

  // Never consider unlabelled targets: '' matches every query under substring
  // comparison, which previously let an unrelated request tap a random icon button.
  let labelled = Array.from(m.values()).filter(t => t.label.trim().length > 0);
  // Option labels repeat across chip groups ("Other"); when the caller names the
  // group, only that group's options are candidates.
  if (group) {
    const g = group.trim().toLowerCase();
    const scoped = labelled.filter(t => (t.group ?? '').toLowerCase() === g || (t.group ?? '').toLowerCase().includes(g));
    if (scoped.length) labelled = scoped;
  }
  const pool = labelled.filter(t => !kind || t.kind === kind);
  // Prefer the kind the caller asked for, but fall back to any kind so a
  // mislabelled action ("set_toggle" on a checkbox row) still resolves.
  const candidates = pool.length ? pool : labelled;

  for (const v of queryVariants(q)) {
    for (const t of candidates) if (t.label.toLowerCase() === v) return t;
    for (const t of candidates) if (t.label.toLowerCase().startsWith(v)) return t;
    for (const t of candidates) {
      const label = t.label.toLowerCase();
      // Require a couple of characters before allowing fuzzy containment, so short
      // labels ("₹", "OK") can't swallow unrelated queries.
      if (label.length >= 3 && v.length >= 3 && (label.includes(v) || v.includes(label))) return t;
    }
  }
  return null;
}

export function buildPageContext(screen: string): Record<string, unknown> {
  const targets = listTargets(screen);
  const info = SCREEN_INFO[screen];
  return {
    page: screen,
    // Plain-language name + purpose, so the agent can tell the user where they are
    // (and never has to speak the internal id above). Omitted for unknown screens.
    screen_title: info?.title,
    screen_purpose: info?.purpose,
    // Include enough of the visible text that data-heavy screens (offers, loans)
    // convey their actual content — 12 lines cut off the offer list, leaving the
    // agent to fall back on example figures from its prompt.
    screen_overview: BUTTONS_ONLY_SCREENS.has(screen) ? undefined : getScreenTexts(screen).slice(0, 40).join(' · '),
    // interactionGuide.opening is injected into the model's system prompt verbatim
    // as "Page-specific behavior: …". Without it the agent never opens the
    // conversation: sending a non-empty `page` puts the backend on its
    // prompt-driven greeting path, which returns an empty greeting, and the
    // instruction that would make the agent speak first is gated on that greeting
    // being non-empty — so nothing tells it to start. This supplies that
    // instruction, which is what the integration guide's step 3 intends.
    //
    // Commented out at request, NOT deleted — this is a deliberate, reversible
    // disable, not a cleanup. Known risk if left off: the agent may go silent
    // at call start (no `opening` instruction) and may stop mid-flow asking
    // "what else can I help with?" instead of auto-advancing (no `autoAdvance`
    // instruction) — both were real observed bugs this field was added to fix.
    // Re-enable by uncommenting if either regresses.
    // interactionGuide: {
    //   goal: `Help the user do what the SwiftLoan "${screen}" screen is for, by calling tools rather than describing steps.`,
    //   // Same reasoning as `opening` below: a rule sitting only in the (much
    //   // larger, static) dashboard system prompt loses out to whatever's
    //   // structurally closest to the model at generation time. Observed
    //   // failure this fixes: model calls select_option, sees a result whose
    //   // controls_now already lists the newly-enabled "Continue with X"
    //   // button, then still stops and asks the user "what else can I help
    //   // with" instead of pressing it. Repeating the instruction here, fresh
    //   // every turn, gives it the same recency the opening instruction has.
    //   autoAdvance:
    //     'If the tool result you just received shows this screen\'s forward button now enabled ' +
    //     '(e.g. "Continue with X" appearing in controls_now/available_actions) because of the ' +
    //     'action you just took, call continue_next yourself immediately, in this same turn — ' +
    //     'before saying anything else to the user. Do not stop to ask "shall I continue?" or ' +
    //     '"what else can I help with?" and wait for them to say "continue."',
    //   opening:
    //     'Speak first, right away, before the user says anything. Open warmly, like ' +
    //     '"Welcome to SwiftLoan!" — then in the same short sentence, name this screen in ' +
    //     'plain everyday words (never speak an internal screen id like "basicpan" or ' +
    //     '"aadhaar") and one thing they can do here. One sentence, genuinely warm, no script. ' +
    //     'Then stop and listen.',
    // },
    available_actions: targets.map(describeTarget),
  };
}
