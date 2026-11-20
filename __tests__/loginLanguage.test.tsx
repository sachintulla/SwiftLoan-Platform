// The login screen after a logout must be in the language the user chose in their account.
// Before this, most of its text was typed into the screen in English, so only the two or three
// lines that came from the strings table (e.g. the "Mobile Number" label) changed language.
import React from 'react';
import { act, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { STR } from '../src/i18n/strings';
import { useStore } from '../src/state/store';
import Mobile from '../src/screens/mobile';

const LOGIN_KEYS = [
  'loginWelcomeTitle', 'loginWelcomeSubBold', 'loginSendOtpCta', 'loginOtpNote', 'loginSoftCheckBody',
  'loginHeroTagline', 'loginHeroRbi', 'loginHeroBadge', 'loginHeroOtpBadge',
  'loginChipInstant', 'loginChipPaperless', 'loginChipRates',
];

let store: ReturnType<typeof useStore> | null = null;
function Probe() { store = useStore(); return null; }

describe('login screen language', () => {
  beforeEach(() => { jest.useFakeTimers(); store = null; });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it.each(['hi', 'te'])('every login text has its own %s wording (not the English one)', (lang) => {
    for (const k of LOGIN_KEYS) {
      expect(STR[lang][k]).toBeTruthy();
      expect(STR[lang][k]).not.toBe(STR.en[k]);
    }
  });

  it('never uses the Telugu word the owner asked us not to use', () => {
    expect(JSON.stringify(STR.te)).not.toContain('మొదలుపెడదాం');
  });

  it('English is unchanged', async () => {
    const r = renderWithProviders(<Mobile />);
    await waitFor(() => expect(r.getByText('Welcome to SwiftLoan')).toBeTruthy());
    expect(r.getByText('Send OTP & Check Offers')).toBeTruthy();
    expect(r.getByText('Digital Lending Marketplace')).toBeTruthy();
    expect(r.getAllByText('Lowest Rates').length).toBeGreaterThan(0);
    r.unmount();
  });

  it.each(['te', 'hi'])('%s chosen in the account, then logout: the login screen is in that language', async (lang) => {
    const r = renderWithProviders(<><Probe /><Mobile /></>);
    await waitFor(() => expect(store).not.toBeNull());
    await act(async () => { store!.set({ lang }); });
    await act(async () => { store!.reset(); });           // what logout does

    const te = STR[lang];
    await waitFor(() => expect(r.getByText(te.loginWelcomeTitle)).toBeTruthy());
    expect(r.getByText(te.loginSendOtpCta)).toBeTruthy();
    expect(r.getByText(te.loginOtpNote)).toBeTruthy();
    expect(r.getByText(te.loginHeroTagline)).toBeTruthy();
    expect(r.getByText(te.loginHeroRbi)).toBeTruthy();
    expect(r.getByText(te.loginHeroBadge)).toBeTruthy();
    expect(r.getAllByText(te.loginChipRates).length).toBeGreaterThan(0);
    expect(r.getByText(te.mobileNumberLabel)).toBeTruthy();
    expect(r.getByText(te.loginHeroBadge)).toBeTruthy();
    expect(r.getAllByText(te.loginChipInstant).length).toBeGreaterThan(0);
    expect(r.getAllByText(te.loginChipPaperless).length).toBeGreaterThan(0);
    // none of the old English-only lines are left
    for (const en of ['Welcome to SwiftLoan', 'Send OTP & Check Offers', 'Digital Lending Marketplace', 'RBI Regulated', 'Compare offers from top lenders', "We'll send a 6-digit OTP to verify securely"]) {
      expect(r.queryByText(en)).toBeNull();
    }
    r.unmount();
  });
});
