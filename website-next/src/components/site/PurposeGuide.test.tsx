// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PurposePageContent } from '@/components/pages/PurposePageContent';
import { LanguageProvider } from '@/lib/i18n';
import { PURPOSE_EXAMPLE, PURPOSE_KEYS, PURPOSE_PATH, purposePagesCopy } from '@/i18n/purpose-pages';
import { offersCopy } from '@/i18n/offers';
import { emiRow, inrWhole } from '@/lib/emi';

let path = '/';
vi.mock('next/navigation', () => ({ usePathname: () => path }));
vi.mock('@/lib/upshot', () => ({ upshotEvent: vi.fn() }));

/** The same server rendering of a piece of text, so HTML escaping cannot matter. */
const text = (s: string) => renderToString(<>{s}</>);
const page = (key: (typeof PURPOSE_KEYS)[number], lang: 'en' | 'hi' | 'te') =>
  renderToString(<LanguageProvider><PurposePageContent purpose={key} lang={lang} /></LanguageProvider>);

beforeEach(() => {
  // renderToString inside jsdom makes React warn that layout effects do not run on a server.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loan-purpose page body', () => {
  it.each(PURPOSE_KEYS)('%s: the server HTML has one H1, the facts, every section, the computed EMI rows, FAQs and links', (key) => {
    path = PURPOSE_PATH[key];
    const html = page(key, 'en');
    const t = purposePagesCopy.en.pages[key];

    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain(text(t.h1));
    expect(html).toContain(text(t.intro));
    // key facts: read from the home page's personal-loan card, not typed on this page
    for (const p of offersCopy.en.offers[0].points) expect(html).toContain(text(p));
    for (const s of t.sections) expect(html, s.title).toContain(text(s.title));
    for (const f of t.faqs) expect(html, f.q).toContain(text(f.q));
    expect(html).toContain(text(t.disclaimer));
    expect(html).toContain(text(purposePagesCopy.en.illustration));

    // the example: title tokens filled in, every row computed
    const ex = PURPOSE_EXAMPLE[key];
    expect(html).not.toMatch(/\{amount\}|\{rate\}|\{months\}/);
    expect(html).toContain(inrWhole(ex.principal));
    for (const r of ex.rows) {
      const row = emiRow(ex.principal, r.rate, r.months);
      expect(html).toContain(inrWhole(row.emi));
      expect(html).toContain(inrWhole(row.totalRepayment));
    }

    // links: breadcrumb parent, calculator, the lead form and the four other purpose pages
    expect(html).toContain('href="/personal-loan"');
    expect(html).toContain('href="/emi-calculator"');
    expect(html).toContain('href="/#lead-form"');
    for (const other of PURPOSE_KEYS) {
      if (other === key) expect(html).not.toContain(`href="${PURPOSE_PATH[other]}"`);
      else expect(html).toContain(`href="${PURPOSE_PATH[other]}"`);
    }
    // structured data
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain(`https://swiftloan.ai${PURPOSE_PATH[key]}`);
  });

  it.each(['hi', 'te'] as const)('%s: the body renders in the URL’s language once the path has language versions', (lang) => {
    path = `/${lang}/wedding-loan`;
    const html = page('wedding', lang);
    expect(html).toContain(text(purposePagesCopy[lang].pages.wedding.h1));
    expect(html).not.toContain(text(purposePagesCopy.en.pages.wedding.h1));
    expect(html).toContain(text(offersCopy[lang].offers[0].points[0]));
    expect(html).toContain(`href="/${lang}/personal-loan"`);
    expect(html).toContain(`href="/${lang}/debt-consolidation-loan"`);
    expect(html).toContain(`https://swiftloan.ai/${lang}/wedding-loan`);
    expect(html).toContain(`"inLanguage":"${lang}-IN"`);
  });
});
