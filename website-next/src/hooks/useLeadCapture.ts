'use client';
import { useEffect, useRef, useState, type FormEvent, useCallback } from "react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCopy } from "@/lib/i18n";
import { leadFormCopy } from "@/i18n/lead-form";
import {
  submitLead,
  attribution,
  makeRefId,
  requestWebsiteOtp,
  verifyWebsiteOtp,
  submitCallbackChoice,
  type LeadDetails,
} from "@/lib/leads";
import { upshotEvent, upshotIdentify } from "@/components/UpshotWeb";

export const AMOUNT_MIN = 10_000;
export const AMOUNT_MAX = 50_00_000;
export const AMOUNT_STEP = 5_000;
export const AMOUNT_DEFAULT = 5_00_000;

export const appStoreUrl = "https://apps.apple.com/app/id0000000000";

/**
 * All the state + handlers behind "submit amount/mobile -> verify OTP -> ask
 * for a callback" — shared by the inline lead-form card (LeadForm.tsx) and
 * the popup version (QuickCheckModal.tsx) triggered from the header/hero
 * buttons, so the two surfaces can never drift on validation, OTP, or
 * callback-consent behaviour. Each caller gets its OWN instance/state — the
 * two forms are independent surfaces, not synced to each other.
 *
 * @param opts.requireAmountTouched - Default true: the submit button stays
 *   disabled until the visitor has actually dragged the amount slider, so an
 *   untouched default amount can never be silently submitted. Hero's one-field
 *   entry point has no slider up front (it asks for amount in the OTP modal
 *   instead — see LeadCaptureUI's `showAmount`) and passes false here so its
 *   button is gated on the mobile number alone.
 */
