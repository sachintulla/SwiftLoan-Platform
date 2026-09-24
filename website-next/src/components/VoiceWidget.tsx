'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ElloAgent, fillInput } from '@/lib/ello-agent';
import { faqsCopy } from '@/i18n/faqs';

// SwiftLoan.ai voice co-pilot — a floating mic that lets a visitor navigate
// the ENTIRE site (home, compliance, brand, logo) and operate every
// interactive control by voice: the EMI calculator, the application tracker,
// the "check your rate" lead form, the FAQ accordion, and the EN/HI language
// toggle. Mounted once in the root layout so the live call survives
// client-side route changes (the agent/WebSocket connection is not torn down
// when the visitor navigates between pages).

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

const PAGES: Record<string, { path: string; label: string; aliases: string[] }> = {
  home: { path: '/', label: 'Home', aliases: ['home', 'homepage', 'main page', 'landing page'] },
  // FAQs became a page of its own in the redesign (it used to be a section on
  // the home page), so "go to FAQs" must navigate rather than scroll.
  faqs: { path: '/faqs', label: 'FAQs', aliases: ['faq', 'faqs', 'questions', 'frequently asked', 'help'] },
  compliance: { path: '/compliance', label: 'Compliance & policies', aliases: ['compliance', 'compliance page', 'policies', 'legal', 'rbi disclosures'] },
  brand: { path: '/brand', label: 'Brand showcase', aliases: ['brand', 'brand page', 'brand identity', 'brand guidelines'] },
  logo: { path: '/logo', label: 'Logo assets', aliases: ['logo', 'logo page', 'logo assets'] },
};

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
 * Snapshot of the lead form, by `name` rather than id.
 *
 * Scoped to `#lead-form` so it cannot accidentally pick up a same-named input
 * elsewhere on the page.
 */
