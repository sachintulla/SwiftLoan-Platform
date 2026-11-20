import { describe, expect, it } from 'vitest';
import { DOCS_PAGE_KEYS, DOCS_PAGE_PATHS, docsPagesCopy, type DocsPage } from '@/i18n/docs-pages';
import { offersCopy } from '@/i18n/offers';
import { PUBLIC_PAGES, SITE_URL, pageMetadata } from '@/lib/seo';
import sitemap from '@/app/sitemap';

/** Every string of one page, joined (for word counts and wording checks). */
function allText(p: DocsPage): string {
  const parts: string[] = [p.breadcrumb, p.h1, p.intro, p.faqTitle, p.ctaTitle, p.ctaBody, p.disclaimer];
  for (const s of p.sections) {
    parts.push(s.title, s.body ?? '', s.note ?? '', ...(s.items ?? []), ...(s.steps ?? []));
    if (s.table) parts.push(...s.table.head, ...s.table.rows.flat());
  }
  for (const f of p.faqs) parts.push(f.q, f.a);
  return parts.join(' ');
}

/** The phrase each page is meant to be found for; its H1 must contain it. */
const SEARCH_PHRASE = {
  personalDocs: 'documents required for personal loan',
  businessDocs: 'documents required for business loan',
  eligibility: 'personal loan eligibility',
  selfEmployed: 'personal loan for self employed',
} as const;

