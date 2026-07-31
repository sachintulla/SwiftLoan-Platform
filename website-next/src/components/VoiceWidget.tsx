'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ElloAgent, fillInput } from '@/lib/ello-agent';

// SwiftLoan.ai voice co-pilot — a floating mic that lets a visitor navigate
// the ENTIRE site (home, compliance, brand, logo) and operate every
// interactive control by voice: the EMI calculator, the application tracker,
// the "check your rate" lead form, the FAQ accordion, and the EN/HI language
// toggle. Mounted once in the root layout so the live call survives
// client-side route changes (the agent/WebSocket connection is not torn down
// when the visitor navigates between pages).

const CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_ELLO_API_KEY || '',
  assistantId: process.env.NEXT_PUBLIC_ELLO_ASSISTANT_ID || '',
  apiBaseUrl: process.env.NEXT_PUBLIC_ELLO_API_BASE || 'https://api-dev.getello.ai',
  wsUrl: process.env.NEXT_PUBLIC_ELLO_WS_URL || 'wss://connect-dev.getello.ai/ws-ello',
};

interface SectionDef {
  id: string;
  label: string;
  aliases: string[];
}

// Sections scrollable-to on the homepage ("/").
const HOME_SECTIONS: SectionDef[] = [
  { id: 'top', label: 'Home / hero', aliases: ['home', 'top', 'start', 'hero', 'beginning'] },
  { id: 'services', label: 'Loan products', aliases: ['loans', 'products', 'loan types', 'services', 'personal loan', 'business loan'] },
  { id: 'how', label: 'How it works', aliases: ['how', 'how it works', 'process', 'steps'] },
  { id: 'ai', label: 'AI matching', aliases: ['ai', 'matching', 'ai matching', 'how matching works'] },
  { id: 'calculator', label: 'EMI calculator', aliases: ['calculator', 'emi', 'emi calculator', 'calculate', 'monthly payment'] },
  { id: 'track', label: 'Track application', aliases: ['track', 'track application', 'status', 'my application'] },
  { id: 'partners', label: 'Partners', aliases: ['partners', 'lenders', 'lending partners', 'become a partner'] },
  { id: 'security', label: 'Security', aliases: ['security', 'safe', 'safety', 'data'] },
  { id: 'compliance', label: 'Compliance (summary)', aliases: ['compliance', 'rbi', 'regulation', 'legal'] },
  { id: 'reviews', label: 'Reviews', aliases: ['reviews', 'testimonials', 'ratings', 'what people say'] },
  { id: 'apply', label: 'Apply / check your rate', aliases: ['apply', 'check my rate', 'check your rate', 'get started', 'eligibility', 'form', 'application'] },
  { id: 'faq', label: 'FAQ', aliases: ['faq', 'faqs', 'questions', 'frequently asked'] },
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
  compliance: { path: '/compliance', label: 'Compliance & policies', aliases: ['compliance', 'compliance page', 'policies', 'legal', 'rbi disclosures'] },
  brand: { path: '/brand', label: 'Brand showcase', aliases: ['brand', 'brand page', 'brand identity', 'brand guidelines'] },
  logo: { path: '/logo', label: 'Logo assets', aliases: ['logo', 'logo page', 'logo assets'] },
};

interface FaqItem {
  question: string;
  answer: string;
}

