'use client';
import { ArrowRight, Clock, HelpCircle, IndianRupee, Landmark, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Reveal } from '@/components/site/Reveal';
import { useCopy } from '@/lib/i18n';
import { faqsCopy } from '@/i18n/faqs';

const highlightIcons = [Clock, ShieldCheck, IndianRupee, Landmark];
const highlightTones = [
  { tone: 'bg-warning text-warning-foreground', valueTone: 'text-warning-foreground' },
  { tone: 'bg-success text-success-foreground', valueTone: 'text-success' },
  { tone: 'bg-brand-gradient text-primary-foreground', valueTone: 'text-primary' },
  { tone: 'bg-info text-info-foreground', valueTone: 'text-info' },
];

function FaqsPage() {
  const t = useCopy(faqsCopy);
  return (
    <main className="shell py-14 sm:py-20">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div>
          <span className="eyebrow flex-wrap">
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            {t.eyebrowIcon}
          </span>
          <h1 className="mt-6 text-3xl leading-snug font-extrabold sm:text-4xl lg:text-5xl">
            {t.headingLine1} <span className="text-gradient">{t.headingHighlight}</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-base leading-relaxed">{t.subhead}</p>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.highlights.map((h, i) => {
            const Icon = highlightIcons[i % highlightIcons.length]!;
            const tone = highlightTones[i % highlightTones.length]!;
            return (
              <div
                key={h.label}
                className="glass lift flex items-center gap-4 rounded-3xl px-6 py-6"
              >
                <span
                  className={`${tone.tone} grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-[var(--shadow-soft)]`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className={`font-display text-xl font-extrabold leading-snug sm:text-2xl ${tone.valueTone}`}>
                    {h.value}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm leading-snug">{h.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <Reveal delay={120}>
        <div className="glass-panel mt-14 p-4 sm:p-10">
          <Accordion type="single" collapsible className="w-full">
            {t.faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`} className="border-border/60">
                <AccordionTrigger className="text-left text-base leading-snug font-semibold hover:no-underline">
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                  {f.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Reveal>

      <Reveal delay={200}>
        <div className="mt-12 text-center">
          <Link
            href="/#lead-form"
            className="bg-brand-gradient inline-flex min-h-10 flex-wrap items-center justify-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-float)] transition-transform hover:-translate-y-0.5"
          >
            {t.cta} <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
        </div>
      </Reveal>
    </main>
  );
}

export default FaqsPage;
