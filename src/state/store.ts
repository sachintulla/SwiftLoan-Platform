import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { trackEvent, trackOnboardingStep, trackLoanStep } from '../api/client';

// The full list of screens, mirroring the design's state machine.
export type Screen =
  | 'splash' | 'language' | 'intro' | 'mobile' | 'otp' | 'permissions' | 'aboutyou'
  | 'home' | 'loans' | 'fare' | 'help' | 'profile'
  | 'basic' | 'basicpan' | 'finding' | 'offers' | 'handoff'
  | 'apply' | 'income' | 'residence' | 'consent' | 'prequalify'
  | 'kyc' | 'aadhaar' | 'panv' | 'bankv' | 'selfie'
  | 'status' | 'disbursed' | 'repay' | 'creditscore';

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
  loans: 'home', fare: 'home',
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
};

type Action =
  | { type: 'set'; patch: Partial<AppState> }
  | { type: 'go'; screen: Screen }
  | { type: 'reset' };

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
