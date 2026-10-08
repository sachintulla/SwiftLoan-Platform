'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ElloAgent } from '@/lib/ello-agent';
import { agentApproach, agentPress, agentSettle, slideTo, typeText } from '@/feedback/agentFx';
import { installManualSounds } from '@/feedback/manual';
import { initSounds, playSound } from '@/feedback/sounds';
import { faqsCopy } from '@/i18n/faqs';
import { bootstrapSession, getAccessToken, subscribeSession } from '@/lib/session';
import { fetchMe, listApplications, type LoanApplication } from '@/lib/applyApi';
import { statusMeta } from '@/lib/statusMeta';
import type { SwiftLoanLeadApi } from '@/components/home/LeadForm';
import {
  activeDialog,
  collectCards,
  collectControls,
  collectMessages,
  collectMissingRequired,
  collectTables,
  describeControl,
  findChip,
  findScroller,
  findOtpField,
  findPressable,
  findSlider,
  findTextField,
  findToggle,
  gateOf,
  groupOf,
  isOtpInput,
  isSensitive,
  isVisible,
  labelOf,
  norm,
  pageHeading,
  scopeRoot,
  selectByText,
  setSliderTo,
  settle,
  stepMarker,
  waitUntilLoaded,
  writeValue,
} from '@/lib/voice-dom';

// SwiftLoan.ai voice co-pilot (Ruby) — a floating mic that lets a visitor
// navigate the whole site (home, FAQs, compliance, privacy policy, the apply
// funnel and the signed-in account area) and operate its controls by voice: the
// home "check your rate" form, the EMI calculator, the sign-in / PAN / details /
// offers / compare steps, support tickets, the FAQ accordion and the EN/HI/TE
// language switch. Mounted once in the root layout so the live call survives
// client-side route changes (the WebSocket is not torn down on navigation).
//
// The agent's behaviour lives in prompts/ello-website-next-navigator-prompt.md;
// this file is the tool surface and the live facts it is given. Change one,
// change the other.

// No Ello API key here, deliberately.
//
// NEXT_PUBLIC_* values are compiled into the client bundle, so the key used to be
// downloadable by any visitor — enough to run up call charges on the account or
// reconfigure agents. The session is now brokered by our own API
// (POST /api/voice/session), which holds the key server-side and resolves which
// agent a role maps to. The browser needs neither the key nor an agent id.
const CONFIG = {
  /** Our API, which starts the Ello session. Same resolution order as the lead form. */
  sessionUrl: process.env.NEXT_PUBLIC_API_BASE || '',
  wsUrl: process.env.NEXT_PUBLIC_ELLO_WS_URL || 'wss://connect-in.getello.ai/ws-ello',
};

interface SectionDef {
  id: string;
  label: string;
  aliases: string[];
}

// Sections scrollable-to on the homepage ("/").
/**
 * Section anchors on the home page.
 *
 * These MUST match the ids actually rendered by src/components/home/*. The
 * redesign renamed every one of them (apply -> lead-form, calculator ->
 * emi-calculator, services -> offers, how -> journey) and dropped the standalone
 * track/security/partners/ai sections, which silently broke every navigation
 * request: scrollToId() just returned false and the agent said it had moved when
 * nothing had. Keep this list in step with the markup — there is no build-time
 * check that an id still exists.
 */
const HOME_SECTIONS: SectionDef[] = [
  { id: 'top', label: 'Home / hero', aliases: ['home', 'top', 'start', 'hero', 'beginning'] },
  { id: 'stats', label: 'Key numbers', aliases: ['stats', 'numbers', 'metrics', 'how many', 'track record'] },
  { id: 'offers', label: 'Loan products', aliases: ['loans', 'products', 'loan types', 'services', 'offers', 'personal loan', 'business loan'] },
  { id: 'journey', label: 'How it works', aliases: ['how', 'how it works', 'process', 'steps', 'journey'] },
  { id: 'lead-form', label: 'Apply / check your rate', aliases: ['apply', 'check my rate', 'check your rate', 'get started', 'eligibility', 'form', 'application', 'lead form'] },
  { id: 'emi-calculator', label: 'EMI calculator', aliases: ['calculator', 'emi', 'emi calculator', 'calculate', 'monthly payment'] },
  { id: 'lsp-role', label: 'Our role (LSP, not a lender)', aliases: ['role', 'lsp', 'compliance', 'rbi', 'regulation', 'legal', 'who we are', 'are you a lender'] },
  { id: 'reviews', label: 'Reviews', aliases: ['reviews', 'testimonials', 'ratings', 'what people say'] },
  { id: 'get-started', label: 'Get started', aliases: ['get started', 'ready', 'sign up', 'final'] },
];

// Sections scrollable-to on the /compliance page.
const COMPLIANCE_SECTIONS: SectionDef[] = [
  { id: 'role', label: 'Our role', aliases: ['role', 'who we are', 'aggregator'] },
  { id: 'framework', label: 'Regulatory framework', aliases: ['framework', 'rbi', 'regulation', 'digital lending directions'] },
  { id: 'kfs', label: 'Key facts statement', aliases: ['kfs', 'key facts', 'key facts statement', 'loan terms'] },
  { id: 'fees', label: 'Fees & charges', aliases: ['fees', 'charges', 'cost'] },
  { id: 'cooloff', label: 'Cool-off / look-up period', aliases: ['cooloff', 'cool off', 'cool-off', 'look up period'] },
  { id: 'privacy', label: 'Privacy & data', aliases: ['privacy', 'data', 'data protection'] },
  { id: 'fair-practices', label: 'Fair practices code', aliases: ['fair practices', 'fair practices code', 'conduct'] },
  { id: 'recovery', label: 'Recovery practices', aliases: ['recovery', 'collections', 'recovery practices'] },
  { id: 'grievance', label: 'Grievance redressal', aliases: ['grievance', 'complaint', 'grievance redressal', 'support'] },
  { id: 'partners', label: 'Lending partners', aliases: ['partners', 'lenders', 'lending partners'] },
  { id: 'contact', label: 'Contact', aliases: ['contact', 'contact us', 'reach us'] },
];

interface PageDef {
  path: string;
  label: string;
  aliases: string[];
  /** The page bounces a signed-out visitor to /apply. */
  needsSignIn?: boolean;
}

/** Pages the agent can send a visitor to (navigate_to_page). */
const PAGES: Record<string, PageDef> = {
  home: { path: '/', label: 'Home', aliases: ['home', 'homepage', 'main page', 'landing page'] },
  // FAQs became a page of its own in the redesign (it used to be a section on
  // the home page), so "go to FAQs" must navigate rather than scroll.
  faqs: { path: '/faqs', label: 'FAQs', aliases: ['faq', 'faqs', 'questions', 'frequently asked', 'help'] },
  compliance: { path: '/compliance', label: 'Compliance & policies', aliases: ['compliance', 'compliance page', 'policies', 'legal', 'rbi disclosures'] },
  privacy_policy: { path: '/privacypolicy', label: 'Privacy policy', aliases: ['privacy', 'privacy policy', 'data policy', 'privacypolicy'] },
  brand: { path: '/brand', label: 'Brand showcase', aliases: ['brand', 'brand page', 'brand identity', 'brand guidelines'] },
  logo: { path: '/logo', label: 'Logo assets', aliases: ['logo', 'logo page', 'logo assets'] },
  apply: { path: '/apply', label: 'Apply / sign in', aliases: ['apply', 'sign in', 'login', 'log in', 'start application', 'get started', 'apply now'] },
  offers: { path: '/apply/offers', label: 'My offers', aliases: ['offers', 'my offers', 'matched offers'], needsSignIn: true },
  applications: { path: '/account', label: 'My applications', aliases: ['applications', 'my applications', 'track', 'track application', 'dashboard', 'account', 'status'], needsSignIn: true },
  profile: { path: '/account/profile', label: 'My profile', aliases: ['profile', 'my profile', 'my details', 'notifications'], needsSignIn: true },
  support: { path: '/account/support', label: 'Support', aliases: ['support', 'help centre', 'tickets', 'raise a ticket', 'grievance', 'contact support'], needsSignIn: true },
  partners: { path: '/account/partners', label: 'Lending partners', aliases: ['partners', 'lending partners', 'my lenders', 'lenders'], needsSignIn: true },
};

/** Every route, for describing where the visitor currently is. */
const ROUTES: Array<{ test: RegExp; key: string; label: string; purpose: string }> = [
  { test: /^\/$/, key: 'home', label: 'Home', purpose: 'Marketing page: products, how it works, rate form, EMI calculator.' },
  { test: /^\/faqs/, key: 'faqs', label: 'FAQs', purpose: 'Seven common questions.' },
  { test: /^\/compliance/, key: 'compliance', label: 'Compliance', purpose: 'RBI Digital Lending disclosures.' },
  { test: /^\/privacypolicy/, key: 'privacy_policy', label: 'Privacy policy', purpose: 'Full privacy policy, 18 sections.' },
  { test: /^\/brand/, key: 'brand', label: 'Brand', purpose: 'Brand identity showcase.' },
  { test: /^\/logo/, key: 'logo', label: 'Logo', purpose: 'Logo concepts.' },
  { test: /^\/apply\/?$/, key: 'apply', label: 'Sign in', purpose: 'Enter mobile number and agree to terms to get a 6-digit code.' },
  { test: /^\/apply\/verify/, key: 'apply_verify', label: 'Verify code', purpose: 'The visitor types the 6-digit code themselves. Never take it by voice.' },
  { test: /^\/apply\/step-1/, key: 'apply_pan', label: 'Step 1 of 3 — PAN', purpose: 'Visitor types their own PAN and the soft-check consent is given.' },
  { test: /^\/apply\/step-2/, key: 'apply_details', label: 'Step 2 of 3 — your details', purpose: 'Loan amount, purpose, personal, address and employment details (pre-filled from PAN).' },
  { test: /^\/apply\/step-3/, key: 'apply_optional', label: 'Step 3 of 3 — optional details', purpose: 'Optional extras; can be skipped.' },
  { test: /^\/apply\/finding/, key: 'apply_finding', label: 'Finding offers', purpose: 'Loader while eligibility is checked. Say nothing.' },
  { test: /^\/apply\/offers/, key: 'apply_offers', label: 'Your offers', purpose: 'Matched offers with rate, EMI and fees.' },
  { test: /^\/apply\/compare/, key: 'apply_compare', label: 'Compare offers', purpose: 'Side-by-side comparison with tenure and ranking filters.' },
  { test: /^\/apply\/lender/, key: 'apply_lender', label: "Lender's application", purpose: "The lender's own secure form inside the page — you cannot see or operate it." },
  { test: /^\/apply\/confirm/, key: 'apply_confirm', label: 'Confirm loan', purpose: 'Final confirmation when a lender has no redirect.' },
  { test: /^\/apply\/success/, key: 'apply_success', label: 'Application submitted', purpose: 'Confirmation after submitting to a lender.' },
  { test: /^\/account\/profile/, key: 'profile', label: 'My profile', purpose: 'Name and email, notification switches, links.' },
  { test: /^\/account\/support/, key: 'support', label: 'Support', purpose: 'Search help, raise a ticket or grievance, see past tickets.' },
  { test: /^\/account\/partners/, key: 'partners', label: 'Lending partners', purpose: 'Lenders that made the visitor an offer.' },
  { test: /^\/account\/faqs/, key: 'account_faqs', label: 'FAQs', purpose: 'The same seven FAQs inside the account area.' },
  { test: /^\/account\/privacy/, key: 'account_privacy', label: 'Privacy policy', purpose: 'Privacy policy inside the account area.' },
  { test: /^\/account\/[^/]+/, key: 'application_status', label: 'Application status', purpose: "One application's status and 4-step timeline." },
  { test: /^\/account\/?$/, key: 'applications', label: 'My applications', purpose: "The visitor's applications, one row per lender." },
];