// Mirrors the 7 <details class="faq__item"> entries in src/app/page.tsx —
// keep in the same order so index-based DOM lookup stays correct.
const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Does SwiftLoan.ai lend money directly?',
    answer:
      'No. SwiftLoan.ai is a loan aggregation and matchmaking platform. We use technology to match you with RBI-registered banks and NBFCs who do the actual lending. The final loan agreement is always between you and the lender.',
  },
  {
    question: 'Will checking my eligibility affect my credit score?',
    answer:
      'No. Our initial eligibility check uses a "soft pull" which is not visible to other lenders and does not impact your credit score. A "hard pull" only happens later, with your explicit consent, when you proceed with a specific lender.',
  },
  {
    question: 'How long does approval and disbursal take?',
    answer:
      'Matching and indicative offers are instant. Once you pick an offer and complete eKYC, many of our partners approve and disburse within a few hours to 2 working days, depending on the loan type and verification.',
  },
  {
    question: 'What documents will I need?',
    answer:
      'Typically your PAN, Aadhaar (for eKYC), and bank statements or GST returns for business loans. Most verification is paperless via DigiLocker and Account Aggregator — you rarely need to upload anything manually.',
  },
  {
    question: 'Are there any charges to use SwiftLoan.ai?',
    answer:
      'Using SwiftLoan.ai to check eligibility and compare offers is free for borrowers. Lenders may charge processing fees on the loan you accept — these are always shown transparently before you commit.',
  },
  {
    question: 'Is my personal data safe?',
    answer:
      "Yes. We use 256-bit encryption, follow a consent-first model via the RBI's Account Aggregator framework, and never sell your data. You can revoke consent or request deletion at any time.",
  },
  {
    question: 'What if I have a low credit score?',
    answer:
      "Because we match across many lenders with different credit criteria, you may still find offers even with a limited or lower score. We rank options by your real likelihood of approval — but approval and final terms are always at the lender's discretion.",
  },
];

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

function readCalculator() {
  const t = (id: string) => document.getElementById(id)?.textContent ?? null;
  return {
    amount: t('amountOut'),
    rate: t('rateOut'),
    tenure: t('tenureOut'),
    emi: t('emiOut'),
    principal: t('principalOut'),
    interest: t('interestOut'),
    total: t('totalOut'),
  };
}

