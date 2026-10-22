import React from 'react';
import { Linking, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from './test-utils';
import { useStore } from '../src/state/store';
import { fetchContext, resumeFromLink } from '../src/api/client';
import { loadTokens } from '../src/state/session';
import ResumePrompt from '../src/components/ResumePrompt';

// The app opened from a website visitor's own link (swiftloan://onboard?token=…): it asks the server for the saved
// journey and offers the same pop-up as a fresh install does; "Okay, continue" opens the login with the number filled in.
jest.mock('../src/api/client', () => ({
  ...jest.requireActual('../src/api/client'),
  claimInstall: jest.fn().mockResolvedValue(null),
  fetchContext: jest.fn(),
  resumeFromLink: jest.fn(),
}));
jest.mock('../src/state/session', () => ({
  ...jest.requireActual('../src/state/session'),
  loadTokens: jest.fn(),
}));

const RAW = { token: 'SVURXDBY', first_name: 'Priya', phone: '9876543210', last_step: 'pan_done' };
const SLOW = { timeout: 5000 };
const openedWith = (url: string | null) => jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(url);

beforeEach(async () => {
  await AsyncStorage.clear();
  (fetchContext as jest.Mock).mockReset().mockResolvedValue(null);
  (resumeFromLink as jest.Mock).mockReset().mockResolvedValue(RAW);
  (loadTokens as jest.Mock).mockReset().mockResolvedValue(null);
});
afterEach(() => jest.restoreAllMocks());

function Probe() {
  const { state, go } = useStore();
  React.useEffect(() => { go('language' as never); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Text testID="probe">{`${state.screen}|${state.mobileVal}|${String(state.terms)}|${String(state.resumePrompt)}|${String(state.resumeStage)}|${String(state.contextLoaded)}`}</Text>;
}
const probe = (getByTestId: (id: string) => any) => String(getByTestId('probe').props.children).split('|');

describe('app opened from the visitor\'s own link', () => {
  it('offers the pop-up with their name, and "Okay, continue" opens the login with the number filled in and consent unticked', async () => {
    openedWith('swiftloan://onboard?token=SVURXDBY');
    const { getByText, getByTestId } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await waitFor(() => expect(getByText('Okay, continue')).toBeTruthy(), SLOW);
    expect(resumeFromLink).toHaveBeenCalledWith('SVURXDBY');
    expect(getByText(/Hi Priya/)).toBeTruthy();
    fireEvent.press(getByText('Okay, continue'));
    await waitFor(() => expect(probe(getByTestId).slice(0, 4)).toEqual(['mobile', '9876543210', 'false', 'null']), SLOW);
  });

  it('tells the voice agent the stage (and not the number)', async () => {
    openedWith('swiftloan://onboard?token=SVURXDBY');
    const { getByTestId } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await waitFor(() => expect(probe(getByTestId)[4]).toBe('pre_login'), SLOW);
    expect(probe(getByTestId)[3]).toBe('welcome');
  });

  it('a lead/agent context link keeps its old behaviour and never asks for a journey', async () => {
    (fetchContext as jest.Mock).mockResolvedValue({ name: 'Asha Rao', greeting: 'Hello Asha', source: 'agent' });
    openedWith('swiftloan://onboard?token=CTX123');
    const { getByTestId, queryByText } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await waitFor(() => expect(probe(getByTestId)[5]).toBe('true'), SLOW);
    expect(resumeFromLink).not.toHaveBeenCalled();
    expect(queryByText('Okay, continue')).toBeNull();
  });

  it('shows nothing when the link has no saved journey (unknown, stale or offline)', async () => {
    (resumeFromLink as jest.Mock).mockResolvedValue(null);
    openedWith('swiftloan://onboard?token=NOSUCH99');
    const { getByTestId, queryByText } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await waitFor(() => expect(resumeFromLink).toHaveBeenCalled(), SLOW);
    expect(queryByText('Okay, continue')).toBeNull();
    expect(probe(getByTestId)[3]).toBe('null');
  });

  it('ignores a malformed reply instead of trusting it', async () => {
    (resumeFromLink as jest.Mock).mockResolvedValue({ ...RAW, phone: '12345' });
    openedWith('swiftloan://onboard?token=SVURXDBY');
    const { getByTestId, queryByText } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await waitFor(() => expect(resumeFromLink).toHaveBeenCalled(), SLOW);
    expect(queryByText('Okay, continue')).toBeNull();
    expect(probe(getByTestId)[3]).toBe('null');
  });

  it('does nothing on a device that is already signed in', async () => {
    (loadTokens as jest.Mock).mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    openedWith('swiftloan://onboard?token=SVURXDBY');
    const { getByTestId, queryByText } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await waitFor(() => expect(fetchContext).toHaveBeenCalled(), SLOW);
    await new Promise<void>((r) => setTimeout(() => r(), 50));
    expect(resumeFromLink).not.toHaveBeenCalled();
    expect(queryByText('Okay, continue')).toBeNull();
    expect(probe(getByTestId)[3]).toBe('null');
  });

  it('a link without a token does nothing', async () => {
    openedWith('swiftloan://onboard');
    const { queryByText } = renderWithProviders(<><Probe /><ResumePrompt /></>);
    await new Promise<void>((r) => setTimeout(() => r(), 50));
    expect(fetchContext).not.toHaveBeenCalled();
    expect(resumeFromLink).not.toHaveBeenCalled();
    expect(queryByText('Okay, continue')).toBeNull();
  });
});
