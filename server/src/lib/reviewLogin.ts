import { timingSafeEqual } from 'node:crypto';
import type { RawLenderOffer, EmiOptionResult } from './lenderOffers.js';
import type { PanPrefill } from './panVerification.js';
import { emi } from '../utils/emi.js';

/**
 * App-store reviewer login (App Store Connect "Sign-in required" / Play Console
 * "App access"). Reviewers cannot receive an SMS, so ONE phone number accepts ONE
 * fixed OTP. Unlike DEV_MASTER_OTP — which signs in ANY number — this is safe in
 * production: the code is only honoured for REVIEW_LOGIN_PHONE, so it cannot be
 * used against a real customer's account.
 *
 * Off unless BOTH env vars are set and valid:
 *   REVIEW_LOGIN_PHONE  10-digit Indian mobile (the demo account)
 *   REVIEW_LOGIN_OTP    4–8 digits
 * Unset both once the apps are approved.
 *
 * The reviewer account is also a SANDBOX: whatever PAN it types, PAN verification
 * and prequalify answer with the sample data below and never call Aurix, Revasure
 * or Yubi — so a reviewer can't trigger a paid or real partner call, nor burn the
 * one-lead-per-number Revasure allowance.
 */
export interface ReviewLogin {
  phone: string;
  otp: string;
}

export function reviewLogin(): ReviewLogin | null {
  const phone = (process.env.REVIEW_LOGIN_PHONE ?? '').trim();
  const otp = (process.env.REVIEW_LOGIN_OTP ?? '').trim();
  if (!/^[6-9]\d{9}$/.test(phone) || !/^\d{4,8}$/.test(otp)) return null;
  return { phone, otp };
}

export function isReviewPhone(phone: string): boolean {
  return reviewLogin()?.phone === phone;
}

/** True only for the configured reviewer number presenting the configured code. */
export function isReviewOtp(phone: string, code: string): boolean {
  const cfg = reviewLogin();
  if (!cfg || cfg.phone !== phone) return false;
  const a = Buffer.from(code);
  const b = Buffer.from(cfg.otp);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Sample "PAN verified" pre-fill for the reviewer account (fictional person). */
export const REVIEW_PAN_PREFILL: PanPrefill = {
  fullName: 'Demo Reviewer',
  firstName: 'Demo',
  lastName: 'Reviewer',
  dob: '1990-01-15',
  gender: 'male',
  addressLine1: '12 Sample Street',
  city: 'Bengaluru',
  district: 'Bengaluru Urban',
  state: 'Karnataka',
  pincode: '560001',
};

const GST_RATE = 0.18;

/** [lender label, APR %, processing fee %] — clearly labelled samples, not real lenders. */
const REVIEW_LENDERS: Array<[string, number, number]> = [
  ['Sample Lender 1', 13.5, 1.5],
  ['Sample Lender 2', 15.9, 2],
  ['Sample Lender 3', 18.5, 2.5],
];

/**
 * Sample offers for the reviewer account, shaped like the real ones (rupees; EMI
 * options per tenure; processing fee + GST; net disbursal). No redirection URL, so
 * the app uses its native "Select offer" path (select → handoff → loan + schedule).
 */
export function reviewOffers(amount: number, tenureMonths: number): RawLenderOffer[] {
  const tenures = Array.from(new Set([tenureMonths, tenureMonths + 12])).filter((t) => t <= 72);
  return REVIEW_LENDERS.map(([lenderName, apr, pfPct], i) => {
    const processingFeeAmount = Math.round(amount * (pfPct / 100));
    const gstOnProcessingFee = Math.round(processingFeeAmount * GST_RATE);
    const emiOptions: EmiOptionResult[] = tenures.map((t) => {
      const monthlyEmi = emi(amount, t, apr);
      const totalRepaymentAmount = monthlyEmi * t;
      return {
        tenureMonths: t,
        monthlyEmi,
        totalInterestPayable: totalRepaymentAmount - amount,
        totalRepaymentAmount,
        recommended: t === tenureMonths,
      };
    });
    return {
      amount,
      apr,
      processingFeeAmount,
      gstOnProcessingFee,
      netDisbursalAmount: amount - processingFeeAmount - gstOnProcessingFee,
      badgeText: 'Sample offer',
      emiOptions,
      offerCode: `REVIEW-${i + 1}`,
      offerType: 'sample',
      roi: apr,
      lenderName,
      redirectionUrl: null,
    };
  });
}