function readTracker() {
  const empty = document.getElementById('trackerEmpty') as HTMLElement | null;
  const found = !!empty && empty.hidden;
  const t = (id: string) => document.getElementById(id)?.textContent ?? null;
  return {
    found,
    applicationId: t('tkId'),
    type: t('tkType'),
    amount: t('tkAmount'),
    status: t('tkFoot'),
    stepsCount: document.getElementById('tkSteps')?.children.length ?? 0,
  };
}

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
    if (!CONFIG.apiKey || !CONFIG.assistantId) {
      console.warn('[VoiceWidget] NEXT_PUBLIC_ELLO_API_KEY/ASSISTANT_ID not set — voice widget disabled.');
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
      apiKey: CONFIG.apiKey,
      assistantId: CONFIG.assistantId,
      apiBaseUrl: CONFIG.apiBaseUrl,
      wsUrl: CONFIG.wsUrl,
      debug: window.location.hostname === 'localhost' || window.location.search.indexOf('voicedebug') >= 0,
    });
    agentRef.current = agent;
    (window as unknown as { __swiftloanVoice: ElloAgent }).__swiftloanVoice = agent;

    agent.registerPageContext(() => {
      const sid = currentSectionId();
      const sections = sectionsForCurrentPage();
      const sec = sections.find((s) => s.id === sid);
      const loanTypeEl = el('loanType') as HTMLSelectElement | null;
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
        faqQuestions: FAQ_ITEMS.map((f) => f.question),
        alreadyFilled: isHome()
          ? {
              name: (el('fullName') as HTMLInputElement | null)?.value || null,
              phone: (el('phone') as HTMLInputElement | null)?.value || null,
              email: (el('email') as HTMLInputElement | null)?.value || null,
              city: (el('city') as HTMLInputElement | null)?.value || null,
              loan_type: loanTypeEl?.value || null,
              amount: (el('loanAmount') as HTMLInputElement | null)?.value || null,
              consent: (el('consent') as HTMLInputElement | null)?.checked || false,
            }
          : null,
        calculator: isHome() ? readCalculator() : null,
        tracker: isHome() ? readTracker() : null,
        interactionGuide: {
          role:
            "You are SwiftLoan.ai's voice guide. Warmly help visitors understand the products, navigate the whole site (home, compliance, brand, logo pages), operate the EMI calculator and application tracker, answer FAQs, switch language, and check their loan eligibility by filling the application form hands-free.",
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
            'Offer to fill the "Check your rate" form by voice — name, phone, email, city, loan type, amount — one field at a time.',
            'Only submit after the visitor gives explicit consent to be contacted.',
            'For EMI questions, CALL set_calculator with the amount/rate/tenure they mention and read back the emi/total from the result.',
            'For "track my application", CALL track_application with their ID, or use_demo_track for the demo IDs SL-2048 / SL-3110.',
            'For FAQ-style questions, CALL answer_faq with their question — use the returned answer text to reply, and it will also open the matching FAQ item on screen.',
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
    const homeOnly = () => !!el('leadForm');

    agent.registerTool({
      name: 'fill_name',
      description: 'Call immediately when the user states their full name for the application.',
      schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      availableWhen: homeOnly,
      handler: (a: { name: string }) => {
        scrollToId('apply');
        return fillInput('#fullName', a.name);
      },
    });
    agent.registerTool({
      name: 'fill_phone',
      description: 'Call immediately when the user states their phone number. Digits only, optional leading +.',
      schema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
      availableWhen: homeOnly,
      handler: (a: { phone: string }) => fillInput('#phone', a.phone),
    });
    agent.registerTool({
      name: 'fill_email',
      description: 'Call when the user states their email address.',
      schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
      availableWhen: homeOnly,
      handler: (a: { email: string }) => fillInput('#email', a.email),
    });
    agent.registerTool({
      name: 'fill_city',
      description: 'Call when the user states their city.',
      schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      availableWhen: homeOnly,
      handler: (a: { city: string }) => fillInput('#city', a.city),
    });
    agent.registerTool({
      name: 'select_loan_type',
      description: "Call when the user says which loan they want for the APPLICATION FORM. Must be 'Personal Loan' or 'Business Loan'.",
      schema: { type: 'object', properties: { loan_type: { type: 'string', enum: ['Personal Loan', 'Business Loan'] } }, required: ['loan_type'] },
      availableWhen: homeOnly,
      handler: (a: { loan_type: string }) => fillInput('#loanType', a.loan_type),
    });
    agent.registerTool({
      name: 'set_loan_amount',
      description: 'Call when the user states how much they want to borrow on the APPLICATION FORM (a number in rupees). For "what would my EMI be", use set_calculator instead.',
      schema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
      availableWhen: homeOnly,
      handler: (a: { amount: number }) => fillInput('#loanAmount', String(a.amount)),
    });
    agent.registerTool({
      name: 'give_consent',
      description: 'Call ONLY when the user explicitly agrees to be contacted about their enquiry.',
      schema: { type: 'object', properties: {} },
      availableWhen: homeOnly,
      handler: () => {
        const c = el('consent') as HTMLInputElement | null;
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
        const btn = el('leadSubmit') as HTMLButtonElement | null;
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
    const calculatorAvailable = () => !!el('amount');

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
        if (a.amount != null) fillInput('#amount', String(a.amount));
        if (a.rate != null) fillInput('#rate', String(a.rate));
        if (a.tenure != null) fillInput('#tenure', String(a.tenure));
        scrollToId('calculator');
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

    // ── Application tracker (home only) ─────────────────────────────────
    const trackerAvailable = () => !!el('trackForm');

    agent.registerTool({
      name: 'track_application',
      description: "Look up an application by its reference ID (e.g. 'SL-2048') that the user gives, and report back its status.",
      schema: { type: 'object', properties: { app_id: { type: 'string' } }, required: ['app_id'] },
      availableWhen: trackerAvailable,
      handler: (a: { app_id: string }) => {
        scrollToId('track');
        fillInput('#appId', a.app_id);
        const form = el('trackForm') as HTMLFormElement | null;
        form?.requestSubmit ? form.requestSubmit() : form?.dispatchEvent(new Event('submit', { cancelable: true }));
        return { success: true, result: readTracker() };
      },
    });
    agent.registerTool({
      name: 'use_demo_track',
      description: "Show one of the two demo application statuses when the user wants to see an example — SL-2048 (personal loan, mid-flow) or SL-3110 (business loan, fully disbursed).",
      schema: { type: 'object', properties: { demo_id: { type: 'string', enum: ['SL-2048', 'SL-3110'] } }, required: ['demo_id'] },
      availableWhen: trackerAvailable,
      handler: (a: { demo_id: string }) => {
        scrollToId('track');
        const btn = document.querySelector(`[data-demo="${a.demo_id}"]`) as HTMLButtonElement | null;
        if (!btn) return { success: false, reason: 'demo button not found' };
        btn.click();
        return { success: true, result: readTracker() };
      },
    });

    // ── Language toggle ─────────────────────────────────────────────────
    agent.registerTool({
      name: 'set_language',
      description: "Switch the site's display language. English or Hindi.",
      schema: { type: 'object', properties: { language: { type: 'string', enum: ['English', 'Hindi'] } }, required: ['language'] },
      availableWhen: () => !!document.querySelector('.langtoggle__btn[data-lang]'),
      handler: (a: { language: string }) => {
        const code = a.language.toLowerCase().startsWith('hi') ? 'HI' : 'EN';
        const btn = document.querySelector(`.langtoggle__btn[data-lang="${code}"]`) as HTMLButtonElement | null;
        if (!btn) return { success: false, reason: 'language toggle not found' };
        btn.click();
        return { success: true, language: code };
      },
    });

    // ── FAQ ──────────────────────────────────────────────────────────────
    agent.registerTool({
      name: 'answer_faq',
      description:
        'Answer a question about SwiftLoan.ai using the FAQ list (lending model, credit score impact, approval time, documents, charges, data safety, low credit score). Pass the user\'s question; the closest FAQ match is opened on screen and its answer text is returned for you to speak.',
      schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
      availableWhen: () => !!document.getElementById('faqList'),
      handler: (a: { question: string }) => {
        const q = (a.question || '').toLowerCase();
        let bestIdx = -1;
        let bestScore = 0;
        FAQ_ITEMS.forEach((item, i) => {
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
        const items = document.querySelectorAll('#faqList .faq__item');
        items.forEach((it, i) => {
          (it as HTMLDetailsElement).open = i === bestIdx;
        });
        const node = items[bestIdx] as HTMLElement | undefined;
        if (node) {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' });
          highlight(node);
        }
        return { success: true, question: FAQ_ITEMS[bestIdx].question, answer: FAQ_ITEMS[bestIdx].answer };
      },
    });

    // ── Floating mic button ──────────────────────────────────────────────
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Talk to SwiftLoan — voice guide');
    btn.style.cssText =
      'position:fixed;right:22px;bottom:22px;z-index:9999;display:flex;align-items:center;gap:9px;' +
      'padding:13px 19px;border:none;border-radius:999px;font:600 14px system-ui,sans-serif;color:#fff;cursor:pointer;' +
      'box-shadow:0 10px 28px rgba(7,159,160,.4);background:linear-gradient(135deg,#079FA0,#2FB183);transition:transform .15s';
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4M8 22h8"/></svg><span class="voice-label">Talk to us</span>';
    const errBox = document.createElement('div');
    errBox.style.cssText =
      'position:fixed;right:22px;bottom:78px;z-index:9999;max-width:280px;display:none;' +
      'padding:9px 12px;border-radius:10px;background:#fee9e7;color:#b42318;font:500 12.5px system-ui,sans-serif;box-shadow:0 6px 18px rgba(0,0,0,.12)';

    const LABELS: Record<string, string> = {
      idle: 'Talk to us',
      connecting: 'Connecting…',
      listening: 'Listening…',
      speaking: 'Speaking…',
      executingTool: 'Working…',
      ended: 'Talk to us',
    };
    agent.on('statusChange', (s: string) => {
      const active = s !== 'idle' && s !== 'ended';
      const label = btn.querySelector('.voice-label') as HTMLElement | null;
      if (label) label.textContent = LABELS[s] || 'Talk to us';
      btn.style.background = active ? 'linear-gradient(135deg,#F04438,#F79009)' : 'linear-gradient(135deg,#079FA0,#2FB183)';
      const svg = btn.querySelector('svg') as SVGElement | null;
      if (svg) svg.style.animation = active ? 'voicePulse 1.4s infinite' : '';
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
      btn.remove();
      errBox.remove();
      style.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
