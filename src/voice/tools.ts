// The tool surface exposed to Ello.
//
// Architecture: a single generic executor (`performAction`) does all the work, and
// every tool — the generic `perform_ui_action` plus the dedicated aliases the
// dashboard system prompt names — routes through it. One execution path, no
// duplicated logic; the aliases exist purely so the model can "call the most
// specific tool" as its prompt instructs.
//
// Targets resolve at call time from actionRegistry, which merges elements
// auto-discovered from the rendered tree (screenGraph.ts) with controls that
// register themselves via useVoiceTarget. So new screens and controls become
// voice-addressable without adding tools.
import type { ElloAgent } from './agent';
import { buildPageContext, findTarget, getCurrentScreen, listTargets, waitForNextPublish } from './actionRegistry';
import type { TargetKind } from './actionRegistry';
import type { JSONSchema } from './types';

interface PerformUiActionArgs {
  action: 'tap' | 'set_input' | 'set_toggle' | 'set_value' | 'scroll';
  target: string;
  value?: string;
  amount?: 'small' | 'page' | 'top' | 'bottom';
}

/** Words that identify a screen's main forward action, for `continue_next`. */
const FORWARD_WORDS = ['continue', 'next', 'get started', 'proceed', 'send otp', 'verify', 'submit', 'apply'];

function describeScreen(screen: string) {
  return listTargets(screen).map(t => t.label);
}