describe('documents and eligibility pages: copy', () => {
  it.each(['hi', 'te'] as const)('%s has every section of every page, with the same counts as English', (lang) => {
    for (const key of DOCS_PAGE_KEYS) {
      const en = docsPagesCopy.en.pages[key], tr = docsPagesCopy[lang].pages[key];
      expect(tr.h1).not.toBe(en.h1);
      expect(tr.intro).not.toBe(en.intro);
      expect(tr.faqs).toHaveLength(en.faqs.length);
      expect(tr.sections).toHaveLength(en.sections.length);
      en.sections.forEach((s, i) => {
        const t = tr.sections[i];
        expect(t.title).not.toBe(s.title);
        expect(Boolean(t.body)).toBe(Boolean(s.body));
        expect(Boolean(t.note)).toBe(Boolean(s.note));
        expect(t.items?.length).toBe(s.items?.length);
        expect(t.steps?.length).toBe(s.steps?.length);
        expect(t.table?.head.length).toBe(s.table?.head.length);
        expect(t.table?.rows.length).toBe(s.table?.rows.length);
        s.table?.rows.forEach((row, r) => expect(t.table?.rows[r]).toHaveLength(row.length));
      });
    }
  });

  it('each page has the search phrase in its H1, 3–5 sections, 4–5 FAQs and 350–600 English words', () => {
    for (const key of DOCS_PAGE_KEYS) {
      const p = docsPagesCopy.en.pages[key];
      expect(p.h1.toLowerCase()).toContain(SEARCH_PHRASE[key]);
      expect(p.sections.length).toBeGreaterThanOrEqual(3);
      expect(p.sections.length).toBeLessThanOrEqual(5);
      expect(p.faqs.length).toBeGreaterThanOrEqual(4);
      expect(p.faqs.length).toBeLessThanOrEqual(5);
      const words = allText(p).split(/\s+/).filter(Boolean).length;
      expect(words).toBeGreaterThanOrEqual(350);
      expect(words).toBeLessThanOrEqual(600);
    }
  });

  it('table rows are as wide as their header, and list keys are unique', () => {
    for (const lang of ['en', 'hi', 'te'] as const) {
      for (const key of DOCS_PAGE_KEYS) {
        const p = docsPagesCopy[lang].pages[key];
        expect(new Set(p.sections.map((s) => s.title)).size).toBe(p.sections.length);
        expect(new Set(p.faqs.map((f) => f.q)).size).toBe(p.faqs.length);
        for (const s of p.sections) {
          for (const row of s.table?.rows ?? []) expect(row).toHaveLength(s.table!.head.length);
          if (s.table) expect(new Set(s.table.rows.map((r) => r[0])).size).toBe(s.table.rows.length);
        }
      }
    }
  });

  it('the four pages are not copies of each other', () => {
    const en = docsPagesCopy.en.pages;
    expect(new Set(DOCS_PAGE_KEYS.map((k) => en[k].h1)).size).toBe(DOCS_PAGE_KEYS.length);
    expect(new Set(DOCS_PAGE_KEYS.map((k) => en[k].intro)).size).toBe(DOCS_PAGE_KEYS.length);
    const sectionTitles = DOCS_PAGE_KEYS.flatMap((k) => en[k].sections.map((s) => s.title));
    expect(new Set(sectionTitles).size).toBe(sectionTitles.length);
  });

  it('every rupee amount and percentage is one the home-page loan cards already state', () => {
    const stated = JSON.stringify(offersCopy.en);
    for (const lang of ['en', 'hi', 'te'] as const) {
      for (const key of DOCS_PAGE_KEYS) {
        const found = allText(docsPagesCopy[lang].pages[key]).match(/₹\d[\d,]*\d|\d+(?:\.\d+)?%/g) ?? [];
        for (const figure of found) expect(stated, `${lang}/${key}: ${figure}`).toContain(figure);
      }
    }
  });

  it('never promises approval', () => {
    const en = JSON.stringify(docsPagesCopy.en);
    expect(en).not.toMatch(/guarantee|assured|100% approval|instant approval|sure[- ]shot|no rejection|always approved/i);
    expect(JSON.stringify(docsPagesCopy.hi)).not.toMatch(/गारंटी|पक्का|पक्की|निश्चित मंज़ूरी/);
    expect(JSON.stringify(docsPagesCopy.te)).not.toMatch(/గ్యారంటీ|పక్కా|తప్పకుండా వస్తుంది|ఖచ్చితంగా వస్తుంది/);
  });

  it('states no minimum age, salary, score, turnover or vintage', () => {
    const en = JSON.stringify(docsPagesCopy.en);
    expect(en).not.toMatch(/\b\d+\s*(?:years?|yrs?)\b/i); // no "21 years", "2 years in business"
    expect(en).not.toMatch(/\b[3-9]\d{2}\b/); // no credit-score style number (650, 750…)
    expect(en).not.toMatch(/\b(?:lakh|crore)\b/i); // amounts only as the cards print them
  });

  it('never uses the Telugu word the owner asked us not to use', () => {
    expect(JSON.stringify(docsPagesCopy.te)).not.toContain('మొదలుపెడదాం');
  });
});

describe('documents and eligibility pages: search setup', () => {
  it('every page is a public page with Hindi and Telugu titles and descriptions, and is in the sitemap', () => {
    const urls = sitemap().map((e) => e.url);
    for (const key of DOCS_PAGE_KEYS) {
      const path = DOCS_PAGE_PATHS[key];
      const page = PUBLIC_PAGES.find((p) => p.path === path);
      expect(page, path).toBeDefined();
      expect(String(pageMetadata(path).title).toLowerCase()).toContain(SEARCH_PHRASE[key]);
      expect(page!.title.length).toBeLessThanOrEqual(65);
      expect(page!.description.length).toBeGreaterThanOrEqual(50);
      expect(page!.description.length).toBeLessThanOrEqual(160);
      for (const lang of ['hi', 'te'] as const) {
        const tr = page!.i18n?.[lang];
        expect(tr?.title, `${path} ${lang} title`).toBeTruthy();
        expect(tr!.title).not.toBe(page!.title);
        expect(tr!.title).toContain('SwiftLoan.ai');
        expect(tr!.description.length).toBeGreaterThanOrEqual(50);
        expect(tr!.description.length).toBeLessThanOrEqual(170);
      }
      expect(JSON.stringify(page)).not.toContain('మొదలుపెడదాం');
      expect(urls).toContain(`${SITE_URL}${path}`);
    }
  });
});
