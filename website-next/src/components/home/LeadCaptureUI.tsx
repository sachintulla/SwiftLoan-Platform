'use client';
import { Check, Phone, X, type LucideIcon } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { fmtINR } from "@/lib/core";
import { AMOUNT_MIN, AMOUNT_MAX, AMOUNT_STEP, type LeadCapture } from "@/hooks/useLeadCapture";

/** Shared visual pieces for anything that captures amount + mobile + OTP +
 *  callback consent — the inline lead-form card and the popup version both
 *  render these off one `useLeadCapture()` instance, so they can never look
 *  or behave inconsistently with each other. */

export function Label({ text, required }: { text: string; required?: boolean | undefined }) {
  return (
    <span className="text-muted-foreground text-xs font-bold tracking-[0.12em] uppercase">
      {text} {required && <span className="text-danger">*</span>}
    </span>
  );
}

export function Input({
  label,
  placeholder,
  type = "text",
  required,
  name,
  focusedField,
  onFocus,
  onBlur,
  numeric,
  maxLength,
  minLength,
  pattern,
  title,
  autoComplete,
  icon: Icon,
  prefix,
}: {
  label: string;
  placeholder: string;
  type?: string;
  required?: boolean;
  name: string;
  focusedField: string | null;
  onFocus: (name: string) => void;
  onBlur: () => void;
  numeric?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  title?: string;
  autoComplete?: string;
  icon?: LucideIcon;
  prefix?: string;
}) {
  const isActive = focusedField === name;
  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    if (!numeric) return;
    const el = e.currentTarget;
    let v = el.value.replace(/\D/g, "");
    if (maxLength) v = v.slice(0, maxLength);
    if (el.value !== v) el.value = v;
  };
  const hasLead = Boolean(Icon || prefix);
  return (
    <label className="group/input block min-w-0 cursor-text">
      <Label text={label} required={required} />
      <div
        className={`input-interactive relative mt-1.5 flex items-center rounded-xl ${
          isActive ? "border-primary" : ""
        }`}
      >
        {prefix ? (
          <span className="text-foreground/80 pointer-events-none absolute left-4 flex items-center gap-2 text-base font-extrabold">
            {prefix}
            <span className="bg-border h-5 w-px" />
          </span>
        ) : Icon ? (
          <Icon className="text-primary/70 pointer-events-none absolute left-4 h-5 w-5" strokeWidth={2.4} />
        ) : null}
        <input
          name={name}
          required={required}
          type={type}
          placeholder={placeholder}
          onFocus={() => onFocus(name)}
          onBlur={onBlur}
          onInput={handleInput}
          {...(numeric ? { inputMode: "numeric" as const } : {})}
          {...(maxLength ? { maxLength } : {})}
          {...(minLength ? { minLength } : {})}
          {...(pattern ? { pattern } : {})}
          {...(title ? { title } : {})}
          {...(autoComplete ? { autoComplete } : {})}
          className={`field-input h-14 w-full cursor-text rounded-xl border-0 pr-4 text-lg font-bold outline-none ${
            prefix ? "pl-16" : hasLead ? "pl-11" : "pl-4"
          }`}
        />
      </div>
    </label>
  );
}

/** The mobile-number field, always with a fixed "+91" prefix — split out
 *  since both surfaces need exactly this, not the generic Input above. */
export function MobileInput({ capture }: { capture: LeadCapture }) {
  const { t, focusedField, handleFocus, handleBlur } = capture;
  return (
    <Input
      label={t.mobileLabel}
      placeholder={t.mobilePlaceholder}
      type="tel"
      required
      name="mobile"
      focusedField={focusedField}
      onFocus={handleFocus}
      onBlur={handleBlur}
      numeric
      maxLength={10}
      minLength={10}
      pattern="[6-9][0-9]{9}"
      title={t.mobileTitle}
      autoComplete="tel-national"
      prefix="+91"
    />
  );
}

