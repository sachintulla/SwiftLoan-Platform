// Regressions from a live Telugu call: "select Telugu" failed, and the agent read the OTP
// screen's on-screen instruction aloud.
import React, { useEffect } from 'react';
import { renderWithProviders } from './test-utils';
import Language from '../src/screens/language';
import Mobile from '../src/screens/mobile';
import { useStore, Screen as ScreenName } from '../src/state/store';
import { findTarget, getScreenTexts, listTargets, setCurrentScreen } from '../src/voice/actionRegistry';

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

function AtScreen({ name, children }: { name: ScreenName; children: React.ReactNode }) {
  const { state, go } = useStore();
  useEffect(() => { if (state.screen !== name) go(name); }, [state.screen, name, go]);
  return <>{state.screen === name ? children : null}</>;
}
function renderAt(name: ScreenName, ui: React.ReactElement) {
  const r = renderWithProviders(<AtScreen name={name}>{ui}</AtScreen>);
  setCurrentScreen(name);
  return r;
}

describe('spoken language names match the native-script language cards', () => {
  it('"Telugu" / "Hindi" / "English" resolve to the cards (they used to be not_found)', () => {
    renderAt('language', <Language />);
    expect(findTarget('language', 'Telugu')?.label).toBe('తెలుగు');
    expect(findTarget('language', 'telugu')?.label).toBe('తెలుగు');
    expect(findTarget('language', 'Hindi')?.label).toBe('हिन्दी');
    expect(findTarget('language', 'हिंदी')?.label).toBe('हिन्दी'); // other common spelling
    expect(findTarget('language', 'English')?.label).toBe('English');
  });

  it('the native labels still work directly, and an unrelated language is still not found', () => {
    renderAt('language', <Language />);
    expect(findTarget('language', 'తెలుగు')?.label).toBe('తెలుగు');
    expect(findTarget('language', 'Marathi')).toBeNull();
  });
});

describe('the agent is not shown on-screen instructions it would read aloud', () => {
  it('mobile step: the "enter your number" heading/subtitle are hidden, the field and button stay', () => {
    renderAt('mobile', <Mobile />);
    const text = getScreenTexts('mobile').join(' ');
    expect(text).not.toMatch(/enter your mobile number/i);
    expect(text).not.toMatch(/6-digit OTP/i);
    expect(listTargets('mobile').length).toBeGreaterThan(0); // controls still discoverable
  });

  it('OTP step: "enter the 6-digit code…" is hidden from the agent, the controls stay', () => {
    renderAt('otp', <Mobile />);
    const text = getScreenTexts('otp').join(' ');
    expect(text).not.toMatch(/6-digit/i);
    expect(text).not.toMatch(/verify your number/i);
    expect(listTargets('otp').length).toBeGreaterThan(0);
  });

  it('OTP step: the code is one "OTP" field — no "OTP digit" button and no second, mislabelled field', () => {
    // The `otp` route is the mobile screen with `otpSent` on; turn it on so the code boxes render.
    function OtpSent() {
      const { set } = useStore();
      useEffect(() => { set({ otpSent: true, mobileVal: '9182922731' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
      return <Mobile />;
    }
    renderAt('otp', <OtpSent />);
    const targets = listTargets('otp');
    const fields = targets.filter(t => t.kind === 'field');
    // Before: the digit boxes showed up as a button "OTP digit 1" and the hidden input as another
    // field labelled with the "change phone number" button text, both holding the same code.
    expect(fields.map(f => f.label)).toEqual(['OTP']);
    expect(targets.some(t => /OTP digit/i.test(t.label))).toBe(false);
  });
});
