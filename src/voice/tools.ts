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
import { buildPageContext, describeTarget, findTarget, getCurrentScreen, listTargets, waitForNextPublish } from './actionRegistry';
import type { TargetKind } from './actionRegistry';
import type { AgentLike, JSONSchema } from './types';
import { requestConfirmation } from './ui/confirmationBridge';

/**
 * App actions the voice tools invoke directly (bound to the store), rather than
 * by tapping an on-screen control. These exist for actions that must work from
 * ANY screen (logout) or that resolve data (open a loan by reference).
 */
export interface VoiceActions {
  /**
   * Resolve a screen name/alias and navigate. Returns the resolved request and the
   * screen the app will actually land on (the login-boundary guard may redirect,
   * e.g. a logged-in user asking for `mobile` lands on `home`), or false if unknown.
   */
  navigateToScreen: (screen: string) => { requested: string; landed: string } | false;
  /** The message the app just showed the user in a toast (last few seconds), if any. */
  recentToast?: () => string | null;
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
   * The app's own UI-copy language (`preferred_language` in page_context) —
   * separate from `setLanguage` above (that's the agent's own voice). Works
   * from any screen, unlike tapping the physical language card on
   * `language`/`profile`, which only exists on those two screens.
   */
  setAppLanguage: (lang: 'en' | 'hi' | 'te') => void;
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
  /** Chips: which field's options (e.g. "Gender") when a label like "Other" repeats. */
  group?: string;
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

// "Skip for now" / "Skip" in English, Hindi, Telugu. Skipping is the user's own
// decision, never the agent's: the agent used to tap these on its own and drop
// people out of About You / Optional details without asking.
const SKIP_LABEL = /skip|स्किप|స్కిప్/i;
// First-run flow. While the user is on one of these, the agent must not navigate
// elsewhere by itself (navigate_screen to home etc. skipped the whole onboarding).
const ONBOARDING_SCREENS = new Set(['privacy', 'language', 'intro', 'mobile', 'otp', 'permissions', 'aboutyou']);

// Filling the last digit of the OTP verifies and navigates by itself (mobile.tsx
// auto-verifies at 6 digits), but the model habitually follows fill_field with
// continue_next. By the time that second call runs the app has already moved on,
// and "continue" resolved to the NEXT screen's primary button — tapping "Allow
// permissions" or About You's Continue on the user's behalf. Remember where the
// last field was filled; if a continue arrives right after and that screen is
// gone, tell the model it already advanced instead of tapping anything.
const ADVANCED_WINDOW_MS = 4000;
let lastFill: { screen: string; at: number } | null = null;

/**
 * Control names with their state, e.g. "Send OTP (disabled)", "Accept terms (checked)",
 * "Gender: Male (selected)". Used for controls_now / available, so the agent sees what
 * its action actually changed, not just which labels exist.
 */
function describeScreen(screen: string) {
  return listTargets(screen).map(t => {
    const d = describeTarget(t) as Record<string, unknown>;
    const bits: string[] = [];
    if (d.enabled === false) bits.push('disabled');
    if (d.selected === true) bits.push('selected');
    if (t.kind === 'toggle' || t.kind === 'consent') bits.push(d.value === true ? 'checked' : 'unchecked');
    else if (d.filled === true) bits.push('filled');
    else if (d.value !== undefined && d.value !== '' && t.kind !== 'chips') bits.push(`= ${String(d.value).slice(0, 40)}`);
    const name = t.group ? `${t.group}: ${t.label}` : t.label;
    return bits.length ? `${name} (${bits.join(', ')})` : name;
  });
}

/** The same control, looked up again after a re-render (the old object's getValue is stale). */
function freshTarget(screen: string, t: { label: string; kind: string; group?: string }) {
  return listTargets(screen).find(x => x.label === t.label && x.kind === t.kind && x.group === t.group) ?? null;
}

const anyPrimaryDisabled = (screen: string) => listTargets(screen).some(t => t.primary && t.disabled);

export function registerCoreTools(agent: AgentLike, actions: VoiceActions): void {
  /**
   * Reports the state the app is ACTUALLY in after an action, rather than letting
   * the model assume. Tapping "English" only selects a language — it does not
   * navigate — and without this the model told the user "you're now on the login
   * screen", which was false. The wait lets React re-render and <Screen>
   * re-publish its graph.
   */
  const settled = async (
    screenBefore: string,
    base: Record<string, unknown>,
    opts: { primaryBusyBefore?: boolean } = {},
  ) => {
    // Event-driven: resolve as soon as <Screen> re-publishes its graph (usually
    // one render, ~16-50ms) rather than always paying a fixed delay. The timeout
    // is only a floor for actions that trigger no re-render at all.
    await waitForNextPublish(250);
    // A tap that starts real work (Send OTP, Continue -> save) first just flips the
    // main button to its busy/disabled state; the outcome (navigation, an error
    // toast) lands later. Reporting at 250ms said "tapped, still on this screen" and
    // the agent had no idea the save then failed. If the forward button went
    // disabled because of this action, wait (bounded) for it to come back or for
    // the screen to change.
    if (opts.primaryBusyBefore === false && getCurrentScreen() === screenBefore && anyPrimaryDisabled(screenBefore)) {
      const deadline = Date.now() + 3500;
      while (Date.now() < deadline && getCurrentScreen() === screenBefore && anyPrimaryDisabled(screenBefore)) {
        await new Promise<void>(r => setTimeout(r, 120));
      }
      await waitForNextPublish(150);
    }
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
    // `immediate` is what makes that true: the plain form is debounced 900ms
    // (PAGE_CONTEXT_DEBOUNCE_MS), which delivered it AFTER she had already
    // answered the tool result — a second, standalone spoken turn.
    agent.updatePageContext({ immediate: true });
    const toast = actions.recentToast?.();
    return {
      ...base,
      screen_after: now,
      navigated: now !== screenBefore,
      // What the app showed the user because of this action (usually why it failed).
      ...(toast ? { message_shown_to_user: toast } : {}),
      controls_now: describeScreen(now).slice(0, 30),
    };
  };

  /** The one executor every tool funnels into. */
  async function performAction(args: PerformUiActionArgs): Promise<Record<string, unknown>> {
    const screen = getCurrentScreen();
    if (!CONFIRM_BEFORE_CONTINUE_SCREENS.has(screen)) reviewConfirmed = false;

    if (
      args.action === 'tap' &&
      args.target === 'continue' &&
      lastFill &&
      lastFill.screen !== screen &&
      Date.now() - lastFill.at < ADVANCED_WINDOW_MS
    ) {
      const from = lastFill.screen;
      lastFill = null;
      return {
        ok: false,
        reason: 'already_advanced',
        screen_now: screen,
        message:
          `Filling that field already submitted "${from}" and the app moved to "${screen}". ` +
          'Nothing was tapped. Read the new screen and continue from there only if the user wants to.',
      };
    }

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
    let target = findTarget(screen, args.target, wantKind, args.group);
    // set_loan_amount / set_tenure / set_interest_rate address a slider by what it
    // controls, not by its (translated, screen-specific) label.
    const roleMatch = /^@role:(amount|tenure|rate)$/.exec(args.target);
    if (roleMatch) {
      target = listTargets(screen).find(t => t.kind === 'slider' && t.role === roleMatch[1]) ?? null;
      if (!target) {
        return { ok: false, reason: 'not_on_this_screen', message: `There is no ${roleMatch[1]} control on this screen.` };
      }
    }
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
      const accepted = dateTarget.setValue(args.value ?? '');
      if (accepted === false) {
        return {
          ok: false,
          reason: 'value_rejected',
          requested: args.value,
          message: 'That date was not accepted — it must be a real date and the applicant must be at least 18 years old. Ask the user for a valid date of birth.',
        };
      }
      const done = await settled(screen, { ok: true, date_set: args.value });
      const after = freshTarget(getCurrentScreen(), dateTarget);
      return { ...done, applied: after?.getValue?.() ?? '' };
    }

    if (!target) {
      // Hand back the real labels so the model can retry with a valid one
      // instead of guessing again.
      return { ok: false, reason: 'not_found', available: describeScreen(screen).slice(0, 25) };
    }

    // Skipping a step is the user's decision. Even when the user asked for it by voice,
    // make them confirm with a tap on the confirmation sheet, so the agent can never
    // skip on its own initiative.
    if (args.action === 'tap' && SKIP_LABEL.test(target.label)) {
      const allowed = await requestConfirmation('Skip this step?', { confirmLabel: 'Skip', cancelLabel: 'Stay here' });
      if (!allowed) {
        return {
          ok: false,
          refused: true,
          reason: 'skip_not_confirmed',
          message:
            'The user did not confirm skipping. Do not tap Skip yourself and do not offer to skip ' +
            'for them. Carry on with the step in front of the user.',
        };
      }
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
      case 'tap': {
        if (!target.onTap) return { ok: false, reason: 'not_tappable', kind: target.kind };
        const primaryBusyBefore = anyPrimaryDisabled(screen);
        target.onTap();
        return settled(screen, { ok: true, tapped: target.label }, { primaryBusyBefore });
      }

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
        lastFill = { screen, at: Date.now() };
        {
          const done = await settled(screen, { ok: true, field: target.label });
          // Report what the field actually holds now (digit-stripping, max length...),
          // not what was asked for.
          const after = freshTarget(getCurrentScreen(), target);
          const committed = after?.getValue ? String(after.getValue() ?? '') : (args.value ?? '');
          return {
            ...done,
            value: committed,
            ...(committed !== (args.value ?? '') ? { note: 'The field kept a different value than requested (it filters or limits input).' } : {}),
          };
        }

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
        {
          const done = await settled(screen, { ok: true, toggle: target.label });
          const after = freshTarget(getCurrentScreen(), target);
          const checked = after?.getValue ? !!after.getValue() : on;
          return checked === on ? { ...done, checked } : { ...done, ok: false, reason: 'not_applied', checked, message: 'The control did not change to the requested state.' };
        }
      }

      case 'set_value': {
        if (!target.setValue) return { ok: false, reason: 'not_settable', kind: target.kind };
        const raw = args.value ?? '';
        const isDate = /^\d{4}-\d{2}-\d{2}$/.test(raw);
        const num = Number(raw);
        // Dates stay strings; numeric sliders are passed as numbers.
        const accepted = target.setValue(!isDate && Number.isFinite(num) && raw !== '' ? (num as any) : raw);
        // A target returns `false` when it refuses the value (a date that is not YYYY-MM-DD, not a
        // real day, or under 18). Reporting that as ok:true made the agent believe the date was set.
        if (accepted === false) {
          return {
            ok: false,
            reason: 'value_rejected',
            control: target.label,
            requested: raw,
            message:
              target.kind === 'date'
                ? 'That date was not accepted. It must be a real date, written YYYY-MM-DD, and the person must be at least 18. Ask the user for their date of birth again in plain words.'
                : 'That value was not accepted. Ask the user for it again in plain words.',
          };
        }
        {
          const done = await settled(screen, { ok: true, control: target.label, requested: raw });
          // `applied` is read AFTER the re-render (the old object's getValue still
          // returns the pre-change value), and may differ from `requested` (clamped
          // to the slider's range/step).
          const after = freshTarget(getCurrentScreen(), target);
          return { ...done, applied: after?.getValue ? after.getValue() : undefined };
        }
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
        controls: listTargets(screen).map(t => {
          const { value, ...d } = describeTarget(t) as Record<string, unknown>;
          return {
            ...d,
            ...(t.disabled ? { note: 'not actionable until its precondition is met' } : {}),
            ...(t.sensitive ? { note: 'cannot be filled by voice' } : {}),
            ...(value !== undefined ? { current_value: value } : {}),
          };
        }),
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

  alias<{ option: string; group?: string }>(
    'select_option',
    'Choose an option, chip, card or list item by its visible text. When the same option text appears ' +
      'in more than one group (e.g. "Other" under Gender and Employment), also pass "group" — the field name shown with the option.',
    { option: { type: 'string' }, group: { type: 'string', description: 'the field the option belongs to, e.g. "Gender"' } },
    ['option'],
    a => ({ action: 'tap', target: a.option, group: a.group }),
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
    a => ({ action: 'set_value', target: '@role:amount', value: String(a.amount) }),
  );

  alias<{ months: number }>(
    'set_tenure',
    'Set the loan tenure slider, in months.',
    { months: { type: 'number' } },
    ['months'],
    a => ({ action: 'set_value', target: '@role:tenure', value: String(a.months) }),
  );

  alias<{ rate: number }>(
    'set_interest_rate',
    'Set the interest-rate slider, in percent per annum.',
    { rate: { type: 'number' } },
    ['rate'],
    a => ({ action: 'set_value', target: '@role:rate', value: String(a.rate) }),
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
    'Navigate to a named app screen: home, loans, fare (My Offers), compare (compare offers), ' +
    'calculator, help, profile, basicpan (start an application), basic, handoff, status, repay, ' +
    'disbursed, mobile, permissions, aboutyou, language, intro. ' +
    'Prefer tapping a visible control when one exists.';

  const navHandler = async ({ screen }: { screen: string }) => {
    const before = getCurrentScreen();
    if (ONBOARDING_SCREENS.has(before)) {
      return {
        ok: false,
        refused: true,
        reason: 'finish_this_step',
        message:
          'The user is in the first-run flow. Do not navigate away on your own — help them complete ' +
          'the step in front of them (the screen advances when it is done).',
      };
    }
    const landed = actions.navigateToScreen(screen);
    if (!landed) return { ok: false, reason: 'unknown_screen', available_screens: 'see description' };
    // Report where the app REALLY is after the render commits — not the screen
    // that was requested, and not the previous screen's controls (which is what
    // describing the screen synchronously returned).
    const result = await settled(before, { ok: true, requested: screen });
    return landed.landed !== landed.requested
      ? { ...result, redirected: true, note: `"${screen}" is not available right now; the app is on "${result.screen_after}".` }
      : result;
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
      'navigates to My Loans, where it now appears selected — read its live status back from the ' +
      'tool result / api_context rather than a dedicated details screen (none exists right now). ' +
      'Use this instead of navigate_screen whenever the user names a reference number.',
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

  agent.registerTool<{ language: string }>({
    name: 'set_app_language',
    description:
      "Change the app's own screen-text language — English, Hindi, or Telugu (preferred_language). " +
      'Works from any screen, without navigating anywhere first. This is separate from set_language, ' +
      "which changes only the AGENT's own speaking voice (agent_language) and never the screens. Call " +
      'this when the user asks to change the APP/SCREEN language specifically, e.g. "change the app ' +
      'to Hindi" or "switch the screens to Telugu" — not for a request to speak a different language.',
    schema: {
      type: 'object',
      properties: { language: { type: 'string', description: '"English", "Hindi", or "Telugu" (or en/hi/te)' } },
      required: ['language'],
    },
    handler: ({ language }) => {
      const code = normalizeLanguage(language);
      if (!code) return { ok: false, reason: 'unsupported_language', supported: ['English', 'Hindi', 'Telugu'] };
      actions.setAppLanguage(code);
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
