'use client';

import { useEffect } from 'react';
import { ElloAgent, fillInput } from '@/lib/ello-agent';

// SwiftLoan.ai voice co-pilot — a floating mic that lets a visitor navigate
// the site and fill the "check your rate" application form by voice. Ported
// from website/js/voice-widget.js.

const CONFIG = {
  apiKey: 'ak_txW3kjj3L-xpYACyvGn8K9ua9pvnHyYBaSeXc15H3DI.OASqN2c_yaFbkuYl',
  assistantId: '6a64d273a4fc43f6203cd3cc',
  apiBaseUrl: 'https://api-dev.getello.ai',
  wsUrl: 'wss://connect-dev.getello.ai/ws-ello',
};

interface SectionDef {
  id: string;
  label: string;
  aliases: string[];
}

const SECTIONS: SectionDef[] = [
  { id: 'top', label: 'Home / hero', aliases: ['home', 'top', 'start', 'hero', 'beginning'] },
  { id: 'services', label: 'Loan products', aliases: ['loans', 'products', 'loan types', 'services', 'personal loan', 'business loan'] },
  { id: 'how', label: 'How it works', aliases: ['how', 'how it works', 'process', 'steps'] },
  { id: 'ai', label: 'AI matching', aliases: ['ai', 'matching', 'ai matching', 'how matching works'] },
  { id: 'calculator', label: 'EMI calculator', aliases: ['calculator', 'emi', 'emi calculator', 'calculate', 'monthly payment'] },
  { id: 'track', label: 'Track application', aliases: ['track', 'track application', 'status', 'my application'] },
  { id: 'partners', label: 'Partners', aliases: ['partners', 'lenders', 'lending partners', 'become a partner'] },
  { id: 'security', label: 'Security', aliases: ['security', 'safe', 'safety', 'data'] },
  { id: 'compliance', label: 'Compliance', aliases: ['compliance', 'rbi', 'regulation', 'legal'] },
  { id: 'reviews', label: 'Reviews', aliases: ['reviews', 'testimonials', 'ratings', 'what people say'] },
  { id: 'apply', label: 'Apply / check your rate', aliases: ['apply', 'check my rate', 'check your rate', 'get started', 'eligibility', 'form', 'application'] },
  { id: 'faq', label: 'FAQ', aliases: ['faq', 'faqs', 'questions', 'frequently asked'] },
];

