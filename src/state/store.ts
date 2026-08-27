import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { Platform, AppState as RNAppState, Linking } from 'react-native';
import {
  trackSessionStart, trackSessionEnd, trackEvent, trackOnboardingStep,
  trackLoanStep, trackInstall, fetchContext, fetchUserContext, setTokens, api,
  type ContextPayload, type PriorInquiry, type UserContext,
} from '../api/client';
import { loadTokens, loadLang, saveLang, loadPrivacyAccepted } from './session';
import { BUILD } from '../config/build';
import { initUpshot, upshotScreen, upshotEvent } from '../analytics/upshot';
import { agent, ensureToolsRegistered } from '../voice';
import { setCurrentScreen, buildPageContext } from '../voice/actionRegistry';

// The full list of screens, mirroring the design's state machine. Kept as a
// const array (rather than a hand-written union) so the voice agent's
// navigate_screen tool can validate an incoming screen name at runtime.
export const SCREEN_NAMES = [
  'splash', 'privacy', 'language', 'intro', 'mobile', 'otp', 'permissions', 'aboutyou',
  'home', 'loans', 'fare', 'help', 'profile', 'explore',
  'basic', 'basicpan', 'moredetails', 'finding', 'offers', 'handoff', 'lenderweb',
  'apply', 'income', 'residence', 'consent', 'prequalify',
  'kyc', 'aadhaar', 'panv', 'bankv', 'selfie',
  'status', 'disbursed', 'repay', 'calculator',
] as const;

// Friendly/spoken screen names → canonical screen id. The voice agent used to
// guess the id from the model, so "My Loan(s)" often landed on the repayment
// screen. This canonical map removes the guessing: names are matched
// case-insensitively after stripping non-alphanumerics.
const SCREEN_ALIASES: Record<string, Screen> = {
  myloan: 'loans', myloans: 'loans', loan: 'loans', loans: 'loans',
  myloanstatus: 'loans', loanstatus: 'loans', applicationstatus: 'status',
  repayment: 'repay', repayments: 'repay', repaymentoverview: 'repay',
  repay: 'repay', emi: 'repay', myrepayments: 'repay',
  myoffers: 'fare', offers: 'fare', fare: 'fare',
  calculator: 'calculator', emicalculator: 'calculator', loancalculator: 'calculator',
  home: 'home', dashboard: 'home', main: 'home',
  profile: 'profile', account: 'profile', settings: 'profile', myprofile: 'profile',
  help: 'help', support: 'help',
  applyforaloan: 'basicpan', apply: 'basicpan', applyloan: 'basicpan', newloan: 'basicpan',
};

/** Resolve a spoken/typed screen name to a canonical screen id, or null. */
export function resolveScreenName(name: string): Screen | null {
  const key = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if ((SCREEN_NAMES as readonly string[]).includes(key)) return key as Screen;
  return SCREEN_ALIASES[key] ?? null;
}
export type Screen = (typeof SCREEN_NAMES)[number];

// Screens that show the bottom tab bar. The tab bar and the assistant FAB both
// key off this so they animate in lockstep: on these screens the tab bar is up
// and the FAB nests in its notch; on any other (full) screen the tab bar slides
// down and the FAB rolls out to the bottom-right corner.
export const TAB_SCREENS: ReadonlySet<Screen> = new Set<Screen>([
  'home', 'loans', 'fare', 'help', 'profile', 'explore',
]);

// Full screens that pin a bottom "Continue"/CTA bar (the Screen `footer`). The
// floating FAB lifts above this bar on these screens so the two never overlap.
export const SCREENS_WITH_FOOTER_CTA: ReadonlySet<Screen> = new Set<Screen>([
  'basicpan', 'basic', 'moredetails', 'aboutyou', 'privacy',
]);

// Spelled out in full for the voice agent's page context — more reliable for
// the model to act on than a bare 'en'/'hi'/'te' code.
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', hi: 'Hindi', te: 'Telugu' };

// Parent screen for the hardware/back-arrow, ported from the bundle's prevMap plus the
// onboarding back handlers (backToLanguage/backToIntro/…).
const PREV: Partial<Record<Screen, Screen>> = {
  privacy: 'splash', language: 'splash', intro: 'language', mobile: 'intro', otp: 'mobile',
  permissions: 'mobile', aboutyou: 'permissions',
  basicpan: 'home', basic: 'basicpan', moredetails: 'basic', finding: 'moredetails',
  apply: 'home', income: 'apply', residence: 'income', consent: 'residence',
  prequalify: 'consent', kyc: 'prequalify',
  // Fallback only — back() dynamically returns offers to its actual origin
  // (state.offersReturn); this parent is used if that's ever unset.
  offers: 'home', handoff: 'offers', lenderweb: 'offers', status: 'home',
  aadhaar: 'kyc', panv: 'kyc', bankv: 'kyc', selfie: 'kyc',
  disbursed: 'home', repay: 'home',
  loans: 'home', fare: 'home', calculator: 'home', explore: 'mobile',
};

