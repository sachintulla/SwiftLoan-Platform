import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { useStore } from '../src/state/store';
import { api, setTokens } from '../src/api/client';
import { agent } from '../src/voice';
import WelcomeGate from '../src/components/WelcomeGate';
import Mobile from '../src/screens/mobile';

// The real video is a WebView; a marker is enough to see whether it is shown.
jest.mock('../src/components/RubyWelcome', () => {
  const { Text: T } = require('react-native');
  return () => <T>RUBY_WELCOME_VIDEO</T>;
});
// Login arms the video only once its CDN assets are cached; treat them as cached here.
jest.mock('../src/config/welcome', () => ({
  ...jest.requireActual('../src/config/welcome'),
  isWelcomeReady: () => true,
}));
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  claimInstall: jest.fn().mockResolvedValue(null),
}));

afterEach(() => {
  setTokens(null);
  jest.restoreAllMocks();
});

function Probe({ seed }: { seed?: Record<string, unknown> }) {
  const { state, set } = useStore();
  React.useEffect(() => { if (seed) set(seed as never); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <Text testID="probe">{`${state.screen}|${state.welcomePending}`}</Text>;
}

describe('Ruby welcome video vs a live call', () => {
  it('plays when no call is on', async () => {
    jest.spyOn(agent, 'getStatus').mockReturnValue('idle');
    const { findByText, getByTestId } = renderWithProviders(<><Probe seed={{ welcomePending: true }} /><WelcomeGate /></>);
    expect(await findByText('RUBY_WELCOME_VIDEO')).toBeTruthy();
    expect(getByTestId('probe').props.children).toContain('|true');
  });

  it('is skipped (and dropped) while a call is live', async () => {
    jest.spyOn(agent, 'getStatus').mockReturnValue('listening');
    const { queryByText, getByTestId } = renderWithProviders(<><Probe seed={{ welcomePending: true }} /><WelcomeGate /></>);
    await waitFor(() => expect(getByTestId('probe').props.children).toContain('|false'));
    expect(queryByText('RUBY_WELCOME_VIDEO')).toBeNull();
  });

  it('logging in during a call does not arm it; logging in with no call does', async () => {
    const login = async (status: 'listening' | 'idle') => {
      jest.spyOn(agent, 'getStatus').mockReturnValue(status);
      jest.spyOn(api, 'journeyResume').mockResolvedValue(null);
      jest.spyOn(api, 'verifyOtp').mockImplementation(async () => {
        setTokens('session-token');
        return { user: { id: 'u1', phone: '9876543210', fullName: 'Priya Sharma', pincode: '500034' }, priorInquiries: [] } as never;
      });
      const utils = renderWithProviders(<><Probe seed={{ mobileVal: '9876543210', terms: true, otpSent: true }} /><Mobile /></>);
      const input = await waitFor(() => utils.UNSAFE_getByProps({ autoComplete: 'sms-otp' }));
      await act(async () => { fireEvent.changeText(input, '123456'); });
      await waitFor(() => expect(utils.getByTestId('probe').props.children).toMatch(/^home\|/));
      const out = utils.getByTestId('probe').props.children as string;
      utils.unmount();
      setTokens(null);
      jest.restoreAllMocks();
      return out;
    };
    expect(await login('listening')).toBe('home|false');
    expect(await login('idle')).toBe('home|true');
  });
});
