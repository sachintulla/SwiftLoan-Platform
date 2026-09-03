import React from 'react';
import { renderWithProviders } from './test-utils';
import Router from '../src/Router';
import { SCREENS } from '../src/screens';

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('UC-F1 Router renders the active screen', () => {
  it('shows the splash screen at startup', () => {
    const { getByText, unmount } = renderWithProviders(<Router />);
    expect(getByText('Loan')).toBeTruthy();
    unmount();
  });
});

describe('UC-X2 route registry completeness', () => {
  const EXPECTED = [
    'splash', 'language', 'intro', 'mobile', 'otp', 'permissions', 'aboutyou',
    'home', 'fare', 'loans', 'basic', 'basicpan', 'finding', 'offers', 'handoff',
    // 'repay' omitted — disabled for now (see screens/index.ts).
    'status', 'disbursed',
    'calculator', 'profile', 'help',
  ];
  it.each(EXPECTED)('route "%s" is registered', route => {
    expect(SCREENS[route as keyof typeof SCREENS]).toBeDefined();
  });
});

describe('UC-F5 every registered route mounts', () => {
  const entries = Object.entries(SCREENS) as [string, React.ComponentType][];
  it.each(entries)('route "%s" mounts without throwing', (_route, Comp) => {
    const { unmount } = renderWithProviders(<Comp />);
    unmount();
  });
});