function readLeadForm() {
  const f = (name: string) =>
    (document.querySelector(`#lead-form [name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null)?.value || null;
  // Simplified form: amount, loan type and mobile only — no name/city/email/
  // consent fields exist anymore (there's no checkbox; eligibility is checked
  // straight from amount + phone + OTP verification).
  return {
    phone: f('mobile'),
    loan_type: f('loanType'),
    amount: f('amount'),
  };
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

// The apply funnel's Steps 1-3 render a sticky, full-width bottom bar
// (ApplyShell's BottomBar) with its Continue/Submit button right-aligned —
// the same corner Ruby's launcher normally sits in. The lender page's
// screen-height iframe puts its "I've finished" button in that corner too.
// Every other page (home, offers, confirm, success, /account/*) either has no
// sticky bottom bar or its own CTA is inline in the content flow, so the
// right corner is free there.
const LEFT_LAUNCHER_ROUTES = ['/apply/step-1', '/apply/step-2', '/apply/step-3', '/apply/lender'];
function launcherSide(path: string): 'left' | 'right' {
  return LEFT_LAUNCHER_ROUTES.includes(path) ? 'left' : 'right';
}
// Below lg there's no left rail to sit over, and on phones BottomBar's
// actions span the full width — so on these routes the launcher floats just
// above the bar instead of covering it (CSS: .sl-voice-above-bar).
const BOTTOM_BAR_ROUTES = ['/apply/step-1', '/apply/step-2', '/apply/step-3'];

export default function VoiceWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  const agentRef = useRef<ElloAgent | null>(null);

  // Keep the live route in a ref so tool handlers (registered once) always
  // act on the current page, and nudge the assistant's context on navigation.
  useEffect(() => {
    pathRef.current = pathname;
    const side = launcherSide(pathname);
    const btn = document.querySelector('.sl-voice-launcher') as HTMLElement | null;
    const err = document.getElementById('sl-voice-error');
    for (const node of [btn, err]) {
      if (!node) continue;
      node.style.left = side === 'left' ? '22px' : '';
      node.style.right = side === 'left' ? '' : '22px';
      node.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathname));
    }
    const fab = document.querySelector('.sl-fab') as HTMLElement | null;
    if (fab) {
      fab.classList.toggle('sl-left', side === 'left');
      fab.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathname));
    }
    const agent = agentRef.current;
    if (agent && agent.conversationId) {
      // Give the new page a tick to mount its DOM before re-describing it.
      setTimeout(() => agent.updatePageContext(), 150);
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
    const sectionsForCurrentPage = () => (pathRef.current === '/compliance' ? COMPLIANCE_SECTIONS : isHome() ? HOME_SECTIONS : []);

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
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }
      const node = el(id);
      if (!node) return false;
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      highlight(node);
      return true;
    }

    const agent = new ElloAgent({
      sessionUrl: CONFIG.sessionUrl,
      role: 'websiteCompanion',
      wsUrl: CONFIG.wsUrl,
      debug: window.location.hostname === 'localhost' || window.location.search.indexOf('voicedebug') >= 0,
    });
    agentRef.current = agent;
    (window as unknown as { __swiftloanVoice: ElloAgent }).__swiftloanVoice = agent;

    agent.registerPageContext(() => {
      const sid = currentSectionId();
      const sections = sectionsForCurrentPage();
      const sec = sections.find((s) => s.id === sid);
      const pageKey = Object.keys(PAGES).find((k) => PAGES[k].path === pathRef.current) ?? 'unknown';
      const pageLabel = PAGES[pageKey]?.label ?? pathRef.current;
      return {
        // Required by the backend's greeting path: a non-empty top-level `page`
        // string is what puts it on the prompt-driven greeting flow at all —
        // without it there is no "speak first" trigger and the agent stays
        // silent for the whole call (confirmed against src/voice/actionRegistry.ts,
        // the mobile app's verified equivalent of this same page context).
        page: pageLabel + (sid && sec ? ` — ${sec.label}` : ''),
        site: 'SwiftLoan.ai — a digital lending marketplace that matches borrowers to the right lender',
        currentPage: { path: pathRef.current, key: pageKey, label: pageLabel },
        pages: Object.entries(PAGES).map(([key, p]) => ({ key, path: p.path, label: p.label })),
        currentSection: sid ? { id: sid, label: sec ? sec.label : sid } : null,
        sections: sections.map((s) => ({ id: s.id, label: s.label })),
        loanProducts: ['Personal Loan', 'Business Loan'],
        faqQuestions: faqItems().map((f) => f.question),
        // What the visitor has already typed, so the agent does not ask again.
        // Read by `name`, matching the redesigned form — reading the old ids
        // returned null for every field, which made the agent re-ask for a name
        // the visitor had just given it.
        alreadyFilled: isHome() ? readLeadForm() : null,
        calculator: isHome() ? readCalculator() : null,
        interactionGuide: {
          role:
            "You are SwiftLoan.ai's voice guide. Warmly help visitors understand the products, navigate the site (home, FAQs, compliance), operate the EMI calculator, answer FAQs, switch language (English, Hindi, Telugu), and check their loan eligibility by filling the application form hands-free.",
          // Required for the agent to say anything at all at call start — the
          // backend's speak-first instruction is otherwise gated on a non-empty
          // greeting, which stays empty without this. See the `page` comment above.
          opening:
            'Speak first, right away, before the visitor says anything. Open warmly, like ' +
            '"Welcome to SwiftLoan!" — then in the same short sentence, name the current page/section ' +
            'in plain everyday words and one thing they can do here. One sentence, genuinely warm, no script. ' +
            'Then stop and listen.',
          behaviour: [
            "Greet the visitor, say which page/section they're on, and ask what they need.",
            'If the visitor asks for something on a different page, CALL navigate_to_page first, then go_to_section once there.',
            'When they express interest in loans, CALL go_to_section to take them there, then describe it.',
            // Deliberate order: the amount is the question the visitor came to
            // answer and is the least personal, so it earns the right to ask
            // for a phone number next. The form itself only has these two
            // fields now — no name/city/email/consent step exists anymore.
            'Offer to fill the "Check eligibility" form by voice, asking ONE field at a time IN THIS ORDER: 1) how much they need (set_loan_amount), 2) mobile number (fill_phone). Confirm each value back before moving on.',
            'As soon as they mention personal or business — even in passing, before you reach the amount — CALL select_loan_type immediately so their loan type is recorded correctly (there is no visible picker for this, but it still matters for the lead).',
            'Never re-ask for something already present in alreadyFilled; read it back to confirm instead.',
            'For EMI questions, CALL set_calculator with the amount/rate/tenure they mention and read back the emi/total from the result.',
            'If they ask to track an existing application, say that tracking lives in the SwiftLoan app and offer to send the app link — there is no tracker on this site.',
            'For FAQ-style questions, CALL answer_faq with their question — use the returned answer text to reply, and it will also open the matching FAQ item on screen.',
            'The site is available in English, Hindi and Telugu. If the visitor speaks one of those, offer to switch with set_language.',
            'Never ask the visitor to speak passwords, OTPs, PAN, Aadhaar, or any security codes.',
          ],
        },
      };
    });

    // ── Navigation ─────────────────────────────────────────────────────
    agent.registerTool({
      name: 'navigate_to_page',
      description:
        "Go to a different page of the site — e.g. 'take me to the compliance page', 'show me the brand page', 'go home'. Valid pages: home, compliance, brand, logo.",
      schema: { type: 'object', properties: { page: { type: 'string', enum: Object.keys(PAGES) } }, required: ['page'] },
      handler: (a: { page: string }) => {
        const target = PAGES[a.page] ?? fuzzyFind(Object.entries(PAGES).map(([key, p]) => ({ ...p, id: key })), a.page);
        if (!target) return { success: false, reason: `Unknown page "${a.page}"` };
        router.push(target.path);
        return { success: true, navigatedTo: target.path };
      },
    });

    agent.registerTool({
      name: 'go_to_section',
      description:
        "Scroll to a section on the CURRENT page — e.g. 'show me the loan products', 'open the EMI calculator', 'take me to apply', 'go to FAQ' on the home page, or 'grievance redressal', 'key facts statement' on the compliance page. If the section isn't on this page, call navigate_to_page first.",
      schema: { type: 'object', properties: { section: { type: 'string', description: 'section the user asked for' } }, required: ['section'] },
      handler: (a: { section: string }) => {
        const list = sectionsForCurrentPage();
        const match = fuzzyFind(list, a.section);
        if (!match) return { success: false, reason: `Section "${a.section}" isn't on this page. Try navigate_to_page first.` };
        return { success: scrollToId(match.id), openedSection: match.id };
      },
    });

    // ── Lead / "check eligibility" form (home only) ─────────────────────
    // Gate for every lead-form tool. This checked `#leadForm`, which the
    // redesign renamed to the `#lead-form` SECTION — so availableWhen returned
    // false and the agent was never offered fill_phone/submit at all. That is
    // why it could hear the request and do nothing: the tools were not
    // absent-but-broken, they were simply never advertised.
    const homeOnly = () => !!document.getElementById('lead-form');

    agent.registerTool({
      name: 'fill_phone',
      description: 'Call immediately when the user states their phone number. Digits only, optional leading +.',
      schema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
      availableWhen: homeOnly,
      handler: (a: { phone: string }) => {
        scrollToId('lead-form');
        return fillInput('[name="mobile"]', a.phone);
      },
    });
    agent.registerTool({
      name: 'select_loan_type',
      description: "Call as soon as the user says which loan they want — e.g. 'personal', 'a business loan', 'for my shop'. Sets the loan type on the APPLICATION FORM.",
      schema: { type: 'object', properties: { loan_type: { type: 'string', enum: ['Personal Loan', 'Business Loan'] } }, required: ['loan_type'] },
      availableWhen: homeOnly,
      /**
       * Resolved to a stable English key, not the spoken text.
       *
       * The loan-type field is a custom-rendered dropdown (not a native
       * <select> — see LeadForm.tsx for why), so there are no <option>
       * elements to match against. Its value is mirrored onto a hidden
       * input#loanType that fillInput can still set the same way it fills
       * every other field: native setter + dispatchEvent('input'), which the
       * hidden input's onChange picks up and pushes into React state.
       */
      handler: (a: { loan_type: string }) => {
        const said = (a.loan_type || '').toLowerCase();
        const wantBusiness = /business|vyapar|व्यापार|వ్యాపార|shop|company|firm|msme/.test(said);
        const want = wantBusiness ? 'Business Loan' : 'Personal Loan';

        const res = fillInput('#lead-form [name="loanType"]', want);
        return res.success ? { success: true, selected: want } : res;
      },
    });
    agent.registerTool({
      name: 'set_loan_amount',
      description: 'Call when the user states how much they want to borrow on the APPLICATION FORM (a number in rupees). For "what would my EMI be", use set_calculator instead.',
      schema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
      availableWhen: homeOnly,
      handler: (a: { amount: number }) => fillInput('[name="amount"]', String(a.amount)),
    });
    agent.registerTool({
      name: 'submit_application',
      // No requiresConfirmation / on-screen popup here on purpose — this is a
      // voice-first flow, so the ASSISTANT must ask "shall I submit this now?"
      // out loud and wait for a spoken yes (see the system prompt's behaviour
      // rules) before ever calling this tool. Once called, it submits immediately.
      description:
        "Call ONLY after the visitor has verbally confirmed out loud that they want to submit (e.g. said \"yes\", \"go ahead\", \"submit it\") in response to you asking them. Requires phone to already be set (there is no consent checkbox anymore — the form itself has no separate consent step).",
      schema: { type: 'object', properties: {} },
      availableWhen: homeOnly,
      handler: () => {
        const btn = document.querySelector('#lead-form button[type="submit"]') as HTMLButtonElement | null;
        if (!btn) return { success: false, reason: 'submit button not found' };
        btn.click();
        return { success: true };
      },
    });
    agent.registerTool({
      name: 'reset_application_form',
      description: "Call when the user wants to check another rate / start a new application after already submitting one.",
      schema: { type: 'object', properties: {} },
      availableWhen: () => {
        const fs = el('formSuccess') as HTMLElement | null;
        return !!fs && !fs.hidden;
      },
      handler: () => {
        const btn = el('resetLead') as HTMLButtonElement | null;
        if (!btn) return { success: false, reason: 'reset button not found' };
        btn.click();
        return { success: true };
      },
    });

    // ── EMI calculator (home only) ─────────────────────────────────────
    // Availability is "has the calculator published its API", i.e. is it
    // mounted — not "does a DOM node with a magic id exist".
    const calculatorAvailable = () => !!calcApi();

    agent.registerTool({
      name: 'set_calculator',
      description:
        "Set the EMI calculator sliders — loan amount (₹50,000–₹75,00,000), annual interest rate (9–28%), and/or tenure in months (3–60). Provide only the values the user mentioned; omitted ones keep their current value. Returns the computed EMI/principal/interest/total so you can read it back.",
      schema: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'loan amount in rupees' },
          rate: { type: 'number', description: 'annual interest rate percent' },
          tenure: { type: 'number', description: 'tenure in months' },
        },
      },
      availableWhen: calculatorAvailable,
      handler: (a: { amount?: number; rate?: number; tenure?: number }) => {
        const api = calcApi();
        if (!api) return { success: false, reason: 'The EMI calculator is not on screen' };
        api.set({ amount: a.amount, rate: a.rate, tenure: a.tenure });
        scrollToId('emi-calculator');
        return { success: true, result: readCalculator() };
      },
    });
    agent.registerTool({
      name: 'get_calculator',
      description: "Read the EMI calculator's CURRENT values/result without changing anything — e.g. 'what's my EMI right now'.",
      schema: { type: 'object', properties: {} },
      availableWhen: calculatorAvailable,
      handler: () => ({ success: true, result: readCalculator() }),
    });

    // ── Application tracker: REMOVED ────────────────────────────────────
    // The redesign has no tracker section, so track_application and
    // use_demo_track had nothing to drive. They self-disabled via
    // availableWhen, but shipping tools that can never fire invites the model
    // to promise a visitor something it cannot deliver — worse than not
    // offering it. Restore them alongside a real tracker UI backed by the API,
    // rather than the old in-page demo data.

    // ── Language toggle ─────────────────────────────────────────────────
    agent.registerTool({
      name: 'set_language',
      // Telugu is new in this design — the old toggle was EN/HI only.
      description: "Switch the site's display language. English, Hindi or Telugu.",
      schema: {
        type: 'object',
        properties: { language: { type: 'string', enum: ['English', 'Hindi', 'Telugu'] } },
        required: ['language'],
      },
      // Language is React context now, so there is no button to click — the
      // provider publishes get/set instead.
      availableWhen: () => !!langApi(),
      handler: (a: { language: string }) => {
        const api = langApi();
        if (!api) return { success: false, reason: 'language switcher not available' };
        const spoken = (a.language || '').toLowerCase();
        const code = spoken.startsWith('hi') ? 'hi' : spoken.startsWith('te') ? 'te' : 'en';
        if (!api.set(code)) return { success: false, reason: `unsupported language "${a.language}"` };
        return { success: true, language: code };
      },
    });

    // ── FAQ ──────────────────────────────────────────────────────────────
    agent.registerTool({
      name: 'answer_faq',
      description:
        'Answer a question about SwiftLoan.ai using the FAQ list (lending model, credit score impact, approval time, documents, charges, data safety, low credit score). Pass the user\'s question; the closest FAQ match is opened on screen and its answer text is returned for you to speak.',
      schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
      // FAQ answers are knowledge, not a screen widget: the agent should be
      // able to answer "does it affect my credit score" from anywhere on the
      // site, not only while the accordion happens to be rendered. When the
      // /faqs accordion IS on screen the matching item is also opened, so the
      // visitor sees what they are being told.
      availableWhen: () => true,
      handler: (a: { question: string }) => {
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
        if (bestIdx === -1) return { success: false, reason: 'No matching FAQ found for that question.' };
        const picked = faqItems()[bestIdx];

        // If the /faqs accordion is on screen, open the matching item so the
        // visitor reads along. Radix renders each question as a trigger button,
        // so match on its text rather than a positional index — the on-screen
        // order is translated and will not line up with this list.
        const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-slot="accordion-trigger"], button[aria-expanded]'));
        const trigger = triggers.find((b) => {
          const text = (b.textContent || '').toLowerCase();
          const key = picked.question.toLowerCase().slice(0, 24);
          return key.length > 6 && text.includes(key);
        });
        if (trigger) {
          if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
          trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlight(trigger);
        }
        return { success: true, question: picked.question, answer: picked.answer, shownOnScreen: !!trigger };
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
         shadow made phones pan sideways. */
      .sl-fab { position: fixed; z-index: 9999; right: 16px; bottom: calc(18px + env(safe-area-inset-bottom, 0px));
        display: none; flex-direction: column; align-items: flex-end; pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif; }
      .sl-fab.sl-left { right: auto; left: 16px; align-items: flex-start; }
      .sl-fab.sl-left .sl-fab-status { right: auto; left: 2px; }
      @media (max-width: 1023px) {
        .sl-fab { display: flex; }
        .sl-fab.sl-voice-above-bar { bottom: calc(84px + env(safe-area-inset-bottom, 0px)); }
      }
      /* Anchored to the FAB's outer edge (not flex-aligned) so a label wider
         than the 64px column never spills past the viewport edge. */
      .sl-fab-status { position: absolute; bottom: 70px; right: 2px; display: none; align-items: center; gap: 6px; padding: 5px 10px;
        border-radius: 14px; background: rgba(15,42,43,.92); color: #fff; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
      .sl-fab-status i { width: 7px; height: 7px; border-radius: 50%; background: #2FB183; }
      .sl-fab[data-active="1"]:not([data-expanded="1"]) .sl-fab-status { display: flex; }
      .sl-fab-zone { position: relative; width: 64px; height: 64px; display: grid; place-items: center; pointer-events: auto; }
      /* Motion ONLY while a call is live, so movement itself means "you're
         in a call": a spinning gradient ring, ripples pulsing outward (faster
         while Ruby is speaking) and a blinking live dot. Idle = still. */
      .sl-fab-ring, .sl-fab-ripple, .sl-fab-live { display: none; }
      .sl-fab[data-active="1"] .sl-fab-ring, .sl-fab[data-active="1"] .sl-fab-ripple, .sl-fab[data-active="1"] .sl-fab-live { display: block; }
      .sl-fab-ring { position: absolute; width: 66px; height: 66px; border-radius: 50%;
        background: conic-gradient(from 0deg, #2FB183, #079FA0 35%, rgba(47,177,131,0) 60%, #2FB183);
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
                mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
        animation: slFabSpin 1.4s linear infinite; }
      .sl-fab-ripple { position: absolute; width: 58px; height: 58px; border-radius: 50%; border: 2px solid #2FB183;
        animation: slFabRipple 1.8s ease-out infinite; }
      .sl-fab-ripple.r2 { animation-delay: .9s; }
      .sl-fab[data-status="speaking"] .sl-fab-ripple { animation-duration: 1.1s; }
      .sl-fab[data-status="speaking"] .sl-fab-ripple.r2 { animation-delay: .55s; }
      .sl-fab[data-status="connecting"] .sl-fab-ripple { border-color: #079FA0; }
      .sl-fab-live { position: absolute; top: 4px; right: 4px; z-index: 2; width: 13px; height: 13px; border-radius: 50%;
        background: #22C55E; border: 2px solid #fff; pointer-events: none; animation: slFabBlink 1.2s ease-in-out infinite; }
      .sl-fab.sl-left .sl-fab-live { right: auto; left: 4px; }
      .sl-fab[data-muted="1"] .sl-fab-live { background: #DD8A0B; animation: none; }
      @keyframes slFabSpin { to { transform: rotate(360deg); } }
      @keyframes slFabRipple { 0% { transform: scale(1); opacity: .75; } 100% { transform: scale(1.6); opacity: 0; } /* 58px → 93px: stays inside the 16px screen margin */ }
      @keyframes slFabBlink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
      .sl-fab-btn { position: relative; width: 56px; height: 56px; padding: 2px; border-radius: 50%; cursor: pointer;
        border: 1.5px solid rgba(255,255,255,.6); background: linear-gradient(135deg,#079FA0,#2FB183);
        box-shadow: 0 10px 22px rgba(10,63,65,.32); transition: transform .15s; -webkit-tap-highlight-color: transparent; }
      .sl-fab-btn:active { transform: scale(.94); }
      .sl-fab-btn img { display: block; width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
      .sl-fab-panel { position: absolute; top: 6px; right: 64px; height: 52px; display: flex; align-items: center; gap: 8px; padding: 0 8px;
        border-radius: 26px; background: rgba(244,247,246,.97); border: 1px solid #DCE7E6; box-shadow: 0 8px 20px rgba(10,63,65,.22);
        transform-origin: right center; transform: translateX(18px) scale(.35); opacity: 0; pointer-events: none;
        transition: transform .22s cubic-bezier(.2,.9,.3,1.2), opacity .16s; }
      .sl-fab.sl-left .sl-fab-panel { right: auto; left: 64px; transform-origin: left center; transform: translateX(-18px) scale(.35); }
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
      .sl-fab[data-muted="1"] .sl-fab-mute { background: #DD8A0B; border-color: #DD8A0B; color: #fff; }
      .sl-fab-mute .sl-off { display: none; } .sl-fab[data-muted="1"] .sl-fab-mute .sl-on { display: none; } .sl-fab[data-muted="1"] .sl-fab-mute .sl-off { display: block; }
      .sl-fab-end { background: #C0392B; border-color: #C0392B; color: #fff; }
      @media (prefers-reduced-motion: reduce) { .sl-fab-ring, .sl-fab-ripple, .sl-fab-live, .sl-fab-eq span { animation: none; } .sl-fab-ripple { opacity: .5; transform: scale(1.2); } }
    `;
    document.head.appendChild(launcherStyle);

    const initialSide = launcherSide(pathRef.current);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sl-voice-launcher';
    btn.setAttribute('aria-label', 'Talk to SwiftLoan — voice guide');
    // Ruby sits flush at the left of the pill, full-bleed, so she reads as a
    // person you are about to talk to rather than an icon in a button.
    // right/left are set per-route below (and kept in sync on navigation by
    // the pathname effect above) rather than hardcoded here.
    btn.style.cssText =
      'position:fixed;bottom:22px;z-index:9999;display:flex;align-items:center;gap:10px;overflow:visible;' +
      'padding:8px 10px 8px 8px;border:none;border-radius:999px;font:600 14px system-ui,sans-serif;color:#fff;cursor:pointer;' +
      'box-shadow:0 12px 30px rgba(7,159,160,.42);background:linear-gradient(135deg,#079FA0,#2FB183);transition:transform .15s';
    btn.style.left = initialSide === 'left' ? '22px' : '';
    btn.style.right = initialSide === 'left' ? '' : '22px';
    btn.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathRef.current));
    // Ruby is a background-free cutout that rises above the pill on the left,
    // with a soft drop shadow so she stands off the page — matching the design.
    btn.innerHTML =
      '<img class="ruby-cut" src="/ruby.png" alt="Ruby, the SwiftLoan assistant" ' +
      'style="height:78px;width:auto;flex:none;align-self:flex-end;margin:-30px -2px -8px 0;pointer-events:none;' +
      'filter:drop-shadow(0 7px 9px rgba(0,0,0,.28))" />' +
      '<span class="sl-voice-text" style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15">' +
      '<span style="font-size:14px;font-weight:800">Talk to Ruby</span>' +
      '<span class="voice-label" style="font-size:11px;font-weight:500;opacity:.9">SwiftLoan assistant</span>' +
      '</span>' +
      '<span aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;' +
      'border-radius:50%;background:#fff;flex:none;margin-left:2px;box-shadow:0 2px 6px rgba(0,0,0,.15)">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none">' +
      '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.58 3.6a1 1 0 0 1-.24 1z" fill="#079FA0"/></svg>' +
      '</span>';
    const errBox = document.createElement('div');
    errBox.id = 'sl-voice-error';
    errBox.style.cssText =
      'position:fixed;bottom:78px;z-index:9999;max-width:280px;display:none;' +
      'padding:9px 12px;border-radius:10px;background:#fee9e7;color:#b42318;font:500 12.5px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.12)';
    errBox.style.left = initialSide === 'left' ? '22px' : '';
    errBox.style.right = initialSide === 'left' ? '' : '22px';
    errBox.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathRef.current));

    const LABELS: Record<string, string> = {
      idle: 'SwiftLoan assistant',
      connecting: 'Connecting…',
      listening: 'Listening…',
      speaking: 'Speaking…',
      executingTool: 'Working on it…',
      ended: 'SwiftLoan assistant',
    };
    agent.on('statusChange', (s: string) => {
      const active = s !== 'idle' && s !== 'ended';
      const label = btn.querySelector('.voice-label') as HTMLElement | null;
      if (label) label.textContent = LABELS[s] || 'SwiftLoan assistant';
      // Ruby's own ring signals listening/thinking now, so the pill no longer
      // turns alarm-red mid-conversation — that read as an error state.
      btn.style.background = active
        ? 'linear-gradient(135deg,#0B6E6F,#128f5b)'
        : 'linear-gradient(135deg,#079FA0,#2FB183)';
      if (agent.conversationId) agent.updatePageContext();
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

    btn.addEventListener('click', () => {
      if (btn.dataset.active === '1') {
        agent.stop();
        btn.dataset.active = '0';
      } else {
        agent.start();
        btn.dataset.active = '1';
      }
    });
    agent.on('statusChange', (s: string) => {
      btn.dataset.active = s !== 'idle' && s !== 'ended' ? '1' : '0';
    });

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        if (agent.conversationId) agent.updatePageContext();
      }, 700);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    const style = document.createElement('style');
    style.textContent =
      '@keyframes voicePulse{0%{opacity:1}50%{opacity:.45}100%{opacity:1}}' +
      '.voice-highlight{outline:3px solid rgba(7,159,160,.65)!important;outline-offset:4px;border-radius:12px;transition:outline .3s}';
    document.head.appendChild(style);

    document.body.appendChild(btn);
    document.body.appendChild(errBox);

    // ── Phones/tablets: app-style FAB (see CSS above) ───────────────────
    const fab = document.createElement('div');
    fab.className = 'sl-fab';
    fab.classList.toggle('sl-left', initialSide === 'left');
    fab.classList.toggle('sl-voice-above-bar', BOTTOM_BAR_ROUTES.includes(pathRef.current));
    fab.dataset.active = '0';
    fab.dataset.expanded = '0';
    fab.dataset.muted = '0';
    const icon = (d: string, cls = '') =>
      `<svg class="${cls}" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    fab.innerHTML =
      '<div class="sl-fab-status" aria-hidden="true"><i></i><span class="sl-fab-status-text">Connecting…</span></div>' +
      '<div class="sl-fab-zone">' +
      '<span class="sl-fab-ripple" aria-hidden="true"></span><span class="sl-fab-ripple r2" aria-hidden="true"></span>' +
      '<span class="sl-fab-ring" aria-hidden="true"></span>' +
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
      '<span class="sl-fab-live" aria-hidden="true"></span>' +
      '</div>';
    document.body.appendChild(fab);

    const fabBtn = fab.querySelector('.sl-fab-btn') as HTMLButtonElement;
    const fabStatus = fab.querySelector('.sl-fab-status-text') as HTMLElement;
    const fabTimer = fab.querySelector('.sl-fab-timer') as HTMLElement;
    const fabMute = fab.querySelector('.sl-fab-mute') as HTMLButtonElement;
    let callTimer: ReturnType<typeof setInterval> | null = null;
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
        setExpanded(true);
      } else if (!active && wasActive) {
        if (callTimer) clearInterval(callTimer);
        callTimer = null;
        fab.dataset.muted = '0';
        setExpanded(false);
      }
    });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
      agent.stop();
      agentRef.current = null;
      btn.remove();
      errBox.remove();
      fab.remove();
      if (callTimer) clearInterval(callTimer);
      style.remove();
      launcherStyle.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