export default function VoiceWidget() {
  useEffect(() => {
    const el = (id: string) => document.getElementById(id);

    function resolveSection(q: string): string | null {
      q = (q || '').toLowerCase().trim();
      const direct = SECTIONS.find((s) => s.id === q || s.aliases.indexOf(q) >= 0);
      if (direct) return direct.id;
      const fuzzy = SECTIONS.find(
        (s) => s.aliases.some((a) => a.indexOf(q) >= 0 || q.indexOf(a) >= 0) || s.label.toLowerCase().indexOf(q) >= 0
      );
      return fuzzy ? fuzzy.id : null;
    }

    function currentSectionId(): string {
      const mid = window.innerHeight / 2;
      let best = 'top';
      let bestDist = Infinity;
      SECTIONS.forEach((s) => {
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
    (window as unknown as { __swiftloanVoice: ElloAgent }).__swiftloanVoice = agent;

    agent.registerPageContext(() => {
      const sid = currentSectionId();
      const sec = SECTIONS.find((s) => s.id === sid);
      const loanTypeEl = el('loanType') as HTMLSelectElement | null;
      return {
        site: 'SwiftLoan.ai — a digital lending marketplace that matches borrowers to the right lender',
        currentSection: { id: sid, label: sec ? sec.label : sid },
        sections: SECTIONS.map((s) => ({ id: s.id, label: s.label })),
        loanProducts: ['Personal Loan', 'Business Loan'],
        alreadyFilled: {
          name: (el('fullName') as HTMLInputElement | null)?.value || null,
          phone: (el('phone') as HTMLInputElement | null)?.value || null,
          email: (el('email') as HTMLInputElement | null)?.value || null,
          city: (el('city') as HTMLInputElement | null)?.value || null,
          loan_type: loanTypeEl?.value || null,
          amount: (el('loanAmount') as HTMLInputElement | null)?.value || null,
          consent: (el('consent') as HTMLInputElement | null)?.checked || false,
        },
        interactionGuide: {
          role:
            "You are SwiftLoan.ai's voice guide. Warmly help visitors understand the products, navigate the page, and check their loan eligibility by filling the application form hands-free.",
          behaviour: [
            "Greet the visitor, say which section they're on, and ask what kind of loan they need.",
            'When they express interest, CALL go_to_section to take them there, then describe it.',
            'Offer to fill the "Check your rate" form by voice — name, phone, email, city, loan type, amount — one field at a time.',
            'Only submit after the visitor gives explicit consent to be contacted.',
            'Never ask the visitor to speak passwords, OTPs, PAN, Aadhaar, or any security codes.',
          ],
        },
      };
    });

    agent.registerTool({
      name: 'go_to_section',
      description:
        "Navigate the page to a section the user asks for — e.g. 'show me the loan products', 'open the EMI calculator', 'take me to apply', 'go to FAQ'. Use ids/aliases from the page context's sections list.",
      schema: { type: 'object', properties: { section: { type: 'string', description: 'section the user asked for' } }, required: ['section'] },
      handler: (a: { section: string }) => {
        const id = resolveSection(a.section);
        if (!id) return { success: false, reason: 'Unknown section "' + a.section + '"' };
        return { success: scrollToId(id), openedSection: id };
      },
    });

    agent.registerTool({
      name: 'fill_name',
      description: 'Call immediately when the user states their full name for the application.',
      schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      handler: (a: { name: string }) => {
        scrollToId('apply');
        return fillInput('#fullName', a.name);
      },
    });
    agent.registerTool({
      name: 'fill_phone',
      description: 'Call immediately when the user states their phone number. Digits only, optional leading +.',
      schema: { type: 'object', properties: { phone: { type: 'string' } }, required: ['phone'] },
      handler: (a: { phone: string }) => fillInput('#phone', a.phone),
    });
    agent.registerTool({
      name: 'fill_email',
      description: 'Call when the user states their email address.',
      schema: { type: 'object', properties: { email: { type: 'string' } }, required: ['email'] },
      handler: (a: { email: string }) => fillInput('#email', a.email),
    });
    agent.registerTool({
      name: 'fill_city',
      description: 'Call when the user states their city.',
      schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
      handler: (a: { city: string }) => fillInput('#city', a.city),
    });
    agent.registerTool({
      name: 'select_loan_type',
      description: "Call when the user says which loan they want. Must be 'Personal Loan' or 'Business Loan'.",
      schema: { type: 'object', properties: { loan_type: { type: 'string', enum: ['Personal Loan', 'Business Loan'] } }, required: ['loan_type'] },
      handler: (a: { loan_type: string }) => fillInput('#loanType', a.loan_type),
    });
    agent.registerTool({
      name: 'set_loan_amount',
      description: 'Call when the user states how much they want to borrow (a number in rupees).',
      schema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'] },
      handler: (a: { amount: number }) => fillInput('#loanAmount', String(a.amount)),
    });
    agent.registerTool({
      name: 'give_consent',
      description: 'Call ONLY when the user explicitly agrees to be contacted about their enquiry.',
      schema: { type: 'object', properties: {} },
      handler: () => {
        const c = el('consent') as HTMLInputElement | null;
        if (!c) return { success: false, reason: 'consent checkbox not found' };
        if (!c.checked) c.click();
        return { success: true };
      },
    });
    agent.registerTool({
      name: 'submit_application',
      description: 'Call when the user confirms they want to submit the application (after name, phone and consent are set).',
      schema: { type: 'object', properties: {} },
      requiresConfirmation: true,
      confirmationMessage: 'Submit your rate check now?',
      handler: () => {
        const btn = el('leadSubmit') as HTMLButtonElement | null;
        if (!btn) return { success: false, reason: 'submit button not found' };
        btn.click();
        return { success: true };
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
      btn.remove();
      errBox.remove();
      style.remove();
    };
  }, []);

  return null;
}
