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
import { buildPageContext, findTarget, getCurrentScreen, listTargets, waitForNextPublish } from './actionRegistry';
import type { TargetKind } from './actionRegistry';
import type { AgentLike, JSONSchema } from './types';

/**
 * App actions the voice tools invoke directly (bound to the store), rather than
 * by tapping an on-screen control. These exist for actions that must work from
 * ANY screen (logout) or that resolve data (open a loan by reference).
 */
export interface VoiceActions {
  /** Resolve a screen name/alias and navigate; false if unknown. */
  navigateToScreen: (screen: string) => boolean;
  /** End the session and return to the welcome flow, from any screen. */
  logout: () => void | Promise<void>;
  /** Look up a loan/application by its reference number and open it. */
  openLoan: (reference: string) => Promise<Record<string, unknown>>;
  /**
   * Persist the language the user has explicitly told the agent to speak, as
   * its own preference (`voiceLang`) separate from the app's UI-copy
   * language — so it becomes `agent_language` on this call's very next turn
   * AND on every future call, without also flipping the app's screen text
   * (`preferred_language`). Synced to AsyncStorage + the user's account.
   */
  setLanguage: (lang: 'en' | 'hi' | 'te') => void;
  /**
   * Merge-saves free-form applicant details Ruby has gathered conversationally
   * from a first-time caller, before any application form exists to fill (see
   * the prompt's "Proactive Details Collection" rule). Persisted on-device
   * (session.ts's prefill draft) so a LATER call can read it back via
   * page_context's `savedApplicantDraft` and prefill `basic` instead of
   * asking everything again. Cleared on login/logout so it never leaks
   * across accounts on a shared device.
   */
  saveApplicantDetails: (details: Record<string, unknown>) => void;
}

/** Accepts the language name, native script, or code the user/model used. */
const LANGUAGE_CODES: Record<string, 'en' | 'hi' | 'te'> = {
  en: 'en', english: 'en',
  hi: 'hi', hindi: 'hi', 'हिन्दी': 'hi', 'हिंदी': 'hi',
  te: 'te', telugu: 'te', 'తెలుగు': 'te',
};

function normalizeLanguage(input: string): 'en' | 'hi' | 'te' | null {
  return LANGUAGE_CODES[String(input ?? '').trim().toLowerCase()] ?? null;
}

interface PerformUiActionArgs {
  action: 'tap' | 'set_input' | 'set_toggle' | 'set_value' | 'scroll';
  target: string;
  value?: string;
  amount?: 'small' | 'page' | 'top' | 'bottom';
  direction?: 'up' | 'down';
}

/** Words that identify a screen's main forward action, for `continue_next`. */
const FORWARD_WORDS = ['continue', 'next', 'get started', 'proceed', 'send otp', 'verify', 'submit', 'apply'];

// Screens where continue_next must not fire immediately — personal details
// (name/DOB/gender/email/pincode) are entered here, so the agent is required
// to read them back and get explicit verbal confirmation before saving.
// A single boolean (not per-screen state) is enough: it's set once continuing
// is actually allowed, and reset the moment the user isn't on this screen, so
// a later re-visit (e.g. going back to fix a field) re-triggers the review.
const CONFIRM_BEFORE_CONTINUE_SCREENS = new Set(['aboutyou']);
let reviewConfirmed = false;

function describeScreen(screen: string) {
  return listTargets(screen).map(t => t.label);
}

