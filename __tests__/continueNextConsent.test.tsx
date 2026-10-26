// Regression: the login screen's consent row reads "By proceeding, you agree to our Terms of Service…".
// continue_next used to fuzzy-match the word "proceed" against that row, so right after the agent ticked the
// terms it tapped the consent row and UN-ticked it (Send OTP went back to disabled) — a loop that never got past login.
import React, { useEffect } from 'react';
import { act, cleanup } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import Mobile from '../src/screens/mobile';
import { useStore } from '../src/state/store';
import { agent } from '../src/voice';
import { setCurrentScreen } from '../src/voice/actionRegistry';
import { api } from '../src/api/client';
import { configureFx } from '../src/feedback/agentFx';

let store: ReturnType<typeof useStore>;
function AtMobile() {
  const s = useStore();
  store = s;
  useEffect(() => {
    if (s.state.screen !== 'mobile') s.go('mobile');
  }, [s.state.screen]); // eslint-disable-line react-hooks/exhaustive-deps
  return s.state.screen === 'mobile' ? <Mobile /> : null;
}
const raw = (name: string, args: Record<string, unknown>) =>
  (agent as any).registry.get(name).handler(args) as Promise<any>;
// Tools wait on short timers (settling after a tap): start the call, then let the fake clock run.
async function call(name: string, args: Record<string, unknown>): Promise<any> {
  let p!: Promise<any>;
  await act(async () => {
    p = raw(name, args);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3000);
  });
  return p;
}

beforeEach(() => {
  jest.useFakeTimers();
  configureFx({ instant: true });
});
afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function openLogin() {
  renderWithProviders(<AtMobile />);
  setCurrentScreen('mobile');
  await act(async () => {
    store.set({ mobileVal: '9876543210' });
  });
}

describe('continue_next on the login screen', () => {
  it('presses Send OTP and leaves the consent ticked (it must never pick the "By proceeding… agree" row)', async () => {
    const send = jest.spyOn(api, 'requestOtp').mockResolvedValue(undefined as never);
    await openLogin();
    await call('set_checkbox', { label: 'Accept terms and privacy policy', checked: true });
    expect(store.state.terms).toBe(true);

    const result = await call('continue_next', {});
    expect(store.state.terms).toBe(true);
    expect(send).toHaveBeenCalledWith('9876543210');
    expect(result.tapped).toMatch(/Send OTP/i);
  });

  it('with the consent still unticked it does not tick it for the user: Send OTP stays disabled', async () => {
    const send = jest.spyOn(api, 'requestOtp').mockResolvedValue(undefined as never);
    await openLogin();
    await call('continue_next', {});
    expect(store.state.terms).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