export function registerCoreTools(agent: ElloAgent, navigateToScreen: (screen: string) => boolean): void {
  /**
   * Reports the state the app is ACTUALLY in after an action, rather than letting
   * the model assume. Tapping "English" only selects a language — it does not
   * navigate — and without this the model told the user "you're now on the login
   * screen", which was false. The wait lets React re-render and <Screen>
   * re-publish its graph.
   */
  const settled = async (screenBefore: string, base: Record<string, unknown>) => {
    // Event-driven: resolve as soon as <Screen> re-publishes its graph (usually
    // one render, ~16-50ms) rather than always paying a fixed delay. The timeout
    // is only a floor for actions that trigger no re-render at all.
    await waitForNextPublish(250);
    const now = getCurrentScreen();
    return {
      ...base,
      screen_after: now,
      navigated: now !== screenBefore,
      controls_now: describeScreen(now).slice(0, 20),
    };
  };

  /** The one executor every tool funnels into. */
  async function performAction(args: PerformUiActionArgs): Promise<Record<string, unknown>> {
    const screen = getCurrentScreen();
    const wantKind: TargetKind | undefined =
      args.action === 'set_input'
        ? 'field'
        : args.action === 'set_toggle'
          ? 'toggle'
          : args.action === 'scroll'
            ? 'scroll'
            : undefined;

    // `continue_next` passes a sentinel: find whichever forward-ish button exists.
    let target = findTarget(screen, args.target, wantKind);
    if (!target && args.target === 'continue') {
      for (const word of FORWARD_WORDS) {
        target = findTarget(screen, word);
        if (target?.onTap) break;
      }
    }

    // Dates need an exact kind match, never a fuzzy label match: the picker is
    // collapsed behind a "Select date" button whose label also contains "date", so
    // fuzzy lookup grabbed that button (no setValue -> "not_settable"). Resolve the
    // real 'date' control by kind, opening the picker first if it isn't mounted yet,
    // so "set my date of birth to 1995-05-15" works as a single instruction.
    if (args.action === 'set_value' && args.target === 'Date') {
      const dateOf = (s: string) => listTargets(s).find(t => t.kind === 'date');
      let dateTarget = dateOf(screen);
      if (!dateTarget) {
        const opener =
          findTarget(screen, 'Select date') ||
          findTarget(screen, 'date of birth') ||
          findTarget(screen, 'calendar month');
        if (opener?.onTap) {
          opener.onTap();
          await new Promise<void>(resolve => setTimeout(() => resolve(), 300));
          dateTarget = dateOf(getCurrentScreen());
        }
      }
      if (!dateTarget?.setValue) {
        return { ok: false, reason: 'no_date_picker_on_screen', available: describeScreen(screen).slice(0, 20) };
      }
      dateTarget.setValue(args.value ?? '');
      return settled(screen, { ok: true, date_set: args.value, applied: dateTarget.getValue?.() });
    }

    if (!target) {
      // Hand back the real labels so the model can retry with a valid one
      // instead of guessing again.
      return { ok: false, reason: 'not_found', available: describeScreen(screen).slice(0, 25) };
    }

    // A disabled control exists but can't be actioned yet. Say so explicitly, and
    // list what IS actionable, so the model can satisfy the precondition (e.g.
    // accept the terms) instead of concluding the control doesn't exist.
    if (target.disabled) {
      return {
        ok: false,
        reason: 'disabled',
        label: target.label,
        message:
          `"${target.label}" is on screen but not enabled yet. Something is still required — ` +
          'check for an unticked checkbox or an empty required field, complete it, then retry.',
        actionable_now: listTargets(screen)
          .filter(t => !t.disabled)
          .map(t => t.label)
          .slice(0, 20),
      };
    }

    switch (args.action) {
      case 'tap':
        if (!target.onTap) return { ok: false, reason: 'not_tappable', kind: target.kind };
        target.onTap();
        return settled(screen, { ok: true, tapped: target.label });

      case 'set_input':
        if (target.sensitive) {
          return {
            ok: false,
            refused: true,
            reason: 'sensitive_field',
            message: `Ask the user to type ${target.label} themselves.`,
          };
        }
        if (!target.setValue) return { ok: false, reason: 'not_fillable', kind: target.kind };
        target.setValue(args.value ?? '');
        return settled(screen, { ok: true, field: target.label, value: args.value ?? '' });

      case 'set_toggle': {
        const on = args.value === undefined ? true : args.value === 'true';
        if (!target.setValue) {
          // Many consent rows are plain <Pressable>s that flip their own state, so
          // they surface as buttons with no setValue. Tapping is the only way to
          // change them — do that rather than failing outright. Their prior state
          // isn't readable, so report that this was a flip, not an absolute set.
          if (target.onTap) {
            target.onTap();
            return settled(screen, {
              ok: true,
              toggled_by_tap: target.label,
              note: 'This control has no readable state; tapping flips it. Verify with read_screen if it matters.',
            });
          }
          return { ok: false, reason: 'not_togglable', kind: target.kind };
        }
        target.setValue(on);
        return settled(screen, { ok: true, toggle: target.label, checked: on });
      }

      case 'set_value': {
        if (!target.setValue) return { ok: false, reason: 'not_settable', kind: target.kind };
        const raw = args.value ?? '';
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(raw);
        const num = Number(raw);
        // Dates stay strings; numeric sliders are passed as numbers.
        target.setValue(!isDate && Number.isFinite(num) && raw !== '' ? (num as any) : raw);
        return settled(screen, {
          ok: true,
          control: target.label,
          value: raw,
          applied: target.getValue ? target.getValue() : undefined,
        });
      }

      case 'scroll': {
        const scroller = target.scrollBy ? target : findTarget(screen, 'page', 'scroll');
        if (!scroller?.scrollBy) return { ok: false, reason: 'not_scrollable' };
        scroller.scrollBy(args.amount || 'page');
        return { ok: true, scrolled: args.amount || 'page' };
      }

      default:
        return { ok: false, reason: 'unknown_action' };
    }
  }

  /* ── 1. Read the screen ─────────────────────────────────────── */
  agent.registerTool<Record<string, never>>({
    name: 'read_screen',
    description:
      'Read the CURRENT screen. Returns the visible text and every control the user can act on ' +
      '(buttons, text fields, toggles, sliders, date pickers, lists) with their current values. ' +
      'Call this whenever you are unsure what is on screen, before acting, or when the user asks ' +
      'what they are looking at.',
    schema: { type: 'object', properties: {} },
    handler: () => {
      const screen = getCurrentScreen();
      const ctx = buildPageContext(screen) as any;
      return {
        ok: true,
        screen,
        summary: ctx.screen_overview,
        controls: listTargets(screen).map(t => ({
          kind: t.kind,
          label: t.label,
          ...(t.disabled ? { enabled: false, note: 'not actionable until its precondition is met' } : {}),
          ...(t.sensitive ? { sensitive: true, note: 'cannot be filled by voice' } : {}),
          ...(t.getValue ? { current_value: t.getValue() } : {}),
        })),
      };
    },
  });

  /* ── 2. The generic executor ─────────────────────────────────── */
  agent.registerTool<PerformUiActionArgs>({
    name: 'perform_ui_action',
    description:
      'Act on ONE control on the current screen when no dedicated tool fits. Use the control\'s ' +
      'visible label as "target" (call read_screen first if unsure). Actions: "tap" a button/row/chip; ' +
      '"set_input" to type into a text field; "set_toggle" with "true"/"false"; "set_value" for a slider ' +
      'or date (dates as YYYY-MM-DD); "scroll" to move the page.',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['tap', 'set_input', 'set_toggle', 'set_value', 'scroll'] },
        target: { type: 'string', description: 'the control\'s visible on-screen label' },
        value: { type: 'string', description: 'text, "true"/"false", a number, or YYYY-MM-DD' },
        amount: { type: 'string', enum: ['small', 'page', 'top', 'bottom'], description: 'for scroll only' },
      },
      required: ['action', 'target'],
    },
    handler: performAction,
  });

  /* ── 3. Dedicated aliases the dashboard prompt names ─────────── */
  const alias = <T extends Record<string, any>>(
    name: string,
    description: string,
    properties: Record<string, JSONSchema>,
    required: string[],
    toArgs: (args: T) => PerformUiActionArgs,
    extra: { requiresConfirmation?: boolean; confirmationMessage?: string } = {},
  ) =>
    agent.registerTool<T>({
      name,
      description,
      schema: { type: 'object', properties, required },
      handler: (args: T) => performAction(toArgs(args)),
      ...extra,
    });

  alias<{ label: string; value: string }>(
    'fill_field',
    'Type a value into a named text field on the current screen.',
    { label: { type: 'string', description: "the field's visible label" }, value: { type: 'string' } },
    ['label', 'value'],
    a => ({ action: 'set_input', target: a.label, value: a.value }),
  );

  alias<{ label: string; checked?: boolean }>(
    'set_checkbox',
    'Tick or untick a checkbox or switch by its visible label.',
    { label: { type: 'string' }, checked: { type: 'boolean' } },
    ['label'],
    a => ({ action: 'set_toggle', target: a.label, value: String(a.checked ?? true) }),
  );

  alias<{ option: string }>(
    'select_option',
    'Choose an option, chip, card or list item by its visible text.',
    { option: { type: 'string' } },
    ['option'],
    a => ({ action: 'tap', target: a.option }),
  );

  alias<{ date: string }>(
    'set_date',
    'Set the date on a date picker. Always pass YYYY-MM-DD.',
    { date: { type: 'string', description: 'YYYY-MM-DD' } },
    ['date'],
    a => ({ action: 'set_value', target: 'Date', value: a.date }),
  );

  alias<{ amount: number }>(
    'set_loan_amount',
    'Set the loan amount slider, in rupees.',
    { amount: { type: 'number' } },
    ['amount'],
    a => ({ action: 'set_value', target: 'Loan amount', value: String(a.amount) }),
  );

  alias<{ months: number }>(
    'set_tenure',
    'Set the loan tenure slider, in months.',
    { months: { type: 'number' } },
    ['months'],
    a => ({ action: 'set_value', target: 'Tenure', value: String(a.months) }),
  );

  alias<{ rate: number }>(
    'set_interest_rate',
    'Set the interest-rate slider, in percent per annum.',
    { rate: { type: 'number' } },
    ['rate'],
    a => ({ action: 'set_value', target: 'Interest rate', value: String(a.rate) }),
  );

  alias<Record<string, never>>(
    'continue_next',
    "Press this screen's main forward action (Continue / Next / Get Started / Proceed / Send OTP).",
    {},
    [],
    () => ({ action: 'tap', target: 'continue' }),
  );

  alias<Record<string, never>>('go_back', 'Go back to the previous screen.', {}, [], () => ({
    action: 'tap',
    target: 'Back',
  }));

  alias<Record<string, never>>(
    'logout',
    'Log the user out of SwiftLoan.',
    {},
    [],
    () => ({ action: 'tap', target: 'Log out' }),
    { requiresConfirmation: true, confirmationMessage: 'Log out of SwiftLoan?' },
  );

  /* ── 4. Navigation ──────────────────────────────────────────── */
  const navDescription =
    'Navigate to a named app screen: home, loans, fare, help, profile, basic, basicpan, offers, ' +
    'handoff, kyc, aadhaar, panv, bankv, selfie, status, disbursed, repay, creditscore, mobile, ' +
    'permissions, aboutyou, language, intro. Prefer tapping a visible control when one exists.';

  const navHandler = ({ screen }: { screen: string }) => {
    const went = navigateToScreen(screen);
    return went
      ? { ok: true, screen, controls_now: describeScreen(screen).slice(0, 20) }
      : { ok: false, reason: 'unknown_screen', available_screens: 'see description' };
  };

  agent.registerTool<{ screen: string }>({
    name: 'navigate_screen',
    description: navDescription,
    schema: { type: 'object', properties: { screen: { type: 'string' } }, required: ['screen'] },
    handler: navHandler,
  });

  // Alias: the dashboard prompt says "Navigate → navigate".
  agent.registerTool<{ screen: string }>({
    name: 'navigate',
    description: navDescription,
    schema: { type: 'object', properties: { screen: { type: 'string' } }, required: ['screen'] },
    handler: navHandler,
  });
}
