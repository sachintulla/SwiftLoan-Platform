'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ElloAgent, fillInput } from '@/lib/ello-agent';
import { faqsCopy } from '@/i18n/faqs';
import { createRoot, type Root } from 'react-dom/client';
import { RubyLive } from '@/components/Ruby';

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
  sessionUrl: process.env.NEXT_PUBLIC_API_BASE || 'https://swiftloan-api.onrender.com',
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
  const consent = document.querySelector('#lead-form input[type="checkbox"]') as HTMLInputElement | null;
  return {
    name: f('fullName'),
    phone: f('mobile'),
    email: f('email'),
    city: f('city'),
    loan_type: f('loanType'),
    amount: f('amount'),
    consent: consent?.checked ?? false,
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

export default function VoiceWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const pathRef = useRef(pathname);
  const agentRef = useRef<ElloAgent | null>(null);

  // Keep the live route in a ref so tool handlers (registered once) always
  // act on the current page, and nudge the assistant's context on navigation.
  useEffect(() => {
    pathRef.current = pathname;
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

      // In development, say so on the page too. A console warning is invisible
      // unless devtools happen to be open, so a missing .env.local silently
      // removes the whole voice experience and looks like it was never built.
      if (process.env.NODE_ENV === 'development') {
        const note = document.createElement('div');
        note.dataset.voiceDisabledNotice = '1';
        note.style.cssText =
          'position:fixed;right:22px;bottom:22px;z-index:9999;max-width:300px;padding:11px 14px;' +
          'border-radius:12px;background:#fff4e5;border:1px solid #ffd8a8;color:#8a4b00;' +
          'font:500 12.5px/1.5 system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.12)';
        note.textContent =
          'Voice widget disabled — NEXT_PUBLIC_API_BASE not set. Copy .env.local.example to .env.local and restart.';
        document.body.appendChild(note);
        return () => note.remove();
      }
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
            // for contact details. Asking for a phone number first reads like a
            // sales capture and is where people drop out.
            'Offer to fill the "Check your rate" form by voice, asking ONE field at a time IN THIS ORDER: 1) how much they need (set_loan_amount), 2) full name (fill_name), 3) city (fill_city), 4) mobile number (fill_phone), 5) email (fill_email). Confirm each value back before moving on.',
            'As soon as they mention personal or business — even in passing, before you reach the amount — CALL select_loan_type immediately so the dropdown matches what they said.',
            'Never re-ask for something already present in alreadyFilled; read it back to confirm instead.',
            'Only submit after the visitor gives explicit consent to be contacted.',
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

    // ── Lead / "check your rate" form (home only) ─────────────────────
    // Gate for every lead-form tool. This checked `#leadForm`, which the
    // redesign renamed to the `#lead-form` SECTION — so availableWhen returned
    // false and the agent was never offered fill_name/fill_phone/submit at all.
    // That is why it could hear the request and do nothing: the tools were not
    // absent-but-broken, they were simply never advertised.
    const homeOnly = () => !!document.getElementById('lead-form');

    agent.registerTool({
      name: 'fill_name',
      description: 'Call immediately when the user states their full name for the application.',
      schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      availableWhen: homeOnly,
      handler: (a: { name: string }) => {
        scrollToId('lead-form');
        return fillInput('[name="fullName"]', a.name);
      },
    });
    agent.registerTool({
      name: 'fill_phone',
      description: 'Call immediately when the user states their phone number. Digits only, optional leading +.',
      schema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
      availableWhen: homeOnly,
      handler: (a: { phone: string }) => fillInput('[name="mobile"]', a.phone),
    });
    agent.registerTool({
      name: 'fill_email',
      description: 'Call when the user states their email address.',
      schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
      availableWhen: homeOnly,
      handler: (a: { email: string }) => fillInput('[name="email"]', a.email),
    });
    agent.registerTool({
      name: 'fill_city',
      description: 'Call when the user states their city.',
      schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      availableWhen: homeOnly,
      handler: (a: { city: string }) => fillInput('[name="city"]', a.city),
    });
    agent.registerTool({
      name: 'select_loan_type',
      description: "Call as soon as the user says which loan they want — e.g. 'personal', 'a business loan', 'for my shop'. Sets the loan type on the APPLICATION FORM.",
      schema: { type: 'object', properties: { loan_type: { type: 'string', enum: ['Personal Loan', 'Business Loan'] } }, required: ['loan_type'] },
      availableWhen: homeOnly,
      /**
       * Resolved against the <option> VALUES, not the spoken text.
       *
       * Passing the raw phrase to fillInput failed silently: an option's value
       * is now a stable English key, while its label is translated, and the
       * agent may say "personal", "Personal Loan" or the Hindi word. A select
       * whose value does not match any option just stays unselected — no error,
       * no feedback, which is why this looked like the agent "not doing
       * anything". Match loosely here and report failure honestly.
       */
      handler: (a: { loan_type: string }) => {
        const sel = document.querySelector('#lead-form [name="loanType"]') as HTMLSelectElement | null;
        if (!sel) return { success: false, reason: 'loan type field not found' };

        const said = (a.loan_type || '').toLowerCase();
        const wantBusiness = /business|vyapar|व्यापार|వ్యాపార|shop|company|firm|msme/.test(said);
        const want = wantBusiness ? 'Business Loan' : 'Personal Loan';

        const option = Array.from(sel.options).find(
          (o) => o.value === want || o.text.toLowerCase() === said,
        );
        if (!option) return { success: false, reason: `no option for "${a.loan_type}"` };

        const res = fillInput('#lead-form [name="loanType"]', option.value);
        return res.success ? { success: true, selected: option.value } : res;
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
      name: 'give_consent',
      description: 'Call ONLY when the user explicitly agrees to be contacted about their enquiry.',
      schema: { type: 'object', properties: {} },
      availableWhen: homeOnly,
      handler: () => {
        const c = document.querySelector('#lead-form input[type="checkbox"]') as HTMLInputElement | null;
        if (!c) return { success: false, reason: 'consent checkbox not found' };
        if (!c.checked) c.click();
        return { success: true };
      },
    });
    agent.registerTool({
      name: 'submit_application',
      // No requiresConfirmation / on-screen popup here on purpose — this is a
      // voice-first flow, so the ASSISTANT must ask "shall I submit this now?"
      // out loud and wait for a spoken yes (see the system prompt's behaviour
      // rules) before ever calling this tool. Once called, it submits immediately.
      description:
        "Call ONLY after the visitor has verbally confirmed out loud that they want to submit (e.g. said \"yes\", \"go ahead\", \"submit it\") in response to you asking them. Requires name, phone and consent to already be set.",
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Talk to SwiftLoan — voice guide');
    // Ruby sits flush at the left of the pill, full-bleed, so she reads as a
    // person you are about to talk to rather than an icon in a button.
    btn.style.cssText =
      'position:fixed;right:22px;bottom:22px;z-index:9999;display:flex;align-items:center;gap:11px;' +
      'padding:6px 20px 6px 6px;border:none;border-radius:999px;font:600 14px system-ui,sans-serif;color:#fff;cursor:pointer;' +
      'box-shadow:0 10px 28px rgba(7,159,160,.4);background:linear-gradient(135deg,#079FA0,#2FB183);transition:transform .15s';
    btn.innerHTML =
      '<span class="ruby-slot" style="display:block;width:52px;height:52px;border-radius:50%;overflow:hidden;flex:none;box-shadow:0 2px 8px rgba(0,0,0,.18)"></span>' +
      '<span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.15">' +
      '<span style="font-size:13.5px;font-weight:700">Talk to Ruby</span>' +
      '<span class="voice-label" style="font-size:11px;font-weight:500;opacity:.9">SwiftLoan assistant</span>' +
      '</span>';
    const errBox = document.createElement('div');
    errBox.style.cssText =
      'position:fixed;right:22px;bottom:78px;z-index:9999;max-width:280px;display:none;' +
      'padding:9px 12px;border-radius:10px;background:#fee9e7;color:#b42318;font:500 12.5px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.12)';

    // Mount Ruby into the launcher. She subscribes to the agent herself and
    // animates from the real output level, so nothing here drives her per-frame.
    const rubySlot = btn.querySelector('.ruby-slot') as HTMLElement | null;
    let rubyRoot: Root | null = null;
    if (rubySlot) {
      rubyRoot = createRoot(rubySlot);
      rubyRoot.render(<RubyLive agent={agent as unknown as { getOutputLevel: () => number; on: (e: string, f: (p: never) => void) => void }} size={52} />);
    }

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
      setTimeout(() => {
        errBox.style.display = 'none';
      }, 6000);
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

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
      agent.stop();
      agentRef.current = null;
      // Unmount Ruby before removing her host node. Detaching the DOM first
      // leaves the React root pointing at an orphan and warns in dev.
      if (rubyRoot) {
        const r = rubyRoot;
        // Deferred: React refuses to unmount synchronously while rendering.
        setTimeout(() => r.unmount(), 0);
      }
      btn.remove();
      errBox.remove();
      style.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
