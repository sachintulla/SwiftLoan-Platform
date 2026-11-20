import { describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { PRIVATE_PATHS, PUBLIC_PAGES, SITE_URL, faqPageJsonLd, jsonLdString, organizationJsonLd, pageMetadata } from '@/lib/seo';
import { faqsCopy } from '@/i18n/faqs';

describe('search engine setup', () => {
  it('robots.txt opens the site, closes private paths and points at the sitemap', () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe('/');
    for (const p of ['/account', '/apply', '/dev']) expect(rule.disallow).toContain(p);
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it('the sitemap lists every public page and no private one', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(SITE_URL);
    expect(urls).toContain(`${SITE_URL}/faqs`);
    // One line per page, plus a Hindi and a Telugu line for each page that has language versions.
    expect(urls).toHaveLength(PUBLIC_PAGES.length + 2 * PUBLIC_PAGES.filter((p) => p.i18n).length);
    expect(new Set(urls).size).toBe(urls.length);
    for (const u of urls) for (const p of PRIVATE_PATHS) expect(u.startsWith(`${SITE_URL}${p}`)).toBe(false);
  });

  it('every public page has its own title, description and canonical', () => {
    const titles = new Set<string>();
    for (const p of PUBLIC_PAGES) {
      const m = pageMetadata(p.path);
      expect(m.title).toBeTruthy();
      expect(String(m.description).length).toBeGreaterThan(50);
      expect(String(m.description).length).toBeLessThanOrEqual(170);
      expect(m.alternates?.canonical).toBe(`${SITE_URL}${p.path === '/' ? '' : p.path}`);
      titles.add(String(m.title));
    }
    expect(titles.size).toBe(PUBLIC_PAGES.length);
  });

  it('a page missing from the list is caught, not shipped with no title', () => {
    expect(() => pageMetadata('/nope')).toThrow();
  });

  it('FAQ structured data carries every question and answer', () => {
    const ld = faqPageJsonLd(faqsCopy.en.faqs);
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(faqsCopy.en.faqs.length);
    expect(ld.mainEntity[0].acceptedAnswer.text).toBe(faqsCopy.en.faqs[0].a);
  });

  it('structured data has no placeholder contact details and cannot break out of its script tag', () => {
    const org = JSON.stringify(organizationJsonLd());
    expect(org).not.toMatch(/123456|1800-SWIFT|telephone|address/i);
    expect(jsonLdString({ a: '</script><b>' })).not.toContain('</script>');
  });
});

describe('EMI calculator page', () => {
  it('is in the sitemap with its own title', () => {
    expect(sitemap().map((e) => e.url)).toContain(`${SITE_URL}/emi-calculator`);
    expect(String(pageMetadata('/emi-calculator').title)).toMatch(/EMI Calculator/);
  });
});

describe('loan pages', () => {
  it('are in the sitemap', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain(`${SITE_URL}/personal-loan`);
    expect(urls).toContain(`${SITE_URL}/business-loan`);
  });
});
