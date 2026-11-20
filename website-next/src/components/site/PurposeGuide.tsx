'use client';
import Link from 'next/link';
import { ArrowRight, Calculator, CheckCircle2, ChevronRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCopy, useLocalizedHref } from '@/lib/i18n';
import { offersCopy } from '@/i18n/offers';
import { PURPOSE_EXAMPLE, PURPOSE_KEYS, PURPOSE_PATH, purposePagesCopy, type PurposeKey, type PurposeSection } from '@/i18n/purpose-pages';
import { emiRow, inrWhole } from '@/lib/emi';

/** The personal-loan card on the home page (offers.ts): the amount, rate and tenure lines come from it. */
const PERSONAL_CARD_INDEX = 0;

/** One section of the page, drawn by its layout. */
function Section({ s }: { s: PurposeSection }) {
  const heading = <h2 className="text-2xl font-extrabold sm:text-3xl">{s.title}</h2>;
  switch (s.layout) {
    case 'prose':
      return (
        <div className="glass-panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold">{s.title}</h2>
          {s.paragraphs.map((p) => (
            <p key={p} className="text-muted-foreground mt-4 max-w-3xl leading-relaxed">{p}</p>
          ))}
        </div>
      );
    case 'steps':
      return (
        <>
          {heading}
          {s.intro && <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">{s.intro}</p>}
          <ol className={`mt-6 grid gap-5 sm:grid-cols-2 ${s.items.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
            {s.items.map((it, i) => (
              <li key={it.title} className="glass-panel p-5">
                <span className="bg-brand-gradient inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-3 font-bold">{it.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{it.body}</p>
              </li>
            ))}
          </ol>
        </>
      );
    case 'cards':
      return (
        <>
          {heading}
          {s.intro && <p className="text-muted-foreground mt-3 max-w-2xl leading-relaxed">{s.intro}</p>}
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {s.items.map((it) => (
              <div key={it.title} className="glass-panel p-5">
                <h3 className="font-bold">{it.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{it.body}</p>
              </div>
            ))}
          </div>
        </>
      );
    case 'checklist':
      return (
        <div className="glass-panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold">{s.title}</h2>
          {s.intro && <p className="text-muted-foreground mt-3 max-w-3xl leading-relaxed">{s.intro}</p>}
          <ul className="mt-5 space-y-3">
            {s.items.map((it) => (
              <li key={it} className="flex items-start gap-2.5">
                <CheckCircle2 className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>{it}</span>
              </li>
            ))}
          </ul>
          {s.note && <p className="text-muted-foreground mt-5 text-sm leading-relaxed">{s.note}</p>}
        </div>
      );
    case 'twoLists':
      return (
        <>
          {heading}
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {s.lists.map((l) => (
              <div key={l.title} className="glass-panel p-6 sm:p-8">
                <h3 className="text-lg font-bold">{l.title}</h3>
                <ul className="text-muted-foreground mt-4 list-disc space-y-2 pl-5 leading-relaxed">
                  {l.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </>
      );
  }
}

/**
 * The body of a loan-purpose page (/wedding-loan, /medical-loan, /travel-loan, /education-loan,
 * /debt-consolidation-loan). Each is about a personal loan USED FOR that purpose. Server-rendered
 * first (English), so Google reads all of it; the key facts come from the home page's personal-loan
 * card and the EMI table is computed, so no figure is typed twice. Also the body of the /hi and /te
 * versions: the language comes from the URL through useCopy, and links stay in that language.
 */
export function PurposeGuide({ purpose }: { purpose: PurposeKey }) {
  const all = useCopy(purposePagesCopy);
  const href = useLocalizedHref(); // keeps a Hindi / Telugu reader on that language's pages
  const t = all.pages[purpose];
  const card = useCopy(offersCopy).offers[PERSONAL_CARD_INDEX];
  const ex = PURPOSE_EXAMPLE[purpose];
  const rows = ex.rows.map((r) => ({ ...r, ...emiRow(ex.principal, r.rate, r.months) }));
  const exampleTitle = t.exampleTitle
    .replace('{amount}', inrWhole(ex.principal))
    .replace('{rate}', String(ex.rows[0].rate))
    .replace('{months}', String(ex.rows[0].months));
  const others = PURPOSE_KEYS.filter((k) => k !== purpose);

  return (
    <main>
      <div className="shell pt-10 sm:pt-14">
        <nav aria-label="Breadcrumb" className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
          <Link href={href('/')} className="hover:text-foreground">{all.home}</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <Link href={href('/personal-loan')} className="hover:text-foreground">{all.personalLoan}</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          <span aria-current="page" className="text-foreground font-semibold">{t.breadcrumb}</span>
        </nav>
        <h1 className="mt-6 max-w-3xl text-3xl leading-snug font-extrabold sm:text-4xl lg:text-5xl">{t.h1}</h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-base leading-relaxed">{t.intro}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={href('/#lead-form')} className="bg-brand-gradient inline-flex items-center gap-1.5 rounded-full px-6 py-3 text-sm font-semibold text-white">
            {all.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={href('/emi-calculator')} className="border-border inline-flex items-center gap-1.5 rounded-full border px-6 py-3 text-sm font-semibold">
            <Calculator className="h-4 w-4" /> {all.emiLink}
          </Link>
        </div>
      </div>

      <section className="shell py-12">
        <div className="glass-panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold">{t.factsTitle}</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {card.points.map((p) => (
              <li key={p} className="flex items-start gap-2.5">
                <CheckCircle2 className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-5 text-sm leading-relaxed">{t.factsNote}</p>
        </div>
      </section>

      {t.sections.map((s) => (
        <section key={s.title} className="shell pb-12">
          <Section s={s} />
        </section>
      ))}

      <section className="shell pb-12">
        <div className="glass-panel min-w-0 p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold">{exampleTitle}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-border border-b">
                  <th className="py-2 pr-3 font-semibold">{ex.vary === 'rate' ? all.cols.rate : all.cols.tenure}</th>
                  <th className="py-2 pr-3 font-semibold">{all.cols.emi}</th>
                  <th className="py-2 pr-3 font-semibold">{all.cols.interest}</th>
                  <th className="py-2 font-semibold">{all.cols.total}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.rate}-${r.months}`} className="border-border border-b last:border-0">
                    <td className="py-2.5 pr-3 font-semibold">{ex.vary === 'rate' ? `${r.rate}%` : `${r.months} ${all.months}`}</td>
                    <td className="py-2.5 pr-3">{inrWhole(r.emi)}</td>
                    <td className="py-2.5 pr-3">{inrWhole(r.totalInterest)}</td>
                    <td className="py-2.5">{inrWhole(r.totalRepayment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">{t.exampleNote}</p>
          <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{all.illustration}</p>
        </div>
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

      <section className="shell pt-10">
        <h2 className="text-xl font-extrabold sm:text-2xl">{all.relatedTitle}</h2>
        <ul className="mt-5 flex flex-wrap gap-2">
          <li>
            <Link href={href('/personal-loan')} className="bg-accent inline-block rounded-full px-3.5 py-1.5 text-sm font-semibold">{all.relatedPersonal}</Link>
          </li>
          <li>
            <Link href={href('/emi-calculator')} className="bg-accent inline-block rounded-full px-3.5 py-1.5 text-sm font-semibold">{all.relatedEmi}</Link>
          </li>
          {others.map((k) => (
            <li key={k}>
              <Link href={href(PURPOSE_PATH[k])} className="bg-accent inline-block rounded-full px-3.5 py-1.5 text-sm font-semibold">{all.pages[k].linkLabel}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="glass-panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="text-xl font-extrabold sm:text-2xl">{t.ctaTitle}</h2>
            <p className="text-muted-foreground mt-2">{t.ctaBody}</p>
          </div>
          <Link href={href('/#lead-form')} className="bg-brand-gradient inline-flex shrink-0 items-center gap-1.5 rounded-full px-6 py-3 text-sm font-semibold text-white">
            {all.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="text-muted-foreground mt-4 text-xs">{t.disclaimer}</p>
      </section>
    </main>
  );
}
