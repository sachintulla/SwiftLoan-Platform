'use client';
import Link from 'next/link';
import { ArrowRight, Calculator, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCopy, useLocalizedHref } from '@/lib/i18n';
import { loanPagesCopy } from '@/i18n/loan-pages';
import { offersCopy } from '@/i18n/offers';
import { DOCS_PAGE_PATHS, docsPagesCopy, type DocsPageKey } from '@/i18n/docs-pages';
import { PURPOSE_KEYS, PURPOSE_PATH } from '@/i18n/purpose-pages';

/** The deeper guides each loan page links to. */
const RELATED_GUIDES: Record<'personal' | 'business', DocsPageKey[]> = {
  personal: ['personalDocs', 'eligibility', 'selfEmployed'],
  business: ['businessDocs'],
};

/** Which loan the page is about; the index is its card on the home page (offers.ts). */
export type LoanKind = 'personal' | 'business';
export const LOAN_CARD_INDEX: Record<LoanKind, number> = { personal: 0, business: 1 };

/**
 * /personal-loan and /business-loan (and their /hi, /te versions). Server-rendered in the page's
 * language so Google reads all of it;
 * the key facts and uses come from the home page's loan card, so the two always agree.
 */
export function LoanGuide({ kind }: { kind: LoanKind }) {
  const all = useCopy(loanPagesCopy);
  const t = all[kind];
  const card = useCopy(offersCopy).offers[LOAN_CARD_INDEX[kind]];
  const docs = useCopy(docsPagesCopy);
  const href = useLocalizedHref(); // keeps a Hindi / Telugu reader on that language's pages

  return (
    <main>
      <div className="shell pt-10 sm:pt-14">
        <nav aria-label="Breadcrumb" className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <Link href={href('/')} className="hover:text-foreground">{all.home}</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span aria-current="page" className="text-foreground font-semibold">{t.breadcrumb}</span>
        </nav>
        <h1 className="mt-6 max-w-3xl text-3xl leading-snug font-extrabold sm:text-4xl lg:text-5xl">{t.h1}</h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed">{t.intro}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={href('/#lead-form')} className="bg-brand-gradient inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm font-semibold text-white">
            {t.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={href('/emi-calculator')} className="border-border inline-flex items-center gap-1.5 rounded-full border px-6 py-3 text-sm font-semibold">
            <Calculator className="h-4 w-4" /> {t.emiLink}
          </Link>
        </div>
      </div>

      <section className="shell py-12">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="glass-panel p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold">{t.factsTitle}</h2>
            <ul className="mt-5 space-y-3">
              {card.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5">
                  <CheckCircle2 className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="glass-panel p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold">{t.usesTitle}</h2>
            <div className="mt-5 flex flex-wrap gap-2">
              {card.tags.map((tag, i) =>
                /* Personal loan: each use has its own page (the chips are in PURPOSE_KEYS order). */
                kind === 'personal' && PURPOSE_KEYS[i] ? (
                  <Link key={tag} href={href(PURPOSE_PATH[PURPOSE_KEYS[i]])} className="bg-accent hover:text-primary rounded-full px-3.5 py-1.5 text-sm font-semibold">{tag}</Link>
                ) : (
                  <span key={tag} className="bg-accent rounded-full px-3.5 py-1.5 text-sm font-semibold">{tag}</span>
                ),
              )}
            </div>
            <p className="text-muted-foreground mt-5 leading-relaxed">{card.body}</p>
          </div>
        </div>
      </section>

      <section className="shell pb-12">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="glass-panel p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold">{t.whoTitle}</h2>
            <ul className="text-muted-foreground mt-5 list-disc space-y-2 pl-5 leading-relaxed">
              {t.who.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
          <div className="glass-panel p-6 sm:p-8">
            <h2 className="text-2xl font-extrabold">{t.docsTitle}</h2>
            <ul className="mt-5 space-y-3">
              {t.docs.map((d) => (
                <li key={d} className="flex items-center gap-2.5">
                  <FileText className="text-primary h-5 w-5 shrink-0" aria-hidden />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="shell pb-10">
        <div className="flex flex-wrap gap-2">
          {RELATED_GUIDES[kind].map((k) => (
            <Link key={k} href={href(DOCS_PAGE_PATHS[k])} className="border-border hover:text-primary rounded-full border px-4 py-2 text-sm font-semibold">
              {docs.pages[k].breadcrumb}
            </Link>
          ))}
        </div>
      </section>

      <section className="shell pb-12">
        <h2 className="text-2xl font-extrabold sm:text-3xl">{t.stepsTitle}</h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {t.steps.map((s, i) => (
            <li key={s.title} className="glass-panel p-5">
              <span className="bg-brand-gradient inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">{i + 1}</span>
              <h3 className="mt-3 font-bold">{s.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="shell pb-6">
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
          <Link href={href('/#lead-form')} className="bg-brand-gradient inline-flex shrink-0 items-center gap-1.5 rounded-full px-6 py-3 text-sm font-semibold text-white">
            {t.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">{t.disclaimer}</p>
      </section>
    </main>
  );
}
