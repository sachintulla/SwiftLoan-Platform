// Generic registry of on-screen, voice-addressable targets. SwiftLoan's shared
// primitives (Controls.tsx, Frame.tsx's Screen) register themselves here; the
// single perform_ui_action tool (see tools.ts) dispatches against whatever is
// registered for the CURRENT screen. This is what lets one generic tool cover
// tap/fill/toggle/scroll across all 25 screens with no per-screen tool authoring.
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
  setValue?: (v: string | boolean | number) => void;
  getValue?: () => string | boolean | number | undefined;
  scrollBy?: (amount: 'small' | 'page' | 'top' | 'bottom', direction?: 'up' | 'down') => void;
}

const targetsByScreen = new Map<string, Map<string, ActionTarget>>();
let currentScreen = '';

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

/** Returns true when the set of addressable controls actually changed. */
export function publishScreenGraph(
  screen: string,
  elements: Array<{ id: string } & ActionTarget>,
  texts: string[],
): boolean {
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
  const elementsSig = elements.map(e => `${e.kind}|${e.label}`).join('~');
  const sig = elementsSig + '§' + texts.join('¶');
  if (lastSignature.get(screen) === sig) return false;

  const controlsChanged = lastElementsSignature.get(screen) !== elementsSig;
  const now = Date.now();
  const sinceLastPublish = now - (lastPublishAt.get(screen) ?? 0);
  if (!controlsChanged && sinceLastPublish < TEXT_CHANGE_THROTTLE_MS) {
    // Text-only churn inside the throttle window (a carousel/count-up tick) —
    // remember the signature so this exact frame isn't re-flagged as "changed"
    // next time, but don't notify the agent yet. Screens like this keep
    // re-rendering on their own timer, so the picture catches up on the very
    // next tick once the window has passed; nothing is lost, just batched.
    lastSignature.set(screen, sig);
    return false;
  }

  lastSignature.set(screen, sig);
  lastElementsSignature.set(screen, elementsSig);
  lastPublishAt.set(screen, now);
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
  return () => {
    targetsByScreen.get(screen)?.delete(id);
  };
}

/** Explicit registrations win over auto-discovered ones with the same id. */
function mergedTargets(screen: string): Map<string, ActionTarget> {
  const merged = new Map<string, ActionTarget>(autoByScreen.get(screen) ?? []);
  for (const [id, t] of targetsByScreen.get(screen) ?? []) merged.set(id, t);
  return merged;
}

export function listTargets(screen: string): Array<{ id: string } & ActionTarget> {
  return Array.from(mergedTargets(screen).entries()).map(([id, t]) => ({ id, ...t }));
}

// Lookup order, scoped to the given screen only (docs/USE_CASES.md notes some
// labels repeat across screens, so cross-screen matching would be ambiguous):
// exact id -> case-insensitive exact label -> substring either direction.
export function findTarget(screen: string, query: string, kind?: TargetKind): ActionTarget | null {
  const m = mergedTargets(screen);
  if (!m.size) return null;
  if (m.has(query)) return m.get(query)!;

  const q = query.trim().toLowerCase();
  if (!q) return null;

  // Never consider unlabelled targets: '' matches every query under substring
  // comparison, which previously let an unrelated request tap a random icon button.
  const labelled = Array.from(m.values()).filter(t => t.label.trim().length > 0);
  const pool = labelled.filter(t => !kind || t.kind === kind);
  // Prefer the kind the caller asked for, but fall back to any kind so a
  // mislabelled action ("set_toggle" on a checkbox row) still resolves.
  const candidates = pool.length ? pool : labelled;

  for (const t of candidates) if (t.label.toLowerCase() === q) return t;
  for (const t of candidates) if (t.label.toLowerCase().startsWith(q)) return t;
  for (const t of candidates) {
    const label = t.label.toLowerCase();
    // Require a couple of characters before allowing fuzzy containment, so short
    // labels ("₹", "OK") can't swallow unrelated queries.
    if (label.length >= 3 && q.length >= 3 && (label.includes(q) || q.includes(label))) return t;
  }
  return null;
}

export function buildPageContext(screen: string): Record<string, unknown> {
  const targets = listTargets(screen);
  return {
    page: screen,
    // Include enough of the visible text that data-heavy screens (offers, loans)
    // convey their actual content — 12 lines cut off the offer list, leaving the
    // agent to fall back on example figures from its prompt.
    screen_overview: getScreenTexts(screen).slice(0, 40).join(' · '),
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
    available_actions: targets.map(t => ({
      kind: t.kind,
      label: t.label,
      ...(t.disabled ? { enabled: false } : {}),
      ...(t.sensitive ? { sensitive: true } : {}),
      ...(t.getValue ? { value: t.getValue() } : {}),
    })),
  };
}