export function OtpModal({
  capture,
  showAmount,
}: {
  capture: LeadCapture;
  /** Hero's one-field entry point skips the amount slider up front (see
   *  Hero.tsx) and asks for it here instead, alongside the OTP code. The
   *  lead was already saved with the slider's untouched default at submit
   *  time — adjusting the slider here only updates local state as the
   *  visitor drags; handleVerifyOtp sends the ONE correction back to the
   *  server right when they click Verify, not per drag (see its comment:
   *  firing one per drag used to burn through the shared 5-req/minute
   *  limit before OTP verify / the callback step ever got their turn). */
  showAmount?: boolean;
}) {
  const {
    t,
    showOtpModal,
    mobileNumber,
    devOtpHint,
    otp,
    setOtp,
    setOtpError,
    otpError,
    otpVerifying,
    otpResendSeconds,
    otpSending,
    factIndex,
    amount,
    handleAmountChange,
    handleVerifyOtp,
    handleCloseOtpModal,
    sendOtp,
  } = capture;
  if (!showOtpModal) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-foreground/50 p-4 backdrop-blur-sm">
      {/* flex + min-h-full rather than grid place-items-center: a centered
          grid item that's taller than the viewport gets clipped at the top
          in some mobile browsers instead of scrolling into view. This still
          centers short content and scrolls tall content top-to-bottom. */}
      <div className="flex min-h-full items-center justify-center">
      <div className="bg-card my-auto w-[calc(100vw-2rem)] min-w-0 max-w-md overflow-hidden rounded-3xl shadow-[var(--shadow-float)]">
        <div className="bg-brand-gradient relative flex flex-col items-center gap-3 px-6 pb-8 pt-9 text-center">
          {/* Lets the visitor back out without submitting the OTP — the lead
              itself is already saved (submitLead ran before this modal ever
              opens), so closing here only skips verification/callback. */}
          <button
            type="button"
            onClick={handleCloseOtpModal}
            aria-label={t.otpCloseLabel}
            className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-card/15 absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2.6} />
          </button>
          <span className="bg-card/95 grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold text-primary shadow-lg">
            S
          </span>
          <h3 className="text-primary-foreground text-xl font-extrabold leading-snug">{t.otpTitle}</h3>
          <p className="text-primary-foreground/90 text-sm font-semibold leading-relaxed">
            {t.otpSubtitle.replace("{mobile}", mobileNumber)}
          </p>
        </div>

        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4 px-6 py-6">
          <p className="text-warning text-center text-xs font-bold">{t.otpStayOpenNotice}</p>
          {devOtpHint && (
            <p className="text-warning text-center text-xs font-bold">
              {t.otpDevHint}: {devOtpHint}
            </p>
          )}

          {showAmount && (
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <Label text={t.amountLabel} required />
                <span className="text-primary text-lg font-extrabold">{fmtINR(amount)}</span>
              </div>
              <Slider
                className="mt-4"
                min={AMOUNT_MIN}
                max={AMOUNT_MAX}
                step={AMOUNT_STEP}
                value={[amount]}
                onValueChange={([v]) => v != null && handleAmountChange(v)}
                aria-label={t.amountLabel}
              />
              <div className="text-muted-foreground mt-2 flex justify-between text-xs font-bold">
                <span>{fmtINR(AMOUNT_MIN)}</span>
                <span>{fmtINR(AMOUNT_MAX)}</span>
              </div>
            </div>
          )}

          <div>
            <Label text={t.otpCodeLabel} required />
            <div className="input-interactive relative mt-1.5 flex items-center rounded-xl">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                required
                autoFocus
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setOtpError(null);
                }}
                placeholder={t.otpCodePlaceholder}
                className="field-input h-14 w-full rounded-xl border-0 px-3 text-center text-2xl font-bold tracking-[0.5em] outline-none placeholder:text-sm placeholder:font-medium placeholder:tracking-normal placeholder:text-muted-foreground"
              />
            </div>
            {otpError && <p className="text-danger mt-1.5 text-xs font-semibold">{otpError}</p>}
          </div>

          {/* <div className="bg-muted/60 border-border/60 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left">
            <span className="bg-brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs">
              💡
            </span>
            <div className="min-w-0">
              <p className="text-muted-foreground text-[10px] font-bold tracking-[0.1em] uppercase">
                {t.otpFactsLabel}
              </p>
              <p key={factIndex} className="animate-pop-in text-xs font-semibold leading-snug">
                {t.otpFacts[factIndex]}
              </p>
            </div>
          </div> */}

          <button
            type="submit"
            disabled={otp.length !== 6 || otpVerifying}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3.5 text-base font-bold transition-transform duration-200 ${
              otp.length === 6 && !otpVerifying
                ? "bg-brand-gradient text-primary-foreground shadow-[var(--shadow-float)] hover:-translate-y-0.5 active:scale-[0.97]"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            }`}
          >
            {otpVerifying ? t.otpVerifyingCta : t.otpVerifyCta}
          </button>
          <button
            type="button"
            disabled={otpResendSeconds > 0 || otpSending}
            onClick={() => sendOtp(mobileNumber)}
            className="text-primary disabled:text-muted-foreground text-center text-sm font-bold underline disabled:no-underline"
          >
            {otpResendSeconds > 0 ? t.otpResendIn.replace("{s}", String(otpResendSeconds)) : t.otpResendCta}
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}

export function CallbackModal({ capture }: { capture: LeadCapture }) {
  const { t, showCallbackModal, handleCallbackChoice } = capture;
  if (!showCallbackModal) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-foreground/50 p-4 backdrop-blur-sm">
      <div className="flex min-h-full items-center justify-center">
      <div className="bg-card my-auto w-[calc(100vw-2rem)] min-w-0 max-w-md overflow-hidden rounded-3xl shadow-[var(--shadow-float)]">
        <div className="bg-brand-gradient relative flex flex-col items-center gap-2 px-6 pb-6 pt-8 text-center">
          <span className="bg-success-soft text-success absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
            {t.matchedBadge}
          </span>
          <img
            src="/ruby-m0.png"
            alt="Ruby, your SwiftLoan assistant"
            className="h-16 w-16 rounded-full border-4 border-white/40 object-cover shadow-lg"
          />
          <h3 className="text-primary-foreground text-lg font-extrabold leading-snug">{t.callbackPromptTitle}</h3>
          <p className="text-primary-foreground/90 text-sm font-semibold leading-relaxed">{t.callbackPromptBody}</p>
        </div>

        <div className="flex flex-col gap-4 px-6 py-6">
          <ul className="flex flex-col gap-2.5">
            {t.callbackBenefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm font-semibold">
                <Check className="text-success mt-0.5 h-4 w-4 shrink-0" strokeWidth={3} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => handleCallbackChoice("yes")}
            className="bg-brand-gradient text-primary-foreground cta-pulse mt-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3.5 text-base font-bold shadow-[var(--shadow-float)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97]"
          >
            <Phone className="h-5 w-5" strokeWidth={2.4} />
            {t.callbackYesCta}
          </button>
          <button
            type="button"
            onClick={() => handleCallbackChoice("no")}
            className="text-muted-foreground text-center text-sm font-bold underline decoration-2 underline-offset-2"
          >
            {t.callbackNoCta}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
