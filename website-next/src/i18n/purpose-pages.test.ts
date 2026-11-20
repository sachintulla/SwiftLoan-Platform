import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { PURPOSE_EXAMPLE, PURPOSE_KEYS, PURPOSE_PATH, purposePagesCopy, type PurposeSection } from '@/i18n/purpose-pages';
import { offersCopy } from '@/i18n/offers';
import { emiRow } from '@/lib/emi';
import { purposeJsonLd } from '@/lib/purposeSeo';
import { PUBLIC_PAGES, SITE_URL, pageMetadata } from '@/lib/seo';
import { PURPOSE_PAGES } from '@/lib/seoPages.purpose';

/** The outline of a section: its layout and how many of everything it holds, without the words. */
function outline(s: PurposeSection) {
  switch (s.layout) {
    case 'prose': return [s.layout, s.paragraphs.length];
    case 'steps':
    case 'cards': return [s.layout, s.items.length, Boolean(s.intro)];
    case 'checklist': return [s.layout, s.items.length, Boolean(s.intro), Boolean(s.note)];
    case 'twoLists': return [s.layout, s.lists.map((l) => l.points.length)];
  }
}

/** Every string in a value, however deeply nested. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

const words = (v: unknown) => strings(v).join(' ').split(/\s+/).filter(Boolean).length;

describe('loan-purpose pages copy', () => {
  it.each(['hi', 'te'] as const)('%s has every section of all five pages, with the same counts as English', (lang) => {
    for (const key of PURPOSE_KEYS) {
      const en = purposePagesCopy.en.pages[key], tr = purposePagesCopy[lang].pages[key];
      expect(tr.sections.map(outline), key).toEqual(en.sections.map(outline));
      expect(tr.faqs, key).toHaveLength(en.faqs.length);
      expect(Object.keys(tr).sort(), key).toEqual(Object.keys(en).sort());
      // translated, not copied: nothing longer than a brand/technical term is still the English text
      const enText = new Set(strings(en).filter((s) => s.length > 40));
      for (const s of strings(tr)) expect(enText.has(s), `${key}: "${s}"`).toBe(false);
      expect(strings(tr).every((s) => s.trim().length > 0), key).toBe(true);
    }
    const shared = (c: typeof purposePagesCopy.en) => Object.entries(c).filter(([k]) => k !== 'pages').map(([, v]) => v);
    const enShared = shared(purposePagesCopy.en), trShared = shared(purposePagesCopy[lang]);
    expect(strings(trShared)).toHaveLength(strings(enShared).length);
    for (const s of strings(trShared)) expect(strings(enShared)).not.toContain(s);
  });

  it('each page has what the brief asks for: 3-4 sections, 4-5 FAQs, roughly 350-600 English words', () => {
    for (const key of PURPOSE_KEYS) {
      const p = purposePagesCopy.en.pages[key];
      expect(p.sections.length, key).toBeGreaterThanOrEqual(3);
      expect(p.sections.length, key).toBeLessThanOrEqual(4);
      expect(p.faqs.length, key).toBeGreaterThanOrEqual(4);
      expect(p.faqs.length, key).toBeLessThanOrEqual(5);
      const n = words(p);
      expect(n, `${key} has ${n} words`).toBeGreaterThanOrEqual(350);
      expect(n, `${key} has ${n} words`).toBeLessThanOrEqual(700);
    }
  });

  it('the five pages are different from each other, not one template with the noun swapped', () => {
    const pages = PURPOSE_KEYS.map((k) => purposePagesCopy.en.pages[k]);
    for (const field of ['h1', 'intro', 'factsTitle', 'factsNote', 'faqTitle', 'ctaTitle', 'disclaimer'] as const) {
      expect(new Set(pages.map((p) => p[field])).size, field).toBe(pages.length);
    }
    // no two pages are built from the same sequence of layouts
    expect(new Set(pages.map((p) => p.sections.map((s) => s.layout).join('>'))).size).toBe(pages.length);
    // section headings are never shared between pages
    const titles = pages.flatMap((p) => p.sections.map((s) => s.title));
    expect(new Set(titles).size).toBe(titles.length);
    // FAQ questions are worded per page, never repeated
    const qs = pages.flatMap((p) => p.faqs.map((f) => f.q));
    expect(new Set(qs).size).toBe(qs.length);
  });

  it('every H1 says "personal loan" and names its purpose; the education page says what it is not', () => {
    const en = purposePagesCopy.en.pages;
    for (const key of PURPOSE_KEYS) expect(en[key].h1).toMatch(/^Personal loan for /);
    expect(en.wedding.h1).toMatch(/wedding/i);
    expect(en.medical.h1).toMatch(/medical emergency/i);
    expect(en.travel.h1).toMatch(/travel/i);
    expect(en.education.h1).toMatch(/education/i);
    expect(en.debt.h1).toMatch(/debt consolidation/i);
    expect(en.education.intro).toMatch(/not a dedicated education loan/i);
    expect(JSON.stringify(en.education)).toMatch(/no moratorium/i);
    expect(en.education.disclaimer).toMatch(/not an education loan/i);
  });

  it('makes no promises and quotes no figures of its own', () => {
    const en = JSON.stringify(purposePagesCopy.en);
    expect(en).not.toMatch(/guarantee|assured|instant(ly)? (approval|loan|disbursal|money|cash)|100% approval|sure[- ]shot|no questions asked|lowest (rate|interest)|best rate|tax (benefit|deduction|saving)/i);
    expect(JSON.stringify(purposePagesCopy.hi)).not.toMatch(/गारंटीड|पक्की मंज़ूरी|तुरंत (मंज़ूरी|अप्रूवल|लोन)|सबसे कम (दर|ब्याज)|टैक्स/);
    expect(JSON.stringify(purposePagesCopy.te)).not.toMatch(/గ్యారంటీడ్|తక్షణ (ఆమోదం|లోన్)|ఖచ్చితంగా ఆమోదం|అతి తక్కువ (రేటు|వడ్డీ)|టాక్స్|పన్ను/);
    // The only numbers allowed in the copy: "100% paperless", "about 3 minutes" and the example-title tokens.
    // Amounts, rates and tenures come from offers.ts and lib/emi.ts at render time.
    for (const lang of ['en', 'hi', 'te'] as const) {
      for (const s of strings(purposePagesCopy[lang])) {
        const rest = s.replace(/100%/g, '').replace(/\b3\b/g, '');
        expect(rest, s).not.toMatch(/[0-9०-९౦-౯₹]/);
      }
    }
  });

  it('never uses the Telugu word the owner asked us not to use', () => {
    expect(JSON.stringify(purposePagesCopy.te)).not.toContain('మొదలుపెడదాం');
    expect(JSON.stringify(PURPOSE_PAGES)).not.toContain('మొదలుపెడదాం');
  });

  it('keeps brand and technical terms in Latin script in Hindi and Telugu', () => {
    for (const lang of ['hi', 'te'] as const) {
      const text = JSON.stringify(purposePagesCopy[lang]);
      for (const term of ['SwiftLoan.ai', 'EMI', 'PAN', 'Aadhaar', 'eKYC', 'DigiLocker', 'RBI', 'APR', 'Key Fact Statement']) expect(text, `${lang} ${term}`).toContain(term);
      expect(text).not.toMatch(/ईएमआई|आधार कार्ड|ఈఎంఐ|ఆధార్/);
    }
  });
});

describe('loan-purpose pages: examples and facts', () => {
  it('the key facts are read from the personal-loan card on the home page', () => {
    expect(offersCopy.en.offers[0].title).toBe('Personal Loans');
    expect(offersCopy.en.offers[0].points.join(' ')).toMatch(/50,000.*25,00,000/);
  });

  it('every example is inside the personal-loan range the site states, and its title has the tokens it needs', () => {
    for (const key of PURPOSE_KEYS) {
      const ex = PURPOSE_EXAMPLE[key];
      expect(ex.principal).toBeGreaterThanOrEqual(50000);
      expect(ex.principal).toBeLessThanOrEqual(2500000);
      expect(ex.rows.length).toBeGreaterThanOrEqual(3);
      for (const r of ex.rows) {
        expect(r.months).toBeGreaterThanOrEqual(3);
        expect(r.months).toBeLessThanOrEqual(60);
        expect(r.rate).toBeGreaterThanOrEqual(10.49); // "Interest from 10.49% p.a."
        expect(r.rate).toBeLessThanOrEqual(28); // top of the APR range on the compliance page
        const row = emiRow(ex.principal, r.rate, r.months);
        expect(row.totalRepayment).toBeGreaterThan(ex.principal);
      }
      // the column that varies really varies; the other stays fixed
      const fixed = ex.vary === 'rate' ? 'months' : 'rate', varying = ex.vary === 'rate' ? 'rate' : 'months';
      expect(new Set(ex.rows.map((r) => r[fixed])).size).toBe(1);
      expect(new Set(ex.rows.map((r) => r[varying])).size).toBe(ex.rows.length);
      for (const lang of ['en', 'hi', 'te'] as const) {
        const title = purposePagesCopy[lang].pages[key].exampleTitle;
        expect(title).toContain('{amount}');
        expect(title).toContain(ex.vary === 'rate' ? '{months}' : '{rate}');
      }
    }
  });
});

describe('loan-purpose pages: search setup', () => {
  it('every page is a public page with English, Hindi and Telugu titles and descriptions', () => {
    expect(PURPOSE_PAGES.map((p) => p.path).sort()).toEqual(Object.values(PURPOSE_PATH).sort());
    const urls = sitemap().map((e) => e.url);
    for (const key of PURPOSE_KEYS) {
      const path = PURPOSE_PATH[key];
      const page = PUBLIC_PAGES.find((p) => p.path === path);
      expect(page, path).toBeTruthy();
      expect(urls).toContain(`${SITE_URL}${path}`);
      expect(String(pageMetadata(path).title)).toMatch(/^Personal loan for /);
      expect(page!.title.length, page!.title).toBeLessThanOrEqual(65);
      for (const meta of [page!, page!.i18n!.hi, page!.i18n!.te]) {
        expect(meta.title).toContain('SwiftLoan.ai');
        expect(meta.description.length, meta.description).toBeGreaterThanOrEqual(50);
        expect(meta.description.length, meta.description).toBeLessThanOrEqual(160);
      }
      expect(page!.i18n!.hi.title).toMatch(/पर्सनल लोन/);
      expect(page!.i18n!.te.title).toMatch(/పర్సనల్ లోన్/);
    }
    const all = PURPOSE_PAGES.flatMap((p) => [p.title, p.i18n!.hi.title, p.i18n!.te.title]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('structured data carries the loan, every English FAQ and a three-step breadcrumb', () => {
    for (const key of PURPOSE_KEYS) {
      const raw = purposeJsonLd(key);
      expect(raw).not.toContain('</script>');
      const [loan, faq, crumbs] = JSON.parse(raw);
      const page = purposePagesCopy.en.pages[key];
      expect(loan['@type']).toBe('LoanOrCredit');
      expect(loan.url).toBe(`${SITE_URL}${PURPOSE_PATH[key]}`);
      expect(loan.amount).toMatchObject({ minValue: 50000, maxValue: 2500000 });
      expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(page.faqs.map((f) => f.q));
      expect(crumbs.itemListElement.map((c: { item: string }) => c.item)).toEqual([SITE_URL, `${SITE_URL}/personal-loan`, `${SITE_URL}${PURPOSE_PATH[key]}`]);
    }
  });

  it('the Hindi and Telugu versions carry their own language, URLs and translated FAQs', () => {
    for (const lang of ['hi', 'te'] as const) {
      for (const key of PURPOSE_KEYS) {
        const [loan, faq, crumbs] = JSON.parse(purposeJsonLd(key, lang));
        expect(loan.inLanguage).toBe(`${lang}-IN`);
        expect(loan.url).toBe(`${SITE_URL}/${lang}${PURPOSE_PATH[key]}`);
        expect(faq.mainEntity[0].name).toBe(purposePagesCopy[lang].pages[key].faqs[0].q);
        expect(crumbs.itemListElement[1].item).toBe(`${SITE_URL}/${lang}/personal-loan`);
        expect(String(pageMetadata(PURPOSE_PATH[key], lang).title)).toBe(PURPOSE_PAGES.find((p) => p.path === PURPOSE_PATH[key])!.i18n![lang].title);
      }
    }
  });
});
