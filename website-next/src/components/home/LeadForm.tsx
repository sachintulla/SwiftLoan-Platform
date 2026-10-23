'use client';
import { useEffect } from "react";
import { ArrowRight, ArrowRightLeft, FileCheck, Landmark, LockKeyhole, ShieldCheck, QrCode } from "lucide-react";

import { Reveal } from "@/components/site/Reveal";
import { Slider } from "@/components/ui/slider";
import { fmtINR } from "@/lib/core";
import { leadFormCopy } from "@/i18n/lead-form";
import { useLeadCapture, AMOUNT_MIN, AMOUNT_MAX, AMOUNT_STEP, appStoreUrl } from "@/hooks/useLeadCapture";
import { Label, MobileInput, OtpModal, CallbackModal } from "@/components/home/LeadCaptureUI";

type LeadFormText = (typeof leadFormCopy)["en"];

/**
 * Imperative bridge for the voice agent (same pattern as window.__swiftloanCalc).
 *
 * The amount and loan type are React state behind a Radix slider and a hidden
 * input. React never listens for change events on `type="hidden"` inputs, so the
 * widget's generic "write the value + dispatch input" could not reach them —
 * the slider stayed "untouched" and Apply now stayed disabled. Publishing a
 * setter that calls the same handlers a drag would is the reliable route.
 */
export interface SwiftLoanLeadApi {
  read: () => { amount: number | null; loanType: string; mobileFilled: boolean; canSubmit: boolean };
  set: (v: { amount?: number; loanType?: string }) => { amount: number | null; loanType: string };
}

const assuranceIcons = [ShieldCheck, ArrowRightLeft, Landmark, FileCheck];

/**
 * QR for the app link.
 *
 * NOTE: this is a third-party image service, so every visitor's context link
 * (which carries their lead token) is sent to api.qrserver.com. That is fine for
 * a demo and NOT fine for launch — swap for a local generator before go-live.
 */