export interface AppState {
  screen: Screen;
  lang: string | null; // null until chosen; effective default 'en'
  selectedLang: string | null;
  privacyAccepted: boolean; // Privacy Policy consent (first-launch gate)
  supportOpen: boolean; // the tab-bar Support (Ruby) bottom-sheet is showing
  toast: string;
  notif: { loan: boolean; security: boolean; promo: boolean };
  // mobile / otp
  mobileVal: string;
  terms: boolean;
  otpSent: boolean;
  // basic (quick application)
  basicFirst: string; basicLast: string; basicPin: string; basicEmail: string;
  basicIncome: string; basicCompany: string; basicEmp: string; basicEmpOther: string;
  basicRes: string;
  // Aurix-required extras collected on the details screen.
  basicQualification: string; basicLoanPurpose: string;
  // Optional "a few more details" screen (skippable) — enrich the lender request.
  optMarital: string; optAltMobile: string; optAltEmail: string;
  optAddr1: string; optAddr2: string; optLandmark: string; optCity: string; optDistrict: string; optState: string;
  optSalaryMode: string; optObligations: string; optProfType: string; optCompanyEmail: string; optBusinessEmail: string;
  panConsent: boolean; panNumber: string;
  // detailed application
  appAmount: number; appTenure: number; appEmp: string; appResidence: string;
  appConsent: boolean; autoDebit: boolean;
  // fare / EMI calculator
  fareAmount: number; fareTenure: number; fareRate: number;
  // repay screen
  payInput: string; payChecked: boolean;
  // about you
  aboutName: string; aboutPin: string; aboutGender: string | null;
  dobOpen: boolean; dobValue: string; calY: number; calM: number;
  // profile personal details
  pdEdit: boolean; pdName: string; pdEmail: string; pdPhone: string; pdDob: string;
  pdDobOpen: boolean; pdCalY: number; pdCalM: number;
  // backend session + funnel context (set once the UI is wired to the API)
  authUser: Record<string, any> | null;
  applicationId: string | null;
  selectedOfferId: string | null;
  loanId: string | null;
  // WS3 context-aware install (context build only)
  contextLoaded: boolean;
  contextData: ContextPayload | null;
  // Website inquiries matched to this phone at OTP verify; fed to the voice agent.
  priorInquiries: PriorInquiry[];
  // WS8: everything the backend already knows about this phone (website
  // enquiries, the outbound call, an application in flight). Fetched once the
  // user is signed in and handed to the in-app agent so it opens from where they
  // left off rather than from scratch. Null until fetched, or when they are new.
  userContext: UserContext | null;
  // True only when 'explore' was opened from home's "Explore more plans" link
  // (already signed in) rather than a pre-signup skip button — changes explore's
  // back-target and hides its "sign up" CTA. Reset by both skip handlers.
  exploreFromHome: boolean;
  // In-app lender web view: URL + title shown by the 'lenderweb' screen when a
  // user taps Continue on an offer that carries a lender deep link.
  webUrl: string; webTitle: string;
  // A friendly, actionable note when prequalify returns no offers (e.g. lender
  // validation rejected the details) — shown on the offers screen empty state.
  offersError: string;
  // One-line summary of the offers the user just received (or the issue), pushed
  // to the voice agent so it can proactively talk about them / any problem.
  offersSummary: string;
  // Real API responses for the loan-application lifecycle, keyed by which call
  // produced them (applicationCreated, applicationUpdated, applications,
  // applicationDetail, prequalifyResult, offerApplyResult, offerFailResult,
  // handoffResult, marketOffers) — pushed to the voice agent as `api_context`
  // so it has the actual data, not just whatever happens to be rendered as
  // visible text on the current screen. See store.ts's registerPageContext.
  apiContext: Record<string, unknown>;
  // The screen the user opened `offers` from, so its back button returns there.
  // (Kept for compatibility; back navigation now uses the real `history` stack.)
  offersReturn: Screen;
  // Voice assistant FAB is hidden by default; unlocked via a hidden gesture
  // (tap the Personal details header 5× in a row on Profile) or the dashboard's
  // "Ask Ruby" affordance.
  voiceFabUnlocked: boolean;
  // Monotonic nonce: bumping it asks the VoiceWidget to draw attention to itself
  // (an entrance/wiggle animation) and start a session — driven by "Ask Ruby" on
  // the dashboard so first-time users discover the always-available support FAB.
  voiceTrigger: number;
  // Proactive-help nudge: when the user stalls (idle / drops off / eligible but
  // hasn't applied), the idle detector sets this so the VoiceWidget vibrates,
  // wiggles the Ruby FAB, and shows a contextual label — WITHOUT starting a
  // session (the user taps to ask). `id` is a monotonic nonce.
  voiceNudge: { id: number; label: string; reason: string } | null;
  // Real back stack: every `go()` pushes the current screen here; `back()` pops it
  // to the screen the user actually came from — no more hardcoded parent map.
  history: Screen[];
  // True when this returning user already has offers pulled in a prior session
  // (restored on login). Lets Home surface a "view your offers" shortcut so they
  // don't re-enter details — applicationId points at that application.
  hasSavedOffers: boolean;
}

