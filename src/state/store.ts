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
import { initUpshot, upshotScreen, upshotEvent, registerUpshotPush } from '../analytics/upshot';
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
  'status', 'disbursed', 'repay', 'creditscore',
] as const;
export type Screen = (typeof SCREEN_NAMES)[number];

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
  disbursed: 'home', repay: 'home', creditscore: 'repay',
  loans: 'home', fare: 'home', explore: 'mobile',
};

export interface AppState {
  screen: Screen;
  lang: string | null; // null until chosen; effective default 'en'
  selectedLang: string | null;
  privacyAccepted: boolean; // Privacy Policy consent (first-launch gate)
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
  // The screen the user opened `offers` from, so its back button returns there.
  offersReturn: Screen;
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
  offersReturn: 'home',
  hasSavedOffers: false,
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

/** WS5: one install report per app process (see the boot effect below). */
let installReported = false;

// Exposed for unit tests.
export const PREV_MAP = PREV;
export function parentScreen(s: Screen): Screen {
  return PREV[s] || 'home';
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set':
      return { ...state, ...action.patch };
    case 'go': {
      // Remember which screen the user opened `offers` from, so its back button
      // returns there instead of a fixed PREV target. Ignore downstream/transient
      // screens (finding/lenderweb/handoff) and re-entries so coming back from
      // the lender page doesn't overwrite the real origin.
      if (action.screen === 'offers' && !['offers', 'finding', 'lenderweb', 'handoff'].includes(state.screen)) {
        return { ...state, screen: 'offers', offersReturn: state.screen };
      }
      return { ...state, screen: action.screen };
    }
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
  /** The onboarding step the user is currently ON, completed when they leave it. */
  const prevOnboardingStep = useRef<{ step: number; screen: Screen } | null>(null);

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
    const cur = stateRef.current.screen;
    // Offers returns to wherever it was opened from (home / My Loans / PAN step /
    // funnel), not a fixed parent.
    if (cur === 'offers') {
      dispatch({ type: 'go', screen: stateRef.current.offersReturn || 'home' });
      return;
    }
    dispatch({ type: 'go', screen: PREV[cur] || 'home' });
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
            lang: user.lang || stateRef.current.lang,
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

  // Keep the last-picked language around across app restarts.
  useEffect(() => {
    if (state.lang) saveLang(state.lang);
  }, [state.lang]);

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
    ensureToolsRegistered((screenName: string) => {
      if (!(SCREEN_NAMES as readonly string[]).includes(screenName)) return false;
      go(screenName as Screen);
      return true;
    });
    agent.registerPageContext(() => ({
      ...buildPageContext(stateRef.current.screen),
      // The language the user picked on the language-selection screen — the
      // voice agent should speak in this language from the first word,
      // regardless of what language it's addressed in, unless the user
      // explicitly asks to switch (see the prompt's Voice style section).
      preferred_language: LANGUAGE_NAMES[stateRef.current.lang ?? 'en'] ?? 'English',
      priorInquiries: stateRef.current.priorInquiries,
      // WS8: the history behind this phone number. `brief` is a one-line summary
      // the agent can open from ("Anita enquired 2 days ago about a 3 lakh
      // personal loan; spoke to us on the phone yesterday"), so it continues the
      // conversation instead of restarting it. Read from stateRef so this closure
      // never goes stale.
      userContext: stateRef.current.userContext ?? undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Ask for POST_NOTIFICATIONS. Required from Android 13 — without it the
      // OS drops every notification silently, so push looks "delivered" on the
      // Upshot dashboard while nothing ever appears on the handset.
      //
      // Deferred a tick because the SDK requests the permission through the
      // *current Activity*, which is not attached yet at this point in boot.
      setTimeout(() => registerUpshotPush(), 1500);
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