function qrFor(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(url)}`;
}

export function LeadForm() {
  const cap = useLeadCapture();
  const {
    t,
    formRef,
    panel,
    seconds,
    landing,
    loanType,
    handleLoanTypeChange,
    amount,
    amountTouched,
    handleAmountChange,
    isSubmitting,
    formValid,
    submitHintVisible,
    setSubmitHintVisible,
    getDisabledReason,
    onSubmit,
    handleFormChange,
  } = cap;

  useEffect(() => {
    const w = window as unknown as { __swiftloanLead?: SwiftLoanLeadApi };
    const mobileFilled = () => {
      const m = formRef.current?.querySelector<HTMLInputElement>('[name="mobile"]');
      return !!m && /^[6-9]\d{9}$/.test(m.value);
    };
    w.__swiftloanLead = {
      read: () => ({
        amount: amountTouched ? amount : null,
        loanType,
        mobileFilled: mobileFilled(),
        canSubmit: formValid && !isSubmitting,
      }),
      set: (v) => {
        if (typeof v.amount === "number" && Number.isFinite(v.amount)) {
          const snapped = Math.round(v.amount / AMOUNT_STEP) * AMOUNT_STEP;
          handleAmountChange(Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, snapped)));
        }
        if (v.loanType) handleLoanTypeChange(v.loanType);
        return {
          amount: typeof v.amount === "number" ? Math.min(AMOUNT_MAX, Math.max(AMOUNT_MIN, Math.round(v.amount / AMOUNT_STEP) * AMOUNT_STEP)) : amountTouched ? amount : null,
          loanType: v.loanType ?? loanType,
        };
      },
    };
    return () => {
      delete w.__swiftloanLead;
    };
  }, [amount, amountTouched, loanType, formValid, isSubmitting, handleAmountChange, handleLoanTypeChange, formRef]);

  return (
    // overflow-x-clip: the card's soft-ping glow ring (below) scales up to
    // 1.6x mid-pulse — on a mobile-width card that's most of the viewport,
    // its peak size pokes past both screen edges, which was tripping real
    // page-level horizontal overflow (confirmed: documentElement.scrollWidth
    // > clientWidth). Matches the same overflow-x:clip fix already applied
    // to <html> in design.css for this exact class of full-bleed overflow.
    <section id="lead-form" className="shell scroll-mt-28 overflow-x-clip py-16 sm:py-24">
      <div className="grid items-center gap-12 sm:gap-14 md:grid-cols-[1fr_22rem] lg:grid-cols-[1fr_28rem]">
        {/* Left: copy + assurances */}
        <div className="flex flex-col gap-10">
          <Reveal className="text-left">
            <div>
              <span className="eyebrow flex-wrap">{t.eyebrow}</span>
              <h2 className="mt-5 text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl lg:text-5xl">
                {t.headingLine1}
                <br />
                <span className="text-gradient">{t.headingHighlight}</span>
              </h2>
              <p className="text-muted-foreground mt-6 max-w-xl text-base font-medium leading-relaxed sm:text-lg">
                {t.subhead}
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="bg-muted/60 border-border/60 flex items-center gap-4 rounded-2xl border px-5 py-4">
              <span className="bg-card grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-[var(--shadow-float)]">
                <LockKeyhole className="text-primary h-5 w-5" />
              </span>
              <p className="min-w-0 text-sm font-semibold sm:text-base">{t.encryptedNote}</p>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2">
            {t.assurances.map((a, i) => (
              <Reveal key={a.title} delay={120 + i * 80}>
                <Tile icon={assuranceIcons[i % assuranceIcons.length]!} {...a} />
              </Reveal>
            ))}
          </div>
        </div>

        {/* Right: the form — a plain card, not a phone mockup (a screenshot-
            style device frame read as decoration, not something to click into).
            A soft pulsing ring + glow draws the eye here without being a real
            popup — that's QuickCheckModal, opened from the header/hero CTAs. */}
        <Reveal delay={140} className="min-w-0">
          <div className="relative mx-auto w-full max-w-lg">
            <div className="bg-brand-gradient absolute -inset-4 rounded-[2.5rem] opacity-20 blur-3xl" />
            <span className="border-primary/40 absolute -inset-2 rounded-[2.75rem] border-2 animate-soft-ping" aria-hidden />
            <div className="glass relative overflow-hidden rounded-3xl p-7 shadow-[var(--shadow-float)] ring-1 ring-primary/15 sm:p-10">
              {panel === "form" ? (
                <form ref={formRef} onSubmit={onSubmit} onChange={handleFormChange} className="flex flex-col gap-7">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">{t.formTitle}</h3>
                    <span className="bg-success-soft text-success shrink-0 rounded-full px-3 py-1.5 text-xs font-bold leading-tight tracking-wide uppercase">
                      {t.softCheckBadge}
                    </span>
                  </div>

                  {/* No visible loan-type picker — defaults to Personal Loan.
                      Mirrors into a real form field (name="loanType") purely so
                      the Ello voice widget's select_loan_type tool — which sets
                      values via the native setter + dispatchEvent('input'), the
                      same way it fills every other field — still has something
                      to write to and still reaches React state. */}
                  <input
                    type="hidden"
                    name="loanType"
                    value={loanType}
                    onChange={(e) => handleLoanTypeChange(e.target.value)}
                  />

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
                    {/* Same mirroring purpose as loanType's hidden input above —
                        lets the voice widget's set_loan_amount tool drive this
                        slider by writing to a real form field. */}
                    <input
                      type="hidden"
                      name="amount"
                      value={amount}
                      onChange={(e) => handleAmountChange(Number(e.target.value) || amount)}
                    />
                  </div>

                  <MobileInput capture={cap} />

                  <div
                    className="relative flex items-center gap-2"
                    onMouseEnter={() => setSubmitHintVisible(true)}
                    onMouseLeave={() => setSubmitHintVisible(false)}
                  >
                    {submitHintVisible && !formValid && (
                      <span
                        role="tooltip"
                        className="bg-foreground text-background pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold shadow-[var(--shadow-float)]"
                      >
                        {getDisabledReason()}
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={!formValid || isSubmitting}
                      className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full px-6 py-4 text-center text-base font-bold transition-transform duration-200 ${
                        formValid && !isSubmitting
                          ? "bg-brand-gradient text-primary-foreground cta-pulse shadow-[var(--shadow-float)] hover:-translate-y-0.5 hover:scale-[1.02] active:scale-[0.96]"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
                      }`}
                    >
                      <span className="min-w-0 leading-snug">{isSubmitting ? t.submittingCta : t.submitCta}</span>
                      <ArrowRight className="h-5 w-5 shrink-0" />
                    </button>
                  </div>
                </form>
              ) : (
                <SuccessView seconds={seconds} active={panel === "success"} t={t} landing={landing} />
              )}
              {panel === "success" && <Confetti />}
            </div>
          </div>
        </Reveal>
      </div>

      <OtpModal capture={cap} />
      <CallbackModal capture={cap} />
    </section>
  );
}

const confettiColors = [
  "var(--success)",
  "var(--warning)",
  "var(--primary)",
  "var(--info)",
  "var(--danger)",
];

