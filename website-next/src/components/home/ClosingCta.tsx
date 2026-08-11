'use client';
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/site/Reveal";
import { useCopy } from "@/lib/i18n";
import { closingCtaCopy } from "@/i18n/closing-cta";

export function ClosingCta() {
  const t = useCopy(closingCtaCopy);
  return (
    <section id="get-started" className="shell pb-8">
      <Reveal>
        <div className="bg-deep-gradient relative overflow-hidden rounded-[2rem] px-5 py-12 text-center text-primary-foreground sm:px-8 sm:py-16">
          <div
            aria-hidden
            className="orb animate-drift -top-24 left-1/3 h-96 w-96 opacity-40"
            style={{ background: "var(--gradient-brand)" }}
          />
          <div className="relative">
            <h2 className="text-2xl leading-snug font-extrabold sm:text-3xl lg:text-4xl">
              {t.heading}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm opacity-85 sm:text-base">{t.body}</p>
            <Link
              href="/#lead-form"
              className="glass-dark mt-9 inline-flex min-h-10 flex-wrap items-center justify-center gap-2 rounded-full px-8 py-4 text-sm font-semibold transition-transform hover:-translate-y-0.5"
            >
              {t.cta} <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
