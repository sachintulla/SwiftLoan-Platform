// Ruby (the floating assistant) is the last layer of the app window, so nothing a screen draws
// can sit above her. These pin the rules that keep her off pop-ups, pinned buttons and web pages.
import React from 'react';
import { Modal } from 'react-native';
import { waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { SCREENS_WITH_FOOTER_CTA } from '../src/state/store';
import { nudgeFor, DEFAULT_TIMERS } from '../src/voice/nudges';
import { RUBY_CLEARANCE } from '../src/components/Frame';
import Legal from '../src/screens/legal';

jest.mock('react-native-webview', () => {
  const R = require('react');
  const { View } = require('react-native');
  return { WebView: (props: object) => R.createElement(View, { testID: 'webview', ...props }) };
});

describe('Ruby never covers a pinned button', () => {
  it('lifts above the login screen\'s "Send OTP" / "Verify" button', () => {
    expect(SCREENS_WITH_FOOTER_CTA.has('mobile')).toBe(true);
    expect(SCREENS_WITH_FOOTER_CTA.has('otp')).toBe(true);
  });

  it('is not lifted on screens whose Continue moved to the header', () => {
    for (const s of ['basicpan', 'basic', 'moredetails'] as const) expect(SCREENS_WITH_FOOTER_CTA.has(s)).toBe(false);
  });

  it('the strip she stands on is taller than she is (bottom offset 24 + an 80 pt touch zone)', () => {
    expect(RUBY_CLEARANCE).toBeGreaterThanOrEqual(24 + 80);
  });
});

describe('Ruby never covers a web page shown in the app', () => {
  it.each(['legal', 'lenderweb', 'altweb'] as const)('no tip bubble on %s', (screen) => {
    expect(nudgeFor(screen, DEFAULT_TIMERS, true)).toBeNull();
    expect(nudgeFor(screen, DEFAULT_TIMERS, false)).toBeNull();
  });

  it('other signed-in screens still get the bubble', () => {
    expect(nudgeFor('home', DEFAULT_TIMERS, true)).not.toBeNull();
  });

  it('Privacy Policy: the website consent banner is answered before the page starts, and the app marks itself', async () => {
    jest.useFakeTimers();
    const r = renderWithProviders(<Legal />);
    const web = await waitFor(() => r.getByTestId('webview'));
    const before = String(web.props.injectedJavaScriptBeforeContentLoaded);
    expect(before).toContain("sl_meta_consent");
    expect(before).toContain("'denied'");
    expect(before).not.toContain("'granted'");
    expect(before).toContain('.sl-fab-anchor');
    expect(web.props.applicationNameForUserAgent).toBe('SwiftLoanApp');
    r.unmount();
    jest.clearAllTimers(); jest.useRealTimers();
  });
});

describe('a pop-up is a real pop-up window (above Ruby)', () => {
  it('the "trying other lenders" pop-up on the loading screen is rendered in a Modal', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '../src/screens/finding.tsx'), 'utf8');
    const popup = src.slice(src.indexOf('{fallback ? ('));
    expect(popup).toMatch(/<Modal[^>]*transparent/);
    expect(popup.indexOf('<Modal')).toBeLessThan(popup.indexOf('styles.fbScrim'));
    expect(Modal).toBeDefined();
  });
});
