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

// Covers the PAN-first application funnel (same as the website):
// PAN (basicpan: verify + pre-fill) -> Personal details (basic) -> Optional
// details (moredetails) -> finding -> My Offers. UC-N3/UC-N3b in
// store.test.ts cover the back-stack; these cover forward navigation and the
// screens' own onContinue/Skip handlers.

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

/** Mounts children only once Harness's seed (panPrefill) is in the store —
 * in the app the PAN step sets it before the details step ever mounts. */
function AfterSeed({ children }: { children: React.ReactNode }) {
  const { state } = useStore();
  return state.panPrefill ? <>{children}</> : null;
}

function currentScreen(getByTestId: (id: string) => any): string {
  return getByTestId('probe-screen').props.children;
}

const VERIFIED = {
  status: 'verified', verified: true, aadhaarLinked: true, source: 'aurix',
  prefill: { fullName: 'RAVI KUMAR', firstName: 'RAVI', lastName: 'KUMAR', dob: '1990-08-15', gender: 'male', pincode: '500034', addressLine1: '12-3-45 BANJARA HILLS', addressLine2: 'ROAD NO 2', city: 'Hyderabad', state: 'Telangana', maskedAadhaar: '12XXXXXXXX34' },
} as const;

describe('UC-N10 funnel step order: PAN first, then details, then optional', () => {
  it('BasicPan (PAN) is step 1 of 3', () => {
    const { getByText, unmount } = renderWithProviders(<BasicPan />);
    expect(getByText('Step 1 of 3')).toBeTruthy();
    unmount();
  });

  it('Basic (personal details) is step 2 of 3', () => {
    const { getByText, unmount } = renderWithProviders(<Basic />);
    expect(getByText('Step 2 of 3')).toBeTruthy();
    unmount();
  });

  it('MoreDetails (optional) is step 3 of 3 - the last step', () => {
    const { getByText, unmount } = renderWithProviders(<MoreDetails />);
    expect(getByText('Step 3 of 3')).toBeTruthy();
    unmount();
  });
});

describe('UC-N11 forward navigation follows the new order', () => {
  // These screens need a session (see guardScreen in store.ts) — a fake token
  // stands in for it here.
  it('MoreDetails Skip goes straight to the loader', () => {
    setTokens('fake-access-token');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness><MoreDetails /></Harness>,
    );
    fireEvent.press(getByText('Skip'));
    expect(currentScreen(getByTestId)).toBe('finding');
    unmount();
  });

  it('MoreDetails Continue goes to the loader', async () => {
    setTokens('fake-access-token');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness><MoreDetails /></Harness>,
    );
    fireEvent.press(getByText('Continue'));
    await waitFor(() => expect(currentScreen(getByTestId)).toBe('finding'));
    unmount();
  });

  it('BasicPan Continue with no PAN entered does not advance or call the API', () => {
    setTokens('fake-access-token');
    const verifySpy = jest.spyOn(api, 'verifyPan');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness seed={{ screen: 'basicpan', panConsent: true }}><BasicPan /></Harness>,
    );
    fireEvent.press(getByText('Verify PAN & continue'));
    expect(currentScreen(getByTestId)).toBe('basicpan');
    expect(verifySpy).not.toHaveBeenCalled();
    unmount();
  });

  it('BasicPan: a verified PAN runs the loader, stores the pre-fill, then opens the details step', async () => {
    setTokens('fake-access-token');
    jest.spyOn(api, 'me').mockResolvedValue({ user: {} } as any);
    const verifySpy = jest.spyOn(api, 'verifyPan').mockResolvedValue(VERIFIED as any);
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness seed={{ panNumber: 'AAAPL1234C', panConsent: true }}><BasicPan /></Harness>,
    );
    fireEvent.press(getByText('Verify PAN & continue'));
    await waitFor(() => expect(getByText('Verifying your PAN')).toBeTruthy());
    expect(verifySpy).toHaveBeenCalledWith('AAAPL1234C');
    jest.advanceTimersByTime(5000);
    await waitFor(() => expect(currentScreen(getByTestId)).toBe('basic'));
    unmount();
  });

  it("BasicPan: a PAN the API rejects shows the API's own message and stays on step 1", async () => {
    setTokens('fake-access-token');
    jest.spyOn(api, 'me').mockResolvedValue({ user: {} } as any);
    jest.spyOn(api, 'verifyPan').mockResolvedValue({ ...VERIFIED, status: 'invalid', verified: false, prefill: {}, message: 'No record found for the given PAN.' } as any);
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness seed={{ panNumber: 'AAAPL1234C', panConsent: true }}><BasicPan /></Harness>,
    );
    fireEvent.press(getByText('Verify PAN & continue'));
    await waitFor(() => expect(getByText('No record found for the given PAN.')).toBeTruthy());
    expect(currentScreen(getByTestId)).not.toBe('basic');
    unmount();
  });

  it('Basic pre-fills from the verified PAN and shows the confirmation card', async () => {
    setTokens('fake-access-token');
    jest.spyOn(api, 'me').mockResolvedValue({ user: {} } as any);
    const { getByText, getByDisplayValue, unmount } = renderWithProviders(
      <Harness seed={{ panNumber: 'AAAPL1234C', panPrefill: { pan: 'AAAPL1234C', prefill: VERIFIED.prefill, aadhaarLinked: true } }}><AfterSeed><Basic /></AfterSeed></Harness>,
    );
    await waitFor(() => expect(getByDisplayValue('RAVI')).toBeTruthy());
    expect(getByDisplayValue('ROAD NO 2')).toBeTruthy();
    expect(getByText('Aadhaar linked')).toBeTruthy();
    expect(getByText('AAXXXX234C')).toBeTruthy();
    unmount();
  });
});

describe('UC-N12 entry points open on the PAN step', () => {
  it('Home "Apply for a loan" opens on BasicPan', () => {
    setTokens('fake-access-token');
    const { getByText, getByTestId, unmount } = renderWithProviders(
      <Harness><Home /></Harness>,
    );
    fireEvent.press(getByText('Apply for a loan'));
    expect(currentScreen(getByTestId)).toBe('basicpan');
    unmount();
  });
});
