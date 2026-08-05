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
  trackLoanStep, fetchContext, type ContextPayload,
} from '../api/client';
import { BUILD } from '../config/build';
import { agent, ensureToolsRegistered } from '../voice';
import { setCurrentScreen, buildPageContext } from '../voice/actionRegistry';

// The full list of screens, mirroring the design's state machine. Kept as a
// const array (rather than a hand-written union) so the voice agent's
// navigate_screen tool can validate an incoming screen name at runtime.
export const SCREEN_NAMES = [
  'splash', 'language', 'intro', 'mobile', 'otp', 'permissions', 'aboutyou',
  'home', 'loans', 'fare', 'help', 'profile', 'explore',
  'basic', 'basicpan', 'finding', 'offers', 'handoff',
  'apply', 'income', 'residence', 'consent', 'prequalify',
  'kyc', 'aadhaar', 'panv', 'bankv', 'selfie',
  'status', 'disbursed', 'repay', 'creditscore',
] as const;
export type Screen = (typeof SCREEN_NAMES)[number];

// Parent screen for the hardware/back-arrow, ported from the bundle's prevMap plus the
// onboarding back handlers (backToLanguage/backToIntro/…).
const PREV: Partial<Record<Screen, Screen>> = {
  language: 'splash', intro: 'language', mobile: 'intro', otp: 'mobile',
  permissions: 'mobile', aboutyou: 'permissions',
  basic: 'home', basicpan: 'basic', finding: 'basicpan',
  apply: 'home', income: 'apply', residence: 'income', consent: 'residence',
  prequalify: 'consent', kyc: 'prequalify',
  offers: 'basicpan', handoff: 'offers', status: 'home',
  aadhaar: 'kyc', panv: 'kyc', bankv: 'kyc', selfie: 'kyc',
  disbursed: 'home', repay: 'home', creditscore: 'repay',
  loans: 'home', fare: 'home', explore: 'mobile',
};

export interface AppState {
  screen: Screen;
  lang: string | null; // null until chosen; effective default 'en'
  selectedLang: string | null;
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
  // True only when 'explore' was opened from home's "Explore more plans" link
  // (already signed in) rather than a pre-signup skip button — changes explore's
  // back-target and hides its "sign up" CTA. Reset by both skip handlers.
  exploreFromHome: boolean;
}

export const initialState: AppState = {
  screen: 'splash',
  lang: null,
  selectedLang: null,
  toast: '',
  notif: { loan: true, security: true, promo: false },
  mobileVal: '',
  terms: false,
  otpSent: false,
  basicFirst: '', basicLast: '', basicPin: '', basicEmail: '',
  basicIncome: '', basicCompany: '', basicEmp: '', basicEmpOther: '',
  basicRes: 'own',
  panConsent: false, panNumber: '',
  appAmount: 150000, appTenure: 12, appEmp: 'salaried', appResidence: 'rented',
  appConsent: false, autoDebit: true,
  fareAmount: 150000, fareTenure: 24, fareRate: 16,
  payInput: '', payChecked: false,
  aboutName: '', aboutPin: '', aboutGender: null,
  dobOpen: false, dobValue: '', calY: 1995, calM: 0,
  pdEdit: false, pdName: 'Johnathan Doe', pdEmail: 'j.doe@example.com',
  pdPhone: '+91 98765 43210', pdDob: '1988-05-15',
  pdDobOpen: false, pdCalY: 1988, pdCalM: 4,
  authUser: null, applicationId: null, selectedOfferId: null, loanId: null,
  contextLoaded: false, contextData: null,
  exploreFromHome: false,
};

type Action =
  | { type: 'set'; patch: Partial<AppState> }
  | { type: 'go'; screen: Screen }
  | { type: 'reset' };

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
  creditscore: 'credit_score_viewed',
};

// Exposed for unit tests.
export const PREV_MAP = PREV;
export function parentScreen(s: Screen): Screen {
  return PREV[s] || 'home';
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'go':
      return { ...state, screen: action.screen };
    case 'reset':
      return { ...initialState, screen: 'splash' };
    default:
      return state;
  }
}

// Exposed for unit tests.
export const _reducer = reducer;

interface Ctx {
  state: AppState;
  set: (patch: Partial<AppState>) => void;
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

  const set = useCallback((patch: Partial<AppState>) => dispatch({ type: 'set', patch }), []);

  const clearAuto = () => {
    if (timers.current.auto) clearTimeout(timers.current.auto);
  };

  const go = useCallback((screen: Screen) => {
    clearAuto();
    dispatch({ type: 'go', screen });
  }, []);

  const parentOf = useCallback((s: Screen): Screen => PREV[s] || 'home', []);

  const back = useCallback(() => {
    dispatch({ type: 'go', screen: PREV[stateRef.current.screen] || 'home' });
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
      timers.current.auto = setTimeout(() => dispatch({ type: 'go', screen: 'language' }), 2600);
    }
    return clearAuto;
  }, [state.screen, state.loanId]);

  // One-time voice-agent setup: register the generic UI-action tools (bound to
  // this provider's own go()) and the page-context source the agent sends on
  // every update. Reads stateRef so the closure never goes stale.
  useEffect(() => {
    ensureToolsRegistered((screenName: string) => {
      if (!(SCREEN_NAMES as readonly string[]).includes(screenName)) return false;
      go(screenName as Screen);
      return true;
    });
    agent.registerPageContext(() => buildPageContext(stateRef.current.screen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WS4: start a tracking session on app boot; end it when backgrounded ──
  useEffect(() => {
    trackSessionStart({
      platform: Platform.OS,
      osVersion: String(Platform.Version),
      appVersion: '1.0',
    });
    const sub = RNAppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') trackSessionEnd(pagesVisited.current);
    });
    return () => { trackSessionEnd(pagesVisited.current); sub.remove(); };
  }, []);

  // ── WS4: emit an event on every screen transition (fire-and-forget) ──
  useEffect(() => {
    const screen = state.screen;
    pagesVisited.current += 1;
    const spent = Math.max(0, Math.round((Date.now() - screenEnteredAt.current) / 1000));
    screenEnteredAt.current = Date.now();

    trackEvent('navigation', 'screen_view', screen);

    const funnelName = FUNNEL_EVENTS[screen];
    if (funnelName) {
      trackEvent('funnel', funnelName, screen, {
        applicationId: stateRef.current.applicationId,
        loanId: stateRef.current.loanId,
      });
    }
    const stepNum = ONBOARDING_STEPS[screen];
    if (stepNum) trackOnboardingStep(stepNum, screen, 'completed', spent);
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

  const value: Ctx = { state, set, go, back, showToast, reset, parentOf };
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
