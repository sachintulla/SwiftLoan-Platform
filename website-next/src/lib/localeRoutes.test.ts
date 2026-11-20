import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { LOCALIZED_PAGES } from '@/app/[lang]/localizedPages';
import { localizedMetadata, localizedStaticParams } from '@/app/[lang]/localizedRoute';
import { PRIVATE_PATHS, PUBLIC_PAGES, SITE_URL, emiCalculatorAppJsonLd, faqPageJsonLd, languageAlternates, loanProductJsonLd, pageMetadata, pageUrl } from '@/lib/seo';
import { splitLangPath, withLang } from '@/lib/locale';
import { isLocalizedPath, languageLinks, localizedHref, localizedPaths, resolveLocalizedRoute, urlLangOf } from '@/lib/localeRoutes';
import { faqsCopy } from '@/i18n/faqs';

const FIVE = ['/', '/faqs', '/emi-calculator', '/personal-loan', '/business-loan'];
const ENGLISH_ONLY = ['/privacy-policy', '/compliance', '/support'];
const DEVANAGARI = /[ऀ-ॿ]/;
const TELUGU = /[ఀ-౿]/;

describe('language URLs: paths', () => {
  it('splits and builds language paths', () => {
    expect(splitLangPath('/hi/faqs')).toEqual({ lang: 'hi', path: '/faqs' });
    expect(splitLangPath('/te')).toEqual({ lang: 'te', path: '/' });
    expect(splitLangPath('/te/')).toEqual({ lang: 'te', path: '/' });
    expect(splitLangPath('/faqs')).toEqual({ lang: 'en', path: '/faqs' });
    expect(splitLangPath('/hindi-loans')).toEqual({ lang: 'en', path: '/hindi-loans' });
    expect(splitLangPath(null)).toEqual({ lang: 'en', path: '/' });
    expect(withLang('/', 'hi')).toBe('/hi');
    expect(withLang('/faqs', 'te')).toBe('/te/faqs');
    expect(withLang('/faqs', 'en')).toBe('/faqs');
  });

  it('the five core pages have language versions; legal and private pages do not', () => {
    for (const p of FIVE) expect(isLocalizedPath(p)).toBe(true);
    for (const p of [...ENGLISH_ONLY, ...PRIVATE_PATHS, '/apply/step-1', '/nope']) expect(isLocalizedPath(p)).toBe(false);
  });

  it('an unknown language or a page without language versions is rejected (404)', () => {
    expect(resolveLocalizedRoute('hi', ['personal-loan'])).toMatchObject({ lang: 'hi', path: '/personal-loan' });
    expect(resolveLocalizedRoute('te', undefined)).toMatchObject({ lang: 'te', path: '/' });
    expect(resolveLocalizedRoute('te', [])).toMatchObject({ lang: 'te', path: '/' });
    expect(resolveLocalizedRoute('en', ['faqs'])).toBeNull(); // English lives at /faqs, never /en/faqs
    expect(resolveLocalizedRoute('fr', ['faqs'])).toBeNull();
    expect(resolveLocalizedRoute('HI', ['faqs'])).toBeNull();
    expect(resolveLocalizedRoute('hi', ['privacy-policy'])).toBeNull();
    expect(resolveLocalizedRoute('hi', ['compliance'])).toBeNull();
    expect(resolveLocalizedRoute('hi', ['support'])).toBeNull();
    expect(resolveLocalizedRoute('hi', ['apply'])).toBeNull();
    expect(resolveLocalizedRoute('te', ['account', 'support'])).toBeNull();
    expect(resolveLocalizedRoute('hi', ['nope'])).toBeNull();
    expect(resolveLocalizedRoute('hi', ['hi', 'faqs'])).toBeNull();
    expect(localizedMetadata({ lang: 'fr', slug: ['faqs'] })).toEqual({});
  });

  it('knows the language of a URL only when it is a real language URL', () => {
    expect(urlLangOf('/hi')).toBe('hi');
    expect(urlLangOf('/te/emi-calculator')).toBe('te');
    expect(urlLangOf('/emi-calculator')).toBeNull();
    expect(urlLangOf('/hi/apply')).toBeNull();
    expect(urlLangOf('/apply')).toBeNull();
    expect(urlLangOf(null)).toBeNull();
  });
});

