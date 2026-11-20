'use client';
import Link from 'next/link';
import { ArrowRight, Calculator, CheckCircle2, ChevronRight } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useCopy, useLocalizedHref } from '@/lib/i18n';
import { DOCS_PAGE_KEYS, DOCS_PAGE_PATHS, docsPagesCopy, type DocsPageKey, type DocsSection } from '@/i18n/docs-pages';

/**
 * The body of the four documents and eligibility pages (/personal-loan-documents,
 * /business-loan-documents, /personal-loan-eligibility, /personal-loan-for-self-employed).
 * One component for all four: the page file only picks the `page` key, so the same body can be
 * mounted again on a /hi/... or /te/... route. All text comes from i18n/docs-pages.ts.
 */
export function DocsGuide({ page }: { page: DocsPageKey }) {
  const href = useLocalizedHref(); // keeps a Hindi / Telugu reader on that language's pages
  const all = useCopy(docsPagesCopy);
  const t = all.pages[page];
  const related = [
    { href: '/personal-loan', label: all.links.personalLoan },
    { href: '/business-loan', label: all.links.businessLoan },
    { href: '/emi-calculator', label: all.links.emiCalculator },
    ...DOCS_PAGE_KEYS.filter((k) => k !== page).map((k) => ({ href: DOCS_PAGE_PATHS[k], label: all.pages[k].breadcrumb })),
  ];

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
            {all.ctaButton} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={href('/emi-calculator')} className="border-border inline-flex items-center gap-1.5 rounded-full border px-6 py-3 text-sm font-semibold">
            <Calculator className="h-4 w-4" /> {all.emiLink}
          </Link>
        </div>
      </div>

      <div className="shell space-y-5 py-12">
        {t.sections.map((s) => <Section key={s.title} s={s} />)}
      </div>

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
        <nav aria-label={all.relatedTitle} className="mt-4 flex flex-wrap gap-2">
          {related.map((r) => (
            <Link key={r.href} href={href(r.href)} className="bg-accent hover:text-primary rounded-full px-3.5 py-1.5 text-sm font-semibold">
              {r.label}
            </Link>
          ))}
        </nav>
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

/** One block: paragraph, list, numbered steps, table and a closing note, whichever the copy has. */
function Section({ s }: { s: DocsSection }) {
  return (
    <section className="glass-panel p-6 sm:p-8">
      <h2 className="text-2xl font-extrabold">{s.title}</h2>
      {s.body && <p className="text-muted-foreground mt-4 max-w-3xl leading-relaxed">{s.body}</p>}
      {s.items && (
        <ul className="mt-5 space-y-3">
          {s.items.map((it) => (
            <li key={it} className="flex items-start gap-2.5">
              <CheckCircle2 className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
      {s.steps && (
        <ol className="mt-5 space-y-3">
          {s.steps.map((st, i) => (
            <li key={st} className="flex items-start gap-3">
              <span className="bg-brand-gradient inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{i + 1}</span>
              <span>{st}</span>
            </li>
          ))}
        </ol>
      )}
      {s.table && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {s.table.head.map((h, i) => (
                  <th key={i} scope="col" className="border-border border-b px-3 py-2.5 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="border-border border-b px-3 py-2.5 align-top font-semibold">{cell}</th>
                    ) : (
                      <td key={i} className="border-border text-muted-foreground border-b px-3 py-2.5 align-top">{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.note && <p className="text-muted-foreground mt-5 max-w-3xl text-sm leading-relaxed">{s.note}</p>}
    </section>
  );
}