export const initialState: AppState = {
  screen: 'splash',
  lang: null,
  selectedLang: null,
  privacyAccepted: false,
  supportOpen: false,
  toast: '',
  notif: { loan: true, security: true, promo: false },
  mobileVal: '',
  terms: false,
  otpSent: false,
  basicFirst: '', basicLast: '', basicPin: '', basicEmail: '',
  basicIncome: '', basicCompany: '', basicEmp: '', basicEmpOther: '',
  basicRes: 'own',
  basicQualification: '', basicLoanPurpose: '',
  optMarital: '', optAltMobile: '', optAltEmail: '',
  optAddr1: '', optAddr2: '', optLandmark: '', optCity: '', optDistrict: '', optState: '',
  optSalaryMode: '', optObligations: '', optProfType: '', optCompanyEmail: '', optBusinessEmail: '',
  panConsent: false, panNumber: '',
  appAmount: 150000, appTenure: 12, appEmp: 'salaried', appResidence: 'rented',
  appConsent: false, autoDebit: true,
  fareAmount: 150000, fareTenure: 24, fareRate: 16,
  payInput: '', payChecked: false,
  aboutName: '', aboutPin: '', aboutGender: null,
  dobOpen: false, dobValue: '', calY: 1995, calM: 0,
  pdEdit: false, pdName: '', pdEmail: '',
  pdPhone: '', pdDob: '',
  pdDobOpen: false, pdCalY: 1995, pdCalM: 0,
  authUser: null, applicationId: null, selectedOfferId: null, loanId: null,
  contextLoaded: false, contextData: null,
  priorInquiries: [],
  userContext: null,
  exploreFromHome: false,
  webUrl: '', webTitle: '',
  offersError: '',
  offersSummary: '',
  apiContext: {},
  offersReturn: 'home',
  voiceFabUnlocked: false,
  voiceTrigger: 0,
  voiceNudge: null,
  history: [],
  hasSavedOffers: false,
};

type Action =
  | { type: 'set'; patch: Partial<AppState> }
  // Merges into apiContext using the reducer's own always-current state,
  // never the caller's closure — several call sites (e.g. offers.tsx's
  // retry() calling load()) write to apiContext from two different async
  // functions bound to the same render's (stale) `state`; a plain
  // `set({ apiContext: { ...state.apiContext, k: v } })` from either one
  // would silently clobber whatever the other just wrote, since both read
  // the same pre-dispatch snapshot. Dispatching this instead is immune to
  // that regardless of how many fire in sequence.
  | { type: 'mergeApiContext'; patch: Record<string, unknown> }
  // `replace` forward-navigations don't push onto the back stack — used for
  // auto/boot transitions (splash→…, finding→offers) so Back never lands on a
  // transient/loading screen the user never chose to visit.
  | { type: 'go'; screen: Screen; replace?: boolean }
  | { type: 'back' }
  | { type: 'reset' };

// Top-level destinations (the bottom-nav roots). Navigating to one resets the
// back stack — each acts as a fresh root, so Back from a flow launched off a tab
// returns to that tab, and tab↔tab switches don't accumulate history.
const TOP_LEVEL = new Set<Screen>(['home', 'fare', 'loans', 'profile', 'help', 'explore']);