export function registerCoreTools(agent: AgentLike, actions: VoiceActions): void {
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
    // Trigger the page-context push HERE, synchronously before this function
    // returns, rather than leaving it to store.ts's/Frame.tsx's own effects.
    // Those fire on their own schedule and were consistently landing AFTER this
    // tool's client-tool-result — missing the server's merge-into-tool-result
    // window (native_orchestrator.py's _pending_context_injection only merges
    // while the tool call is still pending) and paying for a slow standalone
    // turn on every navigation instead. agent.updatePageContext() queues its
    // send on a microtask; because it's called before this function's own
    // return (which is what lets executeToolCall's continuation send the tool
    // result), that send is queued — and therefore delivered over the socket —
    // first, so the server still sees the tool call as pending when the
    // context update arrives and can merge them into one turn.
    agent.updatePageContext();
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
    if (!CONFIRM_BEFORE_CONTINUE_SCREENS.has(screen)) reviewConfirmed = false;

    // Block the forward action on a details-review screen until the model has
    // read the entered data back to the user and gotten explicit confirmation.
    // The model gets this instruction as the tool RESULT (same pattern as the
    // 'disabled' precondition message below) rather than a native popup, since
    // "read back and confirm" is a conversational step, not a yes/no dialog.
    if (
      CONFIRM_BEFORE_CONTINUE_SCREENS.has(screen) &&
      args.action === 'tap' &&
      args.target === 'continue' &&
      !reviewConfirmed
    ) {
      reviewConfirmed = true; // the retry immediately after this is allowed through
      return {
        ok: false,
        reason: 'confirm_before_continue',
        message:
          'Before continuing, read back every entered detail on this screen (name, date of birth, ' +
          'gender, email, pincode) to the user and ask them to confirm it is correct. Call this ' +
          'action again only after they explicitly confirm — do not proceed on silence or an ' +
          'unrelated reply.',
      };
    }

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
      // FORWARD_WORDS is English-only, so it silently finds nothing once the
      // user's selected language renders that same button as "OTP పంపండి" or
      // "ప్రారంభించండి" — confirmed live (repeated continue_next -> not_found
      // on Telugu screens whose primary CTA was clearly visible and tappable).
      // Fall back to the PrimaryButton flagged `primary: true` at registration,
      // which identifies the screen's main forward action by role, not by
      // matching translated label text. No current screen renders more than one
      // PrimaryButton at once (mobile.tsx's Send OTP / Verify pair is a ternary,
      // never both), but if a future one did, prefer an enabled primary over a
      // disabled one rather than grabbing whichever registered first — an
      // enabled sibling is the one actually meant by "continue".
      if (!target?.onTap) {
        const primaries = listTargets(screen).filter(t => t.primary && t.onTap);
        target = primaries.find(t => !t.disabled) ?? primaries[0] ?? target;
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
        scroller.scrollBy(args.amount || 'page', args.direction || 'down');
        return { ok: true, scrolled: args.amount || 'page', direction: args.direction || 'down' };
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
      'or date (dates as YYYY-MM-DD); "scroll" to move the page (pass "direction" to scroll back up).',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['tap', 'set_input', 'set_toggle', 'set_value', 'scroll'] },
        target: { type: 'string', description: 'the control\'s visible on-screen label' },
        value: { type: 'string', description: 'text, "true"/"false", a number, or YYYY-MM-DD' },
        amount: { type: 'string', enum: ['small', 'page', 'top', 'bottom'], description: 'for scroll only' },
        direction: {
          type: 'string',
          enum: ['up', 'down'],
          description: 'for scroll only, with amount "small"/"page"; defaults to "down". Use "up" to scroll back up.',
        },
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

  // Logout runs the real store action (clears the session + returns to the
  // welcome flow) from ANY screen — the old version tried to tap a "Log out"
  // button that only exists on the Profile screen, so it silently did nothing
  // everywhere else.
  agent.registerTool<Record<string, never>>({
    name: 'logout',
    description: 'Log the user out of SwiftLoan. Ends the session from any screen.',
    schema: { type: 'object', properties: {} },
    handler: async () => {
      await actions.logout();
      return { ok: true, logged_out: true };
    },
    requiresConfirmation: true,
    confirmationMessage: 'Log out of SwiftLoan?',
  });

  /* ── 4. Navigation ──────────────────────────────────────────── */
  const navDescription =
    'Navigate to a named app screen: home, loans, fare, help, profile, basic, basicpan, offers, ' +
    // 'repay' removed for now — that screen is disabled; navigateToScreen()
    // redirects it to 'status' anyway, but keeping it out of the description
    // stops the model from reaching for it in the first place.
    'handoff, status, disbursed, mobile, ' +
    'permissions, aboutyou, language, intro. Prefer tapping a visible control when one exists.';

  const navHandler = ({ screen }: { screen: string }) => {
    const went = actions.navigateToScreen(screen);
    return went
      ? { ok: true, screen, controls_now: describeScreen(getCurrentScreen()).slice(0, 20) }
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

  /* ── 5. Open a specific loan/application by its reference number ── */
  agent.registerTool<{ reference: string }>({
    name: 'open_loan',
    description:
      'Open a specific loan or application when the user gives its Loan Reference Number ' +
      '(e.g. "open loan SL-2024-00042" or "show me reference 42"). Looks the reference up and ' +
      'navigates to its application/loan status screen. Use this instead of navigate_screen ' +
      'whenever the user names a reference number.',
    schema: {
      type: 'object',
      properties: { reference: { type: 'string', description: 'the loan/application reference number the user said' } },
      required: ['reference'],
    },
    handler: ({ reference }) => actions.openLoan(reference),
  });

  /* ── 6. Language preference ─────────────────────────────────── */
  agent.registerTool<{ language: string }>({
    name: 'set_language',
    description:
      'Persist the language the user wants the AGENT to speak — English, Hindi, or Telugu — as ' +
      'their agent_language, for the rest of THIS call and every future call (it is saved to their ' +
      "account, not just remembered for this session). This is separate from preferred_language, " +
      "which is the app's own screen-text language and is never changed by this tool. Call this " +
      'when the user explicitly asks to switch language, or clearly states which language they ' +
      'want, e.g. "speak to me in Telugu" or "मुझसे हिंदी में बात करो" — not just because they said ' +
      'one sentence in another language.',
    schema: {
      type: 'object',
      properties: { language: { type: 'string', description: '"English", "Hindi", or "Telugu" (or en/hi/te)' } },
      required: ['language'],
    },
    handler: ({ language }) => {
      const code = normalizeLanguage(language);
      if (!code) return { ok: false, reason: 'unsupported_language', supported: ['English', 'Hindi', 'Telugu'] };
      actions.setLanguage(code);
      return { ok: true, lang: code };
    },
  });

  /* ── 6. Save applicant details gathered before an application exists ── */
  agent.registerTool<{ details: Record<string, unknown> }>({
    name: 'save_applicant_details',
    description:
      'Save applicant details the user told you conversationally BEFORE they reached the application ' +
      'form — a first-time caller with no history yet, per the prompt\'s "Proactive Details Collection" ' +
      'rule. Keys are free-form: use whatever field names fit what was actually said (e.g. fullName, ' +
      'dob, gender, qualification, email, pincode, addressLine1, city, state, residenceType, ' +
      'employmentType, monthlyIncome, salaryMode, company, loanPurpose, loanAmount). Safe to call more ' +
      'than once as more comes up in conversation — each call merges into what is already saved, it ' +
      'does not replace it. Persisted on-device, so even a call on a LATER day can read this back (via ' +
      'page_context\'s savedApplicantDraft) and prefill the application instead of asking again. Never ' +
      'save anything covered by the Sensitive Data Handling Protocol (PAN, Aadhaar, PINs, passwords, ' +
      'card numbers) — those were never collected this way in the first place.',
    schema: {
      type: 'object',
      properties: { details: { type: 'object', description: 'key→value applicant details collected so far' } },
      required: ['details'],
    },
    handler: ({ details }) => {
      actions.saveApplicantDetails(details || {});
      return { ok: true, saved: Object.keys(details || {}) };
    },
  });
}