export function useLeadCapture(opts: { requireAmountTouched?: boolean } = {}) {
  const requireAmountTouched = opts.requireAmountTouched ?? true;
  /** Which of the two "panels" is showing. OTP + callback consent are
   *  full-screen popups layered on top, not a panel of their own. */
  const [panel, setPanel] = useState<"form" | "success">("form");
  const [seconds, setSeconds] = useState(10);
  /** Deep link back into the app carrying this lead's context token. */
  const [landing, setLanding] = useState<string | undefined>(undefined);
  const isMobile = useIsMobile();
  const formRef = useRef<HTMLFormElement>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [formValid, setFormValid] = useState(false);
  const [submitHintVisible, setSubmitHintVisible] = useState(false);
  /** No visible loan-type picker — defaults to Personal Loan, but stays
   *  voice-settable (the Ello widget's select_loan_type tool still writes to
   *  a hidden field) and still reaches the backend as product interest. */
  const [loanType, setLoanType] = useState("Personal Loan");
  /** Loan amount — a slider, not a text field, so it's always in-range by
   *  construction (no separate min/max validation needed). Starts untouched:
   *  the thumb renders at the min but the displayed value reads as unset, and
   *  the submit button stays disabled, until the visitor actually drags it —
   *  a silently-submitted default amount is not a real choice. */
  const [amount, setAmount] = useState(AMOUNT_DEFAULT);
  const [amountTouched, setAmountTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useCopy(leadFormCopy);

  // ── OTP verification + callback consent (runs after the lead is already
  // saved — see onSubmit) ──
  const [mobileNumber, setMobileNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpResendSeconds, setOtpResendSeconds] = useState(0);
  /** Only ever set outside prod / with no SMS provider configured — see the server's sms.ts dev fallback. */
  const [devOtpHint, setDevOtpHint] = useState<string | undefined>(undefined);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  /** Rotates through otpFacts while the visitor waits for/enters the OTP —
   *  keeps them engaged instead of staring at a blank wait. */
  const [factIndex, setFactIndex] = useState(0);

  const handleFocus = useCallback((name: string) => setFocusedField(name), []);
  const handleBlur = useCallback(() => setFocusedField(null), []);
  const handleFormChange = useCallback(() => {
    setFormValid((formRef.current?.checkValidity() ?? false) && (!requireAmountTouched || amountTouched));
  }, [amountTouched, requireAmountTouched]);

  const handleLoanTypeChange = useCallback((value: string) => {
    setLoanType(value);
    setFormValid((formRef.current?.checkValidity() ?? false) && (!requireAmountTouched || amountTouched));
  }, [amountTouched, requireAmountTouched]);

  /** Set whenever the amount changes AFTER the lead was already submitted
   *  (Hero's flow: its slider lives INSIDE the OTP modal, opened after
   *  onSubmit already ran submitLead() with the untouched AMOUNT_DEFAULT).
   *  handleVerifyOtp reads this once, at Verify time, to send the corrected
   *  amount in a single request — see the comment there for why this used
   *  to fire per-drag instead and what that broke. A plain ref, not state:
   *  nothing needs to re-render off this, it's just a flag for the next
   *  verify click. */
  const amountNeedsCorrection = useRef(false);

  /** The slider itself dispatches no native form event, so dragging it must
   *  explicitly re-run validity (handleFormChange only fires from the
   *  mobile input's own change event). */
  const handleAmountChange = useCallback(
    (value: number) => {
      setAmount(value);
      setAmountTouched(true);
      setFormValid(formRef.current?.checkValidity() ?? false);
      // mobileNumber is only set once submitLead has already run (Hero's
      // flow) — LeadForm/QuickCheckModal show this same slider BEFORE
      // submit, where onSubmit sends the correct value directly and there
      // is nothing to correct.
      if (mobileNumber) amountNeedsCorrection.current = true;
    },
    [mobileNumber],
  );

  /** Amount-not-yet-selected takes priority — a mobile number typed against
   *  an untouched default amount was never actually a deliberate choice. */
  const getDisabledReason = useCallback((): string => {
    if (requireAmountTouched && !amountTouched) return t.hintAmount;
    const form = formRef.current;
    if (form) {
      const el = form.elements.namedItem("mobile") as HTMLInputElement | null;
      if (el && !el.validity.valid) return t.hintMobile;
    }
    return "";
  }, [t, amountTouched, requireAmountTouched]);

  const resetAll = useCallback(() => {
    setPanel("form");
    setFormValid(false);
    setLoanType("Personal Loan");
    setAmount(AMOUNT_DEFAULT);
    setAmountTouched(false);
    setOtp("");
    setOtpError(null);
    setDevOtpHint(undefined);
    setOtpResendSeconds(0);
    formRef.current?.reset();
  }, []);

  useEffect(() => {
    // Held while either popup is up — a visitor mid-verification or being
    // asked a yes/no question must never get redirected out from under it.
    if (panel !== "success" || showCallbackModal || showOtpModal) return;
    if (seconds <= 0) {
      if (isMobile) {
        window.location.href = landing || appStoreUrl;
      } else {
        resetAll();
      }
      return;
    }
    const timer = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [panel, showCallbackModal, showOtpModal, seconds, isMobile, landing, resetAll]);

  // 30s resend cooldown for the OTP popup.
  useEffect(() => {
    if (otpResendSeconds <= 0) return;
    const timer = window.setTimeout(() => setOtpResendSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [otpResendSeconds]);

  // Cycle the "did you know" fact every 4s while the OTP modal is open.
  useEffect(() => {
    if (!showOtpModal) {
      setFactIndex(0);
      return;
    }
    const timer = window.setInterval(
      () => setFactIndex((i) => (i + 1) % t.otpFacts.length),
      4000,
    );
    return () => window.clearInterval(timer);
  }, [showOtpModal, t.otpFacts.length]);

  const sendOtp = useCallback(
    async (phone: string) => {
      setOtpSending(true);
      setOtpError(null);
      const result = await requestWebsiteOtp(phone);
      setOtpSending(false);
      if (!result) {
        toast.error(t.otpToastSendFailed);
        return;
      }
      // Always require a fresh, real OTP entry here — even if this phone was
      // verified on an earlier visit — so the callback popup can never appear
      // without the visitor actually seeing and completing the OTP screen in
      // THIS session.
      setDevOtpHint(result.devOtp);
      setOtpResendSeconds(30);
    },
    [t],
  );

  const handleVerifyOtp = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (otp.length !== 6 || otpVerifying) return;
      setOtpVerifying(true);
      setOtpError(null);

      // Send the corrected amount now — ONCE, at the moment of verifying —
      // rather than on every slider drag. Firing a request per drag used to
      // eat into the 5-req/minute limit /api/context and /api/website share,
      // so a visitor who paused the slider twice while choosing an amount
      // could burn the whole budget before ever reaching OTP verify or the
      // callback step, which then 429'd.
      if (amountNeedsCorrection.current) {
        amountNeedsCorrection.current = false;
        const details: LeadDetails = { phone: mobileNumber, product: loanType, amountRupees: amount };
        await submitLead(details, makeRefId()).catch(() => undefined);
      }

      const result = await verifyWebsiteOtp(mobileNumber, otp);
      setOtpVerifying(false);
      if (!result) {
        toast.error(t.otpToastSendFailed);
        return;
      }
      if (!result.verified) {
        setOtpError(t.otpToastInvalid);
        setOtp("");
        return;
      }
      setShowOtpModal(false);
      setShowCallbackModal(true);
      setPanel("success");
      setSeconds(10);
    },
    [otp, otpVerifying, mobileNumber, amount, loanType, t],
  );

  /** The lead is already saved by this point (submitLead ran before this modal
   *  ever opens) — closing early just skips phone verification/callback, it
   *  never loses the submission itself. */
  const handleCloseOtpModal = useCallback(() => {
    setShowOtpModal(false);
    setOtp("");
    setOtpError(null);
    setDevOtpHint(undefined);
    setOtpResendSeconds(0);
  }, []);

  const handleCallbackChoice = useCallback(
    (choice: "yes" | "no") => {
      setShowCallbackModal(false);
      // Fire-and-forget, same philosophy as upshotEvent/upshotIdentify below —
      // the visitor's own screen never waits on this.
      void submitCallbackChoice(mobileNumber, choice);
    },
    [mobileNumber],
  );

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (isSubmitting) return;
      const data = new FormData(e.currentTarget);
      const mobile = String(data.get("mobile") ?? "");
      if (!/^[6-9]\d{9}$/.test(mobile)) {
        toast.error(t.toastMobile);
        return;
      }

      const ref = makeRefId();
      const details = {
        phone: mobile,
        product: String(data.get("loanType") ?? "") || "Personal Loan",
        amountRupees: amount,
      };

      // Identify first, then record the conversion — so the visitor resolves
      // to the same Upshot profile as their later app login (same E.164 key)
      // and journeys can target them.
      upshotIdentify({ phone: details.phone });
      upshotEvent("website_lead_submitted", {
        product: details.product,
        amount: details.amountRupees,
        ref,
        ...attribution(),
      });

      // ── the integration the redesign must preserve ──────────────────────
      // The success screen (and the app-deep-link/QR it shows) means "this is
      // saved and the app can find it" — so it must not appear until the save
      // actually lands. submitLead() itself never throws; a failed save just
      // resolves undefined, which is what the check below is for.
      setIsSubmitting(true);
      const result = await submitLead(details, ref);
      setIsSubmitting(false);
      if (!result) {
        toast.error(t.toastSubmitFailed);
        return;
      }

      setLanding(result.landingUrl);
      // Phone verification is layered on AFTER the save, not a blocker to it —
      // the lead already exists and is visible in the admin funnel regardless
      // of whether the visitor finishes this next step.
      setMobileNumber(mobile);
      setShowOtpModal(true);
      void sendOtp(mobile);
    },
    [isSubmitting, amount, t, sendOtp],
  );

  return {
    t,
    formRef,
    panel,
    seconds,
    landing,
    focusedField,
    formValid,
    submitHintVisible,
    setSubmitHintVisible,
    loanType,
    amount,
    amountTouched,
    handleAmountChange,
    isSubmitting,
    mobileNumber,
    otp,
    setOtp,
    otpSending,
    otpVerifying,
    otpError,
    setOtpError,
    otpResendSeconds,
    devOtpHint,
    showOtpModal,
    showCallbackModal,
    factIndex,
    handleFocus,
    handleBlur,
    handleFormChange,
    handleLoanTypeChange,
    getDisabledReason,
    sendOtp,
    handleVerifyOtp,
    handleCloseOtpModal,
    handleCallbackChoice,
    onSubmit,
  };
}

export type LeadCapture = ReturnType<typeof useLeadCapture>;