// Transient/loading screens the user never chooses to sit on — leaving one is
// never recorded on the back stack, so Back skips the splash + "finding offers"
// loaders and lands on the last real screen (e.g. offers → moredetails).
const TRANSIENT = new Set<Screen>(['splash', 'finding']);

// WS4 tracking maps — screen → funnel event, and onboarding step numbers.
// Used only to emit fire-and-forget analytics; no effect on navigation.
const ONBOARDING_STEPS: Partial<Record<Screen, number>> = {
  language: 1, mobile: 2, otp: 3, permissions: 4, aboutyou: 5, home: 6,
};
const FUNNEL_EVENTS: Partial<Record<Screen, string>> = {
  basic: 'application_started', basicpan: 'pan_submitted', finding: 'prequalify_started',
  offers: 'offers_viewed', handoff: 'offer_selected', kyc: 'kyc_started',
  aadhaar: 'kyc_submitted', panv: 'kyc_submitted', bankv: 'kyc_submitted', selfie: 'kyc_submitted',
  status: 'application_submitted', disbursed: 'loan_disbursed', repay: 'repayment_viewed',
};

/** WS5: one install report per app process (see the boot effect below). */
let installReported = false;

// Exposed for unit tests.
export const PREV_MAP = PREV;
export function parentScreen(s: Screen): Screen {
  return PREV[s] || 'home';
}

// apiContext exists purely to feed the voice agent's page_context (every
// mergeApiContext call site renders from its own local state, never reads
// apiContext back — see e.g. home.tsx, which keeps its own `offers` state
// and only pushes into apiContext as a side effect) — so it's safe, and
// necessary, to strip fields the voice model has no use for but that are
// huge: each Offer carries the same lender logo twice, once as a base64
// data: URI (`lenderLogoUrl`) and again buried in the untouched provider
// payload (`rawOffer.Lender.LenderLogo`). With ~10 offers per application
// that's enough bloat to blow past the Gemini Live session's WebSocket
// frame size and kill it outright (close code 1007, "invalid frame payload
// data"). Deep and key-name-based (rather than shape-specific) since patches
// arrive in several different shapes (`applications`, `applicationDetail`,
// `prequalifyResult`, ...) — new call sites are covered automatically.
const VOICE_CONTEXT_STRIP_KEYS = new Set(['lenderLogoUrl', 'rawOffer']);
function stripForVoiceContext<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripForVoiceContext) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (VOICE_CONTEXT_STRIP_KEYS.has(k)) continue;
      out[k] = stripForVoiceContext(v);
    }
    return out as T;
  }
  return value;
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'mergeApiContext':
      return { ...state, apiContext: { ...state.apiContext, ...stripForVoiceContext(action.patch) } };
    case 'go': {
      const { screen } = action;
      // No-op navigations don't touch the stack.
      if (screen === state.screen) return state;
      let history: Screen[];
      if (action.replace) {
        // Transient/auto transition — swap the current screen without recording it.
        history = state.history;
      } else if (TOP_LEVEL.has(screen)) {
        // A tab root starts a fresh stack.
        history = [];
      } else if (TRANSIENT.has(state.screen)) {
        // Leaving a loader/splash — don't record it.
        history = state.history;
      } else {
        // Normal forward nav — remember where we came from (cap depth defensively).
        history = [...state.history, state.screen].slice(-50);
      }
      // apiContext is a voice-only snapshot of whichever API calls the
      // screen(s) the user was just on happened to make (see the reducer
      // comment above) — reset on every real screen change so a call started
      // later never carries forward data fetched for a screen the user has
      // since left. Each new screen repopulates it from its own API calls.
      return { ...state, screen, history, apiContext: {} };
    }
    case 'back': {
      // The offers RESULT is a funnel endpoint: pressing back must return to
      // wherever the funnel was started from (My Offers / Home) — never back into
      // the funnel (Verify PAN → details → …). offersReturn records that origin.
      if (state.screen === 'offers') {
        return { ...state, screen: state.offersReturn || 'home', history: [], apiContext: {} };
      }
      // Pop to the screen the user actually came from; fall back to the PREV map
      // (then home) only when the stack is empty (e.g. deep-linked entry).
      if (state.history.length > 0) {
        const history = state.history.slice(0, -1);
        return { ...state, screen: state.history[state.history.length - 1], history, apiContext: {} };
      }
      return { ...state, screen: PREV[state.screen] || 'home', apiContext: {} };
    }
    case 'reset':
      // Logout: clear all session/profile state, but KEEP device-level consent
      // (privacyAccepted) and the chosen language, and land on the login screen —
      // NOT splash, which would auto-route to the Privacy screen (bug #14) because
      // a fresh initialState has privacyAccepted=false.
      return {
        ...initialState,
        privacyAccepted: state.privacyAccepted,
        lang: state.lang,
        selectedLang: state.selectedLang,
        screen: 'mobile',
      };
    default:
      return state;
  }
}

