import { describe, it, expect, afterEach } from 'vitest';
import { reviewLogin, isReviewPhone, isReviewOtp } from './reviewLogin.js';

const clear = () => {
  delete process.env.REVIEW_LOGIN_PHONE;
  delete process.env.REVIEW_LOGIN_OTP;
};

describe('reviewLogin (app-store reviewer account)', () => {
  afterEach(clear);

  it('is off when nothing is configured', () => {
    expect(reviewLogin()).toBeNull();
    expect(isReviewPhone('9876543210')).toBe(false);
    expect(isReviewOtp('9876543210', '123456')).toBe(false);
  });

  it('is off unless BOTH values are set', () => {
    process.env.REVIEW_LOGIN_PHONE = '9876543210';
    expect(reviewLogin()).toBeNull();
    clear();
    process.env.REVIEW_LOGIN_OTP = '482910';
    expect(reviewLogin()).toBeNull();
  });

  it('rejects a malformed phone or OTP (fails closed)', () => {
    process.env.REVIEW_LOGIN_PHONE = '12345';
    process.env.REVIEW_LOGIN_OTP = '482910';
    expect(reviewLogin()).toBeNull();
    process.env.REVIEW_LOGIN_PHONE = '9876543210';
    process.env.REVIEW_LOGIN_OTP = 'abcdef';
    expect(reviewLogin()).toBeNull();
  });

  it('accepts the fixed OTP only for the reviewer number', () => {
    process.env.REVIEW_LOGIN_PHONE = '9876543210';
    process.env.REVIEW_LOGIN_OTP = '482910';
    expect(isReviewPhone('9876543210')).toBe(true);
    expect(isReviewOtp('9876543210', '482910')).toBe(true);
    // a real customer's number must never accept the reviewer code
    expect(isReviewOtp('9123456780', '482910')).toBe(false);
    expect(isReviewPhone('9123456780')).toBe(false);
  });

  it('rejects a wrong or different-length code', () => {
    process.env.REVIEW_LOGIN_PHONE = '9876543210';
    process.env.REVIEW_LOGIN_OTP = '482910';
    expect(isReviewOtp('9876543210', '000000')).toBe(false);
    expect(isReviewOtp('9876543210', '4829')).toBe(false);
    expect(isReviewOtp('9876543210', '')).toBe(false);
  });
});

import { reviewOffers, REVIEW_PAN_PREFILL } from './reviewLogin.js';

describe('review sandbox data', () => {
  it('builds three clearly-labelled sample offers for the requested amount/tenure', () => {
    const offers = reviewOffers(300000, 24);
    expect(offers).toHaveLength(3);
    for (const o of offers) {
      expect(o.amount).toBe(300000);
      expect(o.lenderName).toMatch(/^Sample Lender/);
      expect(o.redirectionUrl).toBeNull();
      expect(o.netDisbursalAmount).toBe(o.amount - o.processingFeeAmount - o.gstOnProcessingFee);
      expect(o.emiOptions.filter((e) => e.recommended)).toHaveLength(1);
      expect(o.emiOptions[0].tenureMonths).toBe(24);
      expect(o.emiOptions[0].monthlyEmi).toBeGreaterThan(0);
    }
    // lowest APR first, so the best-offer pick is stable
    expect(offers[0].apr).toBeLessThan(offers[2].apr);
  });

  it('never offers a tenure beyond 72 months', () => {
    expect(reviewOffers(100000, 72)[0].emiOptions.map((e) => e.tenureMonths)).toEqual([72]);
  });

  it('has a complete sample PAN pre-fill', () => {
    expect(REVIEW_PAN_PREFILL.fullName).toBeTruthy();
    expect(REVIEW_PAN_PREFILL.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(REVIEW_PAN_PREFILL.pincode).toMatch(/^\d{6}$/);
  });
});