describe('localizedHref', () => {
  it('moves a link to a page with language versions into the language', () => {
    expect(localizedHref('/', 'hi')).toBe('/hi');
    expect(localizedHref('/faqs', 'hi')).toBe('/hi/faqs');
    expect(localizedHref('/emi-calculator', 'te')).toBe('/te/emi-calculator');
    expect(localizedHref('/#lead-form', 'te')).toBe('/te#lead-form');
    expect(localizedHref('/#offers', 'hi')).toBe('/hi#offers');
    expect(localizedHref('/faqs?x=1#top', 'hi')).toBe('/hi/faqs?x=1#top');
    expect(localizedHref('/faqs/', 'hi')).toBe('/hi/faqs');
  });

  it('English keeps the plain path, and switching language swaps the prefix', () => {
    expect(localizedHref('/faqs', 'en')).toBe('/faqs');
    expect(localizedHref('/#lead-form', 'en')).toBe('/#lead-form');
    expect(localizedHref('/hi/faqs', 'en')).toBe('/faqs');
    expect(localizedHref('/hi/faqs', 'te')).toBe('/te/faqs');
    expect(localizedHref('/hi', 'te')).toBe('/te');
    expect(localizedHref('/te#lead-form', 'en')).toBe('/#lead-form');
  });

  it('leaves alone pages with no language version and anything that is not a site path', () => {
    for (const href of ['/apply', '/apply/step-1', '/account', '/privacy-policy', '/compliance', '/support', '/partner/return', '/nope'])
      for (const lang of ['en', 'hi', 'te'] as const) expect(localizedHref(href, lang)).toBe(href);
    for (const href of ['https://example.com/faqs', '//example.com/faqs', 'mailto:help@example.com', 'tel:123', '#lead-form', ''])
      expect(localizedHref(href, 'hi')).toBe(href);
  });

  it('the language menu gets the three URLs of a page with versions, and nothing elsewhere', () => {
    expect(languageLinks('/personal-loan')).toEqual({ en: '/personal-loan', hi: '/hi/personal-loan', te: '/te/personal-loan' });
    expect(languageLinks('/te/personal-loan')).toEqual({ en: '/personal-loan', hi: '/hi/personal-loan', te: '/te/personal-loan' });
    expect(languageLinks('/hi')).toEqual({ en: '/', hi: '/hi', te: '/te' });
    expect(languageLinks('/apply/step-2')).toBeNull();
    expect(languageLinks('/account')).toBeNull();
    expect(languageLinks('/privacy-policy')).toBeNull();
  });
});

describe('language URLs: search tags', () => {
  it.each(FIVE)('%s: every version has its own title, description, canonical and the full hreflang set', (path) => {
    const tail = path === '/' ? '' : path;
    const expected = {
      'en-IN': `${SITE_URL}${tail}`,
      'hi-IN': `${SITE_URL}/hi${tail}`,
      'te-IN': `${SITE_URL}/te${tail}`,
      'x-default': `${SITE_URL}${tail}`,
    };
    expect(languageAlternates(path)).toEqual(expected);
    const titles = new Set<string>();
    for (const lang of ['en', 'hi', 'te'] as const) {
      const m = pageMetadata(path, lang);
      expect(m.alternates?.canonical).toBe(expected[`${lang}-IN`]); // self-referencing
      expect(m.alternates?.languages).toEqual(expected);
      expect((m.openGraph as { url?: string }).url).toBe(expected[`${lang}-IN`]);
      expect((m.openGraph as { locale?: string }).locale).toBe(`${lang}_IN`);
      expect((m.openGraph as { alternateLocale?: string[] }).alternateLocale).toHaveLength(2);
      expect((m.openGraph as { title?: string }).title).toBe(m.title);
      expect(String(m.description).length).toBeGreaterThan(50);
      expect(String(m.description).length).toBeLessThanOrEqual(170);
      titles.add(String(m.title));
    }
    expect(titles.size).toBe(3);
    expect(String(pageMetadata(path, 'hi').title)).toMatch(DEVANAGARI);
    expect(String(pageMetadata(path, 'hi').description)).toMatch(DEVANAGARI);
    expect(String(pageMetadata(path, 'te').title)).toMatch(TELUGU);
    expect(String(pageMetadata(path, 'te').description)).toMatch(TELUGU);
    // The route's own metadata is the same thing.
    expect(localizedMetadata({ lang: 'hi', slug: path === '/' ? undefined : path.slice(1).split('/') })).toEqual(pageMetadata(path, 'hi'));
  });

  it('pageMetadata(path) with no language is still English, as before', () => {
    expect(pageMetadata('/faqs')).toEqual(pageMetadata('/faqs', 'en'));
    expect(pageUrl('/')).toBe(SITE_URL);
    expect(pageUrl('/', 'hi')).toBe(`${SITE_URL}/hi`);
  });

  it('English-only pages have no hreflang and refuse a language', () => {
    for (const path of ENGLISH_ONLY) {
      const m = pageMetadata(path);
      expect(m.alternates?.canonical).toBe(`${SITE_URL}${path}`);
      expect(m.alternates?.languages).toBeUndefined();
      expect((m.openGraph as { locale?: string }).locale).toBe('en_IN');
      expect(() => pageMetadata(path, 'hi')).toThrow();
      expect(() => pageMetadata(path, 'te')).toThrow();
    }
  });

  it('translated titles keep brand and technical terms in Latin script and avoid the word the owner ruled out', () => {
    const text = JSON.stringify(PUBLIC_PAGES.map((p) => p.i18n));
    expect(text).not.toContain('మొదలుపెడదాం');
    for (const p of PUBLIC_PAGES) {
      if (!p.i18n) continue;
      for (const lang of ['hi', 'te'] as const) expect(`${p.i18n[lang].title} ${p.i18n[lang].description}`).toMatch(/SwiftLoan\.ai|EMI|RBI/);
    }
    expect(pageMetadata('/emi-calculator', 'hi').title).toContain('EMI');
    expect(pageMetadata('/emi-calculator', 'te').title).toContain('EMI');
    expect(String(pageMetadata('/personal-loan', 'te').title)).toContain('RBI');
  });
});