// Exposed for unit tests.
export const _reducer = reducer;

interface Ctx {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
  // Use this (not `set`) for apiContext writes — see the 'mergeApiContext'
  // Action comment for why a plain set() is unsafe when multiple call sites
  // can write to it from the same render's stale `state` closure.
  mergeApiContext: (patch: Record<string, unknown>) => void;
  go: (screen: Screen) => void;
  back: () => void;
  showToast: (msg: string) => void;
  reset: () => void;
  parentOf: (s: Screen) => Screen;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timers = useRef<{ [k: string]: ReturnType<typeof setTimeout> }>({});
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // WS4 tracking bookkeeping (fire-and-forget analytics only).
  const pagesVisited = useRef(0);
  const screenEnteredAt = useRef(Date.now());
  /** The onboarding step the user is currently ON, completed when they leave it. */
  const prevOnboardingStep = useRef<{ step: number; screen: Screen } | null>(null);

  const set = useCallback((patch: Partial<AppState>) => dispatch({ type: 'set', patch }), []);
  const mergeApiContext = useCallback((patch: Record<string, unknown>) => dispatch({ type: 'mergeApiContext', patch }), []);

  const clearAuto = () => {
    if (timers.current.auto) clearTimeout(timers.current.auto);
  };

  const go = useCallback((screen: Screen) => {
    clearAuto();
    dispatch({ type: 'go', screen });
  }, []);

  const parentOf = useCallback((s: Screen): Screen => PREV[s] || 'home', []);

  const back = useCallback(() => {
    // Pop the real back stack — returns to wherever the user actually came from.
    dispatch({ type: 'back' });
  }, []);

