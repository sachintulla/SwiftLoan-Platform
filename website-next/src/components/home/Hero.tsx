'use client';
import { ArrowRight, Clock, Lock, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { Slider } from "@/components/ui/slider";
import { fmtINR } from "@/lib/core";
import { useCopy } from "@/lib/i18n";
import { heroCopy } from "@/i18n/hero";
import { useLeadCapture, AMOUNT_MIN, AMOUNT_MAX, AMOUNT_STEP } from "@/hooks/useLeadCapture";
import { Input, Label, MobileInput, OtpModal, CallbackModal } from "@/components/home/LeadCaptureUI";

const badgeIcons: LucideIcon[] = [TrendingUp, Clock, Lock];

export function Hero() {
  const t = useCopy(heroCopy);
  const badges = t.badges.map((b, i) => ({ ...b, icon: badgeIcons[i]! }));
  const cap = useLeadCapture({ requireAmountTouched: false });
  const {
    formRef, onSubmit, handleFormChange, formValid, isSubmitting, t: capT,
    focusedField, handleFocus, handleBlur, amount, amountTouched, handleAmountChange,
  } = cap;

  return (
    <section className="relative overflow-hidden pt-6 pb-10 sm:pt-9 sm:pb-16">
      {/* Pitch on the left, the apply card on the right. On lg the phone preview
          sits behind the card as brand atmosphere; on mobile/tablet the card is
          the hero so Name + Mobile + Loan amount are always above the fold. */}
      <div className="shell grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
        {/* ── Left: pitch + slim trust strip ── */}
        <div className="min-w-0">
          <Reveal>
            <span className="eyebrow">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>{t.eyebrow}</span>
            </span>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="mt-4 text-[2rem] font-extrabold leading-[1.08] tracking-tight sm:mt-5 sm:text-[2.7rem] lg:text-[3.3rem] lg:leading-[1.05]">
              {t.heading}
              <span className="text-gradient">{t.headingHighlight}</span>
            </h1>
          </Reveal>

          <Reveal delay={130}>
            <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed sm:mt-4 sm:text-base">
              {t.body}
            </p>
          </Reveal>

          {/* Slim trust strip — replaces the big badge grid so it never pushes
              the form below the fold, keeps the signals (soft check / speed /
              encryption) in view. */}
          <Reveal delay={190}>
            <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 sm:mt-7">
              {badges.map((b) => (
                <li key={b.label} className="flex items-center gap-2.5">
                  <span className="bg-brand-gradient grid h-8 w-8 shrink-0 place-items-center rounded-xl shadow-[var(--shadow-soft)]">
                    <b.icon className="text-primary-foreground h-4 w-4" />
                  </span>
                  <span className="text-sm leading-tight">
                    <span className="text-foreground font-extrabold">{b.value}</span>
                    <span className="text-muted-foreground block text-xs font-medium">{b.label}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>

        </div>

        {/* ── Right: the apply card (Name, Mobile, Loan amount) ── */}
        <Reveal delay={120} className="min-w-0">
          <div className="relative mx-auto w-full max-w-md lg:ml-auto lg:mr-0">
            <div className="bg-brand-gradient absolute -inset-3 rounded-[2.5rem] opacity-15 blur-3xl" aria-hidden />
            <span className="border-primary/30 absolute -inset-1.5 rounded-[2.25rem] border-2 animate-soft-ping" aria-hidden />

            <form
              ref={formRef}
              onSubmit={onSubmit}
              onChange={handleFormChange}
              className="glass relative flex flex-col gap-4 rounded-3xl p-5 shadow-[var(--shadow-float)] ring-1 ring-primary/15 sm:gap-5 sm:p-7"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold tracking-tight sm:text-xl">{t.formTitle}</h2>
                <span className="bg-success-soft text-success shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase leading-none tracking-wide">
                  {t.softBadge}
                </span>
              </div>

              <input type="hidden" name="loanType" value="Personal Loan" readOnly />

              <Input
                label={t.nameLabel}
                placeholder={t.namePlaceholder}
                name="name"
                focusedField={focusedField}
                onFocus={handleFocus}
                onBlur={handleBlur}
                autoComplete="name"
              />

              <MobileInput capture={cap} />

              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <Label text={t.amountLabel} />
                  <span className="text-primary text-lg font-extrabold">
                    {amountTouched ? fmtINR(amount) : capT.amountUnselected}
                  </span>
                </div>
                <Slider
                  className="mt-4"
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
                <input type="hidden" name="amount" value={amount} readOnly />
              </div>

              <button
                type="submit"
                disabled={!formValid || isSubmitting}
                className={`group inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-bold transition-transform ${
                  formValid && !isSubmitting
                    ? "bg-brand-gradient cta-pulse text-primary-foreground shadow-[var(--shadow-float)] hover:-translate-y-0.5 active:scale-[0.97]"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {isSubmitting ? capT.submittingCta : t.ctaPrimary}
                <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </button>

              <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[11px] font-semibold">
                <Lock className="text-primary h-3.5 w-3.5 shrink-0" />
                {t.secureNote}
              </p>
            </form>
          </div>
        </Reveal>
      </div>

      <OtpModal capture={cap} />
      <CallbackModal capture={cap} />
    </section>
  );
}
