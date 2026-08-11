'use client';

import { useEffect, useRef } from 'react';
import { emiBreakdown, fmtINR, validateField, amountBounds, lookupApp, makeRefId, TrackedApp } from '@/lib/core';
import { upshotIdentify, upshotEvent } from '@/components/UpshotWeb';
import { dict } from '@/lib/i18n-legacy';

// Imperative port of website/js/main.js. Deliberately querySelector-style
// (not idiomatic React) to keep the DOM wiring mechanically identical to the
// original, with a full cleanup function so it survives StrictMode's
// double-invoke of effects in development.
export default function SiteScripts() {
  const curLangRef = useRef<'EN' | 'HI'>('EN');

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const on = <T extends EventTarget>(t: T, ev: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
      t.addEventListener(ev, fn, opts);
      cleanups.push(() => t.removeEventListener(ev, fn, opts));
    };

    const $ = <T extends Element = Element>(s: string, c: ParentNode = document): T | null => c.querySelector<T>(s);
    const $$ = <T extends Element = Element>(s: string, c: ParentNode = document): T[] => Array.from(c.querySelectorAll<T>(s));

    /* ---------- year ---------- */
    const yearEl = $('#year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    /* ---------- nav: scroll shadow + back-to-top ---------- */
    const nav = $('#nav');
    const toTop = $('#toTop');
    const onScroll = () => {
      const y = window.scrollY;
      if (nav) nav.classList.toggle('scrolled', y > 10);
      if (toTop) toTop.classList.toggle('show', y > 600);
    };
    on(window, 'scroll', onScroll, { passive: true });
    onScroll();
    if (toTop) on(toTop, 'click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    /* ---------- mobile menu ---------- */
    const navToggle = $('#navToggle');
    const navLinks = $('#navLinks');
    const toggleMenu = (open?: boolean) => {
      if (!navLinks || !nav || !navToggle) return;
      const willOpen = open ?? !navLinks.classList.contains('open');
      navLinks.classList.toggle('open', willOpen);
      nav.classList.toggle('menu-open', willOpen);
      navToggle.setAttribute('aria-expanded', String(willOpen));
      document.body.style.overflow = willOpen ? 'hidden' : '';
    };
    if (navToggle && navLinks) {
      on(navToggle, 'click', () => toggleMenu());
      $$('a', navLinks).forEach((a) => on(a, 'click', () => toggleMenu(false)));
    }

    /* ---------- language toggle (EN / HI) with live translation ---------- */
    const applyLang = (lang: string) => {
      curLangRef.current = lang === 'HI' ? 'HI' : 'EN';
      document.documentElement.setAttribute('lang', curLangRef.current === 'HI' ? 'hi' : 'en');
      const table = lang === 'HI' ? dict.hi : dict.en;
      $$('[data-i18n]').forEach((elx) => {
        const key = elx.getAttribute('data-i18n');
        if (!key) return;
        const val = table[key] ?? dict.en[key];
        if (val != null) {
          const icon = elx.querySelector(':scope > .msi');
          if (icon) {
            let iconFirst = true;
            for (const node of Array.from(elx.childNodes)) {
              if (node === icon) break;
              if (node.nodeType === 3 && (node.textContent || '').trim()) {
                iconFirst = false;
                break;
              }
            }
            Array.from(elx.childNodes).forEach((n) => {
              if (n.nodeType === 3) elx.removeChild(n);
            });
            if (iconFirst) elx.insertAdjacentText('beforeend', ' ' + val);
            else elx.insertAdjacentText('afterbegin', val + ' ');
          } else {
            elx.textContent = val;
          }
        }
      });
      $$('[data-i18n-ph]').forEach((elx) => {
        const key = elx.getAttribute('data-i18n-ph');
        if (!key) return;
        const val = table[key] ?? dict.en[key];
        if (val != null) elx.setAttribute('placeholder', val);
      });
    };
    $$('.langtoggle__btn').forEach((btn) => {
      on(btn, 'click', () => {
        $$('.langtoggle__btn').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        applyLang(btn.getAttribute('data-lang') || 'EN');
      });
    });

    /* ---------- scroll reveal ---------- */
    const revealTargets = [
      '.section__head', '.svc-card', '.journey__step', '.ai__feat', '.ai__panel',
      '.sec-card', '.review', '.partners__col', '.stat', '.calc', '.tracker',
      '.apply__form', '.faq__item', '.logostrip',
    ];
    const revealEls = $$(revealTargets.join(','));
    revealEls.forEach((elx, i) => {
      elx.classList.add('reveal');
      (elx as HTMLElement).style.transitionDelay = (i % 4) * 60 + 'ms';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach((elx) => io.observe(elx));
    cleanups.push(() => io.disconnect());

    /* ---------- animated stat counters ---------- */
    const animateCount = (elx: Element) => {
      const target = +(elx.getAttribute('data-count') || '0');
      const suffix = elx.getAttribute('data-suffix') || '';
      const dur = 1600;
      const start = performance.now();
      const step = (now: number) => {
        const p = Math.min((now - start) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target * eased;
        let out: string;
        if (elx.getAttribute('data-count') === '2400') out = '₹' + Math.round(val).toLocaleString('en-IN');
        else out = Math.round(val).toLocaleString('en-IN');
        elx.textContent = out + (p === 1 ? suffix : '');
        if (p < 1) requestAnimationFrame(step);
        else elx.textContent = out + suffix;
      };
      requestAnimationFrame(step);
    };
    const statIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animateCount(e.target);
          statIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.5 });
    $$('.stat__num').forEach((elx) => statIO.observe(elx));
    cleanups.push(() => statIO.disconnect());

    /* ---------- match list stagger ---------- */
    const matchIO = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          $$('.match-row', e.target).forEach((row, i) => {
            setTimeout(() => row.classList.add('in'), 250 + i * 220);
          });
          matchIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    const matchList = $('#matchList');
    if (matchList) matchIO.observe(matchList);
    cleanups.push(() => matchIO.disconnect());

    /* ---------- EMI CALCULATOR ---------- */
    const amount = $<HTMLInputElement>('#amount');
    const rate = $<HTMLInputElement>('#rate');
    const tenure = $<HTMLInputElement>('#tenure');
    const amountOut = $('#amountOut');
    const rateOut = $('#rateOut');
    const tenureOut = $('#tenureOut');
    const emiOut = $('#emiOut');
    const principalOut = $('#principalOut');
    const interestOut = $('#interestOut');
    const totalOut = $('#totalOut');
    const donut = $<SVGCircleElement>('#donut');
    const R = 52;
    const CIRC = 2 * Math.PI * R;

    const calcEMI = () => {
      if (!amount || !rate || !tenure) return;
      const P = +amount.value;
      const annual = +rate.value;
      const n = +tenure.value;
      const b = emiBreakdown(P, annual, n);

      if (amountOut) amountOut.textContent = fmtINR(P);
      if (rateOut) rateOut.textContent = annual.toFixed(1) + '%';
      if (tenureOut) tenureOut.textContent = n + ' month' + (n > 1 ? 's' : '');
      if (emiOut) emiOut.textContent = fmtINR(b.emi);
      if (principalOut) principalOut.textContent = fmtINR(P);
      if (interestOut) interestOut.textContent = fmtINR(b.interest);
      if (totalOut) totalOut.textContent = fmtINR(b.total);

      if (donut) {
        donut.setAttribute('r', String(R));
        donut.style.strokeDasharray = (b.principalRatio * CIRC).toFixed(1) + ' ' + CIRC.toFixed(1);
      }
    };
    [amount, rate, tenure].forEach((elx) => elx && on(elx, 'input', calcEMI));
    if (amount && donut) {
      donut.style.strokeDasharray = '0 ' + CIRC;
      calcEMI();
    }

    /* ---------- APPLICATION TRACKER ---------- */
    const demoApps: Record<string, TrackedApp> = {
      'SL-2048': {
        type: 'Personal Loan', amount: '₹5,00,000', stage: 3,
        steps: [
          { t: 'Application submitted', d: 'Received on 12 Mar, 10:24 AM' },
          { t: 'Eligibility check', d: 'Soft check across 18 lenders — passed' },
          { t: 'Offers matched', d: '4 offers found · best rate 10.49% p.a.' },
          { t: 'eKYC & verification', d: 'In progress — complete your video KYC' },
          { t: 'Loan approved', d: 'Pending verification' },
          { t: 'Amount disbursed', d: 'Funds credited to your bank account' },
        ],
        footIcon: 'hourglass_top', foot: 'Action needed: complete your eKYC to move forward.',
      },
      'SL-3110': {
        type: 'Business Loan', amount: '₹15,00,000', stage: 5,
        steps: [
          { t: 'Application submitted', d: 'Received on 02 Mar, 4:11 PM' },
          { t: 'Eligibility check', d: 'GST & bank-flow analysed — passed' },
          { t: 'Offers matched', d: '3 offers found · best rate 14.00% p.a.' },
          { t: 'eKYC & verification', d: 'Completed on 04 Mar' },
          { t: 'Loan approved', d: 'Approved by MetroCredit NBFC' },
          { t: 'Amount disbursed', d: '₹15,00,000 credited on 06 Mar' },
        ],
        footIcon: 'check_circle', foot: 'All done! Your loan has been fully disbursed.',
      },
    };

    const trackForm = $<HTMLFormElement>('#trackForm');
    const appId = $<HTMLInputElement>('#appId');
    const trackerEmpty = $<HTMLElement>('#trackerEmpty');
    const trackerBody = $<HTMLElement>('#trackerBody');
    const tkSteps = $('#tkSteps');

    const renderTracker = (id: string) => {
      const res = lookupApp(id, demoApps);
      const key = res.key;
      const app = res.app;
      if (!trackerEmpty || !trackerBody || !tkSteps) return;
      if (!app) {
        trackerEmpty.hidden = false;
        trackerBody.hidden = true;
        trackerEmpty.innerHTML =
          '<span class="msi tracker__empty-ic">search_off</span><p>No application found for <b>' +
          (key || '—') + '</b>.<br>Try demo IDs <b>SL-2048</b> or <b>SL-3110</b>.</p>';
        return;
      }
      trackerEmpty.hidden = true;
      trackerBody.hidden = false;
      const tkId = $('#tkId'); if (tkId) tkId.textContent = key;
      const tkType = $('#tkType'); if (tkType) tkType.textContent = app.type;
      const tkAmount = $('#tkAmount'); if (tkAmount) tkAmount.textContent = app.amount;
      tkSteps.innerHTML = '';
      app.steps.forEach((s, i) => {
        const done = i < app.stage;
        const active = i === app.stage;
        const li = document.createElement('li');
        li.className = done ? 'done' : active ? 'active' : '';
        li.innerHTML =
          '<span class="step__dot">' + (done ? '<span class="msi">check</span>' : String(i + 1)) + '</span>' +
          '<div class="step__body"><b>' + s.t + '</b><span>' + s.d + '</span></div>';
        tkSteps.appendChild(li);
        requestAnimationFrame(() => {
          li.style.opacity = '0';
          li.style.transform = 'translateY(8px)';
          li.style.transition = 'opacity .4s, transform .4s';
          setTimeout(() => {
            li.style.opacity = '1';
            li.style.transform = 'none';
          }, 80 * i);
        });
      });
      const tkFoot = $('#tkFoot');
      if (tkFoot) tkFoot.innerHTML = '<span class="msi">' + app.footIcon + '</span>' + app.foot;
    };

    if (trackForm && appId) {
      on(trackForm, 'submit', (e) => {
        e.preventDefault();
        renderTracker(appId.value);
      });
      $$('.linkbtn[data-demo]').forEach((b) =>
        on(b, 'click', () => {
          const demo = b.getAttribute('data-demo') || '';
          appId.value = demo;
          renderTracker(demo);
        })
      );
    }

    /* ---------- LEAD FORM ---------- */
    const leadForm = $<HTMLFormElement>('#leadForm');
    const formSuccess = $<HTMLElement>('#formSuccess');
    const loanTypeEl = $<HTMLSelectElement>('#loanType');
    const loanAmountEl = $<HTMLInputElement>('#loanAmount');
    const leadSubmit = $<HTMLButtonElement>('#leadSubmit');
    const leadSubmitHTML = leadSubmit ? leadSubmit.innerHTML : '';
    const FIELD_NAMES = ['loanType', 'loanAmount', 'fullName', 'phone', 'email'];

    const ctx = () => ({ loanType: loanTypeEl ? loanTypeEl.value : '' });
    const validate = (name: string, value: string) => validateField(name, value, ctx());

    const setErr = (name: string, msg: string) => {
      const field = $<HTMLInputElement>('#' + name);
      const errEl = $('.err[data-for="' + name + '"]');
      if (field) field.classList.toggle('invalid', !!msg);
      if (errEl) errEl.textContent = msg;
      return !msg;
    };

    const syncAmountBounds = () => {
      if (!loanAmountEl) return;
      const b = amountBounds(loanTypeEl ? loanTypeEl.value : '');
      loanAmountEl.min = String(b.min);
      loanAmountEl.max = String(b.max);
      if (loanAmountEl.classList.contains('invalid')) setErr('loanAmount', validate('loanAmount', loanAmountEl.value));
    };

    // WS5: campaign/UTM attribution for this visit. Captured once on load and
    // stashed in sessionStorage, because the visitor usually lands on a UTM'd
    // URL and only submits the form later, by which point the query string is
    // often gone (in-page anchor navigation rewrites it).
    function attribution(): Record<string, string> {
      const KEY = 'sl_attribution';
      try {
        const stored = sessionStorage.getItem(KEY);
        if (stored) return JSON.parse(stored) as Record<string, string>;
      } catch {
        /* private mode / storage disabled — fall through to a fresh read */
      }
      const qs = new URLSearchParams(window.location.search);
      const out: Record<string, string> = {};
      const utmSource = qs.get('utm_source');
      const utmMedium = qs.get('utm_medium');
      const utmCampaign = qs.get('utm_campaign') || qs.get('campaign');
      if (utmSource) out.utmSource = utmSource;
      if (utmMedium) out.utmMedium = utmMedium;
      if (utmCampaign) {
        out.utmCampaign = utmCampaign;
        out.campaignId = utmCampaign;
      }
      if (document.referrer) out.referrer = document.referrer;
      try {
        sessionStorage.setItem(KEY, JSON.stringify(out));
      } catch {
        /* not fatal — attribution just won't survive an in-page navigation */
      }
      return out;
    }
    attribution(); // capture on load, while the query string is still present

    // WS3: POST the captured details to the backend, then render a "continue in
    // the app" download CTA whose link carries the (opaque) context token.
    // Resolution order matters. `window.SWIFTLOAN_API_BASE` stays first so a
    // deployed page can be repointed without a rebuild; NEXT_PUBLIC_API_BASE is
    // the normal per-environment setting. The dev EC2 box (behind nginx at
    // dev-api.swiftloan.ai) is the last resort — note that without the env var, a
    // form submitted on localhost used to post straight to this default, so the
    // lead vanished from the local database and no call was ever queued. That is
    // a confusing failure, so it now warns loudly in development instead of
    // silently crossing environments.
    const API_BASE =
      (window as unknown as { SWIFTLOAN_API_BASE?: string }).SWIFTLOAN_API_BASE ||
      process.env.NEXT_PUBLIC_API_BASE ||
      'http://dev-api.swiftloan.ai';
    if (
      process.env.NODE_ENV !== 'production' &&
      /^https?:\/\/(localhost|127\.0\.0\.1)/.test(window.location.origin) &&
      !/localhost|127\.0\.0\.1/.test(API_BASE)
    ) {
      console.warn(
        `[swiftloan] This page is on ${window.location.origin} but posts leads to ${API_BASE}. ` +
          'Set NEXT_PUBLIC_API_BASE=http://localhost:4000 in website-next/.env.local, ' +
          'or your submissions will land in the production database.',
      );
    }
    const CONTEXT_API = API_BASE + '/api/context/create';
    function createContextLink(details: Record<string, unknown>) {
      const box = $<HTMLElement>('#appContinue');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = '<p class="app-continue__loading">Preparing your app link…</p>';
      fetch(CONTEXT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(details),
      })
        .then((r) => r.json())
        .then((j) => {
          const d = j && j.data;
          if (!d || !d.landingUrl) {
            box.hidden = true;
            return;
          }
          const name = String(details.name || '').split(' ')[0];
          box.innerHTML =
            '<div class="app-continue__card">' +
            '<div class="app-continue__ic msi msi--fill">smartphone</div>' +
            '<div class="app-continue__body">' +
            '<strong>Continue on the SwiftLoan app' + (name ? ', ' + name : '') + '</strong>' +
            '<span>Your details are saved. Download the app and pick up right where you left off — no re-typing.</span>' +
            '<a class="btn btn--primary btn--block" href="' + d.landingUrl + '" target="_blank" rel="noopener">Download the app &amp; continue →</a>' +
            '</div></div>';
        })
        .catch(() => {
          box.hidden = true;
        });
    }

    if (leadForm) {
      FIELD_NAMES.forEach((name) => {
        const f = $<HTMLInputElement | HTMLSelectElement>('#' + name);
        if (!f) return;
        on(f, 'blur', () => setErr(name, validate(name, f.value)));
        on(f, 'input', () => {
          if (f.classList.contains('invalid')) setErr(name, validate(name, f.value));
        });
        on(f, 'change', () => {
          if (f.classList.contains('invalid')) setErr(name, validate(name, f.value));
        });
      });
      if (loanTypeEl) on(loanTypeEl, 'change', syncAmountBounds);
      syncAmountBounds();

      on(leadForm, 'submit', (e) => {
        e.preventDefault();
        let ok = true;
        FIELD_NAMES.forEach((name) => {
          const f = $<HTMLInputElement | HTMLSelectElement>('#' + name);
          ok = setErr(name, validate(name, f ? f.value : '')) && ok;
        });
        const consent = $<HTMLInputElement>('#consent');
        const consentOk = !!consent?.checked;
        const consentErr = $('.err[data-for="consent"]');
        if (consentErr) consentErr.textContent = consentOk ? '' : 'Please provide your consent to continue.';
        ok = ok && consentOk;

        if (!ok) {
          const firstInvalid = leadForm.querySelector('.invalid') || (!consentOk ? consent : null);
          if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        const btn = leadSubmit;
        const table = curLangRef.current === 'HI' ? dict.hi : dict.en;
        if (btn) {
          btn.textContent = table['apply.matching'] || 'Matching you with lenders…';
          btn.disabled = true;
        }
        setTimeout(() => {
          const id = makeRefId();
          const genId = $('#genId');
          if (genId) genId.textContent = id;
          const amtNum = +(loanAmountEl ? loanAmountEl.value : '') || 0;
          demoApps[id] = {
            type: (loanTypeEl && loanTypeEl.value) || 'Personal Loan',
            amount: fmtINR(amtNum),
            stage: 1,
            steps: [
              { t: 'Application submitted', d: 'Just now' },
              { t: 'Eligibility check', d: 'Running a soft check across lenders…' },
              { t: 'Offers matched', d: 'Pending' },
              { t: 'eKYC & verification', d: 'Pending' },
              { t: 'Loan approved', d: 'Pending' },
              { t: 'Amount disbursed', d: 'Pending' },
            ],
            footIcon: 'schedule',
            foot: "We've received your application and are matching you with lenders.",
          };
          leadForm.classList.add('is-done');
          if (formSuccess) {
            formSuccess.hidden = false;
            formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }

          // Upshot: identify the visitor and record the conversion, so IAM /
          // activity campaigns can target them and so this person resolves to
          // the same Upshot profile as their later app login (same E.164 key).
          upshotIdentify({
            name: $<HTMLInputElement>('#fullName')?.value || '',
            phone: $<HTMLInputElement>('#phone')?.value || '',
            email: $<HTMLInputElement>('#email')?.value || '',
            city: $<HTMLInputElement>('#city')?.value || '',
          });
          upshotEvent('website_lead_submitted', {
            product: (loanTypeEl && loanTypeEl.value) || 'Personal Loan',
            amount: amtNum,
            ref: id,
            ...attribution(),
          });

          createContextLink({
            name: $<HTMLInputElement>('#fullName')?.value || '',
            phone: $<HTMLInputElement>('#phone')?.value || '',
            email: $<HTMLInputElement>('#email')?.value || '',
            city: $<HTMLInputElement>('#city')?.value || '',
            product: (loanTypeEl && loanTypeEl.value) || 'Personal Loan',
            amount: amtNum * 100, // paise
            summary: `Interested in a ${fmtINR(amtNum)} ${(loanTypeEl && loanTypeEl.value) || 'loan'} — submitted on swiftloan.ai (ref ${id}).`,
            source: 'website',
            // WS5: campaign attribution. Without these the admin dashboard can
            // never answer "which campaign did this customer come from".
            ...attribution(),
          });
        }, 1100);
      });

      const resetLead = $('#resetLead');
      if (resetLead) {
        on(resetLead, 'click', () => {
          leadForm.classList.remove('is-done');
          if (formSuccess) formSuccess.hidden = true;
          ['loanType', 'loanAmount', 'fullName', 'phone', 'email', 'city'].forEach((id) => {
            const f = $<HTMLInputElement | HTMLSelectElement>('#' + id);
            if (f) f.value = '';
          });
          const consentEl = $<HTMLInputElement>('#consent');
          if (consentEl) consentEl.checked = false;
          FIELD_NAMES.forEach((n) => setErr(n, ''));
          const ce = $('.err[data-for="consent"]');
          if (ce) ce.textContent = '';
          if (leadSubmit) {
            leadSubmit.disabled = false;
            leadSubmit.innerHTML = leadSubmitHTML;
          }
          applyLang(curLangRef.current);
          syncAmountBounds();
          leadForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }

    /* ---------- pre-select loan type from product CTAs ---------- */
    $$('[data-loan]').forEach((a) => {
      on(a, 'click', () => {
        if (loanTypeEl) {
          loanTypeEl.value = a.getAttribute('data-loan') || '';
          loanTypeEl.dispatchEvent(new Event('change'));
        }
      });
    });

    /* ---------- FAQ: single-open accordion ---------- */
    const faqItems = $$<HTMLDetailsElement>('#faqList .faq__item');
    faqItems.forEach((item) => {
      on(item, 'toggle', () => {
        if (item.open) faqItems.forEach((o) => { if (o !== item) o.open = false; });
      });
    });

    /* ---------- active nav link on scroll ---------- */
    const sections = $$('main section[id]');
    const navAnchors = $$('.nav__links a[href^="#"]');
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const id = e.target.id;
          navAnchors.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
    cleanups.push(() => spy.disconnect());

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
