'use client';
import { ArrowRight, Clock, Lock, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
/**
 * Served from public/, not the package's asset manifest.
 *
 * hero.mp4.asset.json points at a Lovable-hosted path (/__l5e/assets-v1/...)
 * that does not exist on our domain, so the original import rendered a <video>
 * with a 404 src — a silently blank hero, since a failed video shows nothing.
 */
const heroVideo = { url: "/hero.mp4" };
import { Reveal } from "@/components/site/Reveal";
import { useCopy } from "@/lib/i18n";
import { heroCopy } from "@/i18n/hero";
import { useLeadCapture } from "@/hooks/useLeadCapture";
import { MobileInput, OtpModal, CallbackModal } from "@/components/home/LeadCaptureUI";

const badgeIcons: LucideIcon[] = [TrendingUp, Clock, Lock];

export function Hero() {
  const t = useCopy(heroCopy);
  const badges = t.badges.map((b, i) => ({ ...b, icon: badgeIcons[i]! }));
  const cap = useLeadCapture({ requireAmountTouched: false });
  const { formRef, onSubmit, handleFormChange, formValid, isSubmitting, t: capT } = cap;

  return (
    <section className="relative overflow-hidden pt-14 pb-20 sm:pt-20">
      <div className="shell grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="min-w-0">
          <Reveal>
            <span className="eyebrow">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>{t.eyebrow}</span>
            </span>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="mt-6 text-3xl leading-[1.15] font-extrabold sm:text-4xl sm:leading-[1.05] lg:text-[3.7rem]">
              {t.heading}
              <span className="text-gradient">{t.headingHighlight}</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="text-muted-foreground mt-6 max-w-xl text-base leading-relaxed sm:text-lg">
              {t.body}
            </p>
          </Reveal>

          <Reveal delay={240}>
            {/* Simple inline form — just the mobile number, right where the
                headline is. The full card version still lives at #lead-form
                further down; this is a second, no-scroll entry point into
                the same submit → OTP → callback flow. The loan amount is
                asked in the OTP popup that follows (see OtpModal's
                showAmount below), not here — this stays a one-field form. */}
            <form
              ref={formRef}
              onSubmit={onSubmit}
              onChange={handleFormChange}
              className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-start"
            >
              <input type="hidden" name="loanType" value="Personal Loan" readOnly />
              <div className="min-w-0 flex-1 sm:max-w-xs">
                <MobileInput capture={cap} />
              </div>
              <button
                type="submit"
                disabled={!formValid || isSubmitting}
                className={`group inline-flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-xl border px-6 text-sm font-bold transition-transform sm:mt-[1.9rem] ${
                  formValid && !isSubmitting
                    ? "bg-brand-gradient cta-pulse border-transparent text-primary-foreground shadow-[var(--shadow-float)] hover:-translate-y-0.5 active:scale-[0.97]"
                    : "bg-muted text-muted-foreground border-border cursor-not-allowed"
                }`}
              >
                {isSubmitting ? capT.submittingCta : t.ctaPrimary}
                <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </button>
            </form>
          </Reveal>

          <Reveal delay={320}>
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {badges.map((b) => (
                <div key={b.label} className="glass lift min-w-0 rounded-2xl p-4">
                  <span className="bg-brand-gradient grid h-9 w-9 place-items-center rounded-xl shadow-[var(--shadow-float)]">
                    <b.icon className="text-primary-foreground h-4.5 w-4.5" />
                  </span>
                  <p className="font-display mt-3 text-base font-bold break-words">{b.value}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs leading-snug">{b.label}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={200} className="min-w-0">
          <div className="relative mx-auto flex aspect-[9/16] h-auto max-h-[640px] w-auto max-w-full items-center justify-center overflow-hidden rounded-[2rem]">
            <video
              src={heroVideo.url}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              width={720}
              height={1280}
              aria-label={t.videoAlt}
              className="h-full w-full rounded-[2.5rem] object-contain [filter:brightness(1.14)_saturate(1.12)_contrast(1.04)]"
            />
          </div>
        </Reveal>
      </div>

      <OtpModal capture={cap} showAmount />
      <CallbackModal capture={cap} />
    </section>
  );
}
