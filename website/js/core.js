/* =========================================================
   SwiftLoan.ai — Core (pure, testable logic)
   UMD: usable as window.SLCore in the browser and via
   require('./core.js') in Node unit tests. No DOM here.
   ========================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SLCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---- currency ---- */
  function fmtINR(n) {
    if (n == null || isNaN(n)) return '₹0';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  /* ---- EMI maths ---- */
  // P: principal, annualPct: annual interest %, months: tenure
  function emi(P, annualPct, months) {
    P = +P; annualPct = +annualPct; months = +months;
    if (!(P > 0) || !(months > 0)) return 0;
    var r = annualPct / 12 / 100;
    if (r === 0) return P / months;
    var pow = Math.pow(1 + r, months);
    return (P * r * pow) / (pow - 1);
  }

  function emiBreakdown(P, annualPct, months) {
    var e = emi(P, annualPct, months);
    var total = e * months;
    var interest = total - P;
    return {
      emi: e,
      total: total,
      interest: interest,
      principalRatio: total > 0 ? P / total : 0
    };
  }

  /* ---- loan amount bounds per product (scalable per use case) ---- */
  var BOUNDS = {
    'Personal Loan': { min: 50000, max: 2500000 },
    'Business Loan': { min: 100000, max: 7500000 }
  };
  function amountBounds(loanType) {
    return BOUNDS[loanType] || { min: 50000, max: 7500000 };
  }

  /* ---- field validators (loanAmount is context-aware) ---- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE_RE = /^[6-9]\d{9}$/;

  function validateField(name, value, ctx) {
    ctx = ctx || {};
    var v = value == null ? '' : String(value);
    switch (name) {
      case 'loanType':
        return v ? '' : 'Please select a loan type.';
      case 'loanAmount': {
        if (!v.trim()) return 'Enter an amount.';
        var n = Number(v);
        if (isNaN(n)) return 'Enter a valid amount.';
        var b = amountBounds(ctx.loanType);
        if (n < b.min) return 'Minimum for ' + (ctx.loanType || 'this loan') + ' is ' + fmtINR(b.min) + '.';
        if (n > b.max) return 'Maximum for ' + (ctx.loanType || 'this loan') + ' is ' + fmtINR(b.max) + '.';
        return '';
      }
      case 'fullName':
        return v.trim().length < 3 ? 'Enter your full name.' : '';
      case 'phone':
        return PHONE_RE.test(v.trim()) ? '' : 'Enter a valid 10-digit mobile number.';
      case 'email':
        return EMAIL_RE.test(v.trim()) ? '' : 'Enter a valid email address.';
      default:
        return '';
    }
  }

  /* ---- application tracker lookup (normalises input) ---- */
  function normaliseId(id) {
    return (id == null ? '' : String(id)).trim().toUpperCase();
  }
  function lookupApp(id, apps) {
    var key = normaliseId(id);
    return { key: key, app: (apps && apps[key]) || null };
  }

  /* ---- reference id generator (deterministic when rng supplied) ---- */
  function makeRefId(rng) {
    var r = typeof rng === 'function' ? rng() : Math.random();
    return 'SL-' + Math.floor(1000 + r * 9000);
  }

  return {
    fmtINR: fmtINR,
    emi: emi,
    emiBreakdown: emiBreakdown,
    amountBounds: amountBounds,
    validateField: validateField,
    normaliseId: normaliseId,
    lookupApp: lookupApp,
    makeRefId: makeRefId,
    EMAIL_RE: EMAIL_RE,
    PHONE_RE: PHONE_RE
  };
});