  const showToast = useCallback((msg: string) => {
    dispatch({ type: 'set', patch: { toast: msg } });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => dispatch({ type: 'set', patch: { toast: '' } }),
      2400,
    );
  }, []);

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  // keep a ref of latest state for back()
  const stateRef = useRef(state);
  stateRef.current = state;

  // Restore a persisted session on boot, so a returning user skips onboarding
  // entirely instead of re-verifying OTP every single app launch — and the
  // voice agent's preferred_language is correct from the very first turn,
  // not just within one session's memory. The language itself restores even
  // for a guest who never logged in.
  useEffect(() => {
    (async () => {
      const savedLang = await loadLang();
      if (savedLang) dispatch({ type: 'set', patch: { lang: savedLang } });

      // Privacy consent gate — loaded before any routing decision.
      const accepted = await loadPrivacyAccepted();
      if (accepted) dispatch({ type: 'set', patch: { privacyAccepted: true } });

      const tokens = await loadTokens();
      if (!tokens) return;
      setTokens(tokens.accessToken, tokens.refreshToken);
      try {
        const { user }: any = await api.me();
        dispatch({
          type: 'set',
          patch: {
            authUser: user,
            pdName: user.fullName || user.firstName || '',
            pdEmail: user.email || '',
            pdPhone: user.phone ? `+91 ${user.phone}` : '',
            pdDob: user.dob ? new Date(user.dob).toISOString().slice(0, 10) : '',
            // Prefer the locally chosen language (from the language screen /
            // voice agent, restored from AsyncStorage) over the backend's value,
            // so a fresh selection isn't clobbered by a stale server `lang`.
            lang: stateRef.current.lang || user.lang || null,
          },
        });
        // Only jump the user automatically if they haven't already moved
        // past the splash screen themselves while this was resolving. New
        // (never-accepted) users see the Privacy Policy first, even with a
        // restored session.
        if (stateRef.current.screen === 'splash') dispatch({ type: 'go', screen: accepted ? 'home' : 'privacy' });
      } catch {
        // Expired/invalid — drop the stale session rather than keep retrying
        // it on every future boot.
        setTokens(null, null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the last-picked language around across app restarts, and — when signed
  // in — push it to the backend so the server value stops going stale (which is
  // what used to clobber the selection on the next Profile load / login).
  useEffect(() => {
    if (!state.lang) return;
    saveLang(state.lang);
    if (state.authUser) api.setLanguage(state.lang).catch(() => {});
  }, [state.lang, state.authUser]);

  // Auto-transition: splash -> language (2.6s). The finding -> offers transition is
  // owned by the finding screen so it can run the real prequalify() call first.
  useEffect(() => {
    clearAuto();

    // Keep the voice agent's view of the current screen + available actions fresh.
    setCurrentScreen(state.screen);
    agent.updatePageContext();

    // Track page view for all screens
    trackEvent('page_view', `viewed_${state.screen}`, state.screen);

    // Track specific screen arrivals and onboarding/loan steps
    if (state.screen === 'finding') {
      trackEvent('onboarding_step', 'finding_offers', 'finding');
    } else if (state.screen === 'offers') {
      trackOnboardingStep(3, 'offers_shown', 'completed', 0);
    } else if (state.screen === 'repay') {
      trackEvent('page_view', 'viewed_repayment', 'repay');
    } else if (state.screen === 'disbursed') {
      trackLoanStep(state.loanId || '', 'loan_disbursed', 'completed', 0);
    }

    if (state.screen === 'splash') {
      // First launch → Privacy Policy consent; thereafter → language selection.
      timers.current.auto = setTimeout(
        () => dispatch({ type: 'go', screen: stateRef.current.privacyAccepted ? 'language' : 'privacy' }),
        2600,
      );
    }
    return clearAuto;
  }, [state.screen, state.loanId]);

  // One-time voice-agent setup: register the generic UI-action tools (bound to
  // this provider's own go()) and the page-context source the agent sends on
  // every update. Reads stateRef so the closure never goes stale.
  useEffect(() => {
    ensureToolsRegistered({
      navigateToScreen: (screenName: string) => {
        const target = resolveScreenName(screenName);
        if (!target) return false;
        go(target);
        return true;
      },
      // Bug fix: logout now runs the real action from any screen (was a no-op
      // unless the Profile screen's "Log out" button happened to be on screen).
      logout: async () => {
        await api.logout().catch(() => {});
        dispatch({ type: 'reset' });
      },
      // Bug fix: open a specific loan/application by its reference number.
      openLoan: async (reference: string) => {
        const want = (reference || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!want) return { ok: false, reason: 'no_reference' };
        const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        try {
          const [loansRes, appsRes]: any[] = await Promise.all([
            api.listLoans().catch(() => null),
            api.listApplications().catch(() => null),
          ]);
          const loans: any[] = loansRes?.loans || loansRes || [];
          const apps: any[] = appsRes?.applications || appsRes || [];
          // Match on the loan's reference first, then the application's.
          const loan = loans.find((l) => norm(l?.ref) === want || norm(l?.id) === want);
          if (loan) {
            dispatch({ type: 'set', patch: { loanId: loan.id, applicationId: loan.applicationId ?? stateRef.current.applicationId } });
            go('repay');
            return { ok: true, opened: 'loan', reference, screen: 'repay' };
          }
          const app = apps.find((a) => norm(a?.ref) === want || norm(a?.id) === want);
          if (app) {
            const hasLoan = !!app.loan?.id;
            dispatch({ type: 'set', patch: { applicationId: app.id, loanId: app.loan?.id ?? null } });
            go(hasLoan ? 'repay' : 'status');
            return { ok: true, opened: hasLoan ? 'loan' : 'application', reference, screen: hasLoan ? 'repay' : 'status' };
          }
          return { ok: false, reason: 'not_found', message: `No loan or application matches reference "${reference}".` };
        } catch {
          return { ok: false, reason: 'lookup_failed' };
        }
      },
    });
    agent.registerPageContext(() => {
      // The authoritative logged-in name — so the agent addresses the user
      // correctly instead of picking a lead name out of `userContext` or
      // inventing one (bug #15). Empty when unknown so the prompt can fall back
      // to a neutral greeting.
      const s = stateRef.current;
      const userName =
        (s.authUser?.firstName || s.authUser?.fullName || s.pdName || '').trim().split(/\s+/)[0] || '';
      // Only relevant on the Profile screen itself — these are exactly the
      // fields skipped at aboutyou/never filled via the application flow that
      // Profile lets the user edit directly. Computed fresh every time the
      // screen context refreshes, not just once, so it reflects whatever's
      // true right now (e.g. filled in via the application flow since).
      const missingProfileFields =
        s.screen === 'profile'
          ? [
              ...(!s.pdName.trim() ? ['full name'] : []),
              ...(!s.pdEmail.trim() ? ['email'] : []),
              ...(!s.pdDob ? ['date of birth'] : []),
            ]
          : [];
      return {
      ...buildPageContext(s.screen),
      missing_profile_fields: missingProfileFields.length ? missingProfileFields : undefined,
      // The language the user picked on the language-selection screen — the
      // voice agent should speak in this language from the first word,
      // regardless of what language it's addressed in, unless the user
      // explicitly asks to switch (see the prompt's Voice style section).
      preferred_language: LANGUAGE_NAMES[s.lang ?? 'en'] ?? 'English',
      // Authoritative user name — the agent must address the user by THIS name
      // (or neutrally if empty), never a name from userContext/priorInquiries.
      user_name: userName,
      // The offers the user just received (or the problem) so the agent can speak
      // about them proactively on the offers screen.
      offers_summary: s.offersSummary || undefined,
      offers_error: s.offersError || undefined,
      priorInquiries: stateRef.current.priorInquiries,
      // WS8: the history behind this phone number. `brief` is a one-line summary
      // the agent can open from ("Anita enquired 2 days ago about a 3 lakh
      // personal loan; spoke to us on the phone yesterday"), so it continues the
      // conversation instead of restarting it. Read from stateRef so this closure
      // never goes stale.
      userContext: stateRef.current.userContext ?? undefined,
      // Real API responses for the loan-application lifecycle (see the
      // apiContext field comment) — more complete/authoritative than
      // screen_overview for these entities since it's the actual response,
      // not scraped visible text. Populated by whichever of these calls has
      // run so far this session; absent until at least one has.
      api_context: Object.keys(stateRef.current.apiContext).length ? stateRef.current.apiContext : undefined,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apiContext changes don't reach the agent on their own — reading a ref
  // doesn't trigger a re-pull; this must explicitly ask it to refresh, same
  // as offersSummary's own effect below (offers.tsx). One shared effect here
  // covers every application-lifecycle call site instead of repeating this
  // in each screen.
  useEffect(() => {
    if (Object.keys(state.apiContext).length) agent.updatePageContext();
  }, [state.apiContext]);

  // ── WS4: start a tracking session on app boot; end it when backgrounded ──
  useEffect(() => {
    trackSessionStart({
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      appVersion: '1.0',
    });
    // WS5: report the install exactly once per device. AsyncStorage isn't a
    // dependency here, so the flag lives on the module-level `installReported`
    // guard — good enough because a reinstall genuinely is a new install.
    if (!installReported) {
      installReported = true;
      trackInstall(Platform.OS, {});
      trackEvent('app_lifecycle', 'app_opened');
    }

    // Upshot: boot once per process. No-ops entirely unless the SDK is
    // installed AND credentials are set, so this is safe on every build.
    if (initUpshot()) {
      upshotEvent('app_opened', { platform: Platform.OS });
      // Note: the notification permission (registerUpshotPush) is NOT requested
      // here. It's requested from the 'Allow permissions' onboarding screen
      // (permissions.tsx) so nothing prompts the user before they reach it.
    }
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') trackSessionEnd(pagesVisited.current);
    });
    return () => { trackSessionEnd(pagesVisited.current); sub.remove(); };
  }, []);

  // ── WS8: load what the backend already knows about this phone ──────────
  //
  // Runs when the user becomes authenticated, by either route (OTP verify or the
  // anonymous "Skip" session). This is the non-deep-link path: an organic
  // Play Store install arrives with just a phone number, so without this the
  // in-app agent greets a returning customer as a stranger and re-asks what they
  // already told the website and the phone agent.
  //
  // Fire-and-forget and never awaited by a screen: if it fails or the user is
  // brand new, `userContext` stays null and the agent behaves exactly as before.
  const contextFetched = useRef(false);
  useEffect(() => {
    if (!state.authUser || contextFetched.current) return;
    contextFetched.current = true;
    fetchUserContext()
      .then((ctx) => {
        // Only store it when there is something to say. An empty context would
        // put `hasHistory: false` in front of the agent, which is noise.
        if (!ctx?.hasHistory) return;
        dispatch({ type: 'set', patch: { userContext: ctx } });
        trackEvent('funnel', 'user_context_loaded', 'home', {
          inquiries: ctx.inquiries.length,
          hadCall: !!ctx.lastCall,
          stage: ctx.stage,
        });
      })
      .catch(() => undefined);
  }, [state.authUser]);

  // ── Restore the returning user's last-pulled offers on login ──────────
  //
  // A user's profile + offers persist server-side (User by phone, Offer rows on
  // their last application). On login we find the most recent application that
  // still has offers and point applicationId at it, so Home can show a "view
  // your offers" shortcut and the offers screen renders the saved offers without
  // the user re-entering any details or re-pulling.
  const offersRestored = useRef(false);
  useEffect(() => {
    if (!state.authUser || offersRestored.current) return;
    offersRestored.current = true;
    api.listApplications()
      .then((r: any) => {
        const apps: any[] = r?.applications || [];
        const withOffers = apps.find(
          (a) => (a.offers?.length ?? 0) > 0 &&
            ['offers_ready', 'handoff', 'under_review', 'approved', 'disbursed'].includes(a.status),
        );
        if (withOffers) {
          dispatch({ type: 'set', patch: { applicationId: withOffers.id, loanId: withOffers.loan?.id ?? null, hasSavedOffers: true } });
        }
      })
      .catch(() => undefined);
  }, [state.authUser]);

  // ── WS4: emit an event on every screen transition (fire-and-forget) ──
  useEffect(() => {
    const screen = state.screen;
    pagesVisited.current += 1;
    const spent = Math.max(0, Math.round((Date.now() - screenEnteredAt.current) / 1000));
    screenEnteredAt.current = Date.now();

    trackEvent('navigation', 'screen_view', screen);
    // Same screen name to Upshot, so IAM/activity campaigns can be targeted at
    // a screen ("show the offers survey on `offers`") using the names the rest
    // of our analytics already uses.
    upshotScreen(screen);

    const funnelName = FUNNEL_EVENTS[screen];
    if (funnelName) {
      trackEvent('funnel', funnelName, screen, {
        applicationId: stateRef.current.applicationId,
        loanId: stateRef.current.loanId,
      });
    }
    // WS5: onboarding steps used to be marked 'completed' the moment the user
    // ARRIVED at a screen, with `spent` (time on the previous screen) attributed
    // to the new one. Both were wrong: landing on `language` reported step 1
    // complete before anything was picked, so drop-off was unmeasurable.
    //
    // Correct model: leaving a screen completes THAT step with the time actually
    // spent on it; arriving marks the new step in_progress.
    const prev = prevOnboardingStep.current;
    if (prev) trackOnboardingStep(prev.step, prev.screen, 'completed', spent);

    const stepNum = ONBOARDING_STEPS[screen];
    if (stepNum) {
      // 'started' — the StepStatus enum has no in_progress.
      trackOnboardingStep(stepNum, screen, 'started', 0);
      prevOnboardingStep.current = { step: stepNum, screen };
    } else {
      prevOnboardingStep.current = null;
    }
  }, [state.screen]);

  // ── WS3: context-aware install ──
  // If this is the context build and the app was opened via a tracked link
  // (swiftloan://onboard?token=XXX), resolve the saved journey server-side and
  // continue it: prefill what the user told the website/agent, greet them, and
  // jump straight into the loan application instead of neutral onboarding.
  useEffect(() => {
    if (!BUILD.CONTEXT_ENABLED) return;
    let done = false;

    const applyContext = async (url: string | null) => {
      if (done || !url) return;
      const m = url.match(/[?&]token=([^&#]+)/i);
      if (!m) return;
      const token = decodeURIComponent(m[1]);
      const ctx = await fetchContext(token);
      if (!ctx || done) return;
      done = true;

      const [first, ...rest] = (ctx.name ?? '').trim().split(/\s+/);
      const rupees = ctx.amount ? Math.round(ctx.amount / 100) : undefined;
      dispatch({
        type: 'set',
        patch: {
          contextLoaded: true,
          contextData: ctx,
          ...(first ? { basicFirst: first, aboutName: ctx.name ?? '', pdName: ctx.name ?? '' } : {}),
          ...(rest.length ? { basicLast: rest.join(' ') } : {}),
          ...(rupees ? { appAmount: rupees, fareAmount: rupees } : {}),
        },
      });
      trackEvent('funnel', 'agent_context_loaded', 'basic', { token, source: ctx.source });
      // Continue the journey: land on the loan-application start, pre-filled.
      dispatch({ type: 'go', screen: 'basic' });
      showToast(ctx.greeting);
    };

    Linking.getInitialURL().then(applyContext).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => applyContext(e.url));
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: Ctx = { state, set, mergeApiContext, go, back, showToast, reset, parentOf };
  return React.createElement(StoreContext.Provider, { value }, children);
}

export function useStore(): Ctx {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// Convenience hook to read the active translation table.
import { strings } from '../i18n/strings';
export function useT() {
  const { state } = useStore();
  const lang = state.lang ?? 'en';
  return strings(lang);
}
