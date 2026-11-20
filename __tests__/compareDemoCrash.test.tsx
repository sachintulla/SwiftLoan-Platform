// Regression: Compare offers crashed about 3.6 seconds after it opened.
// The screen cycles the "best offer by" ranking on its own while no call is live. The list of
// rankings was cut to three (interest rate, processing fee, EMI) but the cycle still stepped
// through the old four, so it landed on a ranking that no longer exists ("Least interest") and
// the screen read `.label` / `.phrase` of nothing. There is no error boundary, so a release
// build closed.
import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderWithProviders } from './test-utils';
import { saveOffersCache } from '../src/state/session';
import Compare, { RANKS, DEMO_RANK_ORDER } from '../src/screens/compare';

const offer = (over: object = {}) => ({
  id: 'o1', lenderName: 'Lender One', amount: 300000, apr: 16, tenure: 24, emi: 14700,
  processingFee: 3000, processingFeeAmount: 3000, gstOnProcessingFee: 540, applied: false, ...over,
});

describe('Compare offers: the self-running ranking demo', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    await saveOffersCache({
      applicationId: null,
      savedAt: Date.now(),
      offers: [offer(), offer({ id: 'o2', lenderName: 'Lender Two', apr: 19, processingFeeAmount: 1000, gstOnProcessingFee: 180, amount: 250000 })],
    });
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('only ever steps through rankings the screen offers', () => {
    const offered = RANKS.map(r => r.key);
    expect(DEMO_RANK_ORDER.length).toBeGreaterThan(0);
    for (const k of DEMO_RANK_ORDER) expect(offered).toContain(k);
  });

  it('stays open while the demo runs through every ranking (it used to crash on the first step)', async () => {
    const r = renderWithProviders(<Compare />);
    await waitFor(() => expect(r.getAllByText('Lender One').length).toBeGreaterThan(0));

    // one full lap and a bit: every ranking gets its turn
    for (let i = 0; i < RANKS.length + 2; i++) {
      await act(async () => { jest.advanceTimersByTime(3700); });
      expect(r.getAllByText('Lender One').length).toBeGreaterThan(0);
      expect(r.getAllByText('Lender Two').length).toBeGreaterThan(0);
    }
    r.unmount();
  });
});
