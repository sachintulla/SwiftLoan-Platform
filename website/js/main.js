/* =========================================================
   SwiftLoan.ai — Interactions (DOM wiring; logic in core.js)
   ========================================================= */
(function () {
  'use strict';

  var C = window.SLCore || {};
  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const fmtINR = C.fmtINR || (n => '₹' + Math.round(n).toLocaleString('en-IN'));

  /* ---------- year ---------- */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- nav: scroll shadow + back-to-top ---------- */
  const nav = $('#nav');
  const toTop = $('#toTop');
  const onScroll = () => {
    const y = window.scrollY;
    if (nav) nav.classList.toggle('scrolled', y > 10);
    if (toTop) toTop.classList.toggle('show', y > 600);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  /* ---------- mobile menu ---------- */
  const navToggle = $('#navToggle');
  const navLinks = $('#navLinks');
  const toggleMenu = (open) => {
    const willOpen = open ?? !navLinks.classList.contains('open');
    navLinks.classList.toggle('open', willOpen);
    nav.classList.toggle('menu-open', willOpen);
    navToggle.setAttribute('aria-expanded', String(willOpen));
    document.body.style.overflow = willOpen ? 'hidden' : '';
  };
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => toggleMenu());
    $$('#navLinks a').forEach(a => a.addEventListener('click', () => toggleMenu(false)));
  }

  /* ---------- language toggle (EN / HI) with live translation ---------- */
  let curLang = 'EN';
  const applyLang = (lang) => {
    curLang = lang === 'HI' ? 'HI' : 'EN';
    document.documentElement.setAttribute('lang', curLang === 'HI' ? 'hi' : 'en');
    const dict = window.SLI18N;
    if (!dict) return;
    const table = lang === 'HI' ? dict.hi : dict.en;
    $$('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = (table && table[key]) != null ? table[key]
                : (dict.en && dict.en[key]);
      if (val != null) {
        // preserve a leading/trailing icon span if present; only swap text nodes
        const icon = el.querySelector(':scope > .msi');
        if (icon) {
          let iconFirst = true;
          for (const node of el.childNodes) {
            if (node === icon) break;
            if (node.nodeType === 3 && node.textContent.trim()) { iconFirst = false; break; }
          }
          Array.from(el.childNodes).forEach(n => { if (n.nodeType === 3) el.removeChild(n); });
          if (iconFirst) el.insertAdjacentText('beforeend', ' ' + val);
          else el.insertAdjacentText('afterbegin', val + ' ');
        } else {
          el.textContent = val;
        }
      }
    });
    $$('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      const val = (table && table[key]) != null ? table[key] : (dict.en && dict.en[key]);
      if (val != null) el.setAttribute('placeholder', val);
    });
  };
  $$('.langtoggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.langtoggle__btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      applyLang(btn.dataset.lang);
    });
  });

  /* ---------- scroll reveal ---------- */
  const revealTargets = [
    '.section__head', '.svc-card', '.journey__step', '.ai__feat', '.ai__panel',
    '.sec-card', '.review', '.partners__col', '.stat', '.calc', '.tracker',
    '.apply__form', '.faq__item', '.logostrip'
  ];
  const revealEls = $$(revealTargets.join(','));
  revealEls.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = (i % 4) * 60 + 'ms';
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  revealEls.forEach(el => io.observe(el));

  /* ---------- animated stat counters ---------- */
  const animateCount = (el) => {
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || '';
    const dur = 1600;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = target * eased;
      let out;
      if (el.dataset.count === '2400') out = '₹' + Math.round(val).toLocaleString('en-IN');
      else out = Math.round(val).toLocaleString('en-IN');
      el.textContent = out + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = out + suffix;
    };
    requestAnimationFrame(step);
  };
  const statIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { animateCount(e.target); statIO.unobserve(e.target); }
    });
  }, { threshold: 0.5 });
  $$('.stat__num').forEach(el => statIO.observe(el));

  /* ---------- match list stagger ---------- */
  const matchIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
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

  /* ---------- EMI CALCULATOR ---------- */
  const amount = $('#amount'), rate = $('#rate'), tenure = $('#tenure');
  const amountOut = $('#amountOut'), rateOut = $('#rateOut'), tenureOut = $('#tenureOut');
  const emiOut = $('#emiOut'), principalOut = $('#principalOut'),
        interestOut = $('#interestOut'), totalOut = $('#totalOut');
  const donut = $('#donut');
  const R = 52, CIRC = 2 * Math.PI * R;

  const calcEMI = () => {
    const P = +amount.value, annual = +rate.value, n = +tenure.value;
    const b = C.emiBreakdown ? C.emiBreakdown(P, annual, n)
            : { emi: 0, total: P, interest: 0, principalRatio: 1 };

    amountOut.textContent = fmtINR(P);
    rateOut.textContent = annual.toFixed(1) + '%';
    tenureOut.textContent = n + ' month' + (n > 1 ? 's' : '');
    emiOut.textContent = fmtINR(b.emi);
    principalOut.textContent = fmtINR(P);
    interestOut.textContent = fmtINR(b.interest);
    totalOut.textContent = fmtINR(b.total);

    if (donut) {
      donut.setAttribute('r', R);
      donut.style.strokeDasharray = (b.principalRatio * CIRC).toFixed(1) + ' ' + CIRC.toFixed(1);
    }
  };
  [amount, rate, tenure].forEach(el => el && el.addEventListener('input', calcEMI));
  if (amount) { donut.style.strokeDasharray = '0 ' + CIRC; calcEMI(); }

  /* ---------- APPLICATION TRACKER ---------- */
  const demoApps = {
    'SL-2048': {
      type: 'Personal Loan', amount: '₹5,00,000', stage: 3,
      steps: [
        { t: 'Application submitted', d: 'Received on 12 Mar, 10:24 AM' },
        { t: 'Eligibility check', d: 'Soft check across 18 lenders — passed' },
        { t: 'Offers matched', d: '4 offers found · best rate 10.49% p.a.' },
        { t: 'eKYC & verification', d: 'In progress — complete your video KYC' },
        { t: 'Loan approved', d: 'Pending verification' },
        { t: 'Amount disbursed', d: 'Funds credited to your bank account' }
      ],
      footIcon: 'hourglass_top', foot: 'Action needed: complete your eKYC to move forward.'
    },
    'SL-3110': {
      type: 'Business Loan', amount: '₹15,00,000', stage: 5,
      steps: [
        { t: 'Application submitted', d: 'Received on 02 Mar, 4:11 PM' },
        { t: 'Eligibility check', d: 'GST & bank-flow analysed — passed' },
        { t: 'Offers matched', d: '3 offers found · best rate 14.00% p.a.' },
        { t: 'eKYC & verification', d: 'Completed on 04 Mar' },
        { t: 'Loan approved', d: 'Approved by MetroCredit NBFC' },
        { t: 'Amount disbursed', d: '₹15,00,000 credited on 06 Mar' }
      ],
      footIcon: 'check_circle', foot: 'All done! Your loan has been fully disbursed.'
    }
  };

  const trackForm = $('#trackForm');
  const appId = $('#appId');
  const trackerEmpty = $('#trackerEmpty');
  const trackerBody = $('#trackerBody');
  const tkSteps = $('#tkSteps');

  const renderTracker = (id) => {
    const res = C.lookupApp ? C.lookupApp(id, demoApps)
              : { key: String(id).trim().toUpperCase(), app: demoApps[String(id).trim().toUpperCase()] || null };
    const key = res.key, app = res.app;
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
    $('#tkId').textContent = key;
    $('#tkType').textContent = app.type;
    $('#tkAmount').textContent = app.amount;
    tkSteps.innerHTML = '';
    app.steps.forEach((s, i) => {
      const done = i < app.stage;
      const active = i === app.stage;
      const li = document.createElement('li');
      li.className = done ? 'done' : (active ? 'active' : '');
      li.innerHTML =
        '<span class="step__dot">' + (done ? '<span class="msi">check</span>' : (i + 1)) + '</span>' +
        '<div class="step__body"><b>' + s.t + '</b><span>' + s.d + '</span></div>';
      tkSteps.appendChild(li);
      requestAnimationFrame(() => {
        li.style.opacity = 0; li.style.transform = 'translateY(8px)';
        li.style.transition = 'opacity .4s, transform .4s';
        setTimeout(() => { li.style.opacity = 1; li.style.transform = 'none'; }, 80 * i);
      });
    });
    $('#tkFoot').innerHTML = '<span class="msi">' + app.footIcon + '</span>' + app.foot;
  };

  if (trackForm) {
    trackForm.addEventListener('submit', (e) => { e.preventDefault(); renderTracker(appId.value); });
    $$('.linkbtn[data-demo]').forEach(b =>
      b.addEventListener('click', () => { appId.value = b.dataset.demo; renderTracker(b.dataset.demo); })
    );
  }

  /* ---------- LEAD FORM ---------- */
  const leadForm = $('#leadForm');
  const formSuccess = $('#formSuccess');
  const loanTypeEl = $('#loanType');
  const loanAmountEl = $('#loanAmount');
  const leadSubmit = $('#leadSubmit');
  const leadSubmitHTML = leadSubmit ? leadSubmit.innerHTML : '';
  const FIELD_NAMES = ['loanType', 'loanAmount', 'fullName', 'phone', 'email'];

  const ctx = () => ({ loanType: loanTypeEl ? loanTypeEl.value : '' });
  const validate = (name, value) =>
    C.validateField ? C.validateField(name, value, ctx()) : '';

  const setErr = (name, msg) => {
    const field = $('#' + name);
    const errEl = $('.err[data-for="' + name + '"]');
    if (field) field.classList.toggle('invalid', !!msg);
    if (errEl) errEl.textContent = msg;
    return !msg;
  };

  // keep the amount field's min attribute + hint in sync with the chosen product
  const syncAmountBounds = () => {
    if (!loanAmountEl || !C.amountBounds) return;
    const b = C.amountBounds(loanTypeEl ? loanTypeEl.value : '');
    loanAmountEl.min = b.min;
    loanAmountEl.max = b.max;
    if (loanAmountEl.classList.contains('invalid')) setErr('loanAmount', validate('loanAmount', loanAmountEl.value));
  };

  if (leadForm) {
    FIELD_NAMES.forEach(name => {
      const f = $('#' + name);
      if (!f) return;
      f.addEventListener('blur', () => setErr(name, validate(name, f.value)));
      f.addEventListener('input', () => { if (f.classList.contains('invalid')) setErr(name, validate(name, f.value)); });
      f.addEventListener('change', () => { if (f.classList.contains('invalid')) setErr(name, validate(name, f.value)); });
    });
    if (loanTypeEl) loanTypeEl.addEventListener('change', syncAmountBounds);
    syncAmountBounds();

    leadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      FIELD_NAMES.forEach(name => { ok = setErr(name, validate(name, $('#' + name).value)) && ok; });
      const consent = $('#consent');
      const consentOk = consent.checked;
      $('.err[data-for="consent"]').textContent = consentOk ? '' : 'Please provide your consent to continue.';
      ok = ok && consentOk;

      if (!ok) {
        const firstInvalid = leadForm.querySelector('.invalid') || (!consentOk ? consent : null);
        if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      const btn = leadSubmit;
      const table = window.SLI18N ? window.SLI18N[curLang === 'HI' ? 'hi' : 'en'] : null;
      btn.textContent = (table && table['apply.matching']) || 'Matching you with lenders…';
      btn.disabled = true;
      setTimeout(() => {
        const id = C.makeRefId ? C.makeRefId() : 'SL-' + Math.floor(1000 + Math.random() * 9000);
        $('#genId').textContent = id;
        // register the just-submitted application so it is immediately trackable
        const amtNum = +(loanAmountEl && loanAmountEl.value) || 0;
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
            { t: 'Amount disbursed', d: 'Pending' }
          ],
          footIcon: 'schedule',
          foot: "We've received your application and are matching you with lenders."
        };
        leadForm.classList.add('is-done');   // hides inputs via CSS (fully reversible)
        formSuccess.hidden = false;
        formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 1100);
    });

    // "Check another rate" — restore the form so a user can submit again
    const resetLead = $('#resetLead');
    if (resetLead) resetLead.addEventListener('click', () => {
      leadForm.classList.remove('is-done');
      formSuccess.hidden = true;
      ['loanType', 'loanAmount', 'fullName', 'phone', 'email', 'city'].forEach(id => {
        const f = $('#' + id); if (f) f.value = '';
      });
      const consentEl = $('#consent'); if (consentEl) consentEl.checked = false;
      FIELD_NAMES.forEach(n => setErr(n, ''));
      const ce = $('.err[data-for="consent"]'); if (ce) ce.textContent = '';
      if (leadSubmit) { leadSubmit.disabled = false; leadSubmit.innerHTML = leadSubmitHTML; }
      applyLang(curLang);      // re-translate restored controls to the active language
      syncAmountBounds();
      leadForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ---------- pre-select loan type from product CTAs ---------- */
  $$('[data-loan]').forEach(a => {
    a.addEventListener('click', () => {
      if (loanTypeEl) {
        loanTypeEl.value = a.getAttribute('data-loan');
        loanTypeEl.dispatchEvent(new Event('change'));
      }
    });
  });

  /* ---------- FAQ: single-open accordion ---------- */
  const faqItems = $$('#faqList .faq__item');
  faqItems.forEach(item => {
    item.addEventListener('toggle', () => {
      if (item.open) faqItems.forEach(o => { if (o !== item) o.open = false; });
    });
  });

  /* ---------- active nav link on scroll ---------- */
  const sections = $$('main section[id]');
  const navAnchors = $$('.nav__links a[href^="#"]');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const id = e.target.id;
        navAnchors.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + id));
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach(s => spy.observe(s));

})();
