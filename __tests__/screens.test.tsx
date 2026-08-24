import React from 'react';
import { renderWithProviders } from './test-utils';

import Splash from '../src/screens/splash';
import Language from '../src/screens/language';
import Intro from '../src/screens/intro';
import Mobile from '../src/screens/mobile';
import Permissions from '../src/screens/permissions';
import AboutYou from '../src/screens/aboutyou';
import Home from '../src/screens/home';
import Loans from '../src/screens/loans';
import Fare from '../src/screens/fare';
import Calculator from '../src/screens/calculator';
import Basic from '../src/screens/basic';
import BasicPan from '../src/screens/basicpan';
import Finding from '../src/screens/finding';
import Offers from '../src/screens/offers';
import Handoff from '../src/screens/handoff';
import Kyc from '../src/screens/kyc';
import Aadhaar from '../src/screens/aadhaar';
import Panv from '../src/screens/panv';
import Bankv from '../src/screens/bankv';
import Selfie from '../src/screens/selfie';
import Status from '../src/screens/status';
import Disbursed from '../src/screens/disbursed';
import Repay from '../src/screens/repay';
import Profile from '../src/screens/profile';
import Help from '../src/screens/help';

// Fake timers so screen intervals/animations don't leak real handles.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

// [Component, one or more human-readable strings expected on screen]
const CASES: [string, React.ComponentType, string[]][] = [
  ['UC-S1 splash', Splash, ['Swift', 'Loan']],
  ['UC-S2 language', Language, ['English', 'हिन्दी', 'తెలుగు']],
  ['UC-S3 intro', Intro, ['Loans made simple, in your language.']],
  ['UC-S4 mobile', Mobile, ['Enter your mobile number']],
  ['UC-S5 permissions', Permissions, ['Permissions', 'Allow permissions']],
  ['UC-S6 aboutyou', AboutYou, ["Just the basics — we'll ask for more only when you apply."]],
  ['UC-S7 home', Home, ['Browse loan types']],
  ['UC-S8 loans', Loans, ['My Loans']],
  ['UC-S9 fare', Fare, ['My Offers']],
  ['UC-S9b calculator', Calculator, ['Your monthly EMI']],
  ['UC-S10 basic', Basic, ['Tell us about yourself']],
  ['UC-S11 basicpan', BasicPan, ['Verify your PAN']],
  ['UC-S12 finding', Finding, ['Finding your personalised offers…']],
  ['UC-S13 offers', Offers, ['Review Your Offers', 'No application yet']],
  ['UC-S14 handoff', Handoff, ['Finalize your connection to the lender.', 'No offer selected.']],
  ['UC-S15 kyc', Kyc, ['Complete verification']],
  ['UC-S16 aadhaar', Aadhaar, ['Aadhaar Verification']],
  ['UC-S17 panv', Panv, ['PAN Verification']],
  ['UC-S18 bankv', Bankv, ['Bank Verification']],
  ['UC-S19 selfie', Selfie, ['Live Selfie']],
  // No authed session in tests → the status screen shows its empty state.
  ['UC-S20 status', Status, ['No application yet']],
  ['UC-S21 disbursed', Disbursed, ['Funds on the way!']],
  ['UC-S22 repay', Repay, ['Repayment Overview']],
  ['UC-S24 profile', Profile, ['Account Settings']],
  ['UC-S25 help', Help, ['How can we help you today?']],
];

describe('Screen smoke tests (UC-S)', () => {
  it.each(CASES)('%s renders without crashing and shows key content', (_label, Comp, texts) => {
    const { getAllByText, unmount } = renderWithProviders(<Comp />);
    for (const t of texts) {
      // getAllByText (not getByText): some screens legitimately render a key
      // string more than once — e.g. the collapsing header repeats the title in
      // the pinned bar and the body. A smoke test only needs it present.
      expect(getAllByText(t).length).toBeGreaterThan(0);
    }
    unmount();
  });
});
