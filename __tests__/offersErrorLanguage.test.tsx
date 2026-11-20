// My Offers showed its "no offers" reason in English with the app in Hindi: the screen kept
// the finished sentence, so it stayed in the language the app was in when it was stored, and
// only Retry (which stored it again) fixed it.
import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { STR } from '../src/i18n/strings';
import { useStore } from '../src/state/store';
import { offersErrorKeyFor, offersErrorText, OFFERS_ERROR_KEYS } from '../src/utils/offersError';

const mockList = jest.fn();
jest.mock('../src/api/client', () => {
  const actual = jest.requireActual('../src/api/client');
  return { ...actual, isAuthed: () => true, api: { ...actual.api, listApplications: (...a: unknown[]) => mockList(...a) } };
});
import Fare from '../src/screens/fare';

let store: ReturnType<typeof useStore> | null = null;
function Probe() { store = useStore(); return null; }

describe('the stored no-offers reason', () => {
  it('is a key, and every key has English, Hindi and Telugu text', () => {
    expect(offersErrorKeyFor('duplicate')).toBe('findingErrDuplicate');
    expect(offersErrorKeyFor('not_eligible')).toBe('findingErrNotEligible');
    expect(offersErrorKeyFor('technical')).toBe('findingErrTechnical');
    expect(offersErrorKeyFor('network')).toBe('findingErrNetwork');
    expect(offersErrorKeyFor(undefined)).toBe('');
    for (const k of OFFERS_ERROR_KEYS) {
      expect(offersErrorText(k, STR.en)).toBe(STR.en[k]);
      expect(offersErrorText(k, STR.hi)).toBe(STR.hi[k]);
      expect(offersErrorText(k, STR.te)).toBe(STR.te[k]);
      expect(STR.hi[k]).not.toBe(STR.en[k]);
      expect(STR.te[k]).not.toBe(STR.en[k]);
    }
  });

  it('nothing stored shows nothing; other text is shown as it is', () => {
    expect(offersErrorText('', STR.hi)).toBe('');
    expect(offersErrorText('Some other message', STR.hi)).toBe('Some other message');
  });
});

describe('My Offers: the no-offers reason follows the app language', () => {
  beforeEach(() => { jest.useFakeTimers(); mockList.mockReset(); store = null; });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('stored while the app was in English, then the app is switched to Hindi and Telugu', async () => {
    mockList.mockResolvedValue({ applications: [{ id: 'a1', status: 'failed', prequalifyReason: 'duplicate', amount: 200000, offers: [] }] });
    const r = renderWithProviders(<><Probe /><Fare /></>);
    await waitFor(() => expect(r.getByText(STR.en.findingErrDuplicate)).toBeTruthy());

    await act(async () => { store!.set({ lang: 'hi' }); });
    await waitFor(() => expect(r.getByText(STR.hi.findingErrDuplicate)).toBeTruthy());
    expect(r.queryByText(STR.en.findingErrDuplicate)).toBeNull();

    await act(async () => { store!.set({ lang: 'te' }); });
    await waitFor(() => expect(r.getByText(STR.te.findingErrDuplicate)).toBeTruthy());
    expect(r.queryByText(STR.hi.findingErrDuplicate)).toBeNull();
    r.unmount();
  });
});
