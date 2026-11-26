// Compare offers and Home's featured offers were English only, whatever the app language
// (seen on the Play build, 2026-11-20). They now follow the app language; the names the voice
// agent uses for the rankings stay English.
import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderWithProviders } from './test-utils';
import { saveOffersCache } from '../src/state/session';
import { useStore } from '../src/state/store';
import { STR } from '../src/i18n/strings';
import { fill, fillParts } from '../src/utils/fill';
import Compare from '../src/screens/compare';

let store: ReturnType<typeof useStore> | null = null;
function Probe() { store = useStore(); return null; }
const offer = (over: object = {}) => ({
  id: 'o1', lenderName: 'Lender One', amount: 300000, apr: 16, tenure: 24, emi: 14700,
  processingFee: 3000, processingFeeAmount: 3000, gstOnProcessingFee: 540, applied: false, ...over,
});

describe('sentence slots', () => {
  it('fills named slots and leaves unknown ones alone', () => {
    expect(fill('Up to {v}', { v: '₹5,000' })).toBe('Up to ₹5,000');
    expect(fill('{n} months', { n: 24 })).toBe('24 months');
    expect(fill('{a} {b}', { a: 'x' })).toBe('x {b}');
  });
  it('splits a sentence into text and slots, in the sentence\'s own order', () => {
    expect(fillParts('{n} महीनों में {lender}', (k) => `<${k}>`)).toEqual(['<n>', ' महीनों में ', '<lender>']);
  });
  it.each(['hi', 'te'])('%s keeps every slot of every Compare / featured sentence', (lang) => {
    const slots = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
    for (const k of Object.keys(STR.en).filter((x) => /^(cmp|feat)/.test(x))) {
      expect(STR[lang][k]).toBeTruthy();
      expect(slots(STR[lang][k])).toBe(slots(STR.en[k]));
    }
  });
});

describe('Compare offers follows the app language', () => {
  beforeEach(async () => {
    jest.useFakeTimers(); store = null;
    await AsyncStorage.clear();
    await saveOffersCache({ applicationId: null, savedAt: Date.now(), offers: [offer(), offer({ id: 'o2', lenderName: 'Lender Two', apr: 19, amount: 250000 })] });
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it.each(['hi', 'te'])('%s: headings, row labels and the Apply button are translated', async (lang) => {
    const r = renderWithProviders(<><Probe /><Compare /></>);
    await waitFor(() => expect(r.getAllByText('Lender One').length).toBeGreaterThan(0));
    await act(async () => { store!.set({ lang }); });
    const t = STR[lang];
    await waitFor(() => expect(r.getByText(t.cmpTitle)).toBeTruthy());
    for (const k of ['cmpTenure', 'cmpMEmi', 'cmpMRate', 'cmpMFee', 'cmpMRepay']) expect(r.getAllByText(t[k]).length).toBeGreaterThan(0);
    expect(r.getByText(fill(t.cmpSubMany, { n: 2 }))).toBeTruthy();
    for (const en of ['Compare your offers', 'Monthly EMI', 'Processing fee', 'TENURE']) expect(r.queryByText(en)).toBeNull();
    r.unmount();
  });

  it('English is unchanged', async () => {
    const r = renderWithProviders(<Compare />);
    await waitFor(() => expect(r.getByText('Compare your offers')).toBeTruthy());
    expect(r.getByText('2 matched offers · pick what fits you')).toBeTruthy();
    expect(r.getAllByText('Monthly EMI').length).toBeGreaterThan(0);
    r.unmount();
  });
});