function routeInfo(path: string) {
  return ROUTES.find((r) => r.test.test(path)) ?? { key: 'unknown', label: path, purpose: '' };
}

/** Sections of /privacypolicy (and /account/privacy), ids as rendered. */
const PRIVACY_SECTIONS: SectionDef[] = [
  { id: 'intro', label: 'Introduction and scope', aliases: ['introduction', 'scope', 'intro'] },
  { id: 'who', label: 'Who we are', aliases: ['who we are', 'about'] },
  { id: 'defs', label: 'Definitions', aliases: ['definitions'] },
  { id: 'collect', label: 'Information we collect', aliases: ['collect', 'what we collect', 'information collected'] },
  { id: 'use', label: 'How we use your information', aliases: ['use', 'how we use'] },
  { id: 'consent', label: 'Consent and legal basis', aliases: ['consent', 'legal basis'] },
  { id: 'lending', label: 'Lending services', aliases: ['lending', 'lending services', 'loan referral'] },
  { id: 'share', label: 'How we share your information', aliases: ['share', 'sharing', 'who gets my data'] },
  { id: 'retention', label: 'Data retention and deletion', aliases: ['retention', 'deletion', 'how long', 'delete my data'] },
  { id: 'security', label: 'Data security', aliases: ['security', 'safe', 'encryption'] },
  { id: 'rights', label: 'Your rights', aliases: ['rights', 'my rights'] },
  { id: 'grievance', label: 'Grievance officer / DPO', aliases: ['grievance', 'dpo', 'complaint', 'data protection officer'] },
  { id: 'children', label: 'Children', aliases: ['children', 'minors', 'age'] },
  { id: 'localization', label: 'Data localization and cross-border transfers', aliases: ['localization', 'localisation', 'cross border', 'data in india', 'transfers'] },
  { id: 'thirdparty', label: 'Third-party links and services', aliases: ['third party', 'third-party', 'links'] },
  { id: 'changes', label: 'Changes to this policy', aliases: ['changes', 'updates'] },
  { id: 'contact', label: 'Contact us', aliases: ['contact', 'contact us'] },
  { id: 'precedence', label: 'Precedence', aliases: ['precedence'] },
];

/** Ranges the site states per product (Offers section / compliance page). */
const PRODUCT_LIMITS: Record<string, { min: number; max: number }> = {
  'Personal Loan': { min: 50_000, max: 25_00_000 },
  'Business Loan': { min: 1_00_000, max: 75_00_000 },
};

// ── Account state handed to the agent ────────────────────────────────────

type CustomerType =
  | 'signed_out'
  | 'no_application'
  | 'in_progress'
  | 'offers_ready'
  | 'in_review'
  | 'approved'
  | 'active_loan'
  | 'declined';

interface AccountSummary {
  signedIn: boolean;
  customerType: CustomerType;
  /** First name only, from the signed-in profile. Null when unknown — never guess one. */
  firstName: string | null;
  hasApplication: boolean;
  applications: Array<{
    ref: string;
    status: string;
    statusLabel: string;
    amountRupees: number;
    lendersApplied: string[];
    offersReady: number;
  }>;
}

function signedOutSummary(): AccountSummary {
  return { signedIn: false, customerType: 'signed_out', firstName: null, hasApplication: false, applications: [] };
}

function summariseAccount(user: Record<string, any> | null, apps: LoanApplication[]): AccountSummary {
  const applications = apps.slice(0, 3).map((a) => ({
    ref: a.ref,
    status: a.status,
    statusLabel: statusMeta(a.status).label,
    amountRupees: a.amount,
    lendersApplied: (a.lenderApplications ?? []).map((l) => l.lenderName).filter((n): n is string => !!n),
    offersReady: (a.offers ?? []).filter((o) => !o.applied).length,
  }));
  const raw = apps.map((a) => a.status);
  const customerType: CustomerType = !apps.length
    ? 'no_application'
    : raw.includes('disbursed')
      ? 'active_loan'
      : raw.some((x) => x === 'handoff' || x === 'under_review')
        ? 'in_review'
        : raw.includes('approved')
          ? 'approved'
          : apps.some((a) => a.status === 'offers_ready' && (a.offers ?? []).some((o) => !o.applied))
            ? 'offers_ready'
            : raw.some((x) => x === 'rejected' || x === 'failed') && !raw.some((x) => ['draft', 'pan_pending', 'prequalifying'].includes(x))
              ? 'declined'
              : 'in_progress';
  const full = String(user?.fullName ?? user?.firstName ?? '').trim();
  return {
    signedIn: true,
    customerType,
    firstName: full ? full.split(/\s+/)[0]! : null,
    hasApplication: apps.length > 0,
    applications,
  };
}

/**
 * Buttons that commit the visitor to something real. The tool refuses them
 * unless the model passes user_confirmed — a forcing function to ask out loud
 * first, mirroring the confirmation-gated actions in the mobile copilot.
 */
const GATE_ACTIONS: Record<string, string> = {
  logout: 'logging the visitor out',
  'apply-offer': 'sending their application to a lender',
  'confirm-loan': 'confirming the loan with the lender',
  'verify-pan': 'a soft credit check using their PAN',
  'submit-ticket': 'raising a support ticket',
  'skip-step': 'skipping the optional step',
};

function needsConfirmation(el: Element, label: string, path: string): string | null {
  // The marker first: it does not change with the page language. The English wording below stays
  // as a fallback for any button that has not been marked.
  const marked = gateOf(el);
  if (marked && GATE_ACTIONS[marked]) return GATE_ACTIONS[marked];
  const l = norm(label);
  if (/^log ?out$/.test(l)) return 'logging the visitor out';
  if (/^(apply now|select this offer|apply with)\b/.test(l) && /^\/apply\/(offers|compare)/.test(path)) return 'sending their application to a lender';
  if (/^confirm (and|&) continue/.test(l) || /^confirm &? ?continue/.test(l)) return 'confirming the loan with the lender';
  if (/^verify pan/.test(l)) return 'a soft credit check using their PAN';
  if (/^submit (ticket|grievance)/.test(l)) return 'raising a support ticket';
  if (/^skip for now/.test(l)) return 'skipping the optional step';
  return null;
}

function leadApi(): SwiftLoanLeadApi | null {
  return (window as unknown as { __swiftloanLead?: SwiftLoanLeadApi }).__swiftloanLead ?? null;
}

interface FaqItem {
  question: string;
  answer: string;
}

/**
 * The agent answers from the SAME source the /faqs page renders.
 *
 * This used to be a hand-copied duplicate of the old page's seven <details>
 * blocks, "kept in the same order so index-based DOM lookup stays correct" —
 * which is exactly the kind of coupling that rots silently: the site's FAQs
 * were rewritten in the redesign and the agent would have kept reciting the old
 * answers, confidently and wrongly.
 */
function faqItems(): FaqItem[] {
  const bundle = faqsCopy.en.faqs as ReadonlyArray<{ q: string; a: string }>;
  return bundle.map((f) => ({ question: f.q, answer: f.a }));
}


function fuzzyFind<T extends { aliases: string[]; label?: string; id?: string }>(list: T[], q: string): T | null {
  q = (q || '').toLowerCase().trim();
  if (!q) return null;
  const direct = list.find((s) => s.id === q || s.aliases.indexOf(q) >= 0);
  if (direct) return direct;
  return (
    list.find(
      (s) => s.aliases.some((a) => a.indexOf(q) >= 0 || q.indexOf(a) >= 0) || (s.label ? s.label.toLowerCase().indexOf(q) >= 0 : false)
    ) ?? null
  );
}

/**
 * The EMI calculator's control surface, published by the EmiCalculator
 * component while it is mounted.
 *
 * The redesign's sliders are Radix components driven by React state, so the
 * generic fillInput() cannot move them — there is no native range input to
 * write to. Reading the rendered text would also be wrong now: the values are
 * formatted for display (₹5,00,000, "36 months"), so the agent would read back
 * strings it cannot compute with. This returns real numbers instead.
 */
interface CalcApi {
  read: () => { amount: number; rate: number; tenure: number; emi: number; interest: number; total: number };
  set: (v: { amount?: number; rate?: number; tenure?: number }) => void;
}
function calcApi(): CalcApi | null {
  return (window as unknown as { __swiftloanCalc?: CalcApi }).__swiftloanCalc ?? null;
}

/**
 * What the visitor has already given the home page rate form, so the agent does
 * not re-ask. Amount and loan type come from the form's own state (via its
 * bridge); the mobile number only reports whether a valid one is entered — the
 * digits are never sent to the model.
 */
function readLeadForm() {
  const st = leadApi()?.read();
  if (!st) return null;
  return { amount: st.amount, loanType: st.loanType, mobileEntered: st.mobileFilled, readyToSubmit: st.canSubmit };
}

/** Language switcher control surface, published by LanguageProvider. */
interface LangApi {
  get: () => string;
  set: (code: string) => boolean;
  available: () => string[];
}
function langApi(): LangApi | null {
  return (window as unknown as { __swiftloanLang?: LangApi }).__swiftloanLang ?? null;
}

