'use client';
import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { fmtINR } from "@/lib/core";
import { useLeadCapture, AMOUNT_MIN, AMOUNT_MAX, AMOUNT_STEP } from "@/hooks/useLeadCapture";
import { Label, MobileInput, OtpModal, CallbackModal } from "@/components/home/LeadCaptureUI";

/**
 * The header's and hero's "Check eligibility" buttons open THIS instead of
 * scrolling to #lead-form — a popup gets someone typing their number in one
 * click, from wherever they are on the page, rather than asking them to find
 * the section first. Mounted once in layout.tsx; any button anywhere can open
 * it via `window.__swiftloanQuickCheck?.open()` (same convention as the
 * voice widget's __swiftloanVoice/__swiftloanCalc globals).
 *
 * Runs its own useLeadCapture() instance — deliberately not shared with the
 * inline #lead-form card. They're independent entry points to the same
 * backend flow, not two views of one form.
 */
declare global {
  interface Window {
    __swiftloanQuickCheck?: { open: () => void };
  }
}

export function QuickCheckModal() {
  const [open, setOpen] = useState(false);
  const cap = useLeadCapture();
  const {
    t,
    formRef,
    onSubmit,
    handleFormChange,
    loanType,
    handleLoanTypeChange,
    amount,
    amountTouched,
    handleAmountChange,
    formValid,
    isSubmitting,
    panel,
  } = cap;

  useEffect(() => {
    window.__swiftloanQuickCheck = { open: () => setOpen(true) };
    return () => {
      delete window.__swiftloanQuickCheck;
    };
  }, []);

  // Once the visitor reaches the success panel inside this popup (submitted,
  // OTP verified, callback answered), there's nothing left for the popup
  // shell itself to show — the OTP/callback modals already took over the
  // screen, and closing this shell underneath them is harmless.
  useEffect(() => {
    if (panel === "success") setOpen(false);
  }, [panel]);

  if (!open) return <OverlayModals cap={cap} />;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-foreground/50 p-4 backdrop-blur-sm">
        <div className="flex min-h-full items-center justify-center">
        <div className="bg-card relative my-auto w-[calc(100vw-2rem)] min-w-0 max-w-md overflow-hidden rounded-3xl shadow-[var(--shadow-float)]">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-muted-foreground hover:bg-muted hover:text-foreground absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full transition-colors"
          >
            <X className="h-4 w-4" strokeWidth={2.6} />
          </button>

          <div className="bg-brand-gradient flex flex-col items-center gap-2 px-7 pb-7 pt-8 text-center">
            <span className="bg-card/95 grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-2xl shadow-lg">
              ⚡
            </span>
            <h3 className="text-primary-foreground text-xl font-extrabold leading-snug">{t.formTitle}</h3>
            <span className="bg-success-soft text-success rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
              {t.softCheckBadge}
            </span>
          </div>

          <form ref={formRef} onSubmit={onSubmit} onChange={handleFormChange} className="flex flex-col gap-6 px-7 py-7">
            <input type="hidden" name="loanType" value={loanType} onChange={(e) => handleLoanTypeChange(e.target.value)} />

            <div className="block min-w-0">
              <div className="flex items-center justify-between gap-2">
                <Label text={t.amountLabel} required />
                <span className="text-primary text-xl font-extrabold">
                  {amountTouched ? fmtINR(amount) : t.amountUnselected}
                </span>
              </div>
              <Slider
                className="mt-5"
                min={AMOUNT_MIN}
                max={AMOUNT_MAX}
                step={AMOUNT_STEP}
                value={[amountTouched ? amount : AMOUNT_MIN]}
                onValueChange={([v]) => v != null && handleAmountChange(v)}
                aria-label={t.amountLabel}
              />
              <div className="text-muted-foreground mt-2 flex justify-between text-xs font-bold">
                <span>{fmtINR(AMOUNT_MIN)}</span>
                <span>{fmtINR(AMOUNT_MAX)}</span>
              </div>
              <input type="hidden" name="amount" value={amount} onChange={(e) => handleAmountChange(Number(e.target.value) || amount)} />
            </div>

            <MobileInput capture={cap} />

            <button
              type="submit"
              disabled={!formValid || isSubmitting}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-4 text-base font-bold transition-transform duration-200 ${
                formValid && !isSubmitting
                  ? "bg-brand-gradient text-primary-foreground cta-pulse shadow-[var(--shadow-float)] hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.96]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              }`}
            >
              <span className="min-w-0 leading-snug">{isSubmitting ? t.submittingCta : t.submitCta}</span>
              <ArrowRight className="h-5 w-5 shrink-0" />
            </button>
          </form>
        </div>
        </div>
      </div>
      <OverlayModals cap={cap} />
    </>
  );
}

/** OTP + callback popups render on top of (and outlive) the quick-check
 *  shell itself — see the panel==="success" effect above. */
function OverlayModals({ cap }: { cap: ReturnType<typeof useLeadCapture> }) {
  return (
    <>
      <OtpModal capture={cap} />
      <CallbackModal capture={cap} />
    </>
  );
}
