// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LanguageProvider, defineCopy, useCopy, useLang, useLanguageLinks, useLocalizedHref } from '@/lib/i18n';
import { FaqsPageContent } from '@/components/pages/FaqsPageContent';
import { LoanPageContent } from '@/components/pages/LoanPageContent';
import { loanPagesCopy } from '@/i18n/loan-pages';
import { faqsCopy } from '@/i18n/faqs';

let path = '/';
vi.mock('next/navigation', () => ({ usePathname: () => path }));
vi.mock('@/lib/upshot', () => ({ upshotEvent: vi.fn() }));

const copy = defineCopy({ en: 'hello', hi: 'नमस्ते', te: 'నమస్కారం' });
let api: ReturnType<typeof useLang>;
function Probe() {
  api = useLang();
  const href = useLocalizedHref();
  const links = useLanguageLinks();
  return (
    <p data-testid="p" data-faqs={href('/faqs')} data-apply={href('/apply')} data-hi={links?.hi ?? 'none'}>
      {useCopy(copy)}
    </p>
  );
}
const tree = () => (
  <LanguageProvider>
    <Probe />
  </LanguageProvider>
);

beforeEach(() => {
  path = '/';
  localStorage.clear();
  // renderToString inside jsdom makes React warn that layout effects do not run on a server; that is the point here.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

describe('LanguageProvider and the URL', () => {
  it('server HTML of a language URL is already in that language', () => {
    path = '/hi/faqs';
    expect(renderToString(tree())).toContain('नमस्ते');
    path = '/te';
    expect(renderToString(tree())).toContain('నమస్కారం');
    path = '/faqs';
    expect(renderToString(tree())).toContain('hello');
  });

  it('a whole page body renders in the URL’s language on the server, with its structured data', () => {
    path = '/hi/personal-loan';
    const hi = renderToString(<LanguageProvider><LoanPageContent kind="personal" lang="hi" /></LanguageProvider>);
    // Compare with the same server rendering of the text, so HTML escaping cannot matter.
    expect(hi).toContain(renderToString(<>{loanPagesCopy.hi.personal.h1}</>));
    expect(hi).toContain(renderToString(<>{loanPagesCopy.hi.personal.faqs[0].q}</>));
    expect(hi).not.toContain(renderToString(<>{loanPagesCopy.en.personal.h1}</>));
    expect(hi).toContain('https://swiftloan.ai/hi/personal-loan');
    expect(hi).toContain('"inLanguage":"hi-IN"');
    expect(hi).toContain('href="/hi/emi-calculator"');
    expect(hi).toContain('href="/hi#lead-form"');

    path = '/te/faqs';
    const te = renderToString(<LanguageProvider><FaqsPageContent lang="te" /></LanguageProvider>);
    expect(te).toContain(renderToString(<>{faqsCopy.te.faqs[0].q}</>));
    expect(te).toContain('"inLanguage":"te-IN"');
    expect(te).toContain('href="/te#lead-form"');

    path = '/personal-loan';
    const en = renderToString(<LanguageProvider><LoanPageContent kind="personal" lang="en" /></LanguageProvider>);
    expect(en).toContain(renderToString(<>{loanPagesCopy.en.personal.h1}</>));
    expect(en).toContain('href="/emi-calculator"');
    expect(en).toContain('href="/#lead-form"');
  });

  it('on a language URL the URL wins over a different saved language, and is then remembered', () => {
    localStorage.setItem('sl_lang', 'te');
    path = '/hi/personal-loan';
    const { getByTestId } = render(tree());
    const p = getByTestId('p');
    expect(p.textContent).toBe('नमस्ते');
    expect(p.dataset.faqs).toBe('/hi/faqs');
    expect(p.dataset.apply).toBe('/apply');
    expect(p.dataset.hi).toBe('/hi/personal-loan');
    expect(localStorage.getItem('sl_lang')).toBe('hi');
    expect(document.documentElement.lang).toBe('hi');
  });

  it('on an English URL the saved language is restored in place: no redirect, links then lead into that language', () => {
    localStorage.setItem('sl_lang', 'hi');
    path = '/personal-loan';
    expect(renderToString(tree())).toContain('hello'); // what the server (and Google) get
    const { getByTestId } = render(tree());
    expect(getByTestId('p').textContent).toBe('नमस्ते');
    expect(getByTestId('p').dataset.faqs).toBe('/hi/faqs');
    expect(path).toBe('/personal-loan');
  });

  it('pages without language versions keep the in-place switch', () => {
    path = '/apply/step-1';
    const { getByTestId } = render(tree());
    expect(getByTestId('p').textContent).toBe('hello');
    expect(getByTestId('p').dataset.hi).toBe('none');
    act(() => api.setLang('te'));
    expect(getByTestId('p').textContent).toBe('నమస్కారం');
    expect(localStorage.getItem('sl_lang')).toBe('te');
  });

  it('a choice made on a language URL (voice assistant) applies at once; after navigating, the new URL decides', () => {
    path = '/hi/faqs';
    const { getByTestId, rerender } = render(tree());
    act(() => (window as unknown as { __swiftloanLang: { set: (c: string) => boolean } }).__swiftloanLang.set('te'));
    expect(getByTestId('p').textContent).toBe('నమస్కారం');
    expect(localStorage.getItem('sl_lang')).toBe('te');
    path = '/hi/emi-calculator';
    rerender(tree());
    expect(getByTestId('p').textContent).toBe('नमस्ते');
  });

  it('choosing English on a Hindi page and landing on the English URL stays English', () => {
    path = '/hi/faqs';
    const { getByTestId, rerender } = render(tree());
    act(() => api.setLang('en')); // the menu link's click
    path = '/faqs'; // …and its navigation
    rerender(tree());
    expect(getByTestId('p').textContent).toBe('hello');
    expect(localStorage.getItem('sl_lang')).toBe('en');
  });
});