describe('language URLs: sitemap', () => {
  const entries = sitemap();
  const byUrl = new Map(entries.map((e) => [e.url, e]));

  it('lists every language URL, each with the same alternates', () => {
    for (const path of localizedPaths()) {
      const alternates = languageAlternates(path);
      for (const lang of ['en', 'hi', 'te'] as const) {
        const entry = byUrl.get(pageUrl(path, lang));
        expect(entry, `${lang} ${path}`).toBeTruthy();
        expect(entry!.alternates?.languages).toEqual(alternates);
      }
    }
    expect(byUrl.has(`${SITE_URL}/hi`)).toBe(true);
    expect(byUrl.has(`${SITE_URL}/te/personal-loan`)).toBe(true);
  });

  it('has no language URL for English-only or private pages', () => {
    for (const path of ENGLISH_ONLY) {
      expect(byUrl.get(`${SITE_URL}${path}`)?.alternates).toBeUndefined();
      expect(byUrl.has(`${SITE_URL}/hi${path}`)).toBe(false);
      expect(byUrl.has(`${SITE_URL}/te${path}`)).toBe(false);
    }
    for (const e of entries) {
      const { path } = splitLangPath(e.url.slice(SITE_URL.length) || '/');
      for (const p of PRIVATE_PATHS) expect(path === p || path.startsWith(`${p}/`)).toBe(false);
    }
    // Every /hi or /te line is a page that really has language versions.
    for (const e of entries) {
      const { lang, path } = splitLangPath(e.url.slice(SITE_URL.length) || '/');
      if (lang !== 'en') expect(isLocalizedPath(path), e.url).toBe(true);
    }
  });
});

describe('language URLs: the route', () => {
  it('every page with language versions has a registered body (else /hi/… would be a 404 we advertise)', () => {
    for (const path of localizedPaths()) expect(LOCALIZED_PAGES[path], `${path} is missing from LOCALIZED_PAGES`).toBeTruthy();
    for (const path of Object.keys(LOCALIZED_PAGES)) expect(isLocalizedPath(path), `${path} is registered but has no i18n in PUBLIC_PAGES`).toBe(true);
  });

  it('builds exactly the language URLs, and only those', () => {
    const built = localizedStaticParams().map((p) => `/${[p.lang, ...p.slug].join('/')}`).sort();
    // Only pages with BOTH i18n and a registered body are built (the test above makes the two lists equal).
    const wanted = localizedPaths().filter((p) => p in LOCALIZED_PAGES).flatMap((p) => [withLang(p, 'hi'), withLang(p, 'te')]).sort();
    expect(built).toEqual(wanted);
    expect(built).toContain('/hi');
    expect(built).toContain('/te/business-loan');
    expect(built.some((u) => u.startsWith('/en'))).toBe(false);
  });
});

describe('language URLs: structured data', () => {
  it('uses the language’s text and URLs', () => {
    const faq = faqPageJsonLd(faqsCopy.hi.faqs, 'hi');
    expect(faq.inLanguage).toBe('hi-IN');
    expect(faq.mainEntity[0].name).toBe(faqsCopy.hi.faqs[0].q);
    expect(faq.mainEntity[0].name).toMatch(DEVANAGARI);
    expect(emiCalculatorAppJsonLd('te').url).toBe(`${SITE_URL}/te/emi-calculator`);
    expect(emiCalculatorAppJsonLd().url).toBe(`${SITE_URL}/emi-calculator`);
    expect(emiCalculatorAppJsonLd().name).toBe('SwiftLoan.ai EMI Calculator');
    const loan = loanProductJsonLd({ name: 'x', path: '/personal-loan', description: 'y', minAmount: 1, maxAmount: 2, lang: 'hi' });
    expect(loan.url).toBe(`${SITE_URL}/hi/personal-loan`);
    expect(loanProductJsonLd({ name: 'x', path: '/personal-loan', description: 'y', minAmount: 1, maxAmount: 2 }).url).toBe(`${SITE_URL}/personal-loan`);
  });
});