function Confetti() {
  const pieces = Array.from({ length: 34 }, (_, i) => i);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((i) => {
        const left = (i * 37) % 100;
        const dx = ((i % 7) - 3) * 18;
        const delay = (i % 10) * 90;
        const w = i % 3 === 0 ? 4 : 6;
        const h = i % 4 === 0 ? 10 : 6;
        return (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${left}%`,
              width: `${w}px`,
              height: `${h}px`,
              background: confettiColors[i % confettiColors.length],
              animationDelay: `${delay}ms`,
              ["--dx" as string]: `${dx}px`,
              ["--rot" as string]: `${360 + (i % 5) * 180}deg`,
            }}
          />
        );
      })}
    </div>
  );
}

function SuccessView({
  seconds,
  active,
  t,
  landing,
}: {
  seconds: number;
  active: boolean;
  t: LeadFormText;
  /** Context link from /api/context/create — carries this lead's token so the
   *  app resumes with their details already filled in. Falls back to the plain
   *  store URL while the request is in flight or if it failed. */
  landing?: string;
}) {
  const target = landing || appStoreUrl;
  const qr = qrFor(target);
  const step = (i: number) =>
    active ? { animationDelay: `${300 + i * 110}ms` } : { opacity: 0 };
  const cls = active ? "animate-rise-in" : "opacity-0";

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center">
        <span
          className={`bg-success-soft text-success relative rounded-full px-4 py-1.5 text-xs font-bold tracking-[0.1em] uppercase ${active ? "animate-pop-in" : "opacity-0"}`}
          style={active ? { animationDelay: "200ms" } : { opacity: 0 }}
        >
          <span className="bg-success/25 absolute inset-0 -z-10 rounded-full animate-soft-ping" />
          {t.matchedBadge}
        </span>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col text-center">
        <h3 className={`text-lg font-extrabold leading-snug tracking-tight ${cls}`} style={step(0)}>
          {t.successTitle}
        </h3>
        <p className={`text-muted-foreground mt-2 text-xs font-semibold leading-snug ${cls}`} style={step(1)}>
          {t.successBody}
        </p>

        <p
          className={`text-muted-foreground mt-3 text-[11px] font-bold tracking-[0.12em] uppercase ${cls}`}
          style={step(2)}
        >
          {t.scanPrompt}
        </p>
        <div
          className={`border-border bg-background mt-2 grid flex-1 place-items-center rounded-2xl border p-2 ${active ? "animate-pop-in" : "opacity-0"}`}
          style={active ? { animationDelay: "620ms" } : { opacity: 0 }}
        >
          <img
            src={qr}
            alt={t.qrAlt}
            width={180}
            height={180}
            className="h-full max-h-28 w-auto"
          />
          <QrCode className="sr-only" />
        </div>

        <div className={`my-2.5 flex items-center gap-2 ${cls}`} style={step(4)}>
          <span className="bg-border h-px flex-1" />
          <span className="text-muted-foreground text-xs font-semibold">{t.or}</span>
          <span className="bg-border h-px flex-1" />
        </div>

        <a
          href={target}
          className={`bg-brand-gradient text-primary-foreground inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-[var(--shadow-float)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.97] ${cls}`}
          style={step(5)}
        >
          <span className="min-w-0 leading-snug">{t.openAppStore}</span>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </a>

        <p className={`text-foreground mt-3 text-sm font-bold leading-snug ${cls}`} style={step(6)}>
          {t.redirectingPrefix}{" "}
          <span key={seconds} className="animate-pop-in text-primary inline-block font-extrabold">
            {seconds}s
          </span>
          …
        </p>
        <a
          href={target}
          className={`text-primary mt-1 mb-5 text-sm font-bold underline decoration-2 underline-offset-2 ${cls}`}
          style={step(7)}
        >
          {t.notRedirected}
        </a>


        <div
          className={`bg-muted/60 border-border/60 mt-auto flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${cls}`}
          style={step(8)}

        >
          <LockKeyhole className="text-primary h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold leading-snug">
            {t.savedSecurely}
          </span>
        </div>
      </div>
    </div>

  );
}


function Tile({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="glass lift flex h-full items-start gap-4 rounded-3xl p-5">
      <span className="bg-brand-gradient text-primary-foreground grid h-10 w-10 shrink-0 place-items-center rounded-2xl shadow-[var(--shadow-soft)]">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-extrabold leading-tight">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm font-medium leading-relaxed">{body}</p>
      </div>
    </div>
  );
}
