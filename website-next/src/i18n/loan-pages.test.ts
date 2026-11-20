import { describe, expect, it } from 'vitest';
import { loanPagesCopy } from '@/i18n/loan-pages';
import { offersCopy } from '@/i18n/offers';
import { LOAN_CARD_INDEX } from '@/components/site/LoanGuide';

describe('loan pages copy', () => {
  it.each(['hi', 'te'] as const)('%s has every section of both pages, translated', (lang) => {
    for (const kind of ['personal', 'business'] as const) {
      const en = loanPagesCopy.en[kind], tr = loanPagesCopy[lang][kind];
      expect(tr.h1).not.toBe(en.h1);
      expect(tr.faqs).toHaveLength(en.faqs.length);
      expect(tr.steps).toHaveLength(en.steps.length);
      expect(tr.docs).toHaveLength(en.docs.length);
    }
  });
  it('the key facts come from the matching home-page loan card', () => {
    expect(offersCopy.en.offers[LOAN_CARD_INDEX.personal].title).toBe('Personal Loans');
    expect(offersCopy.en.offers[LOAN_CARD_INDEX.business].title).toBe('Business Loans');
  });
  it('never uses the Telugu word the owner asked us not to use', () => {
    expect(JSON.stringify(loanPagesCopy.te)).not.toContain('మొదలుపెడదాం');
  });
});
