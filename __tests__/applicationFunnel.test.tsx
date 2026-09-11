import React from 'react';
import { Text } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { useStore } from '../src/state/store';
import { api, setTokens } from '../src/api/client';

import Basic from '../src/screens/basic';
import MoreDetails from '../src/screens/moredetails';
import BasicPan from '../src/screens/basicpan';
import Home from '../src/screens/home';

// Covers the reordered application funnel: Personal details (basic) -> Optional
// details (moredetails) -> PAN (basicpan, now last) -> finding -> My Offers.
// UC-N3/UC-N3b in store.test.ts already cover the back-stack; these cover the
// forward navigation and the screens' own onContinue/Skip handlers.

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  setTokens(null);
  jest.restoreAllMocks();
});

/** Renders `children` inside the store, optionally seeding state first, and
 * exposes the current screen as plain text so navigation can be asserted on
 * without mounting the full Router. */
function Harness({ seed, children }: { seed?: Record<string, unknown>; children: React.ReactNode }) {
  const { state, set } = useStore();
  React.useEffect(() => {
    if (seed) set(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {children}
      <Text testID="probe-screen">{state.screen}</Text>
    </>
  );
}

function currentScreen(getByTestId: (id: string) => any): string {
  return getByTestId('probe-screen').props.children;
}

describe('UC-N10 funnel step order: personal details, then optional, then PAN last', () => {
  it('Basic (personal details) is step 1 of 3', () => {
    const { getByText, unmount } = renderWithProviders(<Basic />);
    expect(getByText('Step 1 of 3')).toBeTruthy();
    unmount();
  });

  it('MoreDetails (optional) is step 2 of 3', () => {
    const { getByText, unmount } = renderWithProviders(<MoreDetails />);
    expect(getByText('Step 2 of 3')).toBeTruthy();
    unmount();
  });

  it('BasicPan (PAN) is step 3 of 3 - the last input step', () => {
    const { getByText, unmount } = renderWithProviders(<BasicPan />);
    expect(getByText('Step 3 of 3')).toBeTruthy();
    unmount();
  });
});

describe('UC-N11 forward navigation follows the new order', () => {
  // These screens are guest-accessible by design, but only once the "Skip"
  // flow's own ensureSession() has minted a real anonymous token (see
  // guardScreen in store.ts) — a truly zero-token render doesn't reflect any
  // real path through the app, so a fake token stands in for that anonymous
  // session here rather than an authenticated one.
  it('MoreDetails Skip goes to the PAN step, not straight to the loader', () => {
    setTokens('fake-access-token');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness><MoreDetails /></Harness>,
    );
    fireEvent.press(getByText('Skip'));
    expect(currentScreen(getByTestId)).toBe('basicpan');
    unmount();
  });

  it('MoreDetails Continue (anonymous session) goes to the PAN step', async () => {
    setTokens('fake-access-token');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness><MoreDetails /></Harness>,
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(currentScreen(getByTestId)).toBe('basicpan'));
    unmount();
  });

  it('BasicPan Continue with no PAN entered does not advance', () => {
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness seed={{ screen: 'basicpan', panConsent: true }}><BasicPan /></Harness>,
    );
    fireEvent.press(getByText('Upload PAN & Verify'));
    expect(currentScreen(getByTestId)).toBe('basicpan');
    unmount();
  });

  it('BasicPan Continue with a valid PAN (anonymous session) goes straight to the loader, with no duplicate-application lookup', async () => {
    setTokens('fake-access-token');
    const listApplicationsSpy = jest.spyOn(api, 'listApplications');
    const updateApplicationSpy = jest.spyOn(api, 'updateApplication');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness seed={{ panNumber: 'AAAPL1234C', panConsent: true }}><BasicPan /></Harness>,
    );
    fireEvent.press(getByText('Upload PAN & Verify'));
    await waitFor(() => expect(currentScreen(getByTestId)).toBe('finding'));
    expect(listApplicationsSpy).not.toHaveBeenCalled();
    expect(updateApplicationSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('BasicPan Continue with a valid PAN (authenticated) attaches it to the existing application, then goes to the loader', async () => {
    setTokens('fake-access-token');
    const updateApplicationSpy = jest
      .spyOn(api, 'updateApplication')
      .mockResolvedValue({ application: { id: 'app-123', panNumber: 'AAAPL1234C' } } as any);
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness seed={{ applicationId: 'app-123', panNumber: 'AAAPL1234C', panConsent: true }}>
        <BasicPan />
      </Harness>,
    );
    fireEvent.press(getByText('Upload PAN & Verify'));
    await waitFor(() => expect(currentScreen(getByTestId)).toBe('finding'));
    expect(updateApplicationSpy).toHaveBeenCalledWith('app-123', { panNumber: 'AAAPL1234C' });
    unmount();
  });
});

describe('UC-N12 entry points open on the details step, not PAN', () => {
  it('Home "Apply for a loan" opens on Basic', () => {
    setTokens('fake-access-token');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness><Home /></Harness>,
    );
    fireEvent.press(getByText('Apply for a loan'));
    expect(currentScreen(getByTestId)).toBe('basic');
    unmount();
  });
});