function inrText(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

function readCalculator() {
  const api = calcApi();
  if (!api) return { available: false };
  const v = api.read();
  return {
    available: true,
    amount: inrText(v.amount),
    rate: `${v.rate}%`,
    tenure: `${v.tenure} months`,
    emi: inrText(v.emi),
    principal: inrText(v.amount),
    interest: inrText(v.interest),
    total: inrText(v.total),
    // Raw numbers too, so the agent can compare or do arithmetic if asked.
    raw: v,
  };
}

// readTracker() removed alongside the tracker tools: the redesign has no
// tracker UI, so it only ever returned nulls.

// Ruby's launcher always sits in the bottom-right corner — on the apply
// funnel's step-1/2/3 and compare, that's also where the sticky bottom bar's
// Continue/Submit button lives, so BOTTOM_BAR_ROUTES below raises the
// launcher above the bar (CSS: .sl-voice-above-bar) rather than covering it.
// Below lg there's no left rail to sit over, and on phones BottomBar's
// actions span the full width — so on these routes the launcher floats just
// above the bar instead of covering it (CSS: .sl-voice-above-bar).
const BOTTOM_BAR_ROUTES = ['/apply/step-1', '/apply/step-2', '/apply/step-3', '/apply/compare'];
// Routes whose bottom bar is two rows (summary + full-width button) on phones.
const TALL_BOTTOM_BAR_ROUTES = ['/apply/compare'];

export default function VoiceWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  const agentRef = useRef<ElloAgent | null>(null);
  const accountRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const prevPathRef = useRef(pathname);

  // Keep the live route in a ref so tool handlers (registered once) always
  // act on the current page, and nudge the assistant's context on navigation.
  useEffect(() => {
    pathRef.current = pathname;
    const btn = document.querySelector('.sl-voice-launcher') as HTMLElement | null;
    const err = document.getElementById('sl-voice-error');
    for (const node of [btn, err]) {
      if (!node) continue;
      node.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathname));
    }
    const fabAnchor = document.querySelector('.sl-fab-anchor') as HTMLElement | null;
    if (fabAnchor) {
      fabAnchor.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathname));
      fabAnchor.classList.toggle('sl-voice-above-tall-bar', TALL_BOTTOM_BAR_ROUTES.includes(pathname));
    }
    const agent = agentRef.current;
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (agent && agent.conversationId && prev !== pathname) {
      // Tell the agent about the NEW page, but only once it has real content: a page
      // that is still fetching ("Loading…") would be described as empty. The first
      // paint after a route change is exactly that, so wait for it to clear, refresh
      // who they are (a sign-in just happened, or an application was submitted), then
      // send. Offers appearing after the finding loader is news worth cutting in for.
      const urgent = prev.startsWith('/apply/finding') && pathname.startsWith('/apply/offers');
      (async () => {
        await waitUntilLoaded(3500);
        if (getAccessToken()) await accountRefreshRef.current?.();
        agent.updatePageContext({ urgent, immediate: true });
      })();
    }
  }, [pathname]);

  useEffect(() => {
    // Only our own API base is required now — the key and agent id live server-side.
    if (!CONFIG.sessionUrl) {
      console.warn(
        '[VoiceWidget] NEXT_PUBLIC_API_BASE not set — voice widget disabled. ' +
          'Copy .env.local.example to .env.local and restart.',
      );
      return;
    }

    const el = (id: string) => document.getElementById(id);
    const isHome = () => pathRef.current === '/';
    const sectionsForCurrentPage = () => {
      const p = pathRef.current;
      if (p === '/compliance') return COMPLIANCE_SECTIONS;
      if (p === '/privacypolicy' || p === '/account/privacy') return PRIVACY_SECTIONS;
      return isHome() ? HOME_SECTIONS : [];
    };

    function currentSectionId(): string | null {
      const list = sectionsForCurrentPage();
      if (!list.length) return null;
      const mid = window.innerHeight / 2;
      let best: string | null = null;
      let bestDist = Infinity;
      list.forEach((s) => {
        const node = s.id === 'top' ? document.body : el(s.id);
        if (!node) return;
        const r = node.getBoundingClientRect();
        const dist = r.top > mid ? r.top - mid : r.bottom < mid ? mid - r.bottom : 0;
        if (dist < bestDist) {
          bestDist = dist;
          best = s.id;
        }
      });
      return best;
    }

    function highlight(node: Element | null) {
      if (!node) return;
      node.classList.add('voice-highlight');
      setTimeout(() => node.classList.remove('voice-highlight'), 3500);
    }

    function scrollToId(id: string): boolean {
      if (id === 'top') {
        playSound('scroll');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      const node = el(id);
      if (!node) return false;
      playSound('scroll');
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      highlight(node);
      return true;
    }

    /** Scroll to the first visible heading matching the text — for pages without a section list. */
    function scrollToHeading(query: string): string | null {
      const q = norm(query);
      if (!q) return null;
      const heads = Array.from(document.querySelectorAll('h1, h2, h3')).filter(isVisible);
      const hit = heads.find((h) => norm(h.textContent) === q) ?? heads.find((h) => norm(h.textContent).includes(q));
      if (!hit) return null;
      playSound('scroll');
      hit.scrollIntoView({ behavior: 'smooth', block: 'start' });
      highlight(hit);
      return (hit.textContent ?? '').trim().slice(0, 80);
    }

    const agent = new ElloAgent({
      sessionUrl: CONFIG.sessionUrl,
      role: 'websiteCompanion',
      wsUrl: CONFIG.wsUrl,
      // Learn who is calling (signed in? which applications?) BEFORE the opening,
      // so the first words are already the right ones for them.
      prepare: () => accountRefreshRef.current?.() ?? Promise.resolve(),
      debug: window.location.hostname === 'localhost' || window.location.search.indexOf('voicedebug') >= 0,
    });
    agentRef.current = agent;
    (window as unknown as { __swiftloanVoice: ElloAgent }).__swiftloanVoice = agent;

    // NO tool here is gated on what is currently on screen. A call's tool set is fixed when
    // it connects, and a tool declared "unavailable" at that moment (enter_otp, while the
    // visitor is still on the home page) can never be called later — which is exactly how
    // the agent ended up saying it was unable to enter the code. Every tool is always
    // offered; each handler says plainly when it does not apply to the current page.

    // ── Who is on the call ─────────────────────────────────────────────
    // Fetched when the visitor taps the mic (and again after each navigation
    // during a call), never on page load: there is no cookie to read from JS, so
    // finding out whether a session exists costs a refresh request, and plain
    // browsing should not pay it.
    let introduced = false;
    let account: AccountSummary = signedOutSummary();
    async function refreshAccount() {
      try {
        const ok = getAccessToken() ? true : await bootstrapSession();
        if (!ok) {
          account = signedOutSummary();
          return;
        }
        const [me, apps] = await Promise.all([fetchMe(), listApplications()]);
        account = summariseAccount(me?.data?.user ?? null, apps ?? []);
      } catch {
        account = { ...signedOutSummary(), signedIn: !!getAccessToken() };
      }
    }

    accountRefreshRef.current = refreshAccount;
    // Logging out clears the token but nothing else would clear what we told the agent
    // the visitor is — the next update would still say signed in, with their name.
    const unsubscribeSession = subscribeSession(() => {
      if (!getAccessToken()) account = signedOutSummary();
    });

    const toastText = (): string | null => {
      const t = Array.from(document.querySelectorAll('[data-sonner-toast]')).pop();
      return t ? (t.textContent ?? '').trim() || null : null;
    };

    // ── What the agent is told about the page ──────────────────────────
    agent.registerPageContext(() => {
      const sections = sectionsForCurrentPage();
      const route = routeInfo(pathRef.current);
      const dialog = activeDialog();
      const onHome = isHome();
      lastSig = screenSignature();
      return {
        // Required by the backend's greeting path: a non-empty top-level `page`
        // string is what puts it on the prompt-driven greeting flow at all —
        // without it there is no "speak first" trigger and the agent stays
        // silent for the whole call.
        page: route.label,
        site: 'SwiftLoan.ai — a digital lending marketplace that matches borrowers to the right lender',
        currentPage: { path: pathRef.current, key: route.key, label: route.label, purpose: route.purpose },
        // The screen language ('en' | 'hi' | 'te'). Distinct from the language the
        // visitor is speaking: the voice follows the visitor, this is the page text.
        siteLanguage: langApi()?.get() ?? 'en',
        pages: Object.entries(PAGES).map(([key, p]) => ({ key, path: p.path, label: p.label, needsSignIn: !!p.needsSignIn })),
        // The section the visitor is looking at is left out — it changes with every scroll
        // and a scroll must not become a turn; read_screen reports it on demand.
        sections: sections.map((s) => ({ id: s.id, label: s.label })),
        // True once she has spoken this call: she has already introduced herself, so a new
        // page is never a new opening.
        alreadyIntroduced: introduced,
        loanProducts: ['Personal Loan', 'Business Loan'],
        faqQuestions: faqItems().map((f) => f.question),
        // Account state, so the opening and every later turn can be personal
        // without asking the visitor for what the site already knows.
        account,
        // Home: what the visitor already typed, so the agent never re-asks.
        alreadyFilled: onHome ? readLeadForm() : null,
        calculator: onHome ? readCalculator() : null,
        // Everywhere except plain home: a live read of the screen — heading,
        // step, every control with its state, and any message the app is showing.
        // Trust this over what was said earlier; the visitor can also act by hand.
        screen:
          !onHome || dialog
            ? {
                heading: pageHeading(),
                step: stepMarker(),
                dialogOpen: !!dialog,
                // The mandatory fields still empty, in page order. Ask for each until this is empty;
                // only then is it right to offer to go ahead. (`missingForVisitor` are mandatory fields
                // the assistant cannot enter itself, e.g. the PAN.)
                ...collectMissingRequired(),
                controls: collectControls(),
                cards: collectCards(),
                table: collectTables(),
                messages: collectMessages(),
              }
            : null,
        loading: /^\/apply\/finding/.test(pathRef.current),
        interactionGuide: {
          role: "You are Ruby, SwiftLoan.ai's voice guide. Follow your system instructions exactly; this block only supplies live facts.",
          // Required for the agent to say anything at all at call start — the
          // backend's speak-first instruction is otherwise gated on a non-empty
          // greeting, which stays empty without this. See the `page` comment above.
          opening:
            'Speak first, right away, before the visitor says anything — once, at the true start of the call. ' +
            'Follow the Opening rules in your instructions for `account.customerType`. Short, warm, one or two sentences, then stop and listen.',
        },
      };
    });

    // A refused or rejected ENTRY plays the error cue; ordinary "not applicable" results stay silent.
    const ERROR_CUE = new Set(['sensitive_field', 'invalid_number', 'bad_date', 'need_six_digits', 'invalid_amount', 'did_not_change']);
    const fail = (reason: string, extra: Record<string, unknown> = {}) => {
      if (ERROR_CUE.has(reason)) playSound('error');
      return { success: false, reason, ...extra };
    };
    /** Deliver the new page to the agent NOW, inside the pending tool call, so the update and the
     *  tool result are answered as one turn — not the result first and a second, late turn after. */
    const pushContext = () => agent.updatePageContext({ immediate: true });
    const SENSITIVE_MESSAGE =
      "That one can't be filled by you. Tell the visitor, in your own words and without naming any control, that it has to be entered by them directly, then carry on once it is.";

    // ── Navigation ─────────────────────────────────────────────────────
    agent.registerTool({
      name: 'navigate_to_page',
      description:
        "Go to a page of the site. Public: home, faqs, compliance, privacy_policy, brand, logo. Application: apply (mobile number + OTP sign-in / start), offers (their matched offers). Signed-in only: applications (My Applications), profile, support, partners. The loan steps themselves (PAN, details, finding, compare, confirm) are reached with the on-screen buttons, not this tool. If sign-in is needed the result says so.",
      schema: { type: 'object', properties: { page: { type: 'string', enum: Object.keys(PAGES) } }, required: ['page'] },
      handler: async (a: { page: string }) => {
        const target = PAGES[a.page] ?? fuzzyFind(Object.entries(PAGES).map(([key, p]) => ({ ...p, id: key })), a.page);
        if (!target) return fail(`Unknown page "${a.page}"`, { pages: Object.keys(PAGES) });
        if (pathRef.current === target.path) return { success: true, navigatedTo: target.path, alreadyHere: true };
        const from = pathRef.current;
        router.push(target.path);
        playSound('nav'); // changing page — the same cue as a menu-bar switch in the app
        // Report where the visitor actually landed, not where we asked to send them:
        // the route commits a moment later (longer on a first, uncompiled visit), and
        // signed-in pages bounce a signed-out visitor to /apply. Poll until one of
        // those happens so the agent never claims an arrival that did not occur.
        const deadline = Date.now() + (target.needsSignIn ? 3000 : 5000);
        let bounced = 0;
        while (pathRef.current !== target.path && Date.now() < deadline) {
          await settle(100);
          if (target.needsSignIn && from !== '/apply' && pathRef.current === '/apply') {
            if (++bounced >= 4) break; // sat on /apply for ~400ms: it is a redirect, not a stop on the way
          }
        }
        if (pathRef.current === target.path) {
          // A signed-in page flashes up before it finds out the visitor is signed
          // out and bounces them. With no token in memory (a cookie session is
          // invisible to JS) give that check time to finish before claiming arrival.
          if (target.needsSignIn && !getAccessToken()) await settle(1400);
          await waitUntilLoaded();
          if (pathRef.current === target.path) {
            pushContext();
            return { success: true, navigatedTo: target.path };
          }
        }
        if (target.needsSignIn && pathRef.current === '/apply') {
          return fail('sign_in_required', { navigatedTo: '/apply', note: 'They are not signed in. Ask whether to sign them in now, and ask for their mobile number.' });
        }
        return fail('navigation_slow', { stillOn: pathRef.current, note: 'The page is still loading; check read_screen before saying you are there.' });
      },
    });

    agent.registerTool({
      name: 'go_to_section',
      description:
        "Scroll to a section of the CURRENT page — e.g. 'loan products', 'EMI calculator', 'how it works', 'check your rate' on home; 'grievance redressal', 'key facts statement', 'fees' on /compliance; any of the 18 policy sections on /privacypolicy (e.g. 'data retention', 'your rights'). Falls back to matching a heading on any other page. If the section isn't on this page, call navigate_to_page first.",
      schema: { type: 'object', properties: { section: { type: 'string', description: 'section the user asked for' } }, required: ['section'] },
      handler: (a: { section: string }) => {
        const list = sectionsForCurrentPage();
        const match = fuzzyFind(list, a.section);
        if (match) return { success: scrollToId(match.id), openedSection: match.id };
        const heading = scrollToHeading(a.section);
        if (heading) return { success: true, openedSection: heading };
        return fail(`Section "${a.section}" isn't on this page.`, { sections: list.map((s) => s.label) });
      },
    });

    // ── Read the screen ────────────────────────────────────────────────
    agent.registerTool({
      name: 'read_screen',
      description:
        'Read what is on screen right now: the heading, step, every field/button/option with its current state, and any message the app is showing (e.g. why Continue is disabled). Call it before describing a screen or acting on a control you have not seen, and after anything that changes the page.',
      schema: { type: 'object', properties: {} },
      handler: () => ({
        success: true,
        path: pathRef.current,
        heading: pageHeading(),
        step: stepMarker(),
        dialogOpen: !!activeDialog(),
        currentSection: (() => {
          const id = currentSectionId();
          const sec = sectionsForCurrentPage().find((x) => x.id === id);
          return id ? { id, label: sec ? sec.label : id } : null;
        })(),
        ...collectMissingRequired(),
        controls: collectControls(scopeRoot()),
        cards: collectCards(),
        table: collectTables(),
        messages: collectMessages(),
        signedIn: account.signedIn,
      }),
    });

    agent.registerTool({
      name: 'scroll_page',
      description:
        "Scroll the page when the visitor asks you to — down, up, to the top or to the bottom. You rarely need it: every other tool already brings the control it works on into view.",
      schema: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['down', 'up', 'top', 'bottom'] },
          amount: { type: 'string', enum: ['small', 'page'], description: "'small' is about a third of the screen; default 'page'" },
        },
        required: ['direction'],
      },
      handler: async (a: { direction: string; amount?: string }) => {
        const sc = findScroller();
        const view = sc === document.scrollingElement || sc === document.documentElement ? window.innerHeight : sc.clientHeight;
        const step = (a.amount === 'small' ? 0.33 : 0.8) * view;
        const top =
          a.direction === 'top' ? 0 : a.direction === 'bottom' ? sc.scrollHeight : sc.scrollTop + (a.direction === 'up' ? -step : step);
        const before = sc.scrollTop;
        playSound('scroll'); // the same pulse roll as a visitor scrolling in test mode
        sc.scrollTo({ top, behavior: 'smooth' });
        await settle(Math.min(700, 240 + Math.abs(top - before) * 0.15));
        const nowTop = sc.scrollTop;
        return {
          success: true,
          moved: Math.abs(nowTop - before) > 2,
          atTop: nowTop <= 2,
          atBottom: nowTop + view >= sc.scrollHeight - 4,
        };
      },
    });

    // ── Lead / "check your rate" form (home only) ──────────────────────
    // The lead form's amount and loan type are React state, reached through the
    // bridge LeadForm publishes — not through the DOM — so these are gated on
    // that bridge being mounted. (The old gate looked for `#lead-form`, which
    // outlived a redesign that moved everything inside it.)

    agent.registerTool({
      name: 'fill_phone',
      description:
        "Call when the visitor gives their 10-digit Indian mobile number — on the home page's rate form or on the sign-in page (/apply). Digits only. Never read the number back digit by digit.",
      schema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
      handler: async (a: { phone: string }) => {
        const digits = String(a.phone ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
        if (!/^[6-9]\d{9}$/.test(digits)) {
          return fail('invalid_number', { message: 'An Indian mobile number is 10 digits and starts with 6, 7, 8 or 9.' });
        }
        const field =
          document.querySelector<HTMLInputElement>('#lead-form [name="mobile"]') ??
          Array.from(document.querySelectorAll<HTMLInputElement>('input[type="tel"]')).find(isVisible) ??
          null;
        if (!field) return fail('no_mobile_field', { note: 'There is no mobile number field on this page.' });
        if (field.closest('#lead-form')) scrollToId('lead-form');
        await agentApproach(field);
        await typeText(field, digits);
        agentSettle();
        await settle(150);
        return { success: true, accepted: field.value.length === 10 };
      },
    });
    agent.registerTool({
      name: 'select_loan_type',
      description:
        "Call as soon as the visitor says which loan they want — 'personal', 'a business loan', 'for my shop'. Sets the loan type on the home page rate form (there is no visible picker; it still matters for the lead).",
      schema: { type: 'object', properties: { loan_type: { type: 'string', enum: ['Personal Loan', 'Business Loan'] } }, required: ['loan_type'] },
      handler: (a: { loan_type: string }) => {
        const said = (a.loan_type || '').toLowerCase();
        const want = /business|vyapar|व्यापार|వ్యాపార|shop|company|firm|msme/.test(said) ? 'Business Loan' : 'Personal Loan';
        const res = leadApi()?.set({ loanType: want });
        if (res) playSound('select');
        return res ? { success: true, selected: want } : fail('form_not_on_screen');
      },
    });
    agent.registerTool({
      name: 'set_loan_amount',
      description:
        'Call when the visitor states how much they want to borrow on the home page rate form (rupees). The slider runs ₹10,000 to ₹50,00,000 in ₹5,000 steps. For "what would my EMI be", use set_calculator instead.',
      schema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
      handler: async (a: { amount: number }) => {
        const api = leadApi();
        if (!api) return fail('form_not_on_screen');
        if (!(a.amount > 0)) return fail('invalid_amount');
        scrollToId('lead-form');
        const thumb = document.querySelector<HTMLElement>('#lead-form [role="slider"]');
        if (thumb) await agentApproach(thumb);
        await slideTo({ from: api.read().amount ?? 10_000, to: a.amount, write: (v) => leadApi()?.set({ amount: v }) });
        agentSettle();
        // The bridge re-publishes after React commits; read the settled state, not the
        // render this call started from (a select_loan_type moments earlier is not in it yet).
        await settle(160);
        const res = { amount: leadApi()?.read().amount ?? null, loanType: leadApi()?.read().loanType ?? 'Personal Loan' };
        const limits = PRODUCT_LIMITS[res.loanType];
        const outside = limits && res.amount != null && (res.amount < limits.min || res.amount > limits.max);
        return {
          success: true,
          amount: res.amount,
          ...(outside
            ? { warning: `${res.loanType}s on SwiftLoan run ${inrText(limits.min)} to ${inrText(limits.max)}. Tell the visitor and confirm the amount.` }
            : {}),
        };
      },
    });
    agent.registerTool({
      name: 'submit_application',
      // No requiresConfirmation / on-screen popup on purpose — this is a
      // voice-first flow, so the ASSISTANT must ask out loud and hear a yes
      // (see the system prompt) before ever calling this tool.
      description:
        'Submit the home page rate form: saves the lead and sends a 6-digit code to the mobile number. Call ONLY after you asked whether to send the code to that number and the visitor clearly said yes. Needs the amount and the mobile number already set. Once it returns awaiting_otp, ask the visitor for the code and enter it with enter_otp.',
      schema: { type: 'object', properties: {} },
      handler: async () => {
        const st = leadApi()?.read();
        if (!st) return fail('form_not_on_screen');
        if (!st.canSubmit) {
          const missing = [st.amount == null ? 'loan amount' : null, !st.mobileFilled ? 'mobile number' : null].filter(Boolean);
          return fail('form_not_ready', { missing });
        }
        const btn = document.querySelector<HTMLButtonElement>('#lead-form button[type="submit"]');
        if (!btn) return fail('submit_button_not_found');
        await agentApproach(btn);
        await agentPress(btn, 'tap');
        btn.click();
        await settle(1200);
        const otp = findOtpField();
        pushContext();
        return {
          success: true,
          awaiting_otp: !!otp,
          ...(otp ? {} : { message_shown_to_user: toastText() }),
        };
      },
    });

    // ── Sign-in code ───────────────────────────────────────────────────
    // The visitor says the code and the agent enters it — same as the mobile app. It is
    // its own tool (fill_field refuses the code boxes) so there is exactly one place
    // that ever writes it: six digits, into a code field that is actually on screen.
    agent.registerTool({
      name: 'enter_otp',
      description:
        'Enter the 6-digit verification code the visitor has just said out loud — on the sign-in page (six boxes) or in the code popup after the home rate form. Pass only the digits, exactly as they said them ("one two three four five six" → "123456"). Never guess, infer or reuse a code. The page verifies by itself once all six digits are in; the result says where they landed or why it failed.',
      schema: { type: 'object', properties: { code: { type: 'string', description: 'the six digits' } }, required: ['code'] },
      handler: async (a: { code: string }) => {
        const digits = String(a.code ?? '').replace(/\D/g, '');
        if (digits.length !== 6) return fail('need_six_digits', { heard: digits.length, note: 'Ask for the full six-digit code again.' });
        const field = findOtpField();
        if (!field) return fail('no_code_field', { note: 'There is no code to enter on this page.' });
        const before = pathRef.current;
        await agentApproach(field);
        await typeText(field, digits);
        agentSettle();
        // Both forms verify on their own the moment the sixth digit lands. Wait for the
        // OUTCOME, not just for the request: either an error appears, or the code field
        // goes away and the visitor is moved on — and that move lands a beat after the
        // field disappears. Reporting earlier would hand the agent a stale page.
        await settle(500);
        const until = Date.now() + 5000;
        while (findOtpField() && !collectMessages().length && Date.now() < until) await settle(150);
        if (!findOtpField() && pathRef.current === before) {
          const moved = Date.now() + 3000;
          while (pathRef.current === before && Date.now() < moved) await settle(100);
        }
        await waitUntilLoaded(5000);
        const messages = collectMessages();
        pushContext();
        return {
          success: true,
          accepted: pathRef.current !== before || !findOtpField(),
          pathAfter: pathRef.current,
          heading: pageHeading(),
          messages,
          ...(toastText() ? { message_shown_to_user: toastText() } : {}),
        };
      },
    });

    // ── EMI calculator (home only) ─────────────────────────────────────
    // Availability is "has the calculator published its API", i.e. is it
    // mounted — not "does a DOM node with a magic id exist".

    agent.registerTool({
      name: 'set_calculator',
      description:
        "Set the EMI calculator sliders — loan amount (₹50,000–₹75,00,000), annual interest rate (9–28%), and/or tenure in months (3–60). Provide only the values the user mentioned; omitted ones keep their current value. Returns the computed EMI/principal/interest/total so you can read it back. Rate is the visitor's assumption — the real rate comes from the lender.",
      schema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'loan amount in rupees' },
          rate: { type: 'number', description: 'annual interest rate percent' },
          tenure: { type: 'number', description: 'tenure in months' },
        },
      },
      handler: async (a: { amount?: number; rate?: number; tenure?: number }) => {
        const api = calcApi();
        if (!api) return fail('The EMI calculator is not on screen');
        scrollToId('emi-calculator');
        const start = api.read();
        const thumb = document.querySelector<HTMLElement>('#emi-calculator [role="slider"]');
        if (thumb) await agentApproach(thumb);
        const lerp = (from: number, to: number | undefined, t: number) => (typeof to === 'number' ? from + (to - from) * t : undefined);
        await slideTo({
          from: 0,
          to: 1,
          write: (t) => calcApi()?.set({ amount: lerp(start.amount, a.amount, t), rate: lerp(start.rate, a.rate, t), tenure: lerp(start.tenure, a.tenure, t) }),
        });
        agentSettle();
        // The calculator re-publishes its API after React commits the new values,
        // so reading straight away returns the OLD numbers. Wait, then read fresh.
        await settle(220);
        return { success: true, result: readCalculator() };
      },
    });
    agent.registerTool({
      name: 'get_calculator',
      description: "Read the EMI calculator's CURRENT values/result without changing anything — e.g. 'what's my EMI right now'.",
      schema: { type: 'object', properties: {} },
      handler: () => (calcApi() ? { success: true, result: readCalculator() } : fail('The EMI calculator is not on this page', { note: 'It is on the home page.' })),
    });

    // ── Language ───────────────────────────────────────────────────────
    agent.registerTool({
      name: 'set_language',
      description: "Switch the site's display language. English, Hindi or Telugu. This changes the page text only.",
      schema: {
        type: 'object',
        properties: { language: { type: 'string', enum: ['English', 'Hindi', 'Telugu'] } },
        required: ['language'],
      },
      // Language is React context, so there is no button to click — the
      // provider publishes get/set instead. The switcher lives in the site
      // header, which /apply and /account hide, but the context still works.
      handler: (a: { language: string }) => {
        const api = langApi();
        if (!api) return fail('language switcher not available');
        const spoken = (a.language || '').toLowerCase();
        const code = spoken.startsWith('hi') ? 'hi' : spoken.startsWith('te') ? 'te' : 'en';
        if (!api.set(code)) return fail(`unsupported language "${a.language}"`);
        playSound('select');
        return { success: true, language: code };
      },
    });

    // ── FAQ ────────────────────────────────────────────────────────────
    agent.registerTool({
      name: 'answer_faq',
      description:
        "Answer a question about SwiftLoan.ai using the 7 official FAQs (lending model, credit-score impact, approval time, documents, charges, data safety, low credit score). Pass the user's question; the closest match is returned for you to speak, and opened on screen when the FAQ page is showing.",
      schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
      // FAQ answers are knowledge, not a screen widget: the agent should be
      // able to answer "does it affect my credit score" from anywhere on the site.
      handler: async (a: { question: string }) => {
        const q = (a.question || '').toLowerCase();
        let bestIdx = -1;
        let bestScore = 0;
        faqItems().forEach((item, i) => {
          const hay = (item.question + ' ' + item.answer).toLowerCase();
          let score = 0;
          q.split(/\W+/).filter(Boolean).forEach((word) => {
            if (word.length > 2 && hay.includes(word)) score++;
          });
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        });
        if (bestIdx === -1) return fail('No matching FAQ found for that question.');
        const picked = faqItems()[bestIdx];

        // If an FAQ accordion is on screen, open the matching item so the
        // visitor reads along. Radix renders each question as a trigger button,
        // so match on its text rather than a positional index.
        const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="accordion-trigger"], button[aria-expanded]'));
        const trigger = triggers.find((b) => {
          const text = (b.textContent || '').toLowerCase();
          const key = picked.question.toLowerCase().slice(0, 24);
          return key.length > 6 && text.includes(key);
        });
        if (trigger) {
          if (trigger.getAttribute('aria-expanded') !== 'true') {
            await agentApproach(trigger);
            await agentPress(trigger, 'tap');
            trigger.click();
          }
          highlight(trigger);
        }
        return { success: true, question: picked.question, answer: picked.answer, shownOnScreen: !!trigger };
      },
    });

    // ── Operating the application funnel and account pages ─────────────
    // Label-driven (see lib/voice-dom.ts): these pages have no name/id hooks.
    // Sensitive fields (PAN, OTP digits, anything password-like) are refused
    // here, not left to the model's judgement.

    agent.registerTool({
      name: 'fill_field',
      description:
        "Type into a text, number, date or dropdown field by its on-screen label — e.g. {label:'First name', value:'Priya'}, {label:'Date of birth', value:'1992-04-18'} (always YYYY-MM-DD), {label:'Monthly income', value:'65000'}, {label:'Related application', value:'SL-2048'}. Use read_screen to see the exact labels. REFUSES the PAN and passwords — the visitor enters those directly. The verification code has its own tool, enter_otp.",
      schema: {
        type: 'object',
        properties: { label: { type: 'string', description: 'the field label as shown' }, value: { type: 'string' } },
        required: ['label', 'value'],
      },
      handler: async (a: { label: string; value: string }) => {
        const m = findTextField(a.label);
        if (m.ambiguous) return fail('ambiguous_field', { options: m.ambiguous });
        if (!m.el) {
          const names = collectControls().filter((c) => c.kind === 'text' || c.kind === 'date' || c.kind === 'select').map((c) => c.label);
          return fail('field_not_found', { available: names });
        }
        const node = m.el;
        if (isOtpInput(node)) return fail('use_enter_otp', { note: 'The verification code goes in with enter_otp.' });
        if (isSensitive(node)) {
          node.focus();
          return fail('sensitive_field', { refused: true, message: SENSITIVE_MESSAGE });
        }
        if (node.disabled || (node as HTMLInputElement).readOnly) return fail('field_not_editable');
        if (node instanceof HTMLInputElement && node.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(a.value)) {
          return fail('bad_date', { message: 'Dates must be YYYY-MM-DD.' });
        }
        await agentApproach(node);
        if (node instanceof HTMLSelectElement) {
          await agentPress(node, 'select');
          const chosen = selectByText(node, a.value);
          return chosen ? { success: true, field: labelOf(node), applied: chosen } : fail('option_not_found', { options: Array.from(node.options).map((o) => o.textContent?.trim()) });
        }
        if (node instanceof HTMLInputElement && node.type === 'date') {
          writeValue(node, String(a.value)); // a native date picker is not typed character by character
        } else {
          await typeText(node as HTMLInputElement | HTMLTextAreaElement, String(a.value));
        }
        agentSettle();
        await settle(160);
        // What is still mandatory-and-empty AFTER this fill: the next question to ask.
        return { success: true, field: labelOf(node), applied: node.value, stillMissing: collectMissingRequired().missingRequired };
      },
    });

    agent.registerTool({
      name: 'select_option',
      description:
        "Pick one of a set of on-screen choices (the pill buttons) — e.g. {option:'Salaried', group:'Employment type'}, {option:'Male', group:'Gender'}, {option:'Medical', group:'What\\'s this loan for?'}, {option:'36', group:'Tenure'}, {option:'Lowest EMI', group:'Best offer by'}, {option:'Repayments'} for a support topic. Pass `group` whenever the same word appears in more than one question (e.g. 'Other').",
      schema: {
        type: 'object',
        properties: { option: { type: 'string' }, group: { type: 'string', description: 'the question the option belongs to' } },
        required: ['option'],
      },
      handler: async (a: { option: string; group?: string }) => {
        const m = findChip(a.option, a.group);
        if (m.ambiguous) return fail('ambiguous_option', { options: m.ambiguous, note: 'Pass `group`.' });
        if (!m.el) {
          const names = collectControls().filter((c) => c.kind === 'chip').map((c) => `${c.group ?? ''}: ${c.label}`);
          return fail('option_not_found', { available: names });
        }
        await agentApproach(m.el);
        await agentPress(m.el, 'select');
        m.el.click();
        agentSettle();
        await settle(220);
        const now = describeControl(m.el);
        return { success: true, option: labelOf(m.el), group: groupOf(m.el), selected: now?.selected ?? true };
      },
    });

    agent.registerTool({
      name: 'set_checkbox',
      description:
        "Tick or untick a checkbox or on/off switch by its on-screen text. The consent boxes (terms & privacy on sign-in, the PAN / soft credit check authorisation on step 1) may ONLY be ticked after you read the wording to the visitor and they clearly said yes — never on your own. Returns the exact wording so you can read it. Notification switches (Loan updates, Security alerts, Promotional offers) are fine on a direct request.",
      schema: {
        type: 'object',
        properties: { label: { type: 'string', description: 'text next to the box' }, checked: { type: 'boolean' } },
        required: ['label', 'checked'],
      },
      handler: async (a: { label: string; checked: boolean }) => {
        const m = findToggle(a.label);
        if (m.ambiguous) return fail('ambiguous_checkbox', { options: m.ambiguous });
        if (!m.el) return fail('checkbox_not_found', { available: collectControls().filter((c) => c.kind === 'checkbox' || c.kind === 'switch').map((c) => c.label) });
        const node = m.el;
        const isOn = node instanceof HTMLInputElement ? node.checked : node.getAttribute('aria-checked') === 'true';
        if (isOn !== a.checked) {
          await agentApproach(node);
          await agentPress(node, a.checked ? 'toggleOn' : 'toggleOff');
          node.click();
          agentSettle();
          await settle(260);
        }
        const nowOn = node instanceof HTMLInputElement ? node.checked : node.getAttribute('aria-checked') === 'true';
        return nowOn === a.checked ? { success: true, label: labelOf(node), checked: nowOn, stillMissing: collectMissingRequired().missingRequired } : fail('did_not_change', { label: labelOf(node), checked: nowOn, message_shown_to_user: toastText() });
      },
    });

    agent.registerTool({
      name: 'set_slider',
      description:
        "Move an on-screen slider to a value — the Loan amount on step 2 (₹25,000 to ₹15,00,000 in ₹25,000 steps), or the Monthly EMI budget on the compare page. Values snap to the slider's own step. On the home page use set_loan_amount / set_calculator instead.",
      schema: {
        type: 'object',
        properties: { label: { type: 'string', description: 'which slider, if there is more than one' }, value: { type: 'number' } },
        required: ['value'],
      },
      handler: async (a: { label?: string; value: number }) => {
        const m = findSlider(a.label);
        if (m.ambiguous) return fail('ambiguous_slider', { options: m.ambiguous });
        if (!m.el) return fail('slider_not_found');
        await agentApproach(m.el);
        const res = await setSliderTo(m.el, Number(a.value), { onStep: () => playSound('slide'), stepDelayMs: 55 });
        agentSettle();
        return { success: true, value: res.value, min: res.min, max: res.max };
      },
    });

    agent.registerTool({
      name: 'press_button',
      description:
        "Press a button or link by its on-screen text — Continue, 'Send OTP', 'Verify PAN & continue', 'See my offers', 'Compare all 3 offers', 'Back to offers', 'Refresh status', a topic tile, an application row (pass its reference, e.g. 'SL-2048'), and so on. Moves the visitor on, so only press when they have asked or clearly agreed. For these you MUST ask out loud first and pass user_confirmed:true once they said yes: Log out, Apply now / Select this offer / Apply with <lender>, Confirm & continue, Verify PAN & continue, Submit ticket / grievance, Skip for now. A disabled button returns the reason the page gives.",
      schema: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'button or link text' },
          user_confirmed: { type: 'boolean', description: 'true only if the visitor said yes out loud to exactly this action' },
        },
        required: ['label'],
      },
      handler: async (a: { label: string; user_confirmed?: boolean }) => {
        const m = findPressable(a.label);
        if (m.ambiguous) return fail('ambiguous_button', { options: m.ambiguous });
        if (!m.el) {
          const names = collectControls().filter((c) => c.kind === 'button' || c.kind === 'link').map((c) => c.label);
          return fail('button_not_found', { available: names });
        }
        const node = m.el;
        const label = labelOf(node);
        const gate = needsConfirmation(node, label, pathRef.current);
        if (gate && !a.user_confirmed) {
          return fail('needs_confirmation', { action: gate, note: 'Ask the visitor out loud, wait for a clear yes, then call again with user_confirmed:true.' });
        }
        if ((node as HTMLButtonElement).disabled || node.getAttribute('aria-disabled') === 'true') {
          return fail('disabled', { reason_shown: collectMessages()[0] ?? null, ...collectMissingRequired() });
        }
        const before = pathRef.current;
        // Light it up, dip and click — then the press goes through. Menu links get the navigation cue.
        await agentApproach(node);
        await agentPress(node, node.matches('header a, nav a, aside a') ? 'nav' : 'tap');
        node.click();
        agentSettle();
        await settle(700);
        // Pressing usually starts a request ("Please wait…", "Verifying…") and often a
        // route change; report the settled result, not the instant after the click.
        await waitUntilLoaded();
        const messages = collectMessages();
        pushContext();
        return {
          success: true,
          pressed: label,
          pathAfter: pathRef.current,
          navigated: pathRef.current !== before,
          heading: pageHeading(),
          messages,
          ...(toastText() ? { message_shown_to_user: toastText() } : {}),
        };
      },
    });

    // ── Floating mic button ──────────────────────────────────────────────
    // Small screens get an icon-only circle (just Ruby's avatar) instead of
    // the full text pill — the pill's fixed 52px avatar + two-line label
    // doesn't leave enough room next to it on a ~375px viewport and was
    // crowding/overlapping other on-screen content. Pure CSS media query
    // (not a JS resize listener) so it's correct on first paint, no flash.
    const launcherStyle = document.createElement('style');
    launcherStyle.textContent = `
      @media (max-width: 1023px) {
        .sl-voice-launcher { display: none !important; }
        #sl-voice-error.sl-voice-above-bar { bottom: 148px !important; }
      }
      /* ── Phones/tablets: the app's agent FAB (src/voice/ui/VoiceWidget.tsx) ──
         A round Ruby avatar with a halo; during a call a frosted panel grows
         out of it with level bars, timer, mute and end-call. Everything sits
         inside the viewport — the old pill's overhanging cut-out image and
         shadow made phones pan sideways.

         .sl-fab-anchor (not .sl-fab itself) is the position:fixed element,
         sized to 100dvh — the DYNAMIC viewport height, which tracks the
         browser chrome's real on-screen size as it collapses/expands on
         scroll. A plain bottom:18px on a fixed element is anchored to the
         LARGER, chrome-collapsed viewport on mobile Safari/Chrome, so it
         visibly slides as the address bar animates in and out while
         scrolling — reported as "Ruby moving around". 100dvh doesn't have
         that lag, so anchoring bottom-alignment to it (via flex) does. */
      .sl-fab-anchor { position: fixed; inset: 0; height: 100dvh; z-index: 9999; pointer-events: none;
        display: none; flex-direction: column; justify-content: flex-end; align-items: flex-end;
        padding: 0 16px calc(18px + env(safe-area-inset-bottom, 0px)); }
      .sl-fab { display: flex; flex-direction: column; align-items: flex-end; pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif; }
      @media (max-width: 1023px) {
        .sl-fab-anchor { display: flex; }
        .sl-fab-anchor.sl-voice-above-bar { padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
        .sl-fab-anchor.sl-voice-above-tall-bar { padding-bottom: calc(112px + env(safe-area-inset-bottom, 0px)); }
      }
      /* Status is for screen readers only — sighted users read it off Ruby
         herself (see the state styles below), not a text label. */
      .sl-fab-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
      .sl-fab-zone { position: relative; width: 64px; height: 64px; display: grid; place-items: center; pointer-events: auto; }
      /* Motion ONLY while a call is live, so movement itself means "you're
         in a call" — and its kind says who's talking:
           listening  → calm: just the slowly spinning ring, Ruby still
           speaking   → Ruby pulses with her real voice level (--sl-lvl,
                        driven from agent.getOutputLevel()) + soft ripples
           connecting → ring + a faint ripple
         Idle = completely still. */
      /* Ring + ripples live in a 96px circle that CLIPS them: a ripple or
         ring can never reach past the 16px screen margin, so mid-animation
         they can't make a phone widen/zoom the page (they did). */
      .sl-fab-fx { position: absolute; width: 96px; height: 96px; left: -16px; top: -16px; border-radius: 50%;
        overflow: hidden; pointer-events: none; display: grid; place-items: center; }
      .sl-fab-ring, .sl-fab-ripple { display: none; }
      .sl-fab[data-active="1"] .sl-fab-ring { display: block; }
      .sl-fab[data-status="speaking"] .sl-fab-ripple, .sl-fab[data-status="connecting"] .sl-fab-ripple { display: block; }
      .sl-fab-ring { position: absolute; width: 66px; height: 66px; border-radius: 50%; margin: auto; inset: 0;
        background: conic-gradient(from 0deg, #2FB183, #079FA0 35%, rgba(47,177,131,0) 60%, #2FB183);
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
                mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
        animation: slFabSpin 3s linear infinite; }
      .sl-fab-ripple { position: absolute; width: 58px; height: 58px; border-radius: 50%; border: 2px solid #2FB183; margin: auto; inset: 0;
        animation: slFabRipple 2s ease-out infinite; }
      .sl-fab[data-status="connecting"] .sl-fab-ripple { border-color: #079FA0; animation-duration: 3s; opacity: .6; }
      @keyframes slFabSpin { to { transform: rotate(360deg); } }
      @keyframes slFabRipple { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(1.6); opacity: 0; } /* 58px → 93px, inside the 96px clip */ }
      .sl-fab-btn { position: relative; width: 56px; height: 56px; padding: 2px; border-radius: 50%; cursor: pointer;
        border: 1.5px solid rgba(255,255,255,.6); background: linear-gradient(135deg,#079FA0,#2FB183);
        box-shadow: 0 10px 22px rgba(10,63,65,.32); transition: transform .09s linear, box-shadow .09s linear; -webkit-tap-highlight-color: transparent;
        transform: scale(calc(1 + var(--sl-lvl, 0) * .07)); } /* ≤ 60px, inside the 64px zone */
      .sl-fab[data-status="speaking"] .sl-fab-btn {
        box-shadow: 0 10px 22px rgba(10,63,65,.32), 0 0 0 calc(var(--sl-lvl, 0) * 6px) rgba(47,177,131,.35); }
      .sl-fab-btn:active { transform: scale(.94); }
      .sl-fab-btn img { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
      .sl-fab-panel { position: absolute; top: 6px; right: 64px; height: 52px; display: flex; align-items: center; gap: 8px; padding: 0 8px;
        border-radius: 26px; background: rgba(244,247,246,.97); border: 1px solid #DCE7E6; box-shadow: 0 8px 20px rgba(10,63,65,.22);
        transform-origin: right center; transform: translateX(18px) scale(.35); opacity: 0; pointer-events: none;
        transition: transform .22s cubic-bezier(.2,.9,.3,1.2), opacity .16s; }
      .sl-fab[data-active="1"][data-expanded="1"] .sl-fab-panel { transform: none; opacity: 1; pointer-events: auto; }
      .sl-fab-meta { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 34px; }
      .sl-fab-eq { display: flex; align-items: center; gap: 3px; height: 18px; }
      .sl-fab-eq span { width: 3.5px; height: 18px; border-radius: 2px; background: #2FB183; transform: scaleY(.3); animation: slFabEq .9s ease-in-out infinite alternate; }
      .sl-fab-eq span:nth-child(2) { animation-delay: .15s; } .sl-fab-eq span:nth-child(3) { animation-delay: .3s; } .sl-fab-eq span:nth-child(4) { animation-delay: .45s; }
      .sl-fab[data-muted="1"] .sl-fab-eq span { animation-play-state: paused; opacity: .4; }
      .sl-fab:not([data-active="1"]) .sl-fab-eq span { animation: none; }
      @keyframes slFabEq { to { transform: scaleY(1); } }
      .sl-fab-timer { font-size: 10.5px; font-weight: 600; color: #64748B; font-variant-numeric: tabular-nums; }
      .sl-fab-ctl { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 50%; cursor: pointer; border: 1px solid #DCE7E6; background: #EEF3F2; color: #0A3F41; }
      .sl-fab[data-muted="1"] .sl-fab-mute, .sl-voice-launcher[data-muted="1"] .sl-voice-mute { background: #DD8A0B; border-color: #DD8A0B; color: #fff; }
      .sl-fab-mute .sl-off, .sl-voice-mute .sl-off { display: none; }
      .sl-fab[data-muted="1"] .sl-fab-mute .sl-on, .sl-voice-launcher[data-muted="1"] .sl-voice-mute .sl-on { display: none; }
      .sl-fab[data-muted="1"] .sl-fab-mute .sl-off, .sl-voice-launcher[data-muted="1"] .sl-voice-mute .sl-off { display: block; }
      .sl-fab-end { background: #C0392B; border-color: #C0392B; color: #fff; }
      @media (prefers-reduced-motion: reduce) { .sl-fab-ring, .sl-fab-ripple, .sl-fab-eq span { animation: none; } .sl-fab-ripple { opacity: .5; transform: scale(1.2); } }
    `;
    document.head.appendChild(launcherStyle);

    // A <div>, not a <button>: once a call is active it hosts its own nested
    // mute/end-call buttons, and a <button> can't legally contain another.
    const btn = document.createElement('div');
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.className = 'sl-voice-launcher';
    btn.setAttribute('aria-label', 'Talk to SwiftLoan — voice guide');
    // Ruby sits flush at the left of the pill, full-bleed, so she reads as a
    // person you are about to talk to rather than an icon in a button.
    btn.style.cssText =
      'position:fixed;bottom:22px;right:22px;z-index:9999;display:flex;align-items:center;gap:10px;overflow:visible;' +
      'padding:8px 10px 8px 8px;border:none;border-radius:999px;font:600 14px system-ui,sans-serif;color:#fff;cursor:pointer;' +
      // min-width holds the pill at its widest (idle text) content's size, so
      // switching to the narrower in-call controls can't shrink the pill —
      // without this, the right-anchored pill narrowing pulled Ruby's avatar
      // (its leftmost content) visibly rightward the moment a call started.
      'min-width:250px;' +
      'box-shadow:0 12px 30px rgba(7,159,160,.42);background:linear-gradient(135deg,#079FA0,#2FB183);transition:transform .15s';
    btn.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathRef.current));
    const ctlIcon = (d: string, cls = '') =>
      `<svg class="${cls}" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    // Ruby is a background-free cutout that rises above the pill on the left,
    // with a soft drop shadow so she stands off the page — matching the design.
    // Idle: name + status text + a phone icon (the whole pill starts the
    // call). Active: same avatar, but the text/phone swap for the same
    // wave/mute/end-call controls the phone app's in-call FAB uses below.
    btn.innerHTML =
      // ruby-pill.png is ruby.png with its bottom-left corner cut along the
      // pill's own curve (28px-radius rounded end, at this fixed 78px/56px
      // display size) — without it, her flat rectangular photo edge pokes a
      // few px past the pill's rounded corner instead of following it.
      '<img class="ruby-cut" src="/ruby-pill.png" alt="Ruby, the SwiftLoan assistant" ' +
      'style="height:78px;width:auto;flex:none;align-self:flex-end;margin:-30px -2px -8px 0;pointer-events:none;' +
      'filter:drop-shadow(0 7px 9px rgba(0,0,0,.28))" />' +
      '<span class="sl-voice-idle" style="display:flex;align-items:center;gap:10px">' +
      '<span class="sl-voice-text" style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15">' +
      '<span style="font-size:14px;font-weight:800">Talk to Ruby</span>' +
      '<span class="voice-label" style="font-size:11px;font-weight:500;opacity:.9">SwiftLoan assistant</span>' +
      '</span>' +
      '<span aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;' +
      'border-radius:50%;background:#fff;flex:none;margin-left:2px;box-shadow:0 2px 6px rgba(0,0,0,.15)">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none">' +
      '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.58 3.6a1 1 0 0 1-.24 1z" fill="#079FA0"/></svg>' +
      '</span>' +
      '</span>' +
      // flex:1 + justify-content:flex-end fills the pill's now-fixed width and
      // right-aligns the controls, so they sit flush at the edge (where the
      // phone icon used to be) instead of leaving a gap where the pill no
      // longer shrinks to fit them.
      '<span class="sl-voice-call" style="display:none;flex:1;align-items:center;justify-content:flex-end;gap:8px" role="group" aria-label="Call controls">' +
      '<span class="sl-fab-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></span>' +
      '<button type="button" class="sl-fab-ctl sl-voice-mute" aria-label="Mute microphone">' +
      ctlIcon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 'sl-on') +
      ctlIcon('<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>', 'sl-off') +
      '</button>' +
      '<button type="button" class="sl-fab-ctl sl-fab-end" aria-label="End call">' +
      ctlIcon('<path d="M3.3 13.4c5-4.5 12.4-4.5 17.4 0 .5.5.5 1.2.1 1.7l-1.7 1.9a1.2 1.2 0 0 1-1.6.2l-2.3-1.6a1.2 1.2 0 0 1-.5-1v-1.8a11 11 0 0 0-5.4 0v1.8c0 .4-.2.8-.5 1L6.5 17.2a1.2 1.2 0 0 1-1.6-.2l-1.7-1.9a1.2 1.2 0 0 1 .1-1.7z" fill="currentColor" stroke="none"/>') +
      '</button>' +
      '</span>';
    const errBox = document.createElement('div');
    errBox.id = 'sl-voice-error';
    errBox.style.cssText =
      'position:fixed;bottom:78px;right:22px;z-index:9999;max-width:280px;display:none;' +
      'padding:9px 12px;border-radius:10px;background:#fee9e7;color:#b42318;font:500 12.5px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.12)';
    errBox.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathRef.current));

    const LABELS: Record<string, string> = {
      idle: 'SwiftLoan assistant',
      connecting: 'Connecting…',
      listening: 'Listening…',
      speaking: 'Speaking…',
      executingTool: 'Working on it…',
      ended: 'SwiftLoan assistant',
    };
    const idleEl = btn.querySelector('.sl-voice-idle') as HTMLElement;
    const callEl = btn.querySelector('.sl-voice-call') as HTMLElement;
    const muteBtn = btn.querySelector('.sl-voice-mute') as HTMLButtonElement;
    const endBtn = btn.querySelector('.sl-fab-end') as HTMLButtonElement;

    agent.on('statusChange', (s: string) => {
      const active = s !== 'idle' && s !== 'ended';
      btn.dataset.active = active ? '1' : '0';
      const label = btn.querySelector('.voice-label') as HTMLElement | null;
      if (label) label.textContent = LABELS[s] || 'SwiftLoan assistant';
      // Ruby's own ring signals listening/thinking now, so the pill no longer
      // turns alarm-red mid-conversation — that read as an error state.
      btn.style.background = active
        ? 'linear-gradient(135deg,#0B6E6F,#128f5b)'
        : 'linear-gradient(135deg,#079FA0,#2FB183)';
      // Once a call is live, the idle text/phone-icon give way to the same
      // wave/mute/end-call controls the phone app's in-call FAB uses.
      idleEl.style.display = active ? 'none' : 'flex';
      callEl.style.display = active ? 'flex' : 'none';
      if (!active) btn.dataset.muted = '0';
      btn.setAttribute('aria-label', active ? 'In a call with SwiftLoan — click to end' : 'Talk to SwiftLoan — voice guide');
      // (No context send here: a status change is not a change to the page, and every
      // send is a turn the agent answers.)
      if (s === 'connecting') initSounds(); // the mic tap is the user gesture browsers require for audio
      if (s === 'speaking') introduced = true;
      if (!active) introduced = false;
    });
    agent.on('muteChange', (m: boolean) => {
      btn.dataset.muted = m ? '1' : '0';
      muteBtn.setAttribute('aria-label', m ? 'Unmute microphone' : 'Mute microphone');
    });
    agent.on('error', (e: { message: string }) => {
      errBox.textContent = e.message;
      errBox.style.display = 'block';
      // Permission/device errors tell the user to go DO something (open the
      // browser's site-permission control) — 6s was tuned for a short status
      // blip, not enough time to read an instruction and act on it.
      const isActionable = /address bar|browser.?s site permissions/i.test(e.message);
      setTimeout(() => {
        errBox.style.display = 'none';
      }, isActionable ? 12000 : 6000);
    });

    // Background of the pill starts the call (only reachable while idle —
    // the call controls cover this area once active). Mute/end have their
    // own handlers below and stop propagation so they don't also toggle this.
    const toggleCall = () => {
      if (btn.dataset.active === '1') agent.stop();
      else agent.start();
    };
    btn.addEventListener('click', toggleCall);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCall();
      }
    });
    muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      agent.setMuted(!agent.isMuted());
    });
    endBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      agent.stop();
    });

    // ── Keeping the agent's picture of the page current ─────────────────
    // A page changes in more ways than the URL: offers arrive after a loader, a popup
    // opens, a field becomes valid and its button enables, an error appears. Watch the
    // DOM and, once it has gone quiet, send an update if what the agent would care
    // about actually differs from what it was last told. There is deliberately NO scroll
    // listener any more — every send is a turn, and scrolling is not news.
    let lastSig = '';
    const screenSignature = (): string => {
      const dlg = activeDialog();
      // Home is long and busy, and the agent drives it through tools whose results
      // already say what changed; only a popup opening or leaving is worth an update.
      if (isHome() && !dlg) return JSON.stringify({ p: pathRef.current });
      // Left out on purpose: field values, whether a text box is filled, and the
      // "Required to continue: …" hint. All of those change with every field the agent
      // (or the visitor) fills, and every send is a turn — an update after each field
      // would have the agent talking over a form it is part-way through. What IS news:
      // the page, a popup, new options or cards, a button becoming usable (Continue
      // enabling is the cue to move on), and an error appearing. A pill or switch being
      // chosen is not: the tool that chose it already reported it.
      return JSON.stringify({
        p: pathRef.current,
        h: pageHeading(),
        s: stepMarker(),
        d: !!dlg,
        c: collectControls(scopeRoot()).map((c) =>
          [c.kind, c.group ?? '', c.label, c.enabled ? 1 : 0].join('|'),
        ),
        m: collectMessages().filter((x) => !/^required to continue/i.test(x)),
        k: collectCards().map((x) => x.title),
      });
    };
    let moTimer: ReturnType<typeof setTimeout> | null = null;
    let moStarted = 0;
    const onMutations = () => {
      if (!agent.conversationId) return;
      if (!moStarted) moStarted = Date.now();
      if (moTimer) clearTimeout(moTimer);
      // Quiet for 500ms, or 2.5s of constant churn (an animation) — whichever first.
      moTimer = setTimeout(() => {
        moTimer = null;
        moStarted = 0;
        if (screenSignature() !== lastSig) agent.updatePageContext({ immediate: true });
      }, Date.now() - moStarted > 2500 ? 0 : 500);
    };
    // Test mode only (src/config/sounds.ts): the visitor's own clicks/typing/scrolling make the same cues.
    const removeManualSounds = installManualSounds();
    const observer = new MutationObserver(onMutations);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-checked', 'aria-pressed', 'disabled', 'hidden'],
    });

    const style = document.createElement('style');
    style.textContent =
      '@keyframes voicePulse{0%{opacity:1}50%{opacity:.45}100%{opacity:1}}' +
      '.voice-highlight{outline:3px solid rgba(7,159,160,.65)!important;outline-offset:4px;border-radius:12px;transition:outline .3s}';
    document.head.appendChild(style);

    document.body.appendChild(btn);
    document.body.appendChild(errBox);

    // ── Phones/tablets: app-style FAB (see CSS above) ───────────────────
    // fabAnchor is the fixed, 100dvh-sized positioning element; fab itself
    // is just a flex child of it now (see the CSS comment on .sl-fab-anchor).
    const fabAnchor = document.createElement('div');
    fabAnchor.className = 'sl-fab-anchor';
    fabAnchor.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathRef.current));
    fabAnchor.classList.toggle('sl-voice-above-tall-bar', TALL_BOTTOM_BAR_ROUTES.includes(pathRef.current));
    const fab = document.createElement('div');
    fab.className = 'sl-fab';
    fab.dataset.active = '0';
    fab.dataset.expanded = '0';
    fab.dataset.muted = '0';
    const icon = (d: string, cls = '') =>
      `<svg class="${cls}" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    fab.innerHTML =
      '<div class="sl-fab-status" role="status" aria-live="polite"><span class="sl-fab-status-text"></span></div>' +
      '<div class="sl-fab-zone">' +
      '<span class="sl-fab-fx" aria-hidden="true"><span class="sl-fab-ripple"></span><span class="sl-fab-ring"></span></span>' +
      '<div class="sl-fab-panel" role="group" aria-label="Call controls">' +
      '<div class="sl-fab-meta"><div class="sl-fab-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></div><span class="sl-fab-timer">0:00</span></div>' +
      '<button type="button" class="sl-fab-ctl sl-fab-mute" aria-label="Mute microphone">' +
      icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', 'sl-on') +
      icon('<path d="M3 3l18 18M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>', 'sl-off') +
      '</button>' +
      '<button type="button" class="sl-fab-ctl sl-fab-end" aria-label="End call">' +
      icon('<path d="M3.3 13.4c5-4.5 12.4-4.5 17.4 0 .5.5.5 1.2.1 1.7l-1.7 1.9a1.2 1.2 0 0 1-1.6.2l-2.3-1.6a1.2 1.2 0 0 1-.5-1v-1.8a11 11 0 0 0-5.4 0v1.8c0 .4-.2.8-.5 1L6.5 17.2a1.2 1.2 0 0 1-1.6-.2l-1.7-1.9a1.2 1.2 0 0 1 .1-1.7z" fill="currentColor" stroke="none"/>') +
      '</button>' +
      '</div>' +
      '<button type="button" class="sl-fab-btn" aria-label="Talk to Ruby, the SwiftLoan assistant">' +
      '<img src="/ruby-avatar.png" alt="" width="52" height="52" />' +
      '</button>' +
      '</div>';
    fabAnchor.appendChild(fab);
    document.body.appendChild(fabAnchor);

    const fabBtn = fab.querySelector('.sl-fab-btn') as HTMLButtonElement;
    const fabStatus = fab.querySelector('.sl-fab-status-text') as HTMLElement;
    const fabTimer = fab.querySelector('.sl-fab-timer') as HTMLElement;
    const fabMute = fab.querySelector('.sl-fab-mute') as HTMLButtonElement;
    let callTimer: ReturnType<typeof setInterval> | null = null;
    // While Ruby speaks, her avatar follows her actual voice level.
    let levelRaf: number | null = null;
    let lvl = 0;
    const trackLevel = () => {
      const target = fab.dataset.status === 'speaking' ? agent.getOutputLevel() : 0;
      lvl += (target - lvl) * 0.35; // smooth so it breathes rather than jitters
      fab.style.setProperty('--sl-lvl', lvl < 0.01 ? '0' : lvl.toFixed(3));
      levelRaf = fab.dataset.active === '1' ? requestAnimationFrame(trackLevel) : null;
    };
    const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    const setExpanded = (v: boolean) => {
      fab.dataset.expanded = v ? '1' : '0';
      fabBtn.setAttribute('aria-label', fab.dataset.active === '1' ? (v ? 'Hide call controls' : 'Show call controls') : 'Talk to Ruby, the SwiftLoan assistant');
    };
    fabBtn.addEventListener('click', () => {
      if (fab.dataset.active === '1') setExpanded(fab.dataset.expanded !== '1');
      else agent.start();
    });
    fab.querySelector('.sl-fab-end')!.addEventListener('click', () => agent.stop());
    fabMute.addEventListener('click', () => agent.setMuted(!agent.isMuted()));
    agent.on('muteChange', (m: boolean) => {
      fab.dataset.muted = m ? '1' : '0';
      fabMute.setAttribute('aria-label', m ? 'Unmute microphone' : 'Mute microphone');
    });
    agent.on('statusChange', (s: string) => {
      const active = s !== 'idle' && s !== 'ended';
      const wasActive = fab.dataset.active === '1';
      fab.dataset.active = active ? '1' : '0';
      fab.dataset.status = s;
      fabStatus.textContent = LABELS[s] || 'Connecting…';
      if (active && !wasActive) {
        // Call just started: open the controls and start the clock.
        const started = Date.now();
        fabTimer.textContent = '0:00';
        callTimer = setInterval(() => { fabTimer.textContent = fmt(Math.floor((Date.now() - started) / 1000)); }, 1000);
        if (levelRaf == null) levelRaf = requestAnimationFrame(trackLevel);
        setExpanded(true);
      } else if (!active && wasActive) {
        if (callTimer) clearInterval(callTimer);
      if (levelRaf != null) cancelAnimationFrame(levelRaf);
        callTimer = null;
        fab.dataset.muted = '0';
        if (levelRaf != null) cancelAnimationFrame(levelRaf);
        levelRaf = null;
        lvl = 0;
        fab.style.setProperty('--sl-lvl', '0');
        setExpanded(false);
      }
    });

    return () => {
      observer.disconnect();
      removeManualSounds();
      unsubscribeSession();
      if (moTimer) clearTimeout(moTimer);
      agent.stop();
      agentRef.current = null;
      btn.remove();
      errBox.remove();
      fabAnchor.remove();
      if (callTimer) clearInterval(callTimer);
      style.remove();
      launcherStyle.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
