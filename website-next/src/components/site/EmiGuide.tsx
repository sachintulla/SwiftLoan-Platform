'use client';
import Link from 'next/link';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { EmiCalculator } from '@/components/home/EmiCalculator';
import { useCopy, useLocalizedHref } from '@/lib/i18n';
import { emiPageCopy } from '@/i18n/emi-page';
import { emiRow, inrWhole } from '@/lib/emi';

/** The worked example under "How EMI is calculated": ₹5,00,000 at 11.5% (the calculator's default rate). */
const EXAMPLE = { principal: 500000, rate: 11.5, tenures: [12, 24, 36, 60] };

/**
 * The /emi-calculator page body: the calculator plus the explanation people search for. It renders
 * on the server in the page's language (English at /emi-calculator, Hindi at /hi/…, Telugu at
 * /te/…), so all of this text is in the page Google reads.
 */
export function EmiGuide() {
  const t = useCopy(emiPageCopy);
  const href = useLocalizedHref(); // keeps a Hindi / Telugu reader on that language's pages
  const rows = EXAMPLE.tenures.map((n) => emiRow(EXAMPLE.principal, EXAMPLE.rate, n));

  return (
    <main>
      <div className="shell pt-10 sm:pt-14">
        <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Link href={href('/')} className="hover:text-foreground">{t.breadcrumbHome}</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span aria-current="page" className="text-foreground font-semibold">{t.breadcrumbHere}</span>
        </nav>
        <h1 className="mt-6 max-w-3xl text-3xl leading-snug font-extrabold sm:text-4xl lg:text-5xl">{t.h1}</h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed">{t.intro}</p>
      </div>

      <EmiCalculator />

      <section className="shell pb-6">
        <div className="glass-panel grid gap-8 p-6 sm:p-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold">{t.formulaTitle}</h2>
            <p className="text-muted-foreground mt-3 leading-relaxed">{t.formulaIntro}</p>
            <p className="bg-accent mt-4 overflow-x-auto rounded-2xl px-4 py-3 font-mono text-sm font-semibold sm:text-base">{t.formula}</p>
            <ul className="text-muted-foreground mt-4 list-disc space-y-1.5 pl-5 leading-relaxed">
              {t.formulaTerms.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <p className="text-muted-foreground mt-4 leading-relaxed">{t.formulaNote}</p>
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold">{t.exampleTitle}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-border border-b">
                    <th className="py-2 pr-3 font-semibold">{t.exampleCols.tenure}</th>
                    <th className="py-2 pr-3 font-semibold">{t.exampleCols.emi}</th>
                    <th className="py-2 pr-3 font-semibold">{t.exampleCols.interest}</th>
                    <th className="py-2 font-semibold">{t.exampleCols.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.months} className="border-border border-b last:border-0">
                      <td className="py-2.5 pr-3 font-semibold">{r.months} {t.months}</td>
                      <td className="py-2.5 pr-3">{inrWhole(r.emi)}</td>
                      <td className="py-2.5 pr-3">{inrWhole(r.totalInterest)}</td>
                      <td className="py-2.5">{inrWhole(r.totalRepayment)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">{t.exampleNote}</p>
          </div>
        </div>
      </section>

      <section className="shell py-10">
        <h2 className="text-2xl font-extrabold sm:text-3xl">{t.tipsTitle}</h2>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {t.tips.map((tip) => (
            <div key={tip.title} className="glass-panel p-5">
              <h3 className="font-bold">{tip.title}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{tip.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell py-6">
        <h2 className="text-2xl font-extrabold sm:text-3xl">{t.faqTitle}</h2>
        <Accordion type="single" collapsible className="glass-panel mt-6 px-5 sm:px-7">
          {t.faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`q${i}`}>
              <AccordionTrigger className="text-left font-semibold">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="glass-panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-extrabold sm:text-2xl">{t.ctaTitle}</h2>
            <p className="text-muted-foreground mt-2">{t.ctaBody}</p>
          </div>
          <Link
            href={href('/#lead-form')}
            className="bg-brand-gradient inline-flex shrink-0 items-center gap-1.5 rounded-full px-6 py-3 text-sm font-semibold text-white"
          >
            {t.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">{t.disclaimer}</p>
      </section>
    </main>
  );
}
